use std::process::{Command, Stdio};
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

fn resolve_jar(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let path = app
        .path()
        .resolve(
            "resources/secure-properties/secure-properties-tool.jar",
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|e| format!("Failed to resolve secure-properties-tool.jar: {}", e))?;
    Ok(strip_unc_prefix(path))
}

/// Invoke MuleSoft's secure-properties-tool.jar to encrypt or decrypt a string value.
/// Mirrors the official CLI exactly so output is byte-for-byte compatible with
/// what Mule runtime expects.
#[tauri::command]
pub fn secure_properties_invoke(
    app: AppHandle,
    operation: String, // "encrypt" | "decrypt"
    algorithm: String, // "AES" | "Blowfish" | "DES" | "DESede" | "RC2"
    mode: String,      // "CBC" | "CFB" | "ECB" | "OFB"
    key: String,
    value: String,
    use_random_iv: bool,
) -> Result<String, String> {
    if operation != "encrypt" && operation != "decrypt" {
        return Err(format!("Invalid operation '{}', expected 'encrypt' or 'decrypt'.", operation));
    }
    if key.is_empty() {
        return Err("Key is required.".into());
    }
    if value.is_empty() {
        return Err("Value is required.".into());
    }

    let jar = resolve_jar(&app)?;

    let mut cmd = Command::new("java");
    cmd.arg("-cp").arg(&jar);
    cmd.arg("com.mulesoft.tools.SecurePropertiesTool");
    cmd.arg("string");
    cmd.arg(&operation);
    cmd.arg(&algorithm);
    cmd.arg(&mode);
    cmd.arg(&key);
    cmd.arg(&value);
    if use_random_iv {
        cmd.arg("--use-random-iv");
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    hide_console_window(&mut cmd);

    let output = cmd.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "Java is not installed or not on PATH.\n\n\
             The Secure Properties tool requires a Java runtime (JRE 8 or newer; \
             the bundled JAR supports up to Java 17).\n\n\
             Install Java from https://adoptium.net and restart DataWeave Studio."
                .to_string()
        } else {
            format!("Failed to run Java: {}", e)
        }
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        return Err(if stderr.is_empty() {
            format!("secure-properties-tool exited with code {}", output.status.code().unwrap_or(-1))
        } else {
            stderr
        });
    }

    // The tool prints "Invalid arguments\nUsage:..." to stdout (not stderr) on
    // bad input but still exits 0. Detect that.
    if stdout.starts_with("Invalid arguments") || stdout.contains("Usage:") {
        return Err(format!(
            "secure-properties-tool rejected the inputs.\n{}",
            stdout
        ));
    }

    Ok(stdout)
}
