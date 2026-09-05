package com.dwstudio

import com.eclipsesource.json.{Json, JsonObject}
import org.mule.weave.v2.model.ServiceManager
import org.mule.weave.v2.model.service.{
  CharsetProviderService, LoggingService,
  ProtocolUrlSourceProviderResolverService, UrlProtocolHandler,
  UrlSourceProviderResolverService
}
import org.mule.weave.v2.parser.ast.variables.NameIdentifier
import org.mule.weave.v2.parser.phase.ParsingContext
import org.mule.weave.v2.parser.location.WeaveLocation
import org.mule.weave.v2.runtime._
import org.mule.weave.v2.utils.DataWeaveVersion
import org.mule.weave.v2.versioncheck.SVersion
import org.mule.weave.v2.version.DataWeaveRuntimeVersion
import org.mule.weave.v2.scaffolding.{ScaffoldingService, ScaffoldingConfiguration}
import org.mule.weave.v2.debugger.{DebuggerFrame, DebuggerValue, WeaveBreakpoint}
import org.mule.weave.v2.interpreted.debugger.server.WeaveDebuggerExecutor
import org.mule.weave.v2.sdk.ClassLoaderWeaveResourceResolver
import org.mule.weave.v2.editor.{WeaveToolingService, SimpleVirtualFileSystem, SpecificModuleResourceResolver, ImplicitInput, WeaveTextDocument, WeaveDocumentToolingService, ValidationMessage}
import org.mule.weave.v2.completion.{Template, LiteralElement, PlaceHolderElement, ChoicePlaceHolderElement, EndPlaceHolderElement}
import org.mule.weave.v2.ts.{WeaveType, ObjectType, KeyValuePairType, KeyType, NameType, ArrayType, StringType, NumberType, BooleanType, AnyType}
import org.mule.weave.v2.parser.ast.QName
import org.mule.weave.v2.completion.{DataFormatDescriptorProvider, DataFormatDescriptor}

import java.io.{ByteArrayOutputStream, File}
import java.net.{URL, URLClassLoader}
import java.nio.charset.{Charset, StandardCharsets}
import java.nio.file.Files
import java.util.Properties

/**
 * Long-lived DataWeave evaluation server.
 *
 * Loads the DW runtime once at startup, then sits in a loop reading
 * newline-delimited JSON jobs off stdin and writing JSON responses to
 * stdout. Each second-and-onwards eval skips the JVM/runtime cold start
 * entirely, so per-run cost drops from ~700ms (native CLI subprocess) to
 * ~30-50ms (in-process compile + eval).
 *
 * Protocol — one JSON object per line:
 *
 *   request:  {"id": <int>, "script": <string>, "payloadPath": <string>,
 *             "payloadMime": <string>, "varsPath": <string|null>,
 *             "attributesPath": <string|null>,
 *             "namedInputs": [{"name": <string>, "path": <string>, "mime": <string>}],
 *             "outputMime": <string default "application/json">}
 *
 *   response: {"id": <int>, "ok": <bool>, "output": <string>,
 *              "error": <string|null>, "executionTimeMs": <long>}
 *
 *   ready notice (sent once at startup):
 *             {"event": "ready", "weaveVersion": <string>}
 */
/** A URLClassLoader that exposes addURL, so we can hot-add user JARs to the
 *  classpath after construction without restarting the JVM. */
class HotURLClassLoader(parent: ClassLoader) extends URLClassLoader(Array.empty[URL], parent) {
  // Track what's been added so addJar is idempotent.
  private val added = scala.collection.mutable.Set[String]()
  def addJar(file: File): Unit = synchronized {
    val canon = file.getCanonicalPath
    if (!added.contains(canon) && file.exists()) {
      addURL(file.toURI.toURL)
      added += canon
    }
  }
}

/** Compile cache. The DW engine doesn't cache compiled DataWeaveScript
 *  objects between calls, so every Run pays full parse + type-check + codegen
 *  cost (~800-1000ms even on a hot JVM). Keying by (script text, ordered
 *  list of input names) reuses the compiled artifact for repeated runs of
 *  the same script — the dominant case when the user just keeps pressing
 *  Run. Bounded LRU to cap memory if a user runs many distinct scripts. */
object CompileCache {
  private val MAX = 64
  private val map = new java.util.LinkedHashMap[String, org.mule.weave.v2.runtime.DataWeaveScript](MAX, 0.75f, true) {
    override def removeEldestEntry(eldest: java.util.Map.Entry[String, org.mule.weave.v2.runtime.DataWeaveScript]): Boolean =
      size() > MAX
  }
  def get(key: String): Option[org.mule.weave.v2.runtime.DataWeaveScript] = synchronized {
    Option(map.get(key))
  }
  def put(key: String, script: org.mule.weave.v2.runtime.DataWeaveScript): Unit = synchronized {
    map.put(key, script)
  }
}

object DwServer {

  // Single classloader used as the JVM's Thread context loader. Both DW's
  // module resolver and `import java!...` lookups go through it, so
  // adding a user JAR here makes it visible to subsequent compilations.
  private val hotLoader: HotURLClassLoader =
    new HotURLClassLoader(Thread.currentThread().getContextClassLoader)

  def main(args: Array[String]): Unit = {
    Thread.currentThread().setContextClassLoader(hotLoader)
    val engine = createEngine()

    // Tell the parent process we're ready to accept jobs.
    val ready = new JsonObject()
    ready.add("event", "ready")
    ready.add("weaveVersion", DataWeaveRuntimeVersion.weaveVersion)
    println(ready.toString)

    val in = new java.io.BufferedReader(new java.io.InputStreamReader(System.in, StandardCharsets.UTF_8))
    var line = in.readLine()
    while (line != null) {
      val resp = handleRequest(line, engine)
      println(resp)
      System.out.flush()
      line = in.readLine()
    }
  }

  private def createEngine(): DataWeaveScriptingEngine = {
    val resolver = ClassLoaderWeaveResourceResolver.apply()
    new DataWeaveScriptingEngine(
      ModuleComponentsFactory.apply(resolver),
      ParserConfiguration(),
      new Properties()
    )
  }

