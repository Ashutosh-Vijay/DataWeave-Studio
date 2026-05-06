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
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
fn hide_console_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console_window(_cmd: &mut Command) {}

#[cfg(target_os = "windows")]
fn strip_unc_prefix(path: std::path::PathBuf) -> std::path::PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix("\\\\?\\") {
        std::path::PathBuf::from(stripped)
    } else {
        path
    }
}

#[cfg(not(target_os = "windows"))]
fn strip_unc_prefix(path: std::path::PathBuf) -> std::path::PathBuf {
    path
}

/// Held in Tauri state. Process handles + a mutex around the pipe so
/// concurrent calls from the UI queue serially through the server.
pub struct DwServerState {
    inner: Mutex<Option<DwServerInner>>,
    next_id: AtomicI64,
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

/// Spawn the server and wait for its `{"event":"ready"}` handshake.
pub fn start(app: &AppHandle) -> Result<(), String> {
    let jar = resolve_server_jar(app)?;
    if !jar.exists() {
        return Err(format!(
            "dwstudio-server.jar not found at {} — bundle is missing.",
            jar.display()
        ));
    }

    let mut cmd = Command::new("java");
    cmd.arg("-jar")
        .arg(&jar)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console_window(&mut cmd);

    let mut child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "Java is not installed or not on PATH.\n\n\
             DataWeave Studio needs a Java runtime (JRE 8 or newer).\n\n\
             Install Java from https://adoptium.net and restart the app."
                .to_string()
        } else {
            format!("Failed to start DataWeave server: {}", e)
        }
    })?;

    let stdin = child.stdin.take().ok_or("server stdin missing")?;
    let stdout = child.stdout.take().ok_or("server stdout missing")?;
    let mut reader = BufReader::new(stdout);

    // Wait for ready handshake (with timeout via blocking read — JVM init
    // takes ~1-3s, we give it generous headroom).
    let mut ready_line = String::new();
    reader
        .read_line(&mut ready_line)
        .map_err(|e| format!("Server failed during startup: {}", e))?;
    if !ready_line.contains("\"ready\"") {
        return Err(format!("Unexpected handshake from server: {}", ready_line));
    }

    let state = app.state::<DwServerState>();
    *state.inner.lock().unwrap() = Some(DwServerInner {
        child,
        stdin,
        stdout: reader,
    });

    // Prime the DW compiler with a no-op script so the FIRST user-visible
    // run doesn't pay parser/compiler cold-start (~1s). The cost is hidden
    // behind the splash. We use a tiny script with no inputs so it's fast
    // even from cold (~300-500ms vs ~1s for a real script the first time).
    let primer_id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let primer_req = format!(
        r#"{{"id":{},"script":"%dw 2.0\noutput application/json\n---\n1","payloadPath":"","payloadMime":"application/json","namedInputs":[],"outputMime":"application/json"}}"#,
        primer_id
    );
    {
        let mut guard = state.inner.lock().unwrap();
        if let Some(inner) = guard.as_mut() {
            let _ = inner.stdin.write_all(primer_req.as_bytes());
            let _ = inner.stdin.write_all(b"\n");
            let _ = inner.stdin.flush();
            let mut primer_resp = String::new();
            let _ = inner.stdout.read_line(&mut primer_resp);
            log::info!("DW server primer: {}", primer_resp.trim());
        }
    }

    // Keep-alive: every 60 s send a no-op eval to keep the JVM hot and the
    // DW compiler caches resident in memory. After ~30 s idle the OS pages
    // out warm code and the next user run pays a ~1-2 s "soft warmup" before
    // returning to ~10 ms. Cost of the ping is ~10 ms once a minute (0.02%
    // CPU) which is invisible.
    let keepalive_app = app.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(60));
            let state = keepalive_app.state::<DwServerState>();
            let id = state.next_id.fetch_add(1, Ordering::Relaxed);
            let req = format!(
                r#"{{"id":{},"script":"%dw 2.0\noutput application/json\n---\n1","payloadPath":"","payloadMime":"application/json","namedInputs":[],"outputMime":"application/json"}}"#,
                id
            );
            let mut guard = state.inner.lock().unwrap();
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

/// Send a request, block on the response. Single-threaded through the mutex.
pub fn run(app: &AppHandle, args: DwRunArgs) -> Result<DwResponse, String> {
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
    };
    let line = serde_json::to_string(&req)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;

    let mut guard = state.inner.lock().unwrap();
    let inner = guard
        .as_mut()
        .ok_or_else(|| "DataWeave server not running".to_string())?;

    inner
        .stdin
        .write_all(line.as_bytes())
        .map_err(|e| format!("Failed to write to server: {}", e))?;
    inner
        .stdin
        .write_all(b"\n")
        .map_err(|e| format!("Failed to flush newline: {}", e))?;
    inner
        .stdin
        .flush()
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    let mut resp_line = String::new();
    inner
        .stdout
        .read_line(&mut resp_line)
        .map_err(|e| format!("Failed to read from server: {}", e))?;
    if resp_line.is_empty() {
        return Err("DataWeave server closed unexpectedly. Try Restart CLI.".into());
    }

    serde_json::from_str::<DwResponse>(&resp_line)
        .map_err(|e| format!("Bad server response: {} (line: {})", e, resp_line.trim()))
}

/// Kill the server process. Used on shutdown or restart.
pub fn stop(app: &AppHandle) {
    let state = app.state::<DwServerState>();
    let taken = { state.inner.lock().unwrap().take() };
    if let Some(mut inner) = taken {
        let _ = inner.child.kill();
        let _ = inner.child.wait();
    }
}

/// Kill + spawn fresh. Used by the user's "Restart CLI" button.
pub fn restart(app: &AppHandle) -> Result<(), String> {
    stop(app);
    start(app)
}
