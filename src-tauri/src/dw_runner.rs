use std::io::Write;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Manager};

static RE_LINE_COL: OnceLock<regex::Regex> = OnceLock::new();
static RE_LINE_PREFIX: OnceLock<regex::Regex> = OnceLock::new();
static RE_GUTTER: OnceLock<regex::Regex> = OnceLock::new();

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct RunResult {
    pub output: String,
    pub error: Option<String>,
    pub execution_time_ms: u64,
    pub error_line: Option<u32>,
    pub error_column: Option<u32>,
    /// Captured `log(...)` output when trace mode is on (None otherwise).
    #[serde(default)]
    pub logs: Option<Vec<String>>,
}

/// Managed state to track warm-up status and any errors
pub struct WarmupState {
    pub ready: Mutex<bool>,
    pub error: Mutex<Option<String>>,
}

/// Managed state for tracking the currently running DW script subprocess so it
/// can be cancelled. PID is set once the child spawns, cleared on completion.
pub struct RunState {
    pub child_pid: Mutex<Option<u32>>,
    pub cancelled: Mutex<bool>,
}

/// Parse DW CLI stderr for line/column error info
fn parse_error_location(stderr: &str) -> (Option<u32>, Option<u32>) {
    let re = RE_LINE_COL.get_or_init(|| regex::Regex::new(r"line:?\s*(\d+),?\s*column:?\s*(\d+)").unwrap());
    if let Some(caps) = re.captures(stderr) {
        return (
            caps.get(1).and_then(|m| m.as_str().parse().ok()),
            caps.get(2).and_then(|m| m.as_str().parse().ok()),
        );
    }
    (None, None)
}

/// Rewrite line numbers in stderr text to undo the header offset, so error
/// messages reference the user's script lines (not the merged-with-imports
/// line numbers the DW CLI sees).
fn shift_stderr_lines(stderr: &str, offset: i64) -> String {
    if offset <= 0 { return stderr.to_string(); }

    // (line N, column M) and (line: N, column: M) — the structured forms.
    let pat_paren = RE_LINE_PREFIX.get_or_init(|| regex::Regex::new(r"line:?\s*(\d+)").unwrap());
    let shifted = pat_paren.replace_all(stderr, |caps: &regex::Captures| {
        let n: i64 = caps[1].parse().unwrap_or(0);
        let mapped = (n - offset).max(1);
        // Preserve the prefix exactly (could be `line ` or `line:`).
        let prefix_end = caps.get(1).unwrap().start() - caps.get(0).unwrap().start();
        let prefix = &caps[0][..prefix_end];
        format!("{}{}", prefix, mapped)
    }).to_string();

    // `N| user code` — the source-line gutter the DW CLI prints. Match digits
    // followed by `|` at start of a line.
    let pat_gutter = RE_GUTTER.get_or_init(|| regex::Regex::new(r"(?m)^(\s*)(\d+)\|").unwrap());
    pat_gutter.replace_all(&shifted, |caps: &regex::Captures| {
        let indent = &caps[1];
        let n: i64 = caps[2].parse().unwrap_or(0);
        let mapped = (n - offset).max(1);
        format!("{}{}|", indent, mapped)
    }).to_string()
}

use crate::platform::strip_unc_prefix;
// Only the Windows kill path opens a console-capable subprocess.
#[cfg(target_os = "windows")]
use crate::platform::hide_console_window;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WarmupStatus {
    pub ready: bool,
    pub error: Option<String>,
    /// False when the engine's startup encoding self-check failed — non-ASCII
    /// output would come back corrupted, so the UI warns instead of pretending
    /// the result is trustworthy.
    pub encoding_ok: bool,
    /// Version string the engine reported at startup, e.g. "2.12.2-20260715".
    /// None until the handshake lands.
    pub weave_version: Option<String>,
}

#[tauri::command]
pub fn is_warmed_up(state: tauri::State<'_, WarmupState>) -> bool {
    *state.ready.lock().unwrap_or_else(|e| e.into_inner())
}