  private def handleRequest(line: String, engine: DataWeaveScriptingEngine): String = {
    val started = System.currentTimeMillis()
    val req: JsonObject =
      try Json.parse(line).asObject()
      catch { case _: Throwable => return errorResponse(-1, "Bad request JSON: " + line, started) }

    val id = if (req.get("id") == null) -1 else req.get("id").asInt()
    try {
      val rawScript = req.getString("script", "")
      val outputMime = req.getString("outputMime", "application/json")

      // op=format: pretty-print the script via the DataWeave tooling formatter
      // (same engine the IDE uses) and return it. No evaluation.
      if (req.getString("op", "run") == "format") {
        return successResponse(id, formatScript(rawScript), started)
      }

      // op=debug: everything except `start`. These only read or poke session
      // state, so they answer immediately — which is the whole point of running
      // the script on a worker thread.
      if (req.getString("op", "run") == "debug" && req.getString("action", "") != "start") {
        return debugResponse(id, req, started)
      }

      // op=tooling: the engine's own IDE language service — type-aware completion,
      // hover, signature help, type-of, go-to-definition, rename and type checking.
      // Same WeaveToolingService the formatter uses, so nothing new is constructed.
      if (req.getString("op", "run") == "tooling") {
        return toolingResponse(id, req, started)
      }

      // Pick the engine: a module-aware one if the request carries custom `.dwl`
      // modules (so `import x from MyModule` resolves), else the shared engine.
      val (compileEngine, moduleCacheSuffix) = engineForRequest(req, engine)
      // compileOnly: pre-warm the cache without actually evaluating. Used by
      // the debounced editor pre-warmer so the user's first Run is already
      // cached and runs at ~10ms instead of paying ~800ms compile cost.
      val compileOnly: Boolean =
        if (req.get("compileOnly") != null) req.get("compileOnly").asBoolean() else false

      // The script is compiled exactly as written. `output application/java`
      // is handled after compilation instead (see `renderAs` below): the engine
      // is asked what the script declared and the writer is overridden, rather
      // than rewriting the user's source before the engine ever sees it.
      //
      // This replaces a regex that had already needed one fix — it missed
      // `output application/java class="com.example.Order"` and silently
      // produced empty output — and it can't drift again, because the engine
      // is now the thing parsing the directive.
      val script = rawScript

      // Hot-add any user-provided JARs to the classloader so `import java!...`
      // can resolve classes from them. Idempotent — only new paths get added.
      if (req.get("classpath") != null && req.get("classpath").isArray) {
        val cp = req.get("classpath").asArray()
        var i = 0
        while (i < cp.size()) {
          val entry = cp.get(i).asString()
          if (entry != null && entry.nonEmpty) hotLoader.addJar(new File(entry))
          i += 1
        }
      }

      val bindings = new ScriptingBindings()
      // Track mime per input — DW needs InputType(name, Some(mime)) so the
      // engine picks the right reader (JSON/XML/CSV/...) at parse time.
      val mimeByName = scala.collection.mutable.LinkedHashMap[String, String]()

      // A debug run reads each input twice: once when the debugger snapshots
      // the frame's variables for the UI, and once when the script itself uses
      // it. A file-backed binding is a stream, so the snapshot consumed it and
      // the script then saw an empty payload — `double(payload.n)` failed with
      // Null on a payload that had just been displayed as {"n": 21}. Binding
      // the bytes instead makes the input re-readable.
      val debugRun = req.getString("op", "run") == "debug"

      def addInput(name: String, path: String, mime: String): Unit = {
        if (path != null && path.nonEmpty) {
          val f = new File(path)
          if (f.exists()) {
            // The (name, File, mime) overload gives DW a stream-compatible
            // source — required for application/json/xml/csv readers.
            if (debugRun) bindings.addBinding(name, Files.readAllBytes(f.toPath), mime)
            else bindings.addBinding(name, f, mime)
            mimeByName(name) = mime
          }
        }
      }

      addInput("payload",    req.getString("payloadPath",    null), req.getString("payloadMime", "application/json"))
      addInput("attributes", req.getString("attributesPath", null), "application/json")
      addInput("vars",       req.getString("varsPath",       null), "application/json")

      if (req.get("namedInputs") != null && req.get("namedInputs").isArray) {
        val arr = req.get("namedInputs").asArray()
        var i = 0
        while (i < arr.size()) {
          val item = arr.get(i).asObject()
          val name = item.getString("name", null)
          val path = item.getString("path", null)
          val mime = item.getString("mime", "application/json")
          if (name != null) addInput(name, path, mime)
          i += 1
        }
      }

      // Pass None for the type — DW resolves mime from the script's
      // `input <name> <mime>` directives or the SourceProvider.
      val inputTypes: Array[InputType] =
        mimeByName.keys.toList.map(name => new InputType(name, None)).toArray

      // Cache key: script text + output mime. The script already contains the
      // `input <name> <mime>` directives our Rust runner injects (via
      // build_full_script), so the input shape is implicit. Earlier we also
      // keyed on mimeByName.keys, but that caused misses when the splash
      // primer compiled with [payload] only while the actual run sent
      // [payload, attributes] — even though the script texts were identical.
      // op=debug + action=start forks here: it needs the bindings built above,
      // but must compile fresh (the cached script is shared, and there is no
      // public way to take an execution listener back off one).
      if (req.getString("op", "run") == "debug") {
        return startDebugRun(id, started, compileEngine, script, inputTypes, outputMime, bindings, mimeByName.keys.toSet, req)
      }

      val target = languageLevelOf(req)

      // Value trace records every expression's result as the script runs. It
      // attaches an execution listener, and `DataWeaveScript` has no public way
      // to take one back off, so a traced run must never go through the shared
      // cache in either direction: it compiles fresh and drops the script after.
      val valueTrace: Boolean =
        if (req.get("valueTrace") != null) req.get("valueTrace").asBoolean() else false

      def compileFresh(): DataWeaveScript = {
        val cfg = compileEngine.newConfig()
          .withScript(script)
          .withInputs(inputTypes)
          .withNameIdentifier(NameIdentifier("main"))
          .withDefaultOutputType(outputMime)
        target.foreach(v => cfg.withLanguageVersion(v))
        compileEngine.compileWith(cfg)
      }

      // The target runtime belongs in the key: the same script compiled at 2.11
      // and at 2.4 are different programs, and the 2.4 one may not compile.
      val cacheKey = script + " " + outputMime + moduleCacheSuffix +
        target.map(" @" + _.toString).getOrElse("")
      val compiled: DataWeaveScript =
        if (valueTrace) compileFresh()
        else CompileCache.get(cacheKey).getOrElse {
          val c = compileFresh()
          CompileCache.put(cacheKey, c)
          c
        }

      if (compileOnly) {
        successResponse(id, "", started)
      } else {
        // Trace mode captures `log(...)` output for intermediate inspection.
        val trace: Boolean = if (req.get("trace") != null) req.get("trace").asBoolean() else false
        val out = new ByteArrayOutputStream()

        // A Java-typed result is a JVM object with no text form, so the writer
        // emits nothing at all. The official Playground shows JSON in that
        // case; match it. Asking the compiled script what it declared beats
        // pattern-matching the source: it catches every spelling of the
        // directive, trailing properties and all.
        val declared = compiled.getDeclaredOutputMimeType
        val renderAs: String =
          if (declared.isPresent && declared.get().startsWith("application/java")) "application/json"
          else null

        if (valueTrace) {
          val listener = new TraceListener(script, "main", 400)
          compiled.addExecutionListener(listener)
          // Without this the interpreter can hand back lazy values. Snapshotting
          // one would force it at the wrong moment, and on a reader-backed input
          // walking it is destructive (see NonConsumingDebuggerExecutor); a
          // materialized result is safe to read twice.
          compiled.materializeValues(true)

          val logger = new CapturingLogger()
          val sm = makeServiceManager(logger)
          var failure: String = null
          try {
            if (renderAs != null) compiled.write(bindings, sm, renderAs, Some(out))
            else compiled.write(bindings, sm, Some(out))
          } catch {
            case t: Throwable =>
              failure = t.getClass.getSimpleName + ": " + Option(t.getMessage).getOrElse("")
          }
          // A trace run that fails is the interesting one: the rows recorded up
          // to the throw are exactly what the user is looking for, so the error
          // travels back alongside them rather than instead of them.
          val r = new JsonObject()
          r.add("id", id)
          r.add("ok", failure == null)
          r.add("output", out.toString("UTF-8"))
          if (failure == null) r.add("error", Json.NULL) else r.add("error", failure)
          r.add("executionTimeMs", System.currentTimeMillis() - started)
          if (logger.messages.nonEmpty) {
            val arr = new com.eclipsesource.json.JsonArray()
            logger.messages.foreach(arr.add)
            r.add("logs", arr)
          }
          r.add("trace", traceJson(listener))
          r.toString
        } else if (trace) {
          val logger = new CapturingLogger()
          val sm = makeServiceManager(logger)
          if (renderAs != null) compiled.write(bindings, sm, renderAs, Some(out))
          else compiled.write(bindings, sm, Some(out))
          successResponse(id, out.toString("UTF-8"), started, logger.messages.toList)
        } else {
          val sm = makeServiceManager()
          if (renderAs != null) compiled.write(bindings, sm, renderAs, Some(out))
          else compiled.write(bindings, sm, Some(out))
          successResponse(id, out.toString("UTF-8"), started)
        }
      }
    } catch {
      case t: Throwable =>
        errorResponse(id, t.getClass.getSimpleName + ": " + Option(t.getMessage).getOrElse(""), started)
    }
  }

