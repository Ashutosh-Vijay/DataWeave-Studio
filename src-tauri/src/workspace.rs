use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// ===========================================================================
// Schema v2 — "workspace = collection of requests"
//
// A workspace is now a folder-like container: one project name, one optional
// message flow, and N "requests". Each request is a fully self-contained
// transform (script + payload + context + named inputs + tests).
//
// Existing v1 files (`mode: 'single' | 'flow'` with `singleTransform` at the
// top) are auto-migrated on load: their singleTransform + context become a
// single request named after the project. See `load_workspace` for the
// migration path.
// ===========================================================================

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VarEntry {
    pub key: String,
    pub value: String,
    pub value_type: String, // "string" | "json"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KeyValuePair {
    pub key: String,
    pub value: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
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

impl Default for ContextState {
    fn default() -> Self {
        Self {
            method: "GET".into(),
            query_params: vec![],
            headers: vec![],
            vars: vec![],
            config_yaml: String::new(),
            secure_config_yaml: String::new(),
            encryption_settings: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NamedInput {
    pub name: String,
    pub content: String,
    pub mime_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
}

/// A single test case attached to a request. Phase 2 will materialize the UI
/// for these; defining the field here so the schema is forward-compatible
/// from day one and we don't have to break workspaces twice.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TestCase {
    pub id: String,
    pub name: String,
    pub payload: String,
    pub payload_mime_type: String,
    /// `None` = test not yet captured (the user has to run + snapshot once).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_output: Option<String>,
    /// "exact" | "semantic-json"
    #[serde(default)]
    pub comparator: String,
    /// Last-known status — purely advisory, the test runner overwrites this.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_time_ms: Option<u64>,
}

/// One request inside a workspace. Mirrors the fields from the old
/// SingleTransform plus its own ContextState plus an id, name, and tests
/// array.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub id: String,
    pub name: String,
    pub script: String,
    pub payload: String,
    pub payload_mime_type: String,
    pub node_label: String,
    #[serde(default)]
    pub named_inputs: Vec<NamedInput>,
    #[serde(default)]
    pub query_template: String,
    #[serde(default)]
    pub classpath: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_file_path: Option<String>,
    #[serde(default)]
    pub multipart_parts: Vec<serde_json::Value>,
    #[serde(default)]
    pub context: ContextState,
    #[serde(default)]
    pub tests: Vec<TestCase>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    pub version: String,
    pub project_name: String,
    pub created_at: String,
    pub updated_at: String,
    /// All transforms in this workspace. Empty Vec is allowed during creation
    /// but `save_workspace` will inject a default request if you somehow save
    /// an empty one (the UI shouldn't, but defense in depth).
    #[serde(default)]
    pub requests: Vec<Request>,
    /// ID of the currently-active request when the user last left the
    /// workspace. UI restores selection on load.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_request_id: Option<String>,
    /// Optional message-flow definition that pipelines this workspace's
    /// requests. `None` means "this workspace is just a request collection,
    /// no flow attached."
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flow: Option<serde_json::Value>,
    /// Optional flow-entry input fixture (sample payload + inbound attributes)
    /// the Flow Designer uses to seed test runs. Opaque to the backend.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flow_input: Option<serde_json::Value>,
}

// ===========================================================================
// Legacy v1 schema — kept only for migration on load.
// ===========================================================================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacySingleTransform {
    script: String,
    payload: String,
    payload_mime_type: String,
    node_label: String,
    #[serde(default)]
    named_inputs: Vec<NamedInput>,
    #[serde(default)]
    query_template: String,
    #[serde(default)]
    classpath: Vec<String>,
    #[serde(default)]
    timeout_ms: Option<u64>,
    #[serde(default)]
    payload_file_path: Option<String>,
    #[serde(default)]
    multipart_parts: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyWorkspaceFile {
    #[serde(default)]
    version: String,
    project_name: String,
    #[serde(default)]
    created_at: String,
    #[serde(default)]
    updated_at: String,
    #[serde(default)]
    mode: String,
    single_transform: LegacySingleTransform,
    #[serde(default)]
    context: Option<ContextState>,
    #[serde(default)]
    flow_nodes: Option<serde_json::Value>,
}

fn migrate_legacy(legacy: LegacyWorkspaceFile) -> WorkspaceFile {
    // The legacy single transform becomes the workspace's first (and only)
    // request. Its name defaults to the project name so the UI doesn't show
    // an awkward "Untitled request" for migrated files.
    let request_id = format!("req-{}", uuid_like_id());
    let request = Request {
        id: request_id.clone(),
        name: if legacy.project_name.is_empty() {
            "Request".into()
        } else {
            legacy.project_name.clone()
        },
        script: legacy.single_transform.script,
        payload: legacy.single_transform.payload,
        payload_mime_type: legacy.single_transform.payload_mime_type,
        node_label: legacy.single_transform.node_label,
        named_inputs: legacy.single_transform.named_inputs,
        query_template: legacy.single_transform.query_template,
        classpath: legacy.single_transform.classpath,
        timeout_ms: legacy.single_transform.timeout_ms,
        payload_file_path: legacy.single_transform.payload_file_path,
        multipart_parts: legacy.single_transform.multipart_parts,
        context: legacy.context.unwrap_or_default(),
        tests: vec![],
    };

    // Old "flow" mode workspaces stored their flow definition in
    // `flow_nodes` at the top level. Keep that, just rename to `flow`.
    WorkspaceFile {
        version: "2.0".into(),
        project_name: legacy.project_name,
        created_at: legacy.created_at,
        updated_at: legacy.updated_at,
        requests: vec![request],
        active_request_id: Some(request_id),
        flow: legacy.flow_nodes,
        flow_input: None,
    }
}

/// Short pseudo-unique ID. Not crypto, just enough to disambiguate requests
/// within a workspace. Format: epoch ms in hex + 4 random hex chars.
fn uuid_like_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    // pseudo-random: take a few bits from the nanos
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("{:x}{:04x}", ms, nanos & 0xffff)
}

// ===========================================================================
// File ops
// ===========================================================================

/// Reject filenames that could escape the workspaces directory.
fn validate_filename(filename: &str) -> Result<(), String> {
    if filename.is_empty() {
        return Err("Filename cannot be empty".into());
    }
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("Invalid filename: path traversal detected".into());
    }
    if !filename.ends_with(".dwstudio") {
        return Err("Invalid filename: must end with .dwstudio".into());
    }
    Ok(())
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

    // Sanitize project name for filename — collapse runs of non-alnum to a
    // single dash and trim leading/trailing dashes to keep names clean.
    let safe_name: String = workspace
        .project_name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let filename = if safe_name.is_empty() {
        "untitled".to_string()
    } else {
        safe_name
    };

    let file_path = dir.join(format!("{}.dwstudio", filename));

    // Update the timestamp + ensure version is current.
    let mut ws = workspace;
    ws.version = "2.0".into();
    ws.updated_at = chrono::Utc::now().to_rfc3339();
    if ws.created_at.is_empty() {
        ws.created_at = ws.updated_at.clone();
    }

    // Defense in depth: persist at least one request EXCEPT for flow-only
    // workspaces (where the user opted into a flow file with no requests).
    // Without this guard, a v1 flow-only workspace would get a phantom
    // "Request" tab the next time it loaded.
    if ws.requests.is_empty() && ws.flow.is_none() {
        let id = format!("req-{}", uuid_like_id());
        ws.requests.push(Request {
            id: id.clone(),
            name: "Request".into(),
            script: "%dw 2.0\noutput application/json\n---\npayload".into(),
            payload: "{}".into(),
            payload_mime_type: "application/json".into(),
            node_label: "Transform".into(),
            named_inputs: vec![],
            query_template: String::new(),
            classpath: vec![],
            timeout_ms: None,
            payload_file_path: None,
            multipart_parts: vec![],
            context: ContextState::default(),
            tests: vec![],
        });
        ws.active_request_id = Some(id);
    }

    let json = serde_json::to_string_pretty(&ws).map_err(|e| e.to_string())?;
    fs::write(&file_path, json).map_err(|e| format!("Failed to save workspace: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn load_workspace(app: AppHandle, filename: String) -> Result<WorkspaceFile, String> {
    validate_filename(&filename)?;
    let dir = get_workspaces_directory(&app)?;
    let file_path = dir.join(&filename);

    let contents = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read workspace '{}': {}", filename, e))?;

    parse_workspace(&contents)
        .map_err(|e| format!("Failed to parse workspace '{}': {}", filename, e))
}

/// Try to deserialize as v2 first; fall back to v1 + migrate. Centralized so
/// `list_workspaces_meta` can use the same logic.
fn parse_workspace(contents: &str) -> Result<WorkspaceFile, String> {
    let raw: serde_json::Value = serde_json::from_str(contents).map_err(|e| e.to_string())?;

    // v2 indicator: has a `requests` array.
    if raw.get("requests").and_then(|v| v.as_array()).is_some() {
        return serde_json::from_value(raw).map_err(|e| e.to_string());
    }

    // v1 indicator: has a `singleTransform` field. Migrate.
    if raw.get("singleTransform").is_some() {
        let legacy: LegacyWorkspaceFile = serde_json::from_value(raw).map_err(|e| e.to_string())?;
        return Ok(migrate_legacy(legacy));
    }

    Err("Unrecognized workspace format — file missing both `requests` and `singleTransform`.".into())
}

#[tauri::command]
pub fn list_workspaces(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = get_workspaces_directory(&app)?;
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut files: Vec<String> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".dwstudio") { Some(name) } else { None }
        })
        .collect();
    files.sort();
    Ok(files)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMeta {
    pub filename: String,
    pub project_name: String,
    /// "single" / "flow" for legacy listings; "collection" for v2.
    /// The frontend keeps using this to filter out flow-only files, but for
    /// v2 every workspace is conceptually a collection — we keep the field
    /// so the filter in `useWorkspace.listWorkspaces` keeps working.
    pub mode: String,
    /// Number of requests in this workspace (v2). Always 1 for migrated v1
    /// files. Useful for the workspace list to show a small "5 requests"
    /// pill if we want to surface that.
    #[serde(default)]
    pub request_count: u32,
}

