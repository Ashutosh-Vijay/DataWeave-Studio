//! Long-lived DataWeave evaluation server.
//!
//! Spawns `java -jar dwstudio-server.jar` once at app startup and keeps the
//! process alive for the app's lifetime. Each `run_dataweave` call becomes a
//! newline-delimited JSON exchange over stdin/stdout instead of a fresh
//! subprocess spawn — reducing per-run cost from ~700ms (native CLI) to
//! ~15-50ms (warm in-process eval).
//!
//! Protocol:
//!   request:  {"id":<int>,"script":...,"payloadPath":...,"payloadMime":...,
//!              "varsPath":...,"attributesPath":...,"namedInputs":[...],
//!              "outputMime":"application/json"}
//!   response: {"id":<int>,"ok":<bool>,"output":<string>,
//!              "error":<string|null>,"executionTimeMs":<long>}

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use crate::platform::{hide_console_window, strip_unc_prefix};

/// Result of the startup encoding self-check (see `start`). Read by
/// `get_warmup_status` so the UI can warn the user that non-ASCII output would
/// be corrupted, instead of silently showing them wrong data.
pub static ENCODING_OK: AtomicBool = AtomicBool::new(true);

/// Held in Tauri state. Process handles + a mutex around the pipe so
/// concurrent calls from the UI queue serially through the server.
pub struct DwServerState {
    inner: Mutex<Option<DwServerInner>>,
    next_id: AtomicI64,
    /// Bumped on every start()/restart(). The keepalive thread captures the
    /// value it spawned under and exits once a newer start supersedes it, so
    /// restarts don't leak a keepalive thread each.
    keepalive_gen: AtomicI64,
}

