use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};
use crate::platform::{hide_console_window, strip_unc_prefix};

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
    const VALID_ALGORITHMS: &[&str] = &["AES", "Blowfish", "DES", "DESede", "RC2"];
    if !VALID_ALGORITHMS.contains(&algorithm.as_str()) {
        return Err(format!("Invalid algorithm '{}', expected one of: {}", algorithm, VALID_ALGORITHMS.join(", ")));
    }
    const VALID_MODES: &[&str] = &["CBC", "CFB", "ECB", "OFB"];
    if !VALID_MODES.contains(&mode.as_str()) {
        return Err(format!("Invalid mode '{}', expected one of: {}", mode, VALID_MODES.join(", ")));
    }
    if key.is_empty() {
        return Err("Key is required.".into());
    }
    if value.is_empty() {
        return Err("Value is required.".into());
    }

    let jar = resolve_jar(&app)?;

    let java = resolve_bundled_java(&app)?;
    let java_bin = if java.exists() { java } else { std::path::PathBuf::from("java") };

    let mut cmd = Command::new(&java_bin);
    // Same Java-17 default-charset trap as the engine (see dw_server.rs) — this
    // fixes the tool's *output* encoding.
    //
    // KNOWN LIMITATION: it does NOT fix non-ASCII *values*. We pass the value as a
    // command-line argument, and on Windows the JVM decodes argv with the OS ANSI
    // codepage; sun.jnu.encoding is resolved before -D properties are applied, so
    // setting it is a no-op (verified: "गुप्त€" still round-trips as "???€").
    // Encrypting a value with characters outside the system codepage needs a
    // different transport (stdin/file), not a flag.
    cmd.arg("-Dfile.encoding=UTF-8")
        .arg("-Dstdout.encoding=UTF-8")
        .arg("-Dsun.stdout.encoding=UTF-8");
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
            "Bundled Java runtime not found and no system Java on PATH.\n\n\
             The Secure Properties tool requires a Java runtime."
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