#[tauri::command]
pub fn list_workspaces_meta(app: AppHandle) -> Result<Vec<WorkspaceMeta>, String> {
    let dir = get_workspaces_directory(&app)?;
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    let mut metas: Vec<WorkspaceMeta> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.ends_with(".dwstudio") { return None; }
            let path = entry.path();
            let contents = fs::read_to_string(&path).ok()?;
            // Cheap shape check: peek at the JSON without parsing the full
            // schema. Avoids running the migration just to list a directory.
            let raw: serde_json::Value = serde_json::from_str(&contents).ok()?;
            let project_name = raw.get("projectName")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled")
                .to_string();
            let (mode, request_count) = if let Some(requests) = raw.get("requests").and_then(|v| v.as_array()) {
                let has_flow = raw.get("flow").map_or(false, |v| !v.is_null());
                let mode = if has_flow && requests.is_empty() { "flow".to_string() } else { "collection".to_string() };
                (mode, requests.len() as u32)
            } else {
                // Legacy
                let mode = raw.get("mode").and_then(|v| v.as_str()).unwrap_or("single").to_string();
                (mode, 1)
            };
            Some(WorkspaceMeta { filename: name, project_name, mode, request_count })
        })
        .collect();

    metas.sort_by(|a, b| a.filename.cmp(&b.filename));
    Ok(metas)
}

#[tauri::command]
pub fn delete_workspace(app: AppHandle, filename: String) -> Result<(), String> {
    validate_filename(&filename)?;
    let dir = get_workspaces_directory(&app)?;
    let file_path = dir.join(&filename);

    fs::remove_file(&file_path)
        .map_err(|e| format!("Failed to delete workspace '{}': {}", filename, e))
}