struct DwServerInner {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl DwServerState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
            next_id: AtomicI64::new(1),
            keepalive_gen: AtomicI64::new(0),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DwNamedInput {
    pub name: String,
    pub path: String,
    pub mime: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DwRequest<'a> {
    id: i64,
    script: &'a str,
    payload_path: &'a str,
    payload_mime: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    attributes_path: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    vars_path: Option<&'a str>,
    named_inputs: &'a [DwNamedInput],
    output_mime: &'a str,
    #[serde(skip_serializing_if = "<[String]>::is_empty")]
    classpath: &'a [String],
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    compile_only: bool,
    /// Custom `.dwl` modules so `import x from MyModule` resolves.
    #[serde(skip_serializing_if = "<[DwModule]>::is_empty")]
    modules: &'a [DwModule],
    /// Trace mode: capture the script's `log(...)` output into the response.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    trace: bool,
    /// Target runtime to check against, e.g. "2.4" for Mule 4.4. Empty means
    /// the engine's own version, i.e. no version gating.
    #[serde(skip_serializing_if = "str::is_empty")]
    language_level: &'a str,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DwModule {
    pub name: String,
    pub content: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DwResponse {
    #[allow(dead_code)]
    pub id: i64,
    pub ok: bool,
    pub output: String,
    pub error: Option<String>,
    #[allow(dead_code)]
    pub execution_time_ms: i64,
    /// Captured `log(...)` output when the request set `trace`.
    #[serde(default)]
    pub logs: Option<Vec<String>>,
}

pub struct DwRunArgs<'a> {
    pub script: &'a str,
    pub payload_path: &'a str,
    pub payload_mime: &'a str,
    pub attributes_path: Option<&'a str>,
    pub vars_path: Option<&'a str>,
    pub named_inputs: &'a [DwNamedInput],
    pub output_mime: &'a str,
    pub classpath: &'a [String],
    pub compile_only: bool,
    pub modules: &'a [DwModule],
    pub trace: bool,
    /// Target runtime, e.g. "2.4". Empty = no gating.
    pub language_level: &'a str,
}

/// Resolve the bundled dwstudio-server.jar path from Tauri resources.
fn resolve_server_jar(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let path = app
        .path()
        .resolve(
            "resources/dw-server/dwstudio-server.jar",
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|e| format!("Failed to resolve dwstudio-server.jar: {}", e))?;
    Ok(strip_unc_prefix(path))
}

/// Resolve the bundled JRE's java executable from Tauri resources.
fn resolve_bundled_java(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let bin = if cfg!(target_os = "windows") {
        "resources/jre/bin/java.exe"
    } else {
        "resources/jre/bin/java"
    };
    let path = app
        .path()
        .resolve(bin, tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve bundled JRE: {}", e))?;
    Ok(strip_unc_prefix(path))
}

/// Spawn one candidate `java` and wait for the `{"event":"ready"}` handshake.
///
/// Two things here exist because of how a blocked JVM actually behaves:
///
/// * **stderr is piped, not null.** It used to be `Stdio::null()`, which threw
///   away the only channel that ever explains a refused launch. Whatever the JVM
///   says on its way down is kept and folded into the error.
/// * **the handshake read has a deadline.** Application allowlisting often leaves
///   the process spawned but suspended, so it never prints the handshake and
///   never exits. A plain blocking `read_line` waited on that forever - which is
///   why the splash screen would sit at 85% with nothing logged anywhere.
fn try_start_java(
    java_bin: &std::path::Path,
    jar: &std::path::Path,
) -> Result<(Child, ChildStdin, BufReader<ChildStdout>), String> {
    let mut cmd = Command::new(java_bin);
    cmd.arg("-Xmx512m")
        .arg("-Xss2m")
        // The server writes its response with println -> System.out, which encodes
        // using the JVM's default charset. On Windows that is the OS ANSI codepage,
        // so Hindi/Chinese/euro silently become literal '?' (ok:true, no error).
        //
        // ALL THREE flags are required - which one works depends on the JRE, and we
        // can run on the bundled 17 or on any system JRE:
        //   Java 17  -> System.out follows `file.encoding`   (stdout.encoding: n/a)
        //   Java 19+ -> System.out follows `stdout.encoding`; when the stream is
        //               redirected (our pipe) it falls back to the NATIVE encoding
        //               and ignores file.encoding, so JEP 400 does NOT save us.
        // Verified matrix: file.encoding alone passes on 17 but CORRUPTS on 21;
        // stdout.encoding alone is the reverse. Unknown properties are ignored, so
        // setting all three is safe everywhere. (sun.stdout.encoding is the JDK 18
        // transitional name.)
        .arg("-Dfile.encoding=UTF-8")
        .arg("-Dstdout.encoding=UTF-8")
        .arg("-Dsun.stdout.encoding=UTF-8")
        .arg("-jar")
        .arg(jar)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("{} ({})", java_bin.display(), e))?;

    // Drain stderr on a worker, keeping a rolling tail. An unread pipe fills up
    // and blocks the writer, so this has to be drained even when nobody reads it.
    let tail = std::sync::Arc::new(Mutex::new(String::new()));
    if let Some(errpipe) = child.stderr.take() {
        let tail = tail.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(errpipe);
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap_or(0) > 0 {
                let mut t = tail.lock().unwrap_or_else(|e| e.into_inner());
                t.push_str(&line);
                if t.len() > 4000 {
                    let cut = t.len() - 4000;
                    *t = t[cut..].to_string();
                }
                line.clear();
            }
        });
    }

    let stdin = child.stdin.take().ok_or("server stdin missing")?;
    let stdout = child.stdout.take().ok_or("server stdout missing")?;

    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        let ok = reader.read_line(&mut line).is_ok();
        let _ = tx.send((reader, line, ok));
    });

    // What the JVM managed to say before giving up - the whole reason stderr is
    // piped now. Collapsed onto one line so it fits in a Tauri error string.
    let said = |tail: &std::sync::Arc<Mutex<String>>| -> String {
        let t = tail
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .trim()
            .to_string();
        if t.is_empty() {
            "printed nothing".to_string()
        } else {
            let last: Vec<String> = t.lines().rev().take(6).map(|l| l.to_string()).collect();
            let ordered: Vec<String> = last.into_iter().rev().collect();
            format!("said: {}", ordered.join(" | "))
        }
    };

    match rx.recv_timeout(std::time::Duration::from_secs(90)) {
        Ok((reader, line, true)) if line.contains("\"ready\"") => Ok((child, stdin, reader)),
        Ok((_, line, _)) => {
            let _ = child.kill();
            let what = if line.trim().is_empty() {
                said(&tail)
            } else {
                format!("gave an unexpected handshake ({})", line.trim())
            };
            Err(format!("{} started but {}", java_bin.display(), what))
        }
        Err(_) => {
            let _ = child.kill();
            Err(format!(
                "{} did not respond within 90s and {}",
                java_bin.display(),
                said(&tail)
            ))
        }
    }
}

