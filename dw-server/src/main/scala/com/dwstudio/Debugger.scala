package com.dwstudio

import org.mule.weave.v2.debugger.{
  DebuggerFrame, DebuggerValue, SimpleDebuggerValue, WeaveBreakpoint, WeaveExceptionBreakpoint
}
import org.mule.weave.v2.interpreted.{ ExecutionContext, Frame }
import org.mule.weave.v2.interpreted.debugger.server.DebuggerConverters.unknownLocation
import org.mule.weave.v2.interpreted.debugger.server.DebuggerValueFactory
import org.mule.weave.v2.model.values.Value
import org.mule.weave.v2.utils.IdentityHashMap
import org.mule.weave.v2.interpreted.debugger.server.{
  WeaveBreakpointManager, WeaveDebuggerExecutor, WeaveDebuggingSession
}
import org.mule.weave.v2.interpreted.listener.SessionListener
import org.mule.weave.v2.parser.ast.WeaveLocationCapable
import org.mule.weave.v2.parser.location.WeaveLocation

import scala.collection.mutable

/**
 * A DataWeave debug session that runs inside this process.
 *
 * The engine ships a real debugger, but its own wiring
 * (`DataWeaveScriptingEngine.enableDebug`) hardcodes a TCP server and expects a
 * separate client process to attach. We don't want a second process or an open
 * port, and we don't need one: everything the debugger actually requires is
 * behind two plain traits — `WeaveDebuggingSession` and `WeaveBreakpointManager`
 * — so both are implemented here and the executor is attached directly to the
 * compiled script with `addExecutionListener`.
 *
 * How pausing works, and why this doesn't need an async protocol:
 * `WeaveDebuggerExecutor.stopExecution` parks the *executing* thread in
 * `sessionLock.wait()`, and `resume()` / `nextStep()` / `stepInto()` /
 * `stepOut()` are called from another thread to release it. So the script runs
 * on a worker thread while the stdio loop stays free to answer requests. The UI
 * asks "where are we?" and sends step commands as ordinary request/response —
 * no unsolicited events, no second channel, no change to the wire format.
 *
 * One session at a time, which matches the UI: you debug one script.
 */
class DwDebugSession extends WeaveDebuggingSession {

  val breakpoints = new SimpleBreakpointManager()

  private var executor: WeaveDebuggerExecutor = _
  @volatile private var live: Boolean = false

  /** Paused state, published by the worker thread and read by the stdio loop. */
  @volatile var paused: Boolean = false
  @volatile var frames: Array[DebuggerFrame] = Array.empty
  @volatile var stoppedLine: Int = -1
  @volatile var stoppedColumn: Int = -1
  @volatile var stopReason: Int = -1

  /** Terminal state. `output` and `error` are mutually exclusive. */
  @volatile var finished: Boolean = false
  @volatile var output: String = _
  @volatile var error: String = _

  override def initSession(): Unit = { live = true }

  /** Nothing waits for a client to attach — the session is live from the start. */
  override def addSessionListener(listener: SessionListener): Unit = listener.onSessionInitialized()

  override def onExecutionPaused(f: Array[DebuggerFrame], location: WeaveLocation, reason: Int): Unit = {
    frames = f
    stoppedLine = location.startPosition.line
    stoppedColumn = location.startPosition.column
    stopReason = reason
    paused = true
  }

  override def getWeaveBreakpointManager(): WeaveBreakpointManager = breakpoints
  override def getWeaveDebuggerExecutor(): WeaveDebuggerExecutor = executor
  override def started(): Boolean = live

  override def start(debuggerExecutor: WeaveDebuggerExecutor): Unit = {
    executor = debuggerExecutor
    live = true
  }

  override def stop(): Unit = {
    live = false
    // A parked worker would otherwise hold the thread forever.
    if (executor != null) executor.resume()
  }

  /** Clear the pause before releasing the worker, so a `state` call landing
   *  between the two can't report the position we just stepped away from. */
  private def release(step: () => Unit): Unit = {
    paused = false
    frames = Array.empty
    stoppedLine = -1
    if (executor != null) step()
  }

  def resume(): Unit = release(() => executor.resume())
  def stepOver(): Unit = release(() => executor.nextStep())
  def stepInto(): Unit = release(() => executor.stepInto())
  def stepOut(): Unit = release(() => executor.stepOut())

  /** Evaluate an expression against a paused frame. Only meaningful while
   *  paused — the executor evaluates against the frame it stopped in. */
  def evaluate(expression: String, frameIndex: Int): String = {
    if (executor == null || !paused) "not paused"
    else executor.evalScript(expression, frameIndex).toString
  }
}

