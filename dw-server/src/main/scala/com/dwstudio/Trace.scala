package com.dwstudio

import org.mule.weave.v2.interpreted.ExecutionContext
import org.mule.weave.v2.interpreted.debugger.server.DebuggerValueFactory
import org.mule.weave.v2.interpreted.listener.WeaveExecutionListener
import org.mule.weave.v2.interpreted.node.ValueNode
import org.mule.weave.v2.model.values.Value

import scala.collection.mutable

/**
 * Records what every expression in the script evaluated to, without the user
 * having to wrap anything in `log(...)`.
 *
 * The interpreter notifies a `WeaveExecutionListener` before and after each
 * node it executes, handing over the node (which carries its exact source
 * location) and the resulting value. That is the same hook the debugger uses,
 * but nothing here ever blocks: `postExecution` records and returns, so a trace
 * run is an ordinary synchronous run that happens to be slower.
 *
 * Two things keep this from exploding on real scripts:
 *
 *  - **One row per source span, not per execution.** A map body inside
 *    `payload map (…)` executes once per item; recording each would produce
 *    thousands of near-identical rows and snapshot the same shape thousands of
 *    times. Instead the first result for a span is kept and later hits only
 *    bump a counter — so the cost is bounded by the size of the *script*, not
 *    the size of the data.
 *  - **Only the user's own script.** Every stdlib function the script calls is
 *    itself DataWeave and notifies too. Filtering on the resource name drops
 *    all of it.
 */
class TraceListener(script: String, resource: String, maxRows: Int) extends WeaveExecutionListener {

  class Row(val line: Int, val column: Int, val endLine: Int, val endColumn: Int, val expression: String) {
    var kind: String = ""
    var typeName: String = ""
    var value: String = ""
    var error: String = null
    var count: Int = 0
  }

  private val rows = mutable.HashMap[String, Row]()

  /** True when the script had more distinct expressions than `maxRows`. The UI
   *  says so rather than silently showing a partial picture. */
  var truncated: Boolean = false

  /** Rows worth showing, innermost span first within a position. */
  def entries: Seq[Row] =
    rows.values.toSeq.filter(keep).sortBy(r => (r.line, r.column, r.endLine, r.endColumn))

  /** The interpreter reports every node it executes, and a good half of them
   *  say nothing: an object key resolving to its own name, a number literal
   *  evaluating to itself, a function name resolving to the function. Those are
   *  dropped here rather than in the UI, so the row cap counts real rows. */
  private def keep(r: Row): Boolean = {
    if (r.kind == "Document") false            // the whole script — that's the output pane
    else if (r.error != null) true             // where it broke, and every frame above it
    else if (r.value.startsWith("function(")) false
    else unquote(r.value) != unquote(r.expression)
  }

  private def unquote(s: String): String =
    if (s.length >= 2 && s.head == '"' && s.last == '"') s.substring(1, s.length - 1) else s

  override def preExecution(node: ValueNode[_])(implicit ctx: ExecutionContext): Unit = ()

  override def postExecution(node: ValueNode[_], result: Value[_])(implicit ctx: ExecutionContext): Unit = {
    val row = rowFor(node)
    if (row != null && row.count == 0) {
      try {
        // Small caps: this is a glance at the value, not the output pane. Depth
        // 2 keeps nested objects readable on one line.
        val dv = DebuggerValueFactory.create(result, 6, 2)
        row.typeName = dv.typeName()
        row.value = truncate(String.valueOf(dv), 240)
      } catch {
        // Snapshotting must never be able to fail the run it is observing.
        case t: Throwable => row.value = "(" + t.getClass.getSimpleName + " while reading this value)"
      }
    }
    if (row != null) row.count += 1
  }

  override def postExecution(node: ValueNode[_], e: Exception)(implicit ctx: ExecutionContext): Unit = {
    val row = rowFor(node)
    if (row != null) {
      row.error = e.getClass.getSimpleName + ": " + Option(e.getMessage).getOrElse("")
      row.count += 1
    }
  }

  /** The row for this node's source span, creating it on first sight. Null when
   *  the node is outside the user's script or the table is already full. */
  private def rowFor(node: ValueNode[_]): Row = {
    try {
      val loc = node.location()
      if (loc == null || loc.startPosition == null || loc.endPosition == null) return null
      if (loc.resourceName == null || loc.resourceName.name != resource) return null

      val sl = loc.startPosition.line
      val sc = loc.startPosition.column
      val el = loc.endPosition.line
      val ec = loc.endPosition.column
      if (sl <= 0) return null

      val key = sl + ":" + sc + "-" + el + ":" + ec
      rows.get(key) match {
        case Some(r) => r
        case None =>
          if (rows.size >= maxRows) { truncated = true; return null }
          val r = new Row(sl, sc, el, ec, sourceSlice(loc.startPosition.index, loc.endPosition.index))
          r.kind = node.getClass.getSimpleName.stripSuffix("Node")
          rows.put(key, r)
          r
      }
    } catch {
      case _: Throwable => null
    }
  }

  /** The expression as the user wrote it. Sliced out of the script we were
   *  handed rather than asked of the location, whose own `source()` joins
   *  multi-line spans with an ellipsis. */
  private def sourceSlice(from: Int, to: Int): String = {
    if (from < 0 || to > script.length || to <= from) return ""
    val flat = script.substring(from, to).map(c => if (c.isWhitespace) ' ' else c).trim
    truncate(flat.split(' ').filter(_.nonEmpty).mkString(" "), 120)
  }

  private def truncate(s: String, max: Int): String =
    if (s == null) "" else if (s.length <= max) s else s.substring(0, max) + "…"
}