/// Spawn the server and wait for its `{"event":"ready"}` handshake.
pub fn start(app: &AppHandle) -> Result<(), String> {
    let jar = resolve_server_jar(app)?;
    if !jar.exists() {
        return Err(format!(
            "dwstudio-server.jar not found at {} — bundle is missing.",
            jar.display()
        ));
    }

    // Walk every java we might use, running each one rather than trusting that
    // the file exists. A bundled JRE that is present but not permitted to execute
    // is the most common failure on a managed corporate laptop: application
    // allowlisting (ManageEngine, Ivanti, AppLocker) does not like an unsigned
    // java.exe under a user-writable directory. A JDK installed by IT normally is
    // permitted, so falling through to JAVA_HOME/PATH turns a dead install into a
    // working one instead of a support ticket.
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(bundled) = resolve_bundled_java(app) {
        candidates.push(bundled);
    }
    if let Ok(home) = std::env::var("JAVA_HOME") {
        let exe = if cfg!(target_os = "windows") { "java.exe" } else { "java" };
        candidates.push(std::path::PathBuf::from(home).join("bin").join(exe));
    }
    candidates.push(std::path::PathBuf::from("java"));

    let mut failures: Vec<String> = Vec::new();
    let mut started: Option<(Child, ChildStdin, BufReader<ChildStdout>)> = None;
    for cand in &candidates {
        if cand.is_absolute() && !cand.exists() {
            failures.push(format!("  - {} (not present)", cand.display()));
            continue;
        }
        match try_start_java(cand, &jar) {
            Ok(pipes) => {
                if !failures.is_empty() {
                    log::warn!(
                        "Using fallback Java at {} after: {}",
                        cand.display(),
                        failures.join("; ")
                    );
                }
                started = Some(pipes);
                break;
            }
            Err(e) => failures.push(format!("  - {}", e)),
        }
    }

    let (child, stdin, reader) = match started {
        Some(v) => v,
        None => {
            return Err(format!(
                "DataWeave Studio could not start its Java runtime.\n\nTried:\n{}\n\nThe runtime ships inside the app, so this is almost never a missing Java - it is endpoint security refusing to run it. Ask IT to allowlist the first path above, or install a Java 17 JDK system-wide and set JAVA_HOME.",
                failures.join("\n")
            ));
        }
    };

    let state = app.state::<DwServerState>();
    *state.inner.lock().unwrap_or_else(|e| e.into_inner()) = Some(DwServerInner {
        child,
        stdin,
        stdout: reader,
    });

    // Prime the DW compiler with a representative script (matches the default
    // starter `{ hello: payload.message }`) so the compiler's hot paths —
    // parser, type checker, codegen, JSON reader+writer — are all JIT-warmed
    // and class-cached BEFORE the splash clears. Also primes the cache for
    // the default script directly, so a user's first manual Run on the
    // out-of-the-box workspace lands at ~10ms instead of ~800ms.
    // Match exactly what build_full_script produces for the default workspace
    // (GET method ⇒ has_attributes=true ⇒ injects `input attributes
    // application/json`). Hits the cache on a fresh user's first manual Run.
    let primer_id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let primer_req = format!(
        r#"{{"id":{},"script":"%dw 2.0\ninput payload application/json\ninput attributes application/json\noutput application/json\n---\n{{\n  hello: payload.message\n}}","payloadPath":"","payloadMime":"application/json","namedInputs":[],"outputMime":"application/json","compileOnly":true}}"#,
        primer_id
    );
    {
        let mut guard = state.inner.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(inner) = guard.as_mut() {
            let _ = inner.stdin.write_all(primer_req.as_bytes());
            let _ = inner.stdin.write_all(b"\n");
            let _ = inner.stdin.flush();
            let mut primer_resp = String::new();
            let _ = inner.stdout.read_line(&mut primer_resp);
            log::info!("DW server primer: {}", primer_resp.trim());
        }
    }

    // Encoding self-check — the last line of defence against silently corrupted
    // output. If a JVM/OS combination ever slips past the -D*encoding flags above,
    // non-Latin text comes back as '?' with ok:true and no error, and the user has
    // no way to know their data is wrong. Prove one non-ASCII round-trip here so
    // the UI can warn instead. Costs one eval (~10ms) on an already-warm engine.
    // (If the response bytes aren't valid UTF-8, read_line itself errors — which
    // is also a failed check, exactly as intended.)
    const PROBE: &str = "नमस्ते";
    {
        let probe_id = state.next_id.fetch_add(1, Ordering::Relaxed);
        let probe_req = format!(
            r#"{{"id":{},"script":"%dw 2.0\noutput application/json\n---\n{{ p: \"{}\" }}","payloadPath":"","payloadMime":"application/json","namedInputs":[],"outputMime":"application/json"}}"#,
            probe_id, PROBE
        );
        let mut guard = state.inner.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(inner) = guard.as_mut() {
            let mut resp = String::new();
            let ok = inner.stdin.write_all(probe_req.as_bytes()).is_ok()
                && inner.stdin.write_all(b"\n").is_ok()
                && inner.stdin.flush().is_ok()
                && inner.stdout.read_line(&mut resp).is_ok()
                && resp.contains(PROBE);
            ENCODING_OK.store(ok, Ordering::Relaxed);
            if !ok {
                log::error!(
                    "Engine encoding self-check FAILED — non-ASCII output will be corrupted. Response: {}",
                    resp.trim()
                );
            }
        }
    }

    // Keep-alive: every 60 s send a no-op eval to keep the JVM hot and the
    // DW compiler caches resident in memory. After ~30 s idle the OS pages
    // out warm code and the next user run pays a ~1-2 s "soft warmup" before
    // returning to ~10 ms. Cost of the ping is ~10 ms once a minute (0.02%
    // CPU) which is invisible.
    let keepalive_app = app.clone();
    let my_gen = state.keepalive_gen.fetch_add(1, Ordering::Relaxed) + 1;
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(60));
            let state = keepalive_app.state::<DwServerState>();
            // A newer start()/restart() superseded us — exit so each restart
            // doesn't leak a keepalive thread.
            if state.keepalive_gen.load(Ordering::Relaxed) != my_gen {
                return;
            }
            let id = state.next_id.fetch_add(1, Ordering::Relaxed);
            let req = format!(
                r#"{{"id":{},"script":"%dw 2.0\noutput application/json\n---\n1","payloadPath":"","payloadMime":"application/json","namedInputs":[],"outputMime":"application/json"}}"#,
                id
            );
            let mut guard = state.inner.lock().unwrap_or_else(|e| e.into_inner());
            let Some(inner) = guard.as_mut() else { return; };
            if inner.stdin.write_all(req.as_bytes()).is_err()
                || inner.stdin.write_all(b"\n").is_err()
                || inner.stdin.flush().is_err()
            {
                return;
            }
            let mut resp = String::new();
            if inner.stdout.read_line(&mut resp).is_err() {
                return;
            }
        }
    });

    Ok(())
}