/**
 * An executor that will not read the script's inputs while snapshotting a frame.
 *
 * This exists because of a real, reproducible corruption. To build the variables
 * panel the stock executor calls `DebuggerValueFactory.create` on every slot in
 * the frame, and for an object that means
 * `ObjectType.coerce(v).evaluate.toIterator()`. On a reader-backed input that
 * iterator is single-use, so merely *looking* at `payload` consumed it: the
 * panel would show `payload = {"n": 21}` and the script would then fail with
 * `You called the function '*' with 1: Null`. One pause was enough to break the
 * run.
 *
 * It is specifically `toIterator()` that is destructive, not reading. A normal
 * run evaluates `payload.n` three times quite happily, and `evaluate` at a
 * breakpoint goes down that same selector path — so inputs stay inspectable on
 * demand, they are just not walked eagerly for display.
 *
 * Everything that is genuinely in memory — locals, function parameters,
 * intermediate results — is still snapshotted in full.
 */
class NonConsumingDebuggerExecutor(session: WeaveDebuggingSession, inputNames: Set[String])
  extends WeaveDebuggerExecutor(session) {

  /** True while this thread is building a frame snapshot.
   *
   *  Rendering a value can FORCE it, and forcing a lazy `var` executes a
   *  ValueNode, which fires `preValueNodeExecution`, which calls `preExecution`,
   *  which builds the frame map again, which renders the same still-unforced
   *  var. 984 frames later the JVM gives up and the session dies with a
   *  StackOverflowError carrying no message. Two `sizeOf(payload.lines)` in one
   *  script was enough; hoisting them into a `var` made it more likely, not
   *  less, because a `var` is exactly the lazy directive that re-enters.
   *
   *  The guard is RE-ENTRANCY, not identity. Skipping by variable name (what
   *  `inputNames` does, and all this class had before) cannot help here: the
   *  value that recurses is an ordinary local with an ordinary name. A nested
   *  snapshot returns nothing and lets the outer one finish with the real,
   *  now-forced values.
   *
   *  Per-thread because the debugged script runs on its own worker thread and
   *  the session must not be affected by anything else in the JVM.
   */
  private val snapshotting = new ThreadLocal[java.lang.Boolean] {
    override def initialValue(): java.lang.Boolean = java.lang.Boolean.FALSE
  }

  override def toFrameValueMap(
    frame: Frame,
    values: IdentityHashMap[Value[_], DebuggerValue])(implicit ctx: ExecutionContext): Seq[(String, DebuggerValue)] = {
    if (snapshotting.get()) return Seq.empty
    snapshotting.set(java.lang.Boolean.TRUE)
    try {
    val names = frame.moduleContext.variableTable.variableNames()
    frame.content.zipWithIndex.flatMap { valueWithIndex =>
      val value = valueWithIndex._1
      val index = valueWithIndex._2
      if (value == null || names.size <= index) None
      else {
        val name = names(index)
        // The engine parks intermediates in slots it names `__fakeVariable1`,
        // `__fakeVariable2`, ... Those are its bookkeeping, not the user's
        // variables, and showing them in the panel is just noise beside `lines`
        // and `net`.
        if (name != null && name.startsWith("__")) None
        else if (inputNames.contains(name)) {
          Some((name, SimpleDebuggerValue("(input - use Evaluate to inspect)", "Input", unknownLocation())))
        } else {
          Some((name, values.getOrElseUpdate(value, DebuggerValueFactory.create(value, maxValueElements, maxValueDepth))))
        }
      }
    }
    } finally snapshotting.set(java.lang.Boolean.FALSE)
  }
}

/**
 * Line breakpoints, matched by resource name and line.
 *
 * The engine's own `DefaultWeaveBreakpointManager` takes the concrete
 * `DefaultWeaveDebuggingSession`, so it can't be reused with the session above.
 * Reimplementing the trait is a dozen lines and keeps this in-process.
 *
 * Conditional breakpoints are deliberately not supported yet: the engine's
 * version evaluates the condition through the executor mid-pause, which is
 * worth adding once stepping is proven.
 */
class SimpleBreakpointManager extends WeaveBreakpointManager {

  private val lines = mutable.HashSet[WeaveBreakpoint]()
  private val exceptions = mutable.HashSet[WeaveExceptionBreakpoint]()

  override def hasBreakpointOn(locationCapable: WeaveLocationCapable)(implicit ctx: ExecutionContext): Boolean = {
    val location = locationCapable.location()
    if (location == null || location.startPosition == null) return false
    val line = location.startPosition.line
    val resource = location.resourceName.name
    lines.exists(bp => bp.lineNumber == line && bp.nameIdentifier == resource)
  }

  override def addBreakpoint(breakpoint: WeaveBreakpoint): Unit = lines.add(breakpoint)
  override def removeBreakpoint(breakpoint: WeaveBreakpoint): Unit = lines.remove(breakpoint)
  override def clearBreakpoints(): Unit = lines.clear()

  override def hasExceptionBreakpoint(e: Exception): Boolean = exceptions.nonEmpty
  override def addExceptionBreakpoint(e: WeaveExceptionBreakpoint): Unit = exceptions.add(e)
  override def removeExceptionBreakpoint(e: WeaveExceptionBreakpoint): Unit = exceptions.remove(e)
}