  /** Pretty-print a DataWeave script using the IDE tooling formatter. Returns the
   *  source unchanged if the formatter reports no reformat is needed. */
  private def formatScript(source: String): String = {
    val vfs = SimpleVirtualFileSystem(scala.collection.immutable.Map("/main.dwl" -> source))
    val provider = DataFormatDescriptorProvider(Array.empty[DataFormatDescriptor])
    val service = WeaveToolingService(vfs, provider, Array.empty[SpecificModuleResourceResolver])
    val doc = service.open("/main.dwl")
    doc.formatting() match {
      case Some(r) => r.newFormat
      case None    => source
    }
  }

  // ── Cached IDE tooling service ──────────────────────────────────────────────
  /** The target runtime a request asks to be checked against, e.g. "2.4" for
   *  Mule 4.4. None means the engine's own version, i.e. no gating at all.
   *
   *  Setting this on the compile config does two things at once: the compiler
   *  rejects stdlib functions newer than the target (every function in the
   *  bundled stdlib carries an @Since annotation) along with language features
   *  gated at 2.3/2.5/2.8, and the runtime's registered behaviour changes flip
   *  back to how that version behaved. The second half is easy to miss --
   *  `[3, "a", true] orderBy $` fails with InvalidComparisonException at 2.11
   *  but InvalidBooleanException at 2.9, from this setting alone. */
  private def languageLevelOf(req: JsonObject): Option[DataWeaveVersion] = {
    val raw = req.getString("languageLevel", "")
    if (raw == null || raw.trim.isEmpty) None
    else raw.trim.split('.') match {
      // DataWeaveVersion(String) throws on anything that is not "major.minor",
      // and this value arrives from the UI, so parse it rather than trust it.
      case Array(maj, min, _*) if maj.nonEmpty && min.nonEmpty &&
        maj.forall(_.isDigit) && min.forall(_.isDigit) =>
        Some(DataWeaveVersion(maj.toInt, min.toInt))
      case _ => None
    }
  }

  // Built once and reused. Constructing a WeaveToolingService loads every
  // DataWeave module from the classpath, which dominates the cost of a query.
  private var toolingVfsRef: SimpleVirtualFileSystem = _
  private var toolingServiceRef: WeaveToolingService = _

  private def toolingService(): (SimpleVirtualFileSystem, WeaveToolingService) = synchronized {
    if (toolingServiceRef == null) {
      toolingVfsRef = SimpleVirtualFileSystem(scala.collection.immutable.Map("/main.dwl" -> ""))
      toolingServiceRef = new WeaveToolingService(
        toolingVfsRef,
        DataFormatDescriptorProvider(Array.empty[DataFormatDescriptor]),
        // Same classpath resolver the runtime engine uses. Without it dw::Core
        // is out of scope: completion drops from 97 suggestions to 2, and field
        // selection returns nothing at all.
        Array(SpecificModuleResourceResolver("dw", ClassLoaderWeaveResourceResolver.apply())),
      ) {
        /** Turn on the engine's cryptographic taint analysis.
         *
         *  `hashWith` and `HMACBinary` declare their algorithm parameter as
         *  `@CryptographicSink` in the bundled stdlib, and a compilation phase
         *  follows what reaches it. It ships switched off, and the only switch
         *  is on the ParsingContext — which the service builds for itself, one
         *  per document. This factory method is the hook.
         *
         *  Only algorithms that are broken for every purpose are listed. SHA-1
         *  is deliberately absent: it is `hashWith`'s own default and still the
         *  right answer for a checksum, so banning it would fire on correct
         *  code far more often than on a real mistake. */
        override def createParsingContext(nameIdentifier: NameIdentifier): ParsingContext = {
          val ctx = super.createParsingContext(nameIdentifier)
          ctx.enableCryptoTaintAnalysis()
          ctx.setCryptoInsecureAlgorithms(Array("MD5", "MD2", "MD4", "HmacMD5"))
          ctx
        }
      }
    }
    (toolingVfsRef, toolingServiceRef)
  }

  /** Sample JSON -> WeaveType, so completion/hover/typeOf know the payload's shape.
   *  Arrays take their first element as representative; unknown values become Any. */
  private def weaveTypeOfJson(v: com.eclipsesource.json.JsonValue): WeaveType = {
    import scala.collection.JavaConverters._
    if (v.isObject) {
      val o = v.asObject()
      val kvs = o.names().asScala.map { n =>
        // AutoCompletionService matches on KeyType(NameType(QName(...))) — a bare
        // NameType key silently yields zero field suggestions.
        KeyValuePairType(KeyType(NameType(Some(QName(n)))), weaveTypeOfJson(o.get(n)), false, false)
      }.toSeq
      ObjectType(kvs, false, false)
    } else if (v.isArray) {
      val items = v.asArray().values().asScala
      ArrayType(if (items.isEmpty) AnyType() else weaveTypeOfJson(items.head))
    } else if (v.isString) StringType(scala.None)
    else if (v.isNumber) NumberType(scala.None)
    else if (v.isBoolean) BooleanType()
    else AnyType()
  }

  /** The engine's IDE language service, exposed over the same stdio protocol.
   *  `kind` picks the query; `offset` is a character offset into the script. */
  /** Serialise a source range for the editor.
   *
   *  `index` is the character offset and is what the editor actually uses -
   *  Monaco converts an offset to a position itself, which sidesteps having to
   *  guess whether the engine counts lines and columns from 0 or from 1. Line
   *  and column ride along for logs and for anything that wants to show a
   *  human-readable position.
   *
   *  Everything here used to be `.toString` on the location object, which threw
   *  away the numbers entirely and produced a pretty-printed source excerpt -
   *  fine to look at, useless to navigate to.
   */
  private def locJson(loc: WeaveLocation): JsonObject = {
    val o = new JsonObject()
    if (loc == null || loc.startPosition == null || loc.endPosition == null) {
      o.add("startIndex", -1)
      o.add("endIndex", -1)
    } else {
      o.add("startIndex", loc.startPosition.index)
      o.add("endIndex", loc.endPosition.index)
      o.add("startLine", loc.startPosition.line)
      o.add("startColumn", loc.startPosition.column)
      o.add("endLine", loc.endPosition.line)
      o.add("endColumn", loc.endPosition.column)
    }
    o
  }

  /** A document the engine's own quick fixes and refactors can edit.
   *
   *  QuickFixAction.run and CodeRefactor.run both mutate a WeaveTextDocument in
   *  place rather than handing back a patch, so the only way to learn what a fix
   *  actually does is to give it a document and read the text back afterwards.
   */
  private class StringDocument(initial: String) extends WeaveTextDocument {
    private val buf = new StringBuilder(initial)
    def result(): String = buf.toString()
    private def clamp(i: Int): Int = math.max(0, math.min(i, buf.length))
    override def insert(text: String, location: Int): Unit = buf.insert(clamp(location), text)
    override def delete(startLocation: Int, endLocation: Int): Unit = {
      val a = clamp(startLocation); val b = math.max(a, clamp(endLocation))
      buf.delete(a, b)
    }
    override def text(startLocation: Int, endLocation: Int): String = {
      val a = clamp(startLocation); val b = math.max(a, clamp(endLocation))
      buf.substring(a, b)
    }
    override def runTemplate(template: Template, location: Int): Unit =
      insert(renderTemplate(template), location)
  }