/// Internal run error, split so `run` knows whether respawning could help.
enum RunErr {
    /// The pipe/process looks dead (broken pipe, EOF, missing inner) —
    /// respawning the JVM and retrying may recover.
    Dead(String),
    /// A non-transport failure (serialize / parse) — respawning won't help.
    Other(String),
}
impl From<RunErr> for String {
    fn from(e: RunErr) -> String {
        match e {
            RunErr::Dead(s) | RunErr::Other(s) => s,
        }
    }
}

/// Send a request, block on the response. Single-threaded through the mutex.
pub fn run(app: &AppHandle, args: DwRunArgs) -> Result<DwResponse, String> {
    match run_once(app, &args) {
        Ok(resp) => Ok(resp),
        Err(RunErr::Dead(msg)) => {
            // The JVM is gone (crash, OOM, or an external kill). Respawn +
            // re-prime and retry the request once, so the user's run just works
            // instead of erroring until a manual "Restart engine" / app reload.
            log::warn!("DW server appears dead ({}); respawning and retrying once", msg);
            stop(app);
            start(app)?;
            run_once(app, &args).map_err(String::from)
        }
        Err(RunErr::Other(msg)) => Err(msg),
    }
}

/// One request/response round-trip over the existing process.
fn run_once(app: &AppHandle, args: &DwRunArgs) -> Result<DwResponse, RunErr> {
    let state = app.state::<DwServerState>();
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let req = DwRequest {
        id,
        script: args.script,
        payload_path: args.payload_path,
        payload_mime: args.payload_mime,
        attributes_path: args.attributes_path,
        vars_path: args.vars_path,
        named_inputs: args.named_inputs,
        output_mime: args.output_mime,
        classpath: args.classpath,
        compile_only: args.compile_only,
        modules: args.modules,
        trace: args.trace,
        language_level: args.language_level,
    };
    let line = serde_json::to_string(&req)
        .map_err(|e| RunErr::Other(format!("Failed to serialize request: {}", e)))?;

    let mut guard = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    let inner = guard
        .as_mut()
        .ok_or_else(|| RunErr::Dead("DataWeave server not running".to_string()))?;

    inner
        .stdin
        .write_all(line.as_bytes())
        .map_err(|e| RunErr::Dead(format!("Failed to write to server: {}", e)))?;
    inner
        .stdin
        .write_all(b"\n")
        .map_err(|e| RunErr::Dead(format!("Failed to flush newline: {}", e)))?;
    inner
        .stdin
        .flush()
        .map_err(|e| RunErr::Dead(format!("Failed to flush stdin: {}", e)))?;

    // Read raw bytes until newline — the DW runtime can produce binary output
    // (e.g. multipart/form-data with file parts) which the Java server base64-
    // encodes into JSON, but edge cases can include non-UTF-8 bytes that would
    // make read_line() fail with "stream did not contain valid UTF-8".
    let mut resp_bytes: Vec<u8> = Vec::new();
    inner
        .stdout
        .read_until(b'\n', &mut resp_bytes)
        .map_err(|e| RunErr::Dead(format!("Failed to read from server: {}", e)))?;
    if resp_bytes.is_empty() {
        return Err(RunErr::Dead(
            "DataWeave server closed unexpectedly.".into(),
        ));
    }
    let resp_line = String::from_utf8_lossy(&resp_bytes);

    serde_json::from_str::<DwResponse>(&resp_line)
        .map_err(|e| RunErr::Other(format!("Bad server response: {} (line: {})", e, resp_line.trim())))
}

