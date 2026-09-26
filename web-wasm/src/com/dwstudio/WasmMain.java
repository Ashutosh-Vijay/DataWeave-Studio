package com.dwstudio;

import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import org.graalvm.webimage.api.JS;
import org.graalvm.webimage.api.JSString;
import org.mule.weave.v2.runtime.DataWeaveScriptingEngine;
import org.mule.weave.v2.version.DataWeaveRuntimeVersion;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.Comparator;
import java.util.function.Function;
import java.util.stream.Stream;

/**
 * Browser entry point for the Web Image (WASM) build.
 *
 * Speaks the same JSON protocol as DwServer's stdin loop, one request per call.
 * A browser has no disk to hand the engine a path on, so inputs may also arrive
 * inline: payloadContent / payloadBase64, attributesContent, varsContent and
 * namedInputs[].content / .base64. Those are written to the image's in-memory
 * filesystem and swapped for the *Path fields DwServer already reads.
 */
public final class WasmMain {

    private static DataWeaveScriptingEngine engine;
    private static long runSeq = 0;

    // Loaded as a Web Worker (the UI's case) it answers postMessage({id, req})
    // with postMessage({id, resp}); loaded any other way it only sets globals.
    @JS(args = {"handler", "version"}, value =
        "globalThis.dwVersion = version; globalThis.dwHandle = handler;" +
        "if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {" +
        "  self.onmessage = (e) => {" +
        "    let resp;" +
        "    try { resp = handler(e.data.req); }" +
        "    catch (err) { resp = JSON.stringify({ id: -1, ok: false, output: '', error: 'Engine crashed: ' + err, executionTimeMs: 0 }); }" +
        "    self.postMessage({ id: e.data.id, resp: resp });" +
        "  };" +
        "  self.postMessage({ ready: version });" +
        "}" +
        "if (typeof globalThis.onDwReady === 'function') globalThis.onDwReady(version);")
    private static native void export(Function<JSString, JSString> handler, JSString version);

    // The secure-properties classes are compiled into the image, so DwServer's
    // URLClassLoader finds them through its parent; it only needs the jar path
    // to exist.
    static final String SECURE_PROPS_JAR = "/dw/secure-properties-tool.jar";

    public static void main(String[] args) throws IOException {
        DwServer$.MODULE$.bindInputsAsBytes_$eq(true);
        Files.createDirectories(Paths.get("/dw"));
        Files.write(Paths.get(SECURE_PROPS_JAR), new byte[0]);
        engine = DwServer$.MODULE$.createEngine();
        export(req -> JSString.of(handle(req.asString())), JSString.of(DataWeaveRuntimeVersion.weaveVersion()));
    }

    static String handle(String line) {
        JsonObject req;
        try {
            req = Json.parse(line).asObject();
        } catch (Throwable t) {
            return DwServer$.MODULE$.handleRequest(line, engine);
        }
        if ("secureProps".equals(req.getString("op", ""))) req.set("jarPath", SECURE_PROPS_JAR);
        Path dir = Paths.get("/tmp/dw-run-" + (runSeq++));
        try {
            Files.createDirectories(dir);
            inline(req, dir, "payloadContent", "payloadBase64", "payloadPath", "payload.dat");
            inline(req, dir, "attributesContent", null, "attributesPath", "attributes.json");
            inline(req, dir, "varsContent", null, "varsPath", "vars.json");
            JsonValue named = req.get("namedInputs");
            if (named != null && named.isArray()) {
                JsonArray arr = named.asArray();
                for (int i = 0; i < arr.size(); i++) {
                    inline(arr.get(i).asObject(), dir, "content", "base64", "path", "input_" + i + ".dat");
                }
            }
            String resp = DwServer$.MODULE$.handleRequest(req.toString(), engine);
            return req.getBoolean("valueTrace", false) ? withUntracedError(req, resp) : resp;
        } catch (IOException e) {
            JsonObject r = new JsonObject();
            r.add("id", req.getInt("id", -1));
            r.add("ok", false);
            r.add("output", "");
            r.add("error", "IOException: " + e.getMessage());
            r.add("executionTimeMs", 0);
            return r.toString();
        } finally {
            deleteQuietly(dir);
        }
    }

    // Inputs are bound as bytes here, and the trace listener reads each one
    // before the script does. When that first read fails, the listener swallows
    // the real error and the script's second read of the same bytes reports
    // "Unable to parse empty input" instead. An untraced run reads once, so its
    // error is the one to show; the traced rows are kept.
    private static String withUntracedError(JsonObject req, String resp) {
        JsonObject traced = Json.parse(resp).asObject();
        if (traced.getBoolean("ok", true)) return resp;
        JsonObject plain = Json.parse(req.toString()).asObject();
        plain.remove("valueTrace");
        JsonObject untraced = Json.parse(DwServer$.MODULE$.handleRequest(plain.toString(), engine)).asObject();
        if (!untraced.getBoolean("ok", true)) traced.set("error", untraced.get("error"));
        return traced.toString();
    }

    private static void inline(JsonObject obj, Path dir, String textKey, String b64Key, String pathKey, String fileName) throws IOException {
        byte[] bytes = null;
        if (b64Key != null && obj.get(b64Key) != null && obj.get(b64Key).isString()) {
            bytes = Base64.getMimeDecoder().decode(obj.get(b64Key).asString());
        } else if (obj.get(textKey) != null && obj.get(textKey).isString()) {
            bytes = obj.get(textKey).asString().getBytes(StandardCharsets.UTF_8);
        }
        if (bytes == null) return;
        Path f = dir.resolve(fileName);
        Files.write(f, bytes);
        obj.set(pathKey, f.toString());
        obj.remove(textKey);
        if (b64Key != null) obj.remove(b64Key);
    }

    private static void deleteQuietly(Path dir) {
        try (Stream<Path> s = Files.walk(dir)) {
            s.sorted(Comparator.reverseOrder()).forEach(p -> {
                try { Files.deleteIfExists(p); } catch (IOException ignored) { }
            });
        } catch (IOException ignored) {
        }
    }
}