#[tauri::command]
pub fn get_warmup_status(state: tauri::State<'_, WarmupState>) -> WarmupStatus {
    WarmupStatus {
        ready: *state.ready.lock().unwrap_or_else(|e| e.into_inner()),
        error: state.error.lock().unwrap_or_else(|e| e.into_inner()).clone(),
        encoding_ok: crate::dw_server::ENCODING_OK.load(std::sync::atomic::Ordering::Relaxed),
        weave_version: crate::dw_server::WEAVE_VERSION
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone(),
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NamedInput {
    name: String,
    content: String,
    mime_type: String,
    /// If set, read binary content from this file path instead of `content`
    file_path: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct MultipartPartData {
    name: String,
    value: String,
    content_type: String,
    is_file: bool,
    file_path: Option<String>,
    filename: Option<String>,
    /// Base64-encoded raw bytes (binary-safe). Takes priority over `value`/`file_path`
    /// when present — used by the MCP tool to pass binary files through a text channel.
    #[serde(default)]
    content_base64: Option<String>,
}

/// Build a proper multipart/form-data body and return (body_bytes, boundary)
fn build_multipart_body(parts: &[MultipartPartData]) -> (Vec<u8>, String) {
    let boundary = format!("dwstudio{}", chrono::Utc::now().timestamp_millis());
    let mut body: Vec<u8> = Vec::new();

    for part in parts {
        // Opening boundary
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());

        // Content-Disposition
        let filename = part.filename.as_deref()
            .or_else(|| part.file_path.as_deref().map(|p| p.split('/').last().unwrap_or(p).split('\\').last().unwrap_or(p)));

        if let Some(fname) = filename {
            body.extend_from_slice(format!(
                "Content-Disposition: form-data; name=\"{}\"; filename=\"{}\"\r\n",
                part.name, fname
            ).as_bytes());
        } else {
            body.extend_from_slice(format!(
                "Content-Disposition: form-data; name=\"{}\"\r\n",
                part.name
            ).as_bytes());
        }

        body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", part.content_type).as_bytes());

        if let Some(ref b64) = part.content_base64 {
            // Binary-safe path: decode agent-supplied bytes straight into the body.
            use base64::Engine;
            if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64.trim()) {
                body.extend_from_slice(&bytes);
            }
        } else if part.is_file {
            if let Some(ref fp) = part.file_path {
                if let Ok(file_bytes) = std::fs::read(fp) {
                    body.extend_from_slice(&file_bytes);
                }
            }
        } else {
            body.extend_from_slice(part.value.as_bytes());
        }

        body.extend_from_slice(b"\r\n");
    }

    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());
    (body, boundary)
}

/// Build the script header with input declarations for all provided inputs.
fn build_full_script(
    user_script: &str,
    payload_mime: &str,
    has_attributes: bool,
    has_vars: bool,
    named_inputs: &[NamedInput],
) -> String {
    let mut header_lines: Vec<String> = Vec::new();

    let has_dw_header = user_script.lines().any(|l| l.trim().starts_with("%dw"));
    let has_separator = user_script.lines().any(|l| l.trim() == "---");
    let has_output = user_script.lines().any(|l| l.trim().starts_with("output "));

    if !has_dw_header {
        header_lines.push("%dw 2.0".to_string());
    }

    let has_payload_input = user_script.lines().any(|l| {
        let t = l.trim();
        t.starts_with("input payload") || t.starts_with("input  payload")
    });
    if !has_payload_input {
        header_lines.push(format!("input payload {}", payload_mime));
    }

    if has_attributes {
        let has_attrs_input = user_script.lines().any(|l| l.trim().starts_with("input attributes"));
        if !has_attrs_input {
            header_lines.push("input attributes application/json".to_string());
        }
    }

    if has_vars {
        let has_vars_input = user_script.lines().any(|l| l.trim().starts_with("input vars"));
        if !has_vars_input {
            header_lines.push("input vars application/json".to_string());
        }
    }

    for ni in named_inputs {
        let prefix = format!("input {}", ni.name);
        let already_declared = user_script.lines().any(|l| l.trim().starts_with(&prefix));
        if !already_declared {
            header_lines.push(format!("input {} {}", ni.name, ni.mime_type));
        }
    }

    if !has_output && !has_separator {
        header_lines.push("output application/json".to_string());
        header_lines.push("---".to_string());
    }

    if header_lines.is_empty() {
        return user_script.to_string();
    }

    let lines: Vec<&str> = user_script.lines().collect();

    if has_dw_header {
        let mut result = Vec::new();
        let mut inserted = false;
        for line in &lines {
            if !has_output && has_separator && !inserted && line.trim() == "---" {
                for h in &header_lines {
                    result.push(h.clone());
                }
                result.push("output application/json".to_string());
                inserted = true;
            }
            result.push(line.to_string());
            if !inserted && line.trim().starts_with("%dw") {
                for h in &header_lines {
                    result.push(h.clone());
                }
                inserted = true;
            }
        }
        result.join("\n")
    } else {
        let mut result = header_lines;
        for line in &lines {
            result.push(line.to_string());
        }
        result.join("\n")
    }
}