/// Format (pretty-print) a DataWeave script via the engine's IDE formatter
/// (`op=format`). Shares the live server connection; returns the formatted source.
pub fn format(app: &AppHandle, script: &str) -> Result<String, String> {
    let state = app.state::<DwServerState>();
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let req = serde_json::json!({ "id": id, "op": "format", "script": script }).to_string();

    let mut guard = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    let inner = guard
        .as_mut()
        .ok_or_else(|| "DataWeave server not running".to_string())?;
    inner.stdin.write_all(req.as_bytes()).map_err(|e| format!("Failed to write to server: {}", e))?;
    inner.stdin.write_all(b"\n").map_err(|e| format!("Failed to write to server: {}", e))?;
    inner.stdin.flush().map_err(|e| format!("Failed to flush stdin: {}", e))?;

    let mut resp_bytes: Vec<u8> = Vec::new();
    inner
        .stdout
        .read_until(b'\n', &mut resp_bytes)
        .map_err(|e| format!("Failed to read from server: {}", e))?;
    if resp_bytes.is_empty() {
        return Err("DataWeave server closed unexpectedly.".into());
    }
    let resp_line = String::from_utf8_lossy(&resp_bytes);
    let v: serde_json::Value = serde_json::from_str(&resp_line)
        .map_err(|e| format!("Bad server response: {} (line: {})", e, resp_line.trim()))?;
    if v.get("ok").and_then(|b| b.as_bool()).unwrap_or(false) {
        Ok(v.get("output").and_then(|s| s.as_str()).unwrap_or("").to_string())
    } else {
        Err(v.get("error").and_then(|s| s.as_str()).unwrap_or("format failed").to_string())
    }
}

