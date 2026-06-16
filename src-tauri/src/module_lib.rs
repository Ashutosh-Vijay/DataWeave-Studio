//! Persistent global DataWeave module library.
//!
//! Users save reusable `.dwl` modules ONCE (utility functions, shared mappings)
//! and every run automatically resolves `import x from MyModule` against them —
//! the community ask was "save it once locally, from next time just use it".
//! Stored as a single JSON file in app-data: `[{ "name": "...", "content": "..." }]`.
//! The frontend owns the shape; we just round-trip the JSON (validated to be an
//! array so a corrupt write can't brick the library).

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn modules_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {}", e))?;
    Ok(dir.join("modules.json"))
}

/// Load the saved module library as a JSON array string. Missing file → "[]".
#[tauri::command]
pub fn load_modules(app: AppHandle) -> Result<String, String> {
    let path = modules_file(&app)?;
    match fs::read_to_string(&path) {
        Ok(s) if !s.trim().is_empty() => Ok(s),
        _ => Ok("[]".to_string()),
    }
}

/// Persist the module library. `json` must be a JSON array of `{name, content}`.
#[tauri::command]
pub fn save_modules(app: AppHandle, json: String) -> Result<(), String> {
    // Reject anything that isn't a JSON array — guards against writing garbage
    // that would fail to load (and silently lose the user's modules).
    let parsed: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| format!("Invalid modules JSON: {}", e))?;
    if !parsed.is_array() {
        return Err("Modules must be a JSON array".to_string());
    }
    let path = modules_file(&app)?;
    fs::write(&path, json).map_err(|e| format!("Failed to save modules: {}", e))
}
