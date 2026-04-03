use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Manager};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct RunResult {
    pub output: String,
    pub error: Option<String>,
    pub execution_time_ms: u64,
    pub error_line: Option<u32>,
    pub error_column: Option<u32>,
}

/// Managed state to track warm-up status and any errors
pub struct WarmupState {
    pub ready: Mutex<bool>,
    pub error: Mutex<Option<String>>,
}

/// Get the platform-specific DW CLI binary resource path
fn get_dw_binary_resource_path() -> &'static str {
    #[cfg(target_os = "windows")]
    { "resources/dw-cli/windows/bin/dw.exe" }
    #[cfg(target_os = "macos")]
    { "resources/dw-cli/macos/bin/dw" }
    #[cfg(target_os = "linux")]
    { "resources/dw-cli/linux/bin/dw" }
}

/// Parse DW CLI stderr for line/column error info
fn parse_error_location(stderr: &str) -> (Option<u32>, Option<u32>) {
    let re = regex::Regex::new(r"line:?\s*(\d+),?\s*column:?\s*(\d+)").ok();
    if let Some(re) = re {
        if let Some(caps) = re.captures(stderr) {
            return (
                caps.get(1).and_then(|m| m.as_str().parse().ok()),
                caps.get(2).and_then(|m| m.as_str().parse().ok()),
            );
        }
    }
    (None, None)
}

/// Strip ANSI escape codes and Java warnings from stderr
fn clean_stderr(stderr: &str) -> String {
    let ansi_re = regex::Regex::new(r"\x1b\[[0-9;]*m").unwrap();
    let cleaned = ansi_re.replace_all(stderr, "");

    let result = cleaned
        .lines()
        .filter(|line| !line.starts_with("WARNING:"))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    if result.contains("Unknown content type `application/java`") {
        return format!(
            "{}\n\nHint: `application/java` is only available inside a Mule runtime. \
            Try `output application/json` instead — the DW CLI does not support Java object output.",
            result
        );
    }

    result
}

/// Strip the \\?\ extended-length path prefix that Windows/Rust canonicalize adds.
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

/// Hide the console window for child processes on Windows.
#[cfg(target_os = "windows")]
fn hide_console_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console_window(_cmd: &mut Command) {}