  /** Templates carry placeholders an interactive editor would let you tab
   *  through. There is no such affordance over stdio, so a placeholder collapses
   *  to its default value and the user edits it afterwards like any other text. */
  private def renderTemplate(template: Template): String = {
    val sb = new StringBuilder
    template.elements.foreach {
      case LiteralElement(content)        => sb.append(content)
      case PlaceHolderElement(default)    => sb.append(default.getOrElse(""))
      case ChoicePlaceHolderElement(opts) => sb.append(opts.headOption.getOrElse(""))
      case EndPlaceHolderElement()        => ()
    }
    sb.toString()
  }

  /** Which checker output is worth showing. See the long note in the typeCheck
   *  branch - both families were measured against this engine, not guessed at. */
  private def isCheckerNoise(msg: String, hasPayloadType: Boolean): Boolean = {
    val ambient = if (hasPayloadType) Seq("vars", "attributes") else Seq("vars", "attributes", "payload")
    msg.startsWith("Auto-Coercing type from") ||
      msg.startsWith("Multiple valid coercion functions") ||
      ambient.exists(n => msg.startsWith("Unable to resolve reference of: `" + n + "`"))
  }

  /** The message as the editor should show it.
   *
   *  The crypto phase's own text names the algorithm and then quotes the
   *  *stdlib's* declaration of `hashWith` as the "source of violation", which
   *  reads as if the problem were in dw::Crypto rather than in the line the
   *  marker is on. Say what happened and what to do instead. */
  private def messageText(vm: ValidationMessage): String = {
    val raw = vm.message.message
    if (vm.message.getClass.getSimpleName != "CryptographicInsecureDocumentError") return raw
    val marker = "algorithm \""
    val from = raw.indexOf(marker)
    if (from < 0) return raw
    val rest = raw.substring(from + marker.length)
    val algo = rest.substring(0, math.max(rest.indexOf('"'), 0))
    "Insecure hash algorithm \"" + algo + "\" — broken against collision attacks. " +
      "Use SHA-256 or stronger unless you are matching a legacy system."
  }

  /** Errors then warnings, noise removed - the ONE ordering shared by typeCheck,
   *  quickFixes and applyQuickFix, so an index means the same thing in all three. */
  /** A hover-sized version of a function's documentation.
   *
   *  The stdlib's doc comments are thorough: `map` carries four worked examples
   *  and renders to 2,700 characters, which as a hover popover is a wall of
   *  text you have to scroll past to see the parameter you came for. Keep the
   *  signature, the description, the parameter table and the first example, and
   *  say how many were left behind.
   *
   *  Done on the rendered markdown rather than through `WeaveDocParser`: the
   *  headings are produced by AsciiDocMigrator from the six literal keywords
   *  the doc grammar recognises, so they are as reliable as the parse tree, and
   *  the parser silently degrades to the raw string when the grammar fails —
   *  which here would mean quietly falling back to the untrimmed wall. */
  private def hoverSizedDoc(markdown: String): String = {
    val marker = "\n### Example"
    val first = markdown.indexOf(marker)
    if (first < 0) return markdown
    val second = markdown.indexOf(marker, first + marker.length)
    if (second < 0) return markdown
    var remaining = 0
    var at = second
    while (at >= 0) {
      remaining += 1
      at = markdown.indexOf(marker, at + marker.length)
    }
    markdown.substring(0, second).trim +
      "\n\n_" + remaining + " more example" + (if (remaining == 1) "" else "s") +
      " in the function reference._"
  }

  private def visibleMessages(doc: WeaveDocumentToolingService, hasPayloadType: Boolean): Seq[(ValidationMessage, String)] = {
    val msgs = doc.typeCheck()
    val all = msgs.errorMessage.toSeq.map(m => (m, "error")) ++ msgs.warningMessage.toSeq.map(m => (m, "warning"))
    all
      .filterNot { case (vm, _) => isCheckerNoise(vm.message.message, hasPayloadType) }
      // The crypto taint phase has two verdicts and reports both down the error
      // channel. Keep the definite one — "you passed the literal MD5" — and drop
      // the speculative one, which fires whenever the algorithm is a variable
      // and so would flag every script that picks its algorithm at runtime.
      .filterNot { case (vm, _) => vm.message.getClass.getSimpleName == "CryptographicInsecureDocumentWarning" }
      // ...and it is advice, not a compile failure: the script runs either way,
      // so it should not sit in the editor looking like a syntax error.
      .map { case (vm, sev) =>
        if (vm.message.getClass.getSimpleName == "CryptographicInsecureDocumentError") (vm, "warning") else (vm, sev)
      }
  }

  /** Does this text parse at all? Used to tell a good quick-fix result from one
   *  the engine mangled - parseCheck is the cheap syntax-only pass. */
  private def parsesCleanly(vfs: SimpleVirtualFileSystem, service: WeaveToolingService, text: String): Boolean = {
    try {
      vfs.updateContent("/main.dwl", text)
      service.open("/main.dwl", new ImplicitInput(), scala.None).parseCheck().errorMessage.isEmpty
    } catch { case _: Throwable => false }
  }

  /** `fun name(args): SomeType = body` -> `fun name(args) = body`. Only touches a
   *  line that is actually a function declaration with an annotation. */
  private def stripReturnType(line: String): String = {
    val re = """^(\s*fun\s+[^(]+\([^)]*\))\s*:\s*.*?(\s=\s.*)$""".r
    line match {
      case re(head, tail) => head + tail
      case _              => line
    }
  }

  // ── Debugger ──────────────────────────────────────────────────────────────
  // One session at a time; the UI debugs one script.
  private var debugSession: DwDebugSession = _

  /** Compile fresh, attach the debugger, and run on a worker thread.
   *
   *  Fresh because `addExecutionListener` mutates the compiled script and
   *  `DataWeaveScript` has no public way to remove one — a cached script that
   *  picked up a debug listener would keep pausing on ordinary runs.
   *
   *  The thread is what keeps the protocol simple: the engine pauses by parking
   *  the executing thread, so the stdio loop has to be somewhere else. */
  private def startDebugRun(
    id: Int,
    started: Long,
    compileEngine: DataWeaveScriptingEngine,
    script: String,
    inputTypes: Array[InputType],
    outputMime: String,
    bindings: ScriptingBindings,
    inputNames: Set[String],
    req: JsonObject): String = {
    try {
      if (debugSession != null) debugSession.stop()

      val session = new DwDebugSession()
      // The input names are exactly the bindings built above; the executor must
      // not walk those while snapshotting (see NonConsumingDebuggerExecutor).
      val executor = new NonConsumingDebuggerExecutor(session, inputNames)
      session.start(executor)

      if (req.get("breakpoints") != null && req.get("breakpoints").isArray) {
        val arr = req.get("breakpoints").asArray()
        var i = 0
        while (i < arr.size()) {
          // "main" is the resource name the run path compiles under, and what
          // the engine reports on every location.
          session.breakpoints.addBreakpoint(WeaveBreakpoint(arr.get(i).asInt(), "main"))
          i += 1
        }
      }

      val compiled = compileEngine.compileWith(
        compileEngine.newConfig()
          .withScript(script)
          .withInputs(inputTypes)
          .withNameIdentifier(NameIdentifier("main"))
          .withDefaultOutputType(outputMime))

      compiled.addExecutionListener(executor)
      // Without this the interpreter can hand back lazy values, and a variables
      // panel showing unevaluated thunks is worse than showing nothing.
      compiled.materializeValues(true)

      debugSession = session

      val worker = new Thread(new Runnable {
        override def run(): Unit = {
          val out = new ByteArrayOutputStream()
          try {
            compiled.write(bindings, makeServiceManager(), Some(out))
            session.output = out.toString("UTF-8")
          } catch {
            case t: Throwable =>
              session.error = t.getClass.getSimpleName + ": " + Option(t.getMessage).getOrElse("")
          } finally {
            session.paused = false
            session.finished = true
          }
        }
      }, "dw-debug")
      worker.setDaemon(true)
      worker.start()

      successResponse(id, "started", started)
    } catch {
      case t: Throwable =>
        errorResponse(id, t.getClass.getSimpleName + ": " + Option(t.getMessage).getOrElse(""), started)
    }
  }