/// Query the engine's IDE language service (`op=tooling`) — completion, hover,
/// signature help, typeOf, definition, rename, typeCheck. `kind` picks the query
/// and `offset` is a character offset into the script. Returns the raw `result`
/// object; the shape differs per kind and the frontend knows which it asked for.
pub fn tooling(
    app: &AppHandle,
    kind: &str,
    script: &str,
    offset: usize,
    payload: &str,
    classpath: &[String],
    new_name: &str,
    language_level: &str,
) -> Result<serde_json::Value, String> {
    let state = app.state::<DwServerState>();
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let req = serde_json::json!({
        "id": id, "op": "tooling", "kind": kind,
        "script": script, "offset": offset, "payload": payload,
        "classpath": classpath, "newName": new_name,
        "languageLevel": language_level,
    })
    .to_string();

    let mut guard = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    let inner = guard
        .as_mut()
        .ok_or_else(|| "DataWeave server not running".to_string())?;
    inner.stdin.write_all(req.as_bytes()).map_err(|e| format!("Failed to write to server: {}", e))?;
    inner.stdin.write_all(b"\n").map_err(|e| format!("Failed to write to server: {}", e))?;
    inner.stdin.flush().map_err(|e| format!("Failed to flush stdin: {}", e))?;

    let mut resp_bytes: Vec<u8> = Vec::new();
    inner
        .stdout
        .read_until(b'\n', &mut resp_bytes)
        .map_err(|e| format!("Failed to read from server: {}", e))?;
    if resp_bytes.is_empty() {
        return Err("DataWeave server closed unexpectedly.".into());
    }
    let resp_line = String::from_utf8_lossy(&resp_bytes);
    let v: serde_json::Value = serde_json::from_str(&resp_line)
        .map_err(|e| format!("Bad server response: {} (line: {})", e, resp_line.trim()))?;
    if v.get("ok").and_then(|b| b.as_bool()).unwrap_or(false) {
        Ok(v.get("result").cloned().unwrap_or(serde_json::Value::Null))
    } else {
        Err(v.get("error").and_then(|s| s.as_str()).unwrap_or("tooling failed").to_string())
    }
}

/// Kill the server process. Used on shutdown or restart.
pub fn stop(app: &AppHandle) {
    let state = app.state::<DwServerState>();
    let taken = { state.inner.lock().unwrap_or_else(|e| e.into_inner()).take() };
    if let Some(mut inner) = taken {
        let _ = inner.child.kill();
        let _ = inner.child.wait();
    }
}

/// Kill + spawn fresh. Used by the user's "Restart engine" button.
pub fn restart(app: &AppHandle) -> Result<(), String> {
    stop(app);
    start(app)
}
