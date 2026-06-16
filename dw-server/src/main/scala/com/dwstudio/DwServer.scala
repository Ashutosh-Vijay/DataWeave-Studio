package com.dwstudio

import com.eclipsesource.json.{Json, JsonObject}
import org.mule.weave.v2.model.ServiceManager
import org.mule.weave.v2.model.service.{
  CharsetProviderService, LoggingService,
  ProtocolUrlSourceProviderResolverService, UrlProtocolHandler,
  UrlSourceProviderResolverService
}
import org.mule.weave.v2.parser.ast.variables.NameIdentifier
import org.mule.weave.v2.runtime._
import org.mule.weave.v2.sdk.ClassLoaderWeaveResourceResolver
import org.mule.weave.v2.editor.{WeaveToolingService, SimpleVirtualFileSystem, SpecificModuleResourceResolver}
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
    ready.add("weaveVersion", "2.11.0")
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

      // Pick the engine: a module-aware one if the request carries custom `.dwl`
      // modules (so `import x from MyModule` resolves), else the shared engine.
      val (compileEngine, moduleCacheSuffix) = engineForRequest(req, engine)
      // compileOnly: pre-warm the cache without actually evaluating. Used by
      // the debounced editor pre-warmer so the user's first Run is already
      // cached and runs at ~10ms instead of paying ~800ms compile cost.
      val compileOnly: Boolean =
        if (req.get("compileOnly") != null) req.get("compileOnly").asBoolean() else false

      // `output application/java` produces a JVM object that has no text
      // representation — the official Playground sidesteps this by rendering
      // the result as JSON instead. Mirror that: rewrite the directive to
      // application/json before compilation so the JSON writer emits text.
      // The user sees the same readable JSON the Playground shows.
      //
      // Previous regex required end-of-line right after `application/java`.
      // That bypasses the rewrite for forms like
      //     output application/java class="com.example.Order"
      //     output application/java ---
      // and silently produces an empty ByteArrayOutputStream (Java writer
      // ran but emitted no text). Be permissive: swallow ALL trailing
      // properties / whitespace on the same line up to EOL or the `---`
      // separator, so the JSON writer kicks in regardless of what the user
      // tacked on after `application/java`.
      val script = rawScript.replaceAll(
        "(?m)^(\\s*output\\s+)application/java(?:[^\\r\\n-]|-(?!-))*",
        "$1application/json"
      )

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

      def addInput(name: String, path: String, mime: String): Unit = {
        if (path != null && path.nonEmpty) {
          val f = new File(path)
          if (f.exists()) {
            // The (name, File, mime) overload gives DW a stream-compatible
            // source — required for application/json/xml/csv readers.
            bindings.addBinding(name, f, mime)
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
      val cacheKey = script + " " + outputMime + moduleCacheSuffix
      val compiled: DataWeaveScript = CompileCache.get(cacheKey).getOrElse {
        val c = compileEngine.compileWith(
          compileEngine.newConfig()
            .withScript(script)
            .withInputs(inputTypes)
            .withNameIdentifier(NameIdentifier("main"))
            .withDefaultOutputType(outputMime)
        )
        CompileCache.put(cacheKey, c)
        c
      }

      if (compileOnly) {
        successResponse(id, "", started)
      } else {
        // Trace mode captures `log(...)` output for intermediate inspection.
        val trace: Boolean = if (req.get("trace") != null) req.get("trace").asBoolean() else false
        val out = new ByteArrayOutputStream()
        if (trace) {
          val logger = new CapturingLogger()
          compiled.write(bindings, makeServiceManager(logger), Some(out))
          successResponse(id, out.toString("UTF-8"), started, logger.messages.toList)
        } else {
          compiled.write(bindings, makeServiceManager(), Some(out))
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
      var j = 0
      while (j < arr.size()) {
        val m = arr.get(j).asObject()
        val name = m.getString("name", null)
        if (name != null && name.nonEmpty) {
          val f = new File(dir, name.replace("::", "/") + ".dwl")
          Option(f.getParentFile).foreach(_.mkdirs())
          Files.write(f.toPath, m.getString("content", "").getBytes(StandardCharsets.UTF_8))
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