  /** State reads and step commands. Every one returns immediately. */
  private def debugResponse(id: Int, req: JsonObject, started: Long): String = {
    val action = req.getString("action", "state")
    val session = debugSession
    if (session == null) {
      val payload = new JsonObject()
      payload.add("status", "idle")
      return successResponse(id, payload.toString, started)
    }

    action match {
      case "resume"   => session.resume()
      case "stepOver" => session.stepOver()
      case "stepInto" => session.stepInto()
      case "stepOut"  => session.stepOut()
      case "stop"     => session.stop()
      case _          => // "state" and "evaluate" read only
    }

    val payload = new JsonObject()

    if (action == "evaluate") {
      val expr = req.getString("expression", "")
      val frameIndex = if (req.get("frameIndex") == null) -1 else req.get("frameIndex").asInt()
      payload.add("result", session.evaluate(expr, frameIndex))
    }

    // A step command releases the worker, which may re-pause within microseconds.
    // Give it a moment so the caller usually gets the new position in the same
    // round trip instead of having to poll for it.
    if (action == "resume" || action == "stepOver" || action == "stepInto" || action == "stepOut") {
      val deadline = System.currentTimeMillis() + 2000
      while (!session.paused && !session.finished && System.currentTimeMillis() < deadline) {
        Thread.sleep(2)
      }
    }

    payload.add("status", if (session.finished) "finished" else if (session.paused) "paused" else "running")
    if (session.finished) {
      if (session.error != null) payload.add("error", session.error)
      else if (session.output != null) payload.add("output", session.output)
    }
    if (session.paused) {
      payload.add("line", session.stoppedLine)
      payload.add("column", session.stoppedColumn)
      payload.add("reason", session.stopReason)
      payload.add("frames", framesJson(session.frames))
    }
    successResponse(id, payload.toString, started)
  }

  /** Frames outermost-first, each with its variables rendered for display.
   *  DebuggerValue is a sealed ADT whose toString is already the readable form,
   *  so the panel gets a name/type/value triple without walking the tree. */
  private def framesJson(frames: Array[DebuggerFrame]): com.eclipsesource.json.JsonArray = {
    val arr = new com.eclipsesource.json.JsonArray()
    frames.foreach { f =>
      val o = new JsonObject()
      o.add("id", f.id)
      f.name.foreach(n => o.add("name", n))
      o.add("line", f.startPosition.line)
      val vars = new com.eclipsesource.json.JsonArray()
      f.values.foreach { case (name, value) =>
        val v = new JsonObject()
        v.add("name", name)
        v.add("type", value.typeName())
        v.add("value", String.valueOf(value))
        vars.add(v)
      }
      o.add("variables", vars)
      arr.add(o)
    }
    arr
  }

  /** Trace rows, in source order, each carrying the expression as written so
   *  the panel can show `expression -> value` without re-reading the script. */
  private def traceJson(listener: TraceListener): com.eclipsesource.json.JsonArray = {
    val arr = new com.eclipsesource.json.JsonArray()
    listener.entries.foreach { row =>
      val o = new JsonObject()
      o.add("line", row.line)
      o.add("column", row.column)
      o.add("endLine", row.endLine)
      o.add("endColumn", row.endColumn)
      o.add("expression", row.expression)
      o.add("kind", row.kind)
      o.add("type", row.typeName)
      o.add("value", row.value)
      o.add("count", row.count)
      if (row.error != null) o.add("error", row.error)
      arr.add(o)
    }
    if (listener.truncated) {
      val o = new JsonObject()
      o.add("line", 0)
      o.add("column", 0)
      o.add("endLine", 0)
      o.add("endColumn", 0)
      o.add("expression", "")
      o.add("kind", "Truncated")
      o.add("type", "")
      o.add("value", "This script has more expressions than the trace records. Showing the first 400.")
      o.add("count", 0)
      arr.add(o)
    }
    arr
  }

