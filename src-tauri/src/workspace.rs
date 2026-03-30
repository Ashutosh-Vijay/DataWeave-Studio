use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VarEntry {
    pub key: String,
    pub value: String,
    pub value_type: String, // "string" | "json"
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KeyValuePair {
    pub key: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EncryptionSettings {
    pub algorithm: String,
    pub mode: String,
    pub use_random_ivs: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContextState {
    pub method: String,
    pub query_params: Vec<KeyValuePair>,
    pub headers: Vec<KeyValuePair>,
    pub vars: Vec<VarEntry>,
    #[serde(default)]
    pub config_yaml: String,
    #[serde(default)]
    pub secure_config_yaml: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_settings: Option<EncryptionSettings>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NamedInput {
    pub name: String,
    pub content: String,
    pub mime_type: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SingleTransform {
    pub script: String,
    pub payload: String,
    pub payload_mime_type: String,
    pub node_label: String,
    #[serde(default)]
    pub named_inputs: Vec<NamedInput>,
    #[serde(default)]
    pub query_template: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    pub version: String,
    pub project_name: String,
    pub created_at: String,
    pub updated_at: String,
    pub mode: String,
    pub single_transform: SingleTransform,
    pub context: ContextState,
}

fn get_workspaces_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let workspaces_dir = app_data.join("workspaces");
    fs::create_dir_all(&workspaces_dir).map_err(|e| format!("Failed to create workspaces dir: {}", e))?;
    Ok(workspaces_dir)
}

#[tauri::command]
pub fn get_workspaces_dir(app: AppHandle) -> Result<String, String> {
    let dir = get_workspaces_directory(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_workspace(app: AppHandle, workspace: WorkspaceFile) -> Result<String, String> {
    let dir = get_workspaces_directory(&app)?;

    // Sanitize project name for filename
    let safe_name: String = workspace
        .project_name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let filename = if safe_name.is_empty() {
        "untitled".to_string()
    } else {
        safe_name
    };

    let file_path = dir.join(format!("{}.dwstudio", filename));

    // Update the timestamp
    let mut ws = workspace;
    ws.updated_at = chrono::Utc::now().to_rfc3339();
    if ws.created_at.is_empty() {
        ws.created_at = ws.updated_at.clone();
    }

    let json = serde_json::to_string_pretty(&ws).map_err(|e| e.to_string())?;
    fs::write(&file_path, json).map_err(|e| format!("Failed to save workspace: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn load_workspace(app: AppHandle, filename: String) -> Result<WorkspaceFile, String> {
    let dir = get_workspaces_directory(&app)?;
    let file_path = dir.join(&filename);

    let contents = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read workspace '{}': {}", filename, e))?;

    serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse workspace '{}': {}", filename, e))
}

#[tauri::command]
pub fn list_workspaces(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = get_workspaces_directory(&app)?;

    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    let mut files: Vec<String> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".dwstudio") {
                Some(name)
            } else {
                None
            }
        })
        .collect();

    files.sort();
    Ok(files)
}

#[tauri::command]
pub fn delete_workspace(app: AppHandle, filename: String) -> Result<(), String> {
    let dir = get_workspaces_directory(&app)?;
    let file_path = dir.join(&filename);

    fs::remove_file(&file_path)
        .map_err(|e| format!("Failed to delete workspace '{}': {}", filename, e))
}