/// Write text content to a temp file and return the path.
fn write_temp_file(run_dir: &std::path::Path, name: &str, content: &str) -> Result<std::path::PathBuf, String> {
    let file_path = run_dir.join(name);
    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create temp file '{}': {}", file_path.display(), e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write temp file '{}': {}", file_path.display(), e))?;
    Ok(file_path)
}

/// Create a unique temp directory for this execution run
fn create_run_dir() -> Result<std::path::PathBuf, String> {
    let dir = std::env::temp_dir()
        .join("dw-studio")
        .join(format!("run-{}", std::process::id()))
        .join(format!("{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()));
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;
    Ok(dir)
}

/// Clean up the temp directory after execution
fn cleanup_run_dir(dir: &std::path::Path) {
    let _ = std::fs::remove_dir_all(dir);
}

/// RAII guard that cleans up the run directory on drop, ensuring cleanup on
/// early `?` returns and panics.
struct RunDirGuard(Option<std::path::PathBuf>);

impl RunDirGuard {
    fn new(path: std::path::PathBuf) -> Self { Self(Some(path)) }
    fn path(&self) -> &std::path::Path { self.0.as_deref().unwrap() }
}

impl Drop for RunDirGuard {
    fn drop(&mut self) {
        if let Some(ref p) = self.0 { cleanup_run_dir(p); }
    }
}

/// Run a DW script with optional classpath, timeout, and binary payload support.
#[tauri::command]
pub async fn run_dataweave(
    app: AppHandle,
    state: tauri::State<'_, RunState>,
    script: String,
    payload: String,
    mut payload_mime_type: String,
    attributes_json: String,
    vars_json: String,
    named_inputs_json: String,
    payload_file_path: Option<String>,
    classpath: Option<Vec<String>>,
    timeout_ms: Option<u64>,
    multipart_parts_json: Option<String>,
    modules_json: Option<String>,
    trace: Option<bool>,
    language_level: Option<String>,
    // debug: start a debug session instead of running. The engine attaches the
    // debugger, runs on its own thread and answers straight away; the UI then
    // drives it with `dw_debug`.
    debug: Option<bool>,
    debug_breakpoints: Option<Vec<u32>>,
) -> Result<RunResult, String> {
    let start_time = Instant::now();
    let trace = trace.unwrap_or(false);
    // A debug run is an ordinary run with a listener attached, so it goes down
    // this same path — that keeps one implementation of payload/attributes/vars
    // temp-file preparation rather than a second, drifting copy.
    let debug = debug.unwrap_or(false);
    let debug_breakpoints = debug_breakpoints.unwrap_or_default();
    // Target runtime, e.g. "2.4" for Mule 4.4. Empty = the engine's own 2.12.
    let language_level = language_level.unwrap_or_default();

    // Custom `.dwl` module libraries so `import x from MyModule` resolves. The
    // server writes each to a classpath dir keyed by a content hash and compiles
    // against a fresh classloader (see DwServer.scala engineForRequest).
    let modules: Vec<crate::dw_server::DwModule> = match modules_json.as_deref() {
        Some(s) if !s.trim().is_empty() && s.trim() != "[]" => serde_json::from_str(s)
            .map_err(|e| format!("Failed to parse modules: {}", e))?,
        _ => vec![],
    };

    // Reset cancellation flag and any stale PID at the start of every run.
    *state.cancelled.lock().unwrap_or_else(|e| e.into_inner()) = false;
    *state.child_pid.lock().unwrap_or_else(|e| e.into_inner()) = None;

    let has_attributes = attributes_json.trim() != "{}" && !attributes_json.trim().is_empty();
    let has_vars = vars_json.trim() != "{}" && !vars_json.trim().is_empty();

    let mut named_inputs: Vec<NamedInput> = if named_inputs_json.trim().is_empty() || named_inputs_json.trim() == "[]" {
        vec![]
    } else {
        serde_json::from_str(&named_inputs_json)
            .map_err(|e| format!("Failed to parse named inputs: {}", e))?
    };

    // `application/java` requires a live in-memory JVM object — the DataWeave
    // JavaReader can't parse a file path. Studio holds mock payloads as JSON
    // text on disk, so feeding the engine `input payload application/java`
    // crashes with a ClassCastException. Transparently coerce java inputs to
    // application/json: the user's mock data parses, and any downstream
    // script that types-checks against Java semantics still works because
    // DataWeave coerces JSON ↔ Java freely at runtime.
    if payload_mime_type == "application/java" {
        payload_mime_type = "application/json".to_string();
    }
    for ni in &mut named_inputs {
        if ni.mime_type == "application/java" {
            ni.mime_type = "application/json".to_string();
        }
    }

    let effective_payload = if payload.trim().is_empty() {
        if payload_mime_type.contains("json") || payload_mime_type.contains("java") {
            "{}".to_string()
        } else if payload_mime_type.contains("xml") {
            "<root/>".to_string()
        } else {
            "".to_string()
        }
    } else {
        payload
    };

    let run_dir_guard = RunDirGuard::new(create_run_dir()?);
    let run_dir = run_dir_guard.path().to_path_buf();

    // Build real multipart body when parts are provided (must happen before build_full_script)
    let multipart_mime_override: Option<String>;
    let payload_file = if let Some(ref parts_json) = multipart_parts_json {
        let parts: Vec<MultipartPartData> = serde_json::from_str(parts_json)
            .map_err(|e| format!("Failed to parse multipart parts: {}", e))?;
        if !parts.is_empty() {
            let (body_bytes, boundary) = build_multipart_body(&parts);
            multipart_mime_override = Some(format!("multipart/form-data; boundary={}", boundary));
            let file_path = run_dir.join("payload_multipart.dat");
            std::fs::write(&file_path, &body_bytes)
                .map_err(|e| format!("Failed to write multipart payload: {}", e))?;
            file_path
        } else {
            multipart_mime_override = None;
            write_temp_file(&run_dir, "payload.dat", &effective_payload)?
        }
    } else if let Some(fp) = payload_file_path.as_deref().filter(|s| !s.is_empty()) {
        multipart_mime_override = None;
        std::path::PathBuf::from(fp)
    } else {
        multipart_mime_override = None;
        write_temp_file(&run_dir, "payload.dat", &effective_payload)?
    };

    // For the script input declaration use bare mime (no boundary param).
    // The boundary is embedded in the raw multipart body file.
    let script_mime = if let Some(ref m) = multipart_mime_override {
        m.split(';').next().unwrap_or(m).trim().to_string()
    } else {
        payload_mime_type.clone()
    };
    // A debug run executes the user's script verbatim. build_full_script inserts
    // `input <name> <mime>` declarations after the %dw line (or before `---`),
    // which shifts every line below the insertion point — so a breakpoint set on
    // editor line 6 would land on a different statement, and the paused line
    // reported back would not match the editor either.
    //
    // The declarations are not actually required: the server derives its input
    // types from the request's payload/attributes/vars entries and passes them
    // via `withInputs`, so `payload` resolves without them. Skipping the
    // rewrite keeps editor and engine line numbers identical, which is the only
    // way breakpoints can be trusted.
    let full_script = if debug {
        script.clone()
    } else {
        build_full_script(&script, &script_mime, has_attributes, has_vars, &named_inputs)
    };
    // Offset = lines we prepended / inserted. The DW CLI reports errors against
    // the merged script; we remap line numbers back to the user's view.
    let line_offset: i64 = (full_script.lines().count() as i64)
        .saturating_sub(script.lines().count() as i64)
        .max(0);
    let script_file = write_temp_file(&run_dir, "script.dwl", &full_script)?;

    // Hot-add user JARs to the server's classloader so `import java!...`
    // resolves classes from them. The server dedupes by canonical path.
    let cp_entries: Vec<String> = classpath
        .as_ref()
        .map(|v| v.iter().filter(|s| !s.is_empty()).cloned().collect())
        .unwrap_or_default();

    // Build attribute / vars temp files (server reads them by path).
    let attrs_path = if has_attributes {
        Some(write_temp_file(&run_dir, "attributes.json", &attributes_json)?)
    } else {
        None
    };
    let vars_path = if has_vars {
        Some(write_temp_file(&run_dir, "vars.json", &vars_json)?)
    } else {
        None
    };

    // Named input file paths (server expects {name, path, mime}).
    let mut ni_paths: Vec<(String, std::path::PathBuf, String)> = Vec::new();
    for (idx, ni) in named_inputs.iter().enumerate() {
        // Empty-string paths count as "no file" — old workspaces saved a
        // cleared file as "" and it must not shadow the typed content.
        let p = if let Some(fp) = ni.file_path.as_deref().filter(|s| !s.is_empty()) {
            std::path::PathBuf::from(fp)
        } else {
            write_temp_file(&run_dir, &format!("input_{}.dat", idx), &ni.content)?
        };
        ni_paths.push((ni.name.clone(), p, ni.mime_type.clone()));
    }
    let server_named_inputs: Vec<crate::dw_server::DwNamedInput> = ni_paths
        .iter()
        .map(|(n, p, m)| crate::dw_server::DwNamedInput {
            name: n.clone(),
            path: p.display().to_string(),
            mime: m.clone(),
        })
        .collect();

    // Mark "running" so cancel can kill the server out from under us if needed.
    *state.child_pid.lock().unwrap_or_else(|e| e.into_inner()) = Some(0); // 0 = "in-flight via server"

    let effective_timeout = timeout_ms.unwrap_or(30000);

    let attrs_path_str = attrs_path.as_ref().map(|p| p.display().to_string());
    let vars_path_str = vars_path.as_ref().map(|p| p.display().to_string());
    let payload_path_str = payload_file.display().to_string();
    let script_path_str = script_file.display().to_string();
    let _ = script_path_str; // currently unused; server takes script inline
    let full_script_clone = full_script.clone();

    // Bridge: blocking server call inside spawn_blocking + tokio timeout.
    let app_for_run = app.clone();
    let payload_mime_for_run = payload_mime_type.clone();
    let run_future = tokio::task::spawn_blocking(move || {
        crate::dw_server::run(
            &app_for_run,
            crate::dw_server::DwRunArgs {
                script: &full_script_clone,
                payload_path: &payload_path_str,
                payload_mime: &payload_mime_for_run,
                attributes_path: attrs_path_str.as_deref(),
                vars_path: vars_path_str.as_deref(),
                named_inputs: &server_named_inputs,
                output_mime: "application/json",
                classpath: &cp_entries,
                compile_only: false,
                modules: &modules,
                trace,
                language_level: &language_level,
                debug,
                breakpoints: &debug_breakpoints,
            },
        )
    });

    let server_result = if effective_timeout > 0 {
        match tokio::time::timeout(
            std::time::Duration::from_millis(effective_timeout),
            run_future,
        )
        .await
        {
            Ok(Ok(Ok(r))) => Ok(r),
            Ok(Ok(Err(e))) => Err(e),
            Ok(Err(e)) => Err(format!("Task join error: {}", e)),
            Err(_) => {
                // Timed out — restart the server so the next run isn't stuck
                // waiting for a leaked response.
                let _ = crate::dw_server::restart(&app);
                *state.child_pid.lock().unwrap_or_else(|e| e.into_inner()) = None;
                return Ok(RunResult {
                    output: String::new(),
                    error: Some(format!(
                        "Script timed out after {}ms. Increase the timeout in Settings if your script needs more time.",
                        effective_timeout
                    )),
                    execution_time_ms: effective_timeout,
                    error_line: None,
                    error_column: None,
                    logs: None,
                });
            }
        }
    } else {
        match run_future.await {
            Ok(r) => r,
            Err(e) => Err(format!("Task join error: {}", e)),
        }
    };

    let execution_time_ms = start_time.elapsed().as_millis() as u64;
    *state.child_pid.lock().unwrap_or_else(|e| e.into_inner()) = None;
    drop(run_dir_guard); // explicit cleanup (guard handles it)

    // Cancel beat us to it — surface that, not the server response.
    if *state.cancelled.lock().unwrap_or_else(|e| e.into_inner()) {
        *state.cancelled.lock().unwrap_or_else(|e| e.into_inner()) = false;
        return Ok(RunResult {
            output: String::new(),
            error: Some("Cancelled".to_string()),
            execution_time_ms,
            error_line: None,
            error_column: None,
            logs: None,
        });
    }

    // The server rewrites `output application/java` → `output application/json`
    // before compilation (the Java writer emits an in-memory JVM object with
    // no text representation; the Playground does the same rewrite to render
    // it as JSON for display). No special handling needed in Rust now.

    match server_result {
        Ok(resp) => {
            if resp.ok {
                Ok(RunResult {
                    output: resp.output,
                    error: None,
                    execution_time_ms,
                    error_line: None,
                    error_column: None,
                    logs: resp.logs,
                })
            } else {
                let raw = resp.error.unwrap_or_else(|| "(no error message)".into());
                let shifted = shift_stderr_lines(&raw, line_offset);
                let (error_line, error_column) = parse_error_location(&shifted);
                Ok(RunResult {
                    output: resp.output,
                    error: Some(shifted),
                    execution_time_ms,
                    error_line,
                    error_column,
                    logs: resp.logs,
                })
            }
        }
        Err(e) => Ok(RunResult {
            output: String::new(),
            error: Some(e),
            execution_time_ms,
            error_line: None,
            error_column: None,
            logs: None,
        }),
    }
}


/// Save text content to a file at the given absolute path.
#[tauri::command]
pub fn save_output_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to save file '{}': {}", path, e))
}

/// Save raw bytes to a file at the given absolute path.
/// Used by the Playground export to write a zip blob.
#[tauri::command]
pub fn save_binary_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, contents)
        .map_err(|e| format!("Failed to save file '{}': {}", path, e))
}