  private def toolingResponse(id: Int, req: JsonObject, started: Long): String = {
    val source = req.getString("script", "")
    val offset = if (req.get("offset") == null) 0 else req.get("offset").asInt()
    val kind   = req.getString("kind", "completion")

    // Any classpath the request carries has to be on the hot loader before the
    // service resolves names, or user classes are invisible to completion.
    if (req.get("classpath") != null && req.get("classpath").isArray) {
      val cp = req.get("classpath").asArray()
      var i = 0
      while (i < cp.size()) {
        val entry = cp.get(i).asString()
        if (entry != null && entry.nonEmpty) hotLoader.addJar(new File(entry))
        i += 1
      }
    }

    val (vfs, service) = toolingService()
    // Gate the editor on the same target the run path uses, so completion and
    // diagnostics agree with what a Run would actually accept. This no-ops when
    // the value is unchanged; a real change invalidates every cached editor and
    // module (~250ms to rebuild), which is fine for a picker the user moves by
    // hand but would be ruinous per keystroke.
    service.updateLanguageLevel(languageLevelOf(req).map(v => SVersion(v.major, v.minor, 0)))
    // Mutating the cached VFS instead of rebuilding the service is the whole
    // point: construction reloads every module (~250ms), the query itself is
    // single-digit ms. The service caches editors per URL and invalidates them
    // when the content or the implicit inputs change.
    vfs.updateContent("/main.dwl", source)

    // Without an input type the service has nothing to offer after `payload.` —
    // it returns zero suggestions. Infer the shape from the sample payload the
    // user already has loaded and hand it over as the implicit input.
    val inputs = new ImplicitInput()
    val rawPayload = req.getString("payload", "")
    var hasPayloadType = false
    if (rawPayload.trim.nonEmpty) {
      try {
        inputs.addInput("payload", weaveTypeOfJson(Json.parse(rawPayload)))
        hasPayloadType = true
      } catch { case _: Throwable => () }  // not JSON: fall back to no input type
    }
    val doc = service.open("/main.dwl", inputs, scala.None)

    val payload = new JsonObject()
    try {
      kind match {
        case "completion" =>
          val arr = new com.eclipsesource.json.JsonArray()
          // completionItems(offset) returns nothing for field selection; the
          // cursor has to be positioned first, and completion() carries the
          // replacement range the editor needs anyway.
          doc.cursorAt(offset)
          val sr = doc.completion(offset)
          payload.add("replacementStart", sr.replacementStart)
          payload.add("replacementEnd", sr.replacementEnd)
          sr.suggestions.foreach { sg =>
            val o = new JsonObject()
            o.add("label", sg.name)
            o.add("insertText", sg.insertText)
            o.add("itemType", sg.itemType)
            sg.wtype.foreach(t => o.add("type", t.toString))
            sg.markdownDocumentation().foreach(d => o.add("doc", d))
            arr.add(o)
          }
          payload.add("items", arr)

        // The `/** ... */` comment at the top of a module. The parser binds a
        // doc comment at index 0 to the document node itself, which is how
        // module-level documentation works; the engine strips the `*` gutter
        // and converts the AsciiDoc, both of which a regex here would get
        // subtly wrong.
        case "moduleDoc" =>
          doc.documentation() match {
            case Some(d) =>
              payload.add("doc", d.markdownDoc())
              d.parseDoc().smallDescription.foreach(sd => payload.add("summary", sd.trim))
            case None => payload.add("doc", Json.NULL)
          }

        case "hover" =>
          doc.hoverResult(offset) match {
            case Some(h) =>
              payload.add("type", h.resultType.toString)
              h.markdownDocs.foreach(d => payload.add("doc", hoverSizedDoc(d)))
            case None => payload.add("type", Json.NULL)
          }

        case "signature" =>
          doc.signatureInfo(offset) match {
            case Some(sig) =>
              payload.add("name", sig.name)
              payload.add("activeParameter", sig.currentArgIndex)
              val arr = new com.eclipsesource.json.JsonArray()
              sig.signatures.foreach { sd =>
                val o = new JsonObject()
                val params = new com.eclipsesource.json.JsonArray()
                sd.parameters.foreach { prm =>
                  val po = new JsonObject()
                  po.add("name", prm.name)
                  po.add("type", prm.wtype.toString)
                  po.add("active", prm.active)
                  params.add(po)
                }
                o.add("parameters", params)
                o.add("active", sd.active)
                sd.docAsMarkdown().foreach(d => o.add("doc", hoverSizedDoc(d)))
                arr.add(o)
              }
              payload.add("signatures", arr)
            case None => payload.add("name", Json.NULL)
          }

        // Realistic sample data for a type. The engine ships a generator that
        // is name-aware -- a field called `email` gets a real-looking address,
        // `creditCard` a valid-format number -- and it returns a whole runnable
        // script whose output IS the sample, so the caller just runs it through
        // the normal path rather than us re-entering the engine here.
        //
        // With a selection, the type is whatever is selected; without one it is
        // the script's own output type, which answers "what shape does this
        // produce" without needing an input to run against.
        case "sampleData" =>
          val mime = req.getString("mimeType", "application/json")
          val repeat = if (req.get("repeat") == null) 1 else req.get("repeat").asInt()
          val endOffset = if (req.get("endOffset") == null) -1 else req.get("endOffset").asInt()
          val wt: Option[WeaveType] =
            if (endOffset > offset) Option(doc.typeOf(offset, endOffset))
            else doc.typeOfMapping()
          wt match {
            case Some(t) =>
              val generated = new ScaffoldingService()
                .scaffold(t, mime, Map.empty[String, Any], ScaffoldingConfiguration(repeat))
              // A type with nothing to generate (Array<Nothing>, an empty
              // object) makes the scaffolder emit `[,` / `{,` — not valid DW.
              // Better to say "nothing to generate" than hand back a script
              // that fails to compile.
              val broken = generated.contains("[,") || generated.contains("{,") ||
                generated.split("---").lastOption.forall(_.trim.isEmpty)
              if (broken) payload.add("script", Json.NULL)
              else payload.add("script", generated.trim)
              payload.add("type", t.toString)
            case None =>
              payload.add("script", Json.NULL)
          }

        case "typeGraph" =>
          doc.typeGraphString() match {
            case Some(g) => payload.add("graph", g.take(600))
            case None    => payload.add("graph", Json.NULL)
          }

        case "typeOf" =>
          payload.add("type", doc.typeOf(offset).toString)

        case "definition" =>
          // definitions() returns Links: where the name was used, and the
          // Reference it resolves to. The editor wants the target.
          val arr = new com.eclipsesource.json.JsonArray()
          doc.definitions(offset).foreach { l =>
            val o = new JsonObject()
            o.add("name", l.reference.referencedNode.name)
            o.add("target", locJson(l.reference.referencedNode.location()))
            o.add("origin", locJson(l.linkLocation.location()))
            arr.add(o)
          }
          payload.add("links", arr)

        case "references" =>
          val arr = new com.eclipsesource.json.JsonArray()
          doc.references(offset).foreach { r =>
            val o = new JsonObject()
            o.add("name", r.referencedNode.name)
            o.add("location", locJson(r.referencedNode.location()))
            arr.add(o)
          }
          payload.add("references", arr)

        case "rename" =>
          // Every occurrence the engine says belongs to this symbol - scope
          // aware, so a shadowed name in another scope is correctly left alone.
          val arr = new com.eclipsesource.json.JsonArray()
          doc.rename(offset, req.getString("newName", "renamed")).foreach { r =>
            val o = new JsonObject()
            o.add("name", r.referencedNode.name)
            o.add("location", locJson(r.referencedNode.location()))
            arr.add(o)
          }
          payload.add("references", arr)

        case "documentSymbol" =>
          val arr = new com.eclipsesource.json.JsonArray()
          doc.documentSymbol().foreach { sym =>
            val o = new JsonObject()
            o.add("name", sym.name)
            o.add("kind", sym.kind)
            o.add("location", locJson(sym.location))
            sym.containerName.foreach(c => o.add("container", c))
            arr.add(o)
          }
          payload.add("symbols", arr)

        // Semantic tokens: colouring driven by the parsed AST rather than by
        // pattern-matching text. The engine knows a bare identifier is a
        // function call, a parameter, a property or a type reference; a regex
        // tokenizer can only guess.
        case "semanticTokens" =>
          val arr = new com.eclipsesource.json.JsonArray()
          doc.semanticTokens().foreach { t =>
            val loc = t.location
            // Monaco has no multi-line token, so anything spanning lines is
            // dropped rather than mis-highlighted.
            if (loc.startPosition.line == loc.endPosition.line) {
              val o = new JsonObject()
              o.add("type", t.tokenType)
              o.add("line", loc.startPosition.line)
              o.add("column", loc.startPosition.column)
              o.add("length", loc.endPosition.column - loc.startPosition.column)
              if (t.tokenModifiers.nonEmpty) o.add("modifiers", t.tokenModifiers.mkString(","))
              arr.add(o)
            }
          }
          payload.add("tokens", arr)

        case "folding" =>
          val arr = new com.eclipsesource.json.JsonArray()
          doc.foldingRegions().foreach { fr =>
            val o = new JsonObject()
            o.add("kind", fr.kind)
            o.add("location", locJson(fr.location))
            arr.add(o)
          }
          payload.add("regions", arr)

        case "typeCheck" =>
          // The engine's own type checker AND its linter, which both ride the
          // same compilation. The inspectors (sizeOf-equals-zero, unnecessary
          // if, double negation, deprecated using(), unused import, ...) are
          // constructed inside WeaveDocumentToolingService itself, so their
          // findings arrive here as warnings without any extra wiring.
          //
          // Two families are dropped rather than shown. Both were measured
          // against this engine, not guessed at:
          //
          //  * "Auto-Coercing type from: `Any` to: X" - emitted once per
          //    candidate coercion whenever a value's type isn't known. A
          //    three-line script reading one absent field produced 33 of them.
          //
          //  * "Unable to resolve reference of: `payload`" - only true because
          //    WE didn't hand over an input type. Every XML, CSV or binary
          //    payload would otherwise light up a correct script with hard
          //    errors on every `payload` reference.
          //
          // `code` is the message's own class name, which reads like a lint rule
          // id (UnnecessaryIfBlockMessage, InvalidReferenceMessage) and lets the
          // editor tell a style hint from a type error without matching on prose.
          val arr = new com.eclipsesource.json.JsonArray()
          visibleMessages(doc, hasPayloadType).foreach { case (vm, sev) =>
            val o = new JsonObject()
            o.add("severity", sev)
            o.add("location", locJson(vm.location))
            o.add("message", messageText(vm))
            o.add("code", vm.message.getClass.getSimpleName)
            // Ask for fixes rather than reading vm.quickFix: getQuickFix
            // SYNTHESISES them for common shapes (an unresolved reference gets
            // create-variable / create-function), where the prepopulated array
            // is usually empty.
            val fixes = new com.eclipsesource.json.JsonArray()
            try {
              doc.getQuickFix(vm.message).foreach { qf =>
                val f = new JsonObject()
                f.add("name", qf.name)
                f.add("description", qf.description)
                fixes.add(f)
              }
            } catch { case _: Throwable => () }
            o.add("quickFixes", fixes)
            arr.add(o)
          }
          payload.add("messages", arr)

        case "applyQuickFix" =>
          // Stateless by necessity: a QuickFixAction is a live object built
          // during a type-check and cannot travel over stdio. So we re-run the
          // check on the same text, take the same message by index, and run its
          // Nth fix. Deterministic as long as the script is unchanged between
          // the two calls, which it is - the editor sends its current model both
          // times.
          val mi = if (req.get("messageIndex") == null) 0 else req.get("messageIndex").asInt()
          val fi = if (req.get("fixIndex") == null) 0 else req.get("fixIndex").asInt()
          val msgs = visibleMessages(doc, hasPayloadType)
          if (mi < 0 || mi >= msgs.size) {
            return errorResponse(id, "No message at index " + mi, started)
          }
          val fixes = doc.getQuickFix(msgs(mi)._1.message)
          if (fi < 0 || fi >= fixes.length) {
            return errorResponse(id, "No quick fix at index " + fi, started)
          }
          val document = new StringDocument(source)
          fixes(fi).quickFix.run(document)
          var produced = document.result()

          // "Create Function" infers the return type from the CALL SITE. In an
          // unconstrained position it writes none, which is what you want. Passed
          // to a single-signature function it writes something genuinely useful
          // (upper(f(1)) gives `: String | Null`). But inside a heavily overloaded
          // operator such as `++`, it emits the union of every type that operator
          // accepts - and that union carries type variables (`T`, `Q <: Object`)
          // which are not bound in the generated scope, so the signature does not
          // parse.
          //
          // Rather than pattern-match for that shape, just check: if the engine's
          // own output no longer parses, drop the return annotation and see
          // whether that fixes it. A missing return type is always valid
          // DataWeave; a broken one never is. If stripping doesn't help either,
          // hand back what the engine said and let the user judge.
          if (!parsesCleanly(vfs, service, produced)) {
            val stripped = produced
              .split(String.valueOf('\n'))
              .map(stripReturnType)
              .mkString(String.valueOf('\n'))
            if (stripped != produced && parsesCleanly(vfs, service, stripped)) produced = stripped
          }
          // Leave the cached document holding the text the request came in with,
          // so the next query isn't answered against a trial balloon.
          vfs.updateContent("/main.dwl", source)

          payload.add("script", produced)
          payload.add("applied", fixes(fi).name)

        case "refactor" =>
          // extractVariable / extractConstant / extractFunction. These mutate a
          // document too, so the shape matches applyQuickFix: run it, hand back
          // the whole rewritten script and let the editor diff it into the model.
          val start = if (req.get("start") == null) 0 else req.get("start").asInt()
          val end   = if (req.get("end") == null) 0 else req.get("end").asInt()
          val what  = req.getString("refactor", "variable")
          val maybe = what match {
            case "constant" => doc.extractConstant(start, end)
            case "function" => doc.extractFunction(start, end)
            case _          => doc.extractVariable(start, end)
          }
          maybe match {
            case Some(refactor) =>
              // parameters() is what an IDE would prompt for (the new name, and
              // so on). Over stdio we take the defaults; the user renames after
              // with F2, which is now wired.
              val args = refactor.parameters().map(p => (p.name, p.defaultValue.asInstanceOf[Any])).toMap
              val document = new StringDocument(source)
              refactor.run(document, args)
              payload.add("script", document.result())
              val ps = new com.eclipsesource.json.JsonArray()
              refactor.parameters().foreach { p =>
                val o = new JsonObject()
                o.add("name", p.name); o.add("default", p.defaultValue); o.add("title", p.title)
                ps.add(o)
              }
              payload.add("parameters", ps)
            case None =>
              payload.add("script", Json.NULL)
          }

        case "availableFunctions" =>
          // Everything in scope, straight from the engine - the live equivalent
          // of the generated 309-function list. Docs are deliberately NOT
          // rendered here: markdownDoc() runs an asciidoc conversion per entry
          // and there are hundreds, which is a real cost for text a completion
          // popup does not show until one item is focused.
          val arr = new com.eclipsesource.json.JsonArray()
          doc.availableFunctions().foreach { fd =>
            val o = new JsonObject()
            o.add("name", fd.nameIdentifier.name)
            fd.returnType.foreach(rt => o.add("returns", rt.toString))
            val ps = new com.eclipsesource.json.JsonArray()
            fd.params.foreach { p =>
              val po = new JsonObject()
              po.add("name", p.name)
              p.weaveType.foreach(t => po.add("type", t.toString))
              p.defaultValue.foreach(d => po.add("default", d))
              ps.add(po)
            }
            o.add("params", ps)
            if (fd.labels.nonEmpty) o.add("labels", fd.labels.mkString(", "))
            arr.add(o)
          }
          payload.add("functions", arr)

        case "visibleVariables" =>
          val arr = new com.eclipsesource.json.JsonArray()
          doc.visibleLocalVariables(offset).foreach { v =>
            val o = new JsonObject()
            o.add("name", v.name)
            o.add("type", v.weaveType.toString)
            arr.add(o)
          }
          payload.add("variables", arr)

        case "scaffoldDocs" =>
          // A doc comment for the function under the cursor, with its parameters
          // already listed. Both this and unitTest need the range to land on a
          // function DECLARATION, not a call - they resolve a FunctionDirectiveNode
          // and return None for anything else.
          val start = if (req.get("start") == null) offset else req.get("start").asInt()
          val end   = if (req.get("end") == null) start else req.get("end").asInt()
          doc.scaffoldDocs(start, end) match {
            case Some(text) => payload.add("docs", text)
            case None       => payload.add("docs", Json.NULL)
          }

        case "unitTest" =>
          val start = if (req.get("start") == null) offset else req.get("start").asInt()
          val end   = if (req.get("end") == null) start else req.get("end").asInt()
          doc.createUnitTestFromDefinition(start, end) match {
            case Some(text) =>
              payload.add("test", text)
              payload.add("path", doc.getTestPathFromDefinition())
            case None => payload.add("test", Json.NULL)
          }

        case "validateDocs" =>
          val arr = new com.eclipsesource.json.JsonArray()
          val vd = doc.validateDocs()
          def addDocMsgs(items: Array[org.mule.weave.v2.editor.ValidationMessage], sev: String): Unit =
            items.foreach { vm =>
              val o = new JsonObject()
              o.add("severity", sev)
              o.add("location", locJson(vm.location))
              o.add("message", messageText(vm))
              o.add("code", vm.message.getClass.getSimpleName)
              arr.add(o)
            }
          addDocMsgs(vd.errorMessage, "error")
          addDocMsgs(vd.warningMessage, "warning")
          payload.add("messages", arr)

        case other =>
          return errorResponse(id, "Unknown tooling kind: " + other, started)
      }
    } catch {
      case t: Throwable =>
        return errorResponse(id, "tooling/" + kind + " failed: " + t.toString, started)
    }

    val r = new JsonObject()
    r.add("id", id); r.add("ok", true); r.add("kind", kind)
    r.add("result", payload)
    r.add("error", Json.NULL)
    r.add("executionTimeMs", System.currentTimeMillis() - started)
    r.toString
  }

