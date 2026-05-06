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

import java.io.{ByteArrayOutputStream, File}
import java.net.{URL, URLClassLoader}
import java.nio.charset.{Charset, StandardCharsets}
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

      // `output application/java` produces a JVM object that has no text
      // representation — the official Playground sidesteps this by rendering
      // the result as JSON instead. Mirror that: rewrite the directive to
      // application/json before compilation so the JSON writer emits text.
      // The user sees the same readable JSON the Playground shows.
      val script = rawScript.replaceAll(
        "(?m)^(\\s*output\\s+)application/java(\\s*)$",
        "$1application/json$2"
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

      val compiled: DataWeaveScript = engine
        .compileWith(
          engine.newConfig()
            .withScript(script)
            .withInputs(inputTypes)
            .withNameIdentifier(NameIdentifier("main"))
            .withDefaultOutputType(outputMime)
        )

      val out = new ByteArrayOutputStream()
      compiled.write(bindings, makeServiceManager(), Some(out))
      successResponse(id, out.toString("UTF-8"), started)
    } catch {
      case t: Throwable =>
        errorResponse(id, t.getClass.getSimpleName + ": " + Option(t.getMessage).getOrElse(""), started)
    }
  }

  private def makeServiceManager(): ServiceManager = {
    val charsetService = new CharsetProviderService {
      override def defaultCharset(): Charset = StandardCharsets.UTF_8
    }
    val urlService = new ProtocolUrlSourceProviderResolverService(Seq(UrlProtocolHandler))
    val customServices: Map[Class[_], _] = Map(
      classOf[UrlSourceProviderResolverService] -> urlService,
      classOf[CharsetProviderService] -> charsetService
    )
    ServiceManager(NullLogger, customServices)
  }

  private object NullLogger extends LoggingService {
    override def isInfoEnabled(): Boolean = false
    override def logInfo(msg: String): Unit = ()
    override def logError(msg: String): Unit = ()
    override def logWarn(msg: String): Unit = ()
  }

  private def successResponse(id: Int, output: String, started: Long): String = {
    val r = new JsonObject()
    r.add("id", id)
    r.add("ok", true)
    r.add("output", output)
    r.add("error", Json.NULL)
    r.add("executionTimeMs", System.currentTimeMillis() - started)
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