/// Read a text file from disk — used by the payload file loader.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

/// Kill a process tree by PID. Best-effort, platform-specific.
/// On Windows uses `taskkill /F /T` to also kill child processes (the JVM
/// the DW CLI shim launches). On Unix uses `kill -TERM`.
fn kill_pid(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("taskkill");
        cmd.arg("/PID").arg(pid.to_string()).arg("/F").arg("/T");
        hide_console_window(&mut cmd);
        let _ = cmd.status();
    }
    #[cfg(not(target_os = "windows"))]
    {
        // SIGTERM first; the OS will reap the child and wait_with_output returns.
        let _ = Command::new("kill").arg("-TERM").arg(pid.to_string()).status();
    }
}

/// Cancel the currently-running DW script, if any.
/// Marks the run as cancelled and kills the subprocess. The pending
/// `run_dataweave` call will see the flag and return a Cancelled result.
#[tauri::command]
pub fn cancel_dataweave(state: tauri::State<'_, RunState>) -> Result<bool, String> {
    let pid_opt = *state.child_pid.lock().unwrap_or_else(|e| e.into_inner());
    match pid_opt {
        Some(pid) if pid > 0 => {
            *state.cancelled.lock().unwrap_or_else(|e| e.into_inner()) = true;
            kill_pid(pid);
            Ok(true)
        }
        Some(_) => {
            // Sentinel PID 0 from server-based runs — mark cancelled but don't kill
            *state.cancelled.lock().unwrap_or_else(|e| e.into_inner()) = true;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Restart the long-lived DataWeave server. Backs the "Restart engine" button
/// on the runtime-error banner and in Settings → Runtime. Resets WarmupState
/// so the splash/banner reflect the restart, then stops and respawns the
/// server on a background thread — the spawn + ready handshake takes ~1-3s and
/// must not block the UI thread.
/// Pretty-print a script with the engine's own DataWeave formatter — the same
/// one Anypoint Studio uses. Previously reachable only from the MCP server, so
/// the editor's Format action fell back to Monaco's generic re-indent.
#[tauri::command]
pub fn dw_format(app: tauri::AppHandle, script: String) -> Result<String, String> {
    crate::dw_server::format(&app, &script)
}

/// Ask the engine's language service about a position in the script. The editor
/// calls this for completion/hover/signature help; it falls back to the static
/// catalog when the engine isn't warm yet, so typing never blocks on it.
#[tauri::command]
pub fn dw_tooling(
    app: tauri::AppHandle,
    kind: String,
    script: String,
    offset: usize,
    payload: Option<String>,
    classpath: Option<Vec<String>>,
    new_name: Option<String>,
    language_level: Option<String>,
    mime_type: Option<String>,
    repeat: Option<i64>,
) -> Result<serde_json::Value, String> {
    crate::dw_server::tooling(
        &app,
        &kind,
        &script,
        offset,
        payload.as_deref().unwrap_or(""),
        &classpath.unwrap_or_default(),
        new_name.as_deref().unwrap_or(""),
        language_level.as_deref().unwrap_or(""),
        mime_type.as_deref().unwrap_or("application/json"),
        repeat.unwrap_or(1),
    )
}

/// Drive a running debug session: state, resume, stepOver/In/Out, evaluate, stop.
#[tauri::command]
pub fn dw_debug(
    app: tauri::AppHandle,
    action: String,
    expression: Option<String>,
    frame_index: Option<i64>,
) -> Result<serde_json::Value, String> {
    crate::dw_server::debug_command(
        &app,
        &action,
        expression.as_deref().unwrap_or(""),
        frame_index.unwrap_or(-1),
    )
}

#[tauri::command]
pub fn restart_engine(app: AppHandle) -> Result<(), String> {
    {
        let state = app.state::<WarmupState>();
        *state.ready.lock().unwrap_or_else(|e| e.into_inner()) = false;
        *state.error.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = crate::dw_server::restart(&handle) {
            let state = handle.state::<WarmupState>();
            *state.error.lock().unwrap_or_else(|e| e.into_inner()) = Some(e);
        }
        let state = handle.state::<WarmupState>();
        *state.ready.lock().unwrap_or_else(|e| e.into_inner()) = true;
    });
    Ok(())
}

/// Return the absolute path to the app's log directory so the frontend can
/// open it with the opener plugin.
#[tauri::command]
pub fn get_log_dir(app: AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to resolve log dir: {}", e))?;
    let path = strip_unc_prefix(path);
    // Ensure the directory exists so the OS doesn't error on open.
    let _ = std::fs::create_dir_all(&path);
    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Log dir path is not valid UTF-8".to_string())
}

/// Pre-warm the compile cache for the user's current workspace script.
///
/// CRITICAL: the merged script (after build_full_script injects `input
/// payload`, `input attributes`, etc.) is what the actual Run sends to the
/// server. The cache key includes the script text. So warm MUST also send
/// the merged form — not the raw user script — or Run will cache-miss.
/// That was the bug behind "first hit always ~1s" even after typing pause.
#[tauri::command]
pub async fn warm_dataweave_script(
    app: AppHandle,
    script: String,
    mut payload_mime_type: String,
    has_attributes: bool,
    has_vars: bool,
    named_inputs_json: String,
) -> Result<(), String> {
    if script.trim().is_empty() {
        return Ok(());
    }

    let mut named_inputs: Vec<NamedInput> =
        if named_inputs_json.trim().is_empty() || named_inputs_json.trim() == "[]" {
            vec![]
        } else {
            serde_json::from_str(&named_inputs_json).unwrap_or_default()
        };

    // Mirror the coercion run_dataweave does so warm and run produce identical
    // merged scripts (and therefore identical compile-cache keys). Without
    // this, a workspace with `input payload application/java` would have warm
    // and run hash to different scripts and the cache would always miss.
    if payload_mime_type == "application/java" {
        payload_mime_type = "application/json".to_string();
    }
    for ni in &mut named_inputs {
        if ni.mime_type == "application/java" {
            ni.mime_type = "application/json".to_string();
        }
    }

    // Same merge logic Run uses, so the cache key matches.
    let merged = build_full_script(
        &script,
        &payload_mime_type,
        has_attributes,
        has_vars,
        &named_inputs,
    );

    let app_clone = app.clone();
    let _ = tokio::task::spawn_blocking(move || {
        if let Err(e) = crate::dw_server::run(
            &app_clone,
            crate::dw_server::DwRunArgs {
                script: &merged,
                payload_path: "",
                payload_mime: "application/json",
                attributes_path: None,
                vars_path: None,
                named_inputs: &[],
                output_mime: "application/json",
                classpath: &[],
                compile_only: true,
                modules: &[],
                trace: false,
                language_level: "",
                debug: false,
                breakpoints: &[],
            },
        ) {
            log::warn!("Warm compile failed: {}", e);
        }
    })
    .await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_error_location() {
        let stderr = "Exception in thread \"main\" java.lang.RuntimeException: Error at line 5, column 12: something went wrong";
        assert_eq!(parse_error_location(stderr), (Some(5), Some(12)));

        let stderr_colon = "Exception in thread \"main\" java.lang.RuntimeException: Error at line: 10, column: 25: something went wrong";
        assert_eq!(parse_error_location(stderr_colon), (Some(10), Some(25)));

        let stderr_none = "Exception in thread \"main\" java.lang.RuntimeException: Error: something went wrong";
        assert_eq!(parse_error_location(stderr_none), (None, None));
    }

    #[test]
    fn test_shift_stderr_lines() {
        // Shift structured line prefix
        let stderr = "Error at line 5, column 12\n  line 7, column 3";
        let shifted = shift_stderr_lines(stderr, 2);
        assert!(shifted.contains("line 3"));
        assert!(shifted.contains("line 5"));

        // Shift gutter-based line prefix
        let stderr_gutter = "  5| payload.foo\n  6| payload.bar";
        let shifted_gutter = shift_stderr_lines(stderr_gutter, 2);
        assert!(shifted_gutter.contains("  3| payload.foo"));
        assert!(shifted_gutter.contains("  4| payload.bar"));
    }

    #[test]
    fn test_build_full_script() {
        // Scenario 1: Entirely empty script, should auto-insert DW header & JSON output
        let script = "";
        let full = build_full_script(script, "application/json", false, false, &[]);
        assert!(full.contains("%dw 2.0"));
        assert!(full.contains("input payload application/json"));
        assert!(full.contains("output application/json"));
        assert!(full.contains("---"));

        // Scenario 2: Already contains headers, should not duplicate
        let script_full = "%dw 2.0\ninput payload application/json\noutput application/json\n---\npayload.foo";
        let full = build_full_script(script_full, "application/json", false, false, &[]);
        assert_eq!(full, script_full);

        // Scenario 3: Has a %dw 2.0 but missing output/separator
        let script_dw = "%dw 2.0\ninput payload application/json";
        let full = build_full_script(script_dw, "application/json", false, false, &[]);
        assert!(full.contains("output application/json"));
        assert!(full.contains("---"));

        // Scenario 4: Multiple named inputs
        let named_inputs = vec![
            NamedInput {
                name: "headers".to_string(),
                content: "{}".to_string(),
                mime_type: "application/json".to_string(),
                file_path: None,
            }
        ];
        let full_named = build_full_script("", "application/json", false, false, &named_inputs);
        assert!(full_named.contains("input headers application/json"));
    }

    #[test]
    fn test_build_multipart_body() {
        let parts = vec![
            MultipartPartData {
                name: "field1".to_string(),
                value: "hello".to_string(),
                content_type: "text/plain".to_string(),
                is_file: false,
                file_path: None,
                filename: None,
                content_base64: None,
            }
        ];
        let (body, boundary) = build_multipart_body(&parts);
        let body_str = String::from_utf8_lossy(&body);
        assert!(body_str.contains(&boundary));
        assert!(body_str.contains("Content-Disposition: form-data; name=\"field1\""));
        assert!(body_str.contains("Content-Type: text/plain"));
        assert!(body_str.contains("hello"));
    }

    #[test]
    fn test_multipart_base64_bytes_survive_intact() {
        // Bytes that are NOT valid UTF-8 (0xFF, 0x00, 0xFE) — these are exactly what
        // a text channel would corrupt. base64 must reproduce them byte-for-byte.
        let raw: Vec<u8> = vec![0xFF, 0x00, 0xFE, 0x10, 0x80, 0xC3, 0x28];
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&raw);
        let parts = vec![MultipartPartData {
            name: "f".to_string(),
            value: String::new(),
            content_type: "application/octet-stream".to_string(),
            is_file: false,
            file_path: None,
            filename: Some("blob.bin".to_string()),
            content_base64: Some(b64),
        }];
        let (body, _) = build_multipart_body(&parts);
        // The exact raw byte sequence must appear in the assembled body.
        assert!(body.windows(raw.len()).any(|w| w == raw.as_slice()));
    }
}