  // ── Custom DataWeave modules (`import x from MyModule`) ─────────────────────
  // A module resolves to a `.dwl` file on the classpath. The engine's resolver
  // captures its classloaders at CREATION (it doesn't re-read the thread CL), and
  // a URLClassLoader caches file content — so to resolve custom modules AND pick
  // up edits, we build a FRESH engine + classloader per distinct module set,
  // keyed by a hash of the module contents. Same set ⇒ warm reuse (and the
  // compile cache hits); changed set ⇒ fresh resolution, no stale content, no
  // cross-set name collisions. Bounded LRU caps memory + temp dirs.
  private val moduleBaseDir: File = {
    val d = new File(System.getProperty("java.io.tmpdir"), "dwstudio-modules-" + java.util.UUID.randomUUID().toString)
    d.mkdirs(); d
  }

  private def deleteRecursively(f: File): Unit = {
    if (f.isDirectory) { val fs = f.listFiles(); if (fs != null) fs.foreach(deleteRecursively) }
    f.delete()
  }

  private val MAX_MODULE_ENGINES = 8
  private val moduleEngines =
    new java.util.LinkedHashMap[String, DataWeaveScriptingEngine](MAX_MODULE_ENGINES, 0.75f, true) {
      override def removeEldestEntry(e: java.util.Map.Entry[String, DataWeaveScriptingEngine]): Boolean = {
        val over = size() > MAX_MODULE_ENGINES
        if (over) deleteRecursively(new File(moduleBaseDir, e.getKey))
        over
      }
    }

