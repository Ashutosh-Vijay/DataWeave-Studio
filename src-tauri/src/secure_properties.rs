use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};
use crate::platform::{hide_console_window, strip_unc_prefix};

/// Saved encryption keys go in the OS keychain (Windows Credential Manager,
/// macOS Keychain, Secret Service on Linux) — never a file we write. Only the
/// NAMES are ours, in app-data, because a name is not a secret.
const KEYRING_SERVICE: &str = "DataWeave Studio secure properties";

fn key_names_file(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {}", e))?;
    Ok(dir.join("secure-keys.json"))
}

fn read_key_names(app: &AppHandle) -> Vec<String> {
    let Ok(path) = key_names_file(app) else { return Vec::new() };
    let Ok(raw) = std::fs::read_to_string(&path) else { return Vec::new() };
    let mut names: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
    names.sort();
    names
}

fn write_key_names(app: &AppHandle, names: &[String]) -> Result<(), String> {
    let path = key_names_file(app)?;
    let json = serde_json::to_string(names).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to save key names: {}", e))
}

/// Names of every saved key, sorted. The secrets themselves stay in the keychain.
#[tauri::command]
pub fn secure_key_names(app: AppHandle) -> Vec<String> {
    read_key_names(&app)
}

/// Store a key under a name. Replaces silently if the name already exists — the
/// UI asks first, so arriving here means the user said yes.
#[tauri::command]
pub fn secure_key_save(app: AppHandle, name: String, value: String) -> Result<Vec<String>, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Give the key a name.".into());
    }
    if value.is_empty() {
        return Err("Type a key before saving it.".into());
    }
    keyring::Entry::new(KEYRING_SERVICE, &name)
        .and_then(|e| e.set_password(&value))
        .map_err(|e| format!("Could not save to the OS keychain: {}", e))?;
    let mut names = read_key_names(&app);
    if !names.contains(&name) {
        names.push(name);
        names.sort();
        write_key_names(&app, &names)?;
    }
    Ok(names)
}

/// Forget a saved key. Removing an entry the keychain no longer has is not an
/// error — the name index is what the UI reads, so it must always come clean.
#[tauri::command]
pub fn secure_key_delete(app: AppHandle, name: String) -> Result<Vec<String>, String> {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, &name) {
        let _ = entry.delete_credential();
    }
    let names: Vec<String> = read_key_names(&app).into_iter().filter(|n| n != &name).collect();
    write_key_names(&app, &names)?;
    Ok(names)
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
    // Names a key held in the OS keychain. When set, `key` is ignored and the
    // secret is read here — so it never has to travel through the frontend.
    key_name: Option<String>,
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
    let key = match key_name.as_deref().map(str::trim).filter(|n| !n.is_empty()) {
        Some(name) => keyring::Entry::new(KEYRING_SERVICE, name)
            .and_then(|e| e.get_password())
            .map_err(|_| format!(
                "Saved key \"{}\" is no longer in the OS keychain — type it in again.",
                name
            ))?,
        None => key,
    };
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