/// Resolve the DW CLI binary path from Tauri resources
fn resolve_dw_binary(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let path = app.path()
        .resolve(get_dw_binary_resource_path(), tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve DW binary path: {}", e))?;
    Ok(strip_unc_prefix(path))
}

/// Run a dummy DW script to warm up the CLI (eats the worst cold start)
pub fn warmup_dw_cli(app: &AppHandle) -> Result<(), String> {
    let dw_binary_path = resolve_dw_binary(app)?;

    let mut cmd = Command::new(&dw_binary_path);
    cmd.arg("run")
        .arg("-s")
        .arg("output application/json --- true")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console_window(&mut cmd);
    let child = cmd.spawn()
        .map_err(|e| format!("Warm-up spawn failed: {} (path: {})", e, dw_binary_path.display()))?;

    let _ = child.wait_with_output();
    Ok(())
}

#[derive(serde::Serialize)]
pub struct WarmupStatus {
    pub ready: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub fn is_warmed_up(state: tauri::State<'_, WarmupState>) -> bool {
    *state.ready.lock().unwrap()
}

#[tauri::command]
pub fn get_warmup_status(state: tauri::State<'_, WarmupState>) -> WarmupStatus {
    WarmupStatus {
        ready: *state.ready.lock().unwrap(),
        error: state.error.lock().unwrap().clone(),
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

        if part.is_file {
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
        .join(format!("{}", Instant::now().elapsed().as_nanos()));
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;
    Ok(dir)
}

/// Clean up the temp directory after execution
fn cleanup_run_dir(dir: &std::path::Path) {
    let _ = std::fs::remove_dir_all(dir);
}

/// Run a DW script with optional classpath, timeout, and binary payload support.
#[tauri::command]
pub async fn run_dataweave(
    app: AppHandle,
    script: String,
    payload: String,
    payload_mime_type: String,
    attributes_json: String,
    vars_json: String,
    named_inputs_json: String,
    payload_file_path: Option<String>,
    classpath: Option<Vec<String>>,
    timeout_ms: Option<u64>,
    multipart_parts_json: Option<String>,
) -> Result<RunResult, String> {
    let start_time = Instant::now();

    let dw_binary_path = resolve_dw_binary(&app)?;

    let has_attributes = attributes_json.trim() != "{}" && !attributes_json.trim().is_empty();
    let has_vars = vars_json.trim() != "{}" && !vars_json.trim().is_empty();

    let named_inputs: Vec<NamedInput> = if named_inputs_json.trim().is_empty() || named_inputs_json.trim() == "[]" {
        vec![]
    } else {
        serde_json::from_str(&named_inputs_json)
            .map_err(|e| format!("Failed to parse named inputs: {}", e))?
    };

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

    let run_dir = create_run_dir()?;

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
    } else if let Some(ref fp) = payload_file_path {
        multipart_mime_override = None;
        std::path::PathBuf::from(fp)
    } else {
        multipart_mime_override = None;
        write_temp_file(&run_dir, "payload.dat", &effective_payload)?
    };

    let effective_payload_mime = multipart_mime_override.as_deref().unwrap_or(&payload_mime_type);
    let full_script = build_full_script(&script, effective_payload_mime, has_attributes, has_vars, &named_inputs);
    let script_file = write_temp_file(&run_dir, "script.dwl", &full_script)?;

    let mut cmd = Command::new(&dw_binary_path);
    cmd.arg("run");
    cmd.arg("-s");
    cmd.arg("-f").arg(&script_file);
    cmd.arg("-i").arg(format!("payload={}", payload_file.display()));

    if has_attributes {
        let attrs_file = write_temp_file(&run_dir, "attributes.json", &attributes_json)?;
        cmd.arg("-i").arg(format!("attributes={}", attrs_file.display()));
    }
    if has_vars {
        let vars_file = write_temp_file(&run_dir, "vars.json", &vars_json)?;
        cmd.arg("-i").arg(format!("vars={}", vars_file.display()));
    }

    for (idx, ni) in named_inputs.iter().enumerate() {
        let ni_file = if let Some(ref fp) = ni.file_path {
            std::path::PathBuf::from(fp)
        } else {
            write_temp_file(&run_dir, &format!("input_{}.dat", idx), &ni.content)?
        };
        cmd.arg("-i").arg(format!("{}={}", ni.name, ni_file.display()));
    }

    // Classpath for custom modules and JARs
    if let Some(ref cp_entries) = classpath {
        let non_empty: Vec<&String> = cp_entries.iter().filter(|s| !s.is_empty()).collect();
        if !non_empty.is_empty() {
            let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
            let cp_str = non_empty.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(sep);
            cmd.arg("-cp").arg(&cp_str);
        }
    }

    hide_console_window(&mut cmd);

    let child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            cleanup_run_dir(&run_dir);
            let path = dw_binary_path.display();
            if e.kind() == std::io::ErrorKind::NotFound {
                format!(
                    "DataWeave CLI binary not found.\n\n\
                     Expected at: {}\n\n\
                     The DW CLI should be bundled in src-tauri/resources/dw-cli/. \
                     If you're running in development, make sure the binary exists at that path.\n\n\
                     Download it from: https://github.com/mulesoft/data-weave-cli",
                    path
                )
            } else if e.kind() == std::io::ErrorKind::PermissionDenied {
                format!(
                    "DataWeave CLI permission denied.\n\n\
                     Path: {}\n\n\
                     The binary exists but cannot be executed. \
                     On macOS/Linux, run: chmod +x \"{}\"",
                    path, path
                )
            } else {
                format!("Failed to start DataWeave CLI: {}\n\nPath: {}", e, path)
            }
        })?;

    // Apply timeout via a killer thread
    let effective_timeout = timeout_ms.unwrap_or(0);
    let run_dir_clone = run_dir.clone();

    let output = if effective_timeout > 0 {
        // Use tokio timeout with spawn_blocking for the blocking wait
        match tokio::time::timeout(
            std::time::Duration::from_millis(effective_timeout),
            tokio::task::spawn_blocking(move || child.wait_with_output()),
        ).await {
            Ok(Ok(Ok(out))) => {
                cleanup_run_dir(&run_dir_clone);
                out
            }
            Ok(Ok(Err(e))) => {
                cleanup_run_dir(&run_dir_clone);
                return Err(e.to_string());
            }
            Ok(Err(e)) => {
                cleanup_run_dir(&run_dir_clone);
                return Err(format!("Task join error: {}", e));
            }
            Err(_) => {
                cleanup_run_dir(&run_dir_clone);
                return Ok(RunResult {
                    output: String::new(),
                    error: Some(format!(
                        "Script timed out after {}ms. Increase the timeout in Settings if your script needs more time.",
                        effective_timeout
                    )),
                    execution_time_ms: effective_timeout,
                    error_line: None,
                    error_column: None,
                });
            }
        }
    } else {
        let out = child.wait_with_output().map_err(|e| {
            cleanup_run_dir(&run_dir);
            e.to_string()
        })?;
        cleanup_run_dir(&run_dir);
        out
    };

    let execution_time_ms = start_time.elapsed().as_millis() as u64;

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    let raw_stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stderr_str = clean_stderr(&raw_stderr);

    if output.status.success() {
        Ok(RunResult {
            output: stdout_str,
            error: if stderr_str.is_empty() { None } else { Some(stderr_str) },
            execution_time_ms,
            error_line: None,
            error_column: None,
        })
    } else {
        let (error_line, error_column) = parse_error_location(&stderr_str);
        Ok(RunResult {
            output: stdout_str,
            error: Some(if stderr_str.is_empty() {
                format!("DW CLI exited with code {}", output.status.code().unwrap_or(-1))
            } else {
                stderr_str
            }),
            execution_time_ms,
            error_line,
            error_column,
        })
    }
}

/// Placeholder — DW CLI does not expose a migrate subcommand.
/// Migration is handled entirely in the frontend (TypeScript).
#[tauri::command]
pub async fn migrate_dataweave(
    _app: AppHandle,
    _script: String,
) -> Result<String, String> {
    Err("migrate_not_supported".to_string())
}

/// Save text content to a file at the given absolute path.
#[tauri::command]
pub fn save_output_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to save file '{}': {}", path, e))
}