  /** The engine to compile a request with: a module-aware one if the request
   *  carries `modules` (a JSON array of {name, content}, name may be nested with
   *  `::`), else the shared engine. Also returns a compile-cache-key suffix. */
  private def engineForRequest(req: JsonObject, shared: DataWeaveScriptingEngine): (DataWeaveScriptingEngine, String) = {
    val mods = req.get("modules")
    if (mods == null || !mods.isArray || mods.asArray().size() == 0) return (shared, "")
    val arr = mods.asArray()
    val sb = new StringBuilder
    var i = 0
    while (i < arr.size()) {
      val m = arr.get(i).asObject()
      val name = m.getString("name", null)
      if (name != null && name.nonEmpty) sb.append(name).append(':').append(m.getString("content", "")).append(';')
      i += 1
    }
    if (sb.isEmpty) return (shared, "")
    val hash = Integer.toHexString(sb.toString.hashCode)
    val engine = Option(moduleEngines.get(hash)).getOrElse {
      val dir = new File(moduleBaseDir, hash)
      // Collect explicit names so a forgiving alias never clobbers a module the
      // user namespaced on purpose.
      val explicit = scala.collection.mutable.HashSet[String]()
      var k = 0
      while (k < arr.size()) {
        val nm = arr.get(k).asObject().getString("name", null)
        if (nm != null && nm.nonEmpty) explicit += nm
        k += 1
      }
      def writeModule(path: String, content: String): Unit = {
        val f = new File(dir, path.replace("::", "/") + ".dwl")
        Option(f.getParentFile).foreach(_.mkdirs())
        Files.write(f.toPath, content.getBytes(StandardCharsets.UTF_8))
      }
      var j = 0
      while (j < arr.size()) {
        val m = arr.get(j).asObject()
        val name = m.getString("name", null)
        if (name != null && name.nonEmpty) {
          val content = m.getString("content", "")
          writeModule(name, content)
          // Forgiving resolution: a bare-named module (no `::`) is ALSO importable
          // under the common MuleSoft conventions `modules::Name` / `module::Name`,
          // so a user who follows the standard `import x from modules::MyModule`
          // doesn't have to rename. Skipped if such a name is used explicitly.
          if (!name.contains("::")) {
            for (pfx <- Seq("modules", "module")) {
              val alias = pfx + "::" + name
              if (!explicit.contains(alias)) writeModule(alias, content)
            }
          }
        }
        j += 1
      }
      val cl = new URLClassLoader(Array(dir.toURI.toURL), hotLoader)
      val resolver = ClassLoaderWeaveResourceResolver.providedClassLoader(Seq(cl, hotLoader))
      val e = new DataWeaveScriptingEngine(ModuleComponentsFactory.apply(resolver), ParserConfiguration(), new Properties())
      moduleEngines.put(hash, e)
      e
    }
    (engine, " // mods:" + hash)
  }

  private def makeServiceManager(logger: LoggingService = NullLogger): ServiceManager = {
    val charsetService = new CharsetProviderService {
      override def defaultCharset(): Charset = StandardCharsets.UTF_8
    }
    val urlService = new ProtocolUrlSourceProviderResolverService(Seq(UrlProtocolHandler))
    val customServices: Map[Class[_], _] = Map(
      classOf[UrlSourceProviderResolverService] -> urlService,
      classOf[CharsetProviderService] -> charsetService
    )
    ServiceManager(logger, customServices)
  }

  private object NullLogger extends LoggingService {
    override def isInfoEnabled(): Boolean = false
    override def logInfo(msg: String): Unit = ()
    override def logError(msg: String): Unit = ()
    override def logWarn(msg: String): Unit = ()
  }

  /** Trace mode: collects everything the script's `log(...)` calls emit so the
   *  caller can inspect intermediate pipeline values. isInfoEnabled MUST be true
   *  or the engine short-circuits `log()` and never calls us. */
  private class CapturingLogger extends LoggingService {
    val messages = scala.collection.mutable.ArrayBuffer[String]()
    override def isInfoEnabled(): Boolean = true
    private def add(msg: String): Unit = messages.synchronized { messages += msg }
    override def logInfo(msg: String): Unit = add(msg)
    override def logError(msg: String): Unit = add(msg)
    override def logWarn(msg: String): Unit = add(msg)
  }

  private def successResponse(id: Int, output: String, started: Long, logs: List[String] = Nil): String = {
    val r = new JsonObject()
    r.add("id", id)
    r.add("ok", true)
    r.add("output", output)
    r.add("error", Json.NULL)
    r.add("executionTimeMs", System.currentTimeMillis() - started)
    if (logs.nonEmpty) {
      val arr = new com.eclipsesource.json.JsonArray()
      logs.foreach(arr.add)
      r.add("logs", arr)
    }
    r.toString
  }

  private def errorResponse(id: Int, msg: String, started: Long): String = {
    val r = new JsonObject()
    r.add("id", id)
    r.add("ok", false)
    r.add("output", "")
    r.add("error", msg)
    r.add("executionTimeMs", System.currentTimeMillis() - started)
    r.toString
  }
}
