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
    /// no flow attached." For multi-flow documents this mirrors the *active*
    /// flow's nodes — kept for backward compat and the `list_workspaces_meta`
    /// "flow"-mode probe; the full collection lives in `flows`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flow: Option<serde_json::Value>,
    /// Optional multi-flow collection: every `<flow>`/`<sub-flow>` in the
    /// document as `{ name, nodes, isSubFlow }`. `None` on legacy single-flow
    /// files (which only carry `flow`). Opaque JSON to the backend.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flows: Option<Vec<serde_json::Value>>,
    /// Index of the active flow within `flows` when the document was saved, so
    /// the UI can restore the same selection on reopen.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_flow_idx: Option<usize>,
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
        flows: None,
        active_flow_idx: None,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_filename() {
        assert!(validate_filename("my-project.dwstudio").is_ok());
        assert!(validate_filename("").is_err());
        assert!(validate_filename("test/file.dwstudio").is_err());
        assert!(validate_filename("test\\file.dwstudio").is_err());
        assert!(validate_filename("../escape.dwstudio").is_err());
        assert!(validate_filename("no-ext").is_err());
        assert!(validate_filename("wrong-ext.txt").is_err());
    }

    #[test]
    fn test_flow_and_flow_input_roundtrip_through_parse() {
        // A flow-only workspace persists its node tree (`flow`) and the Flow
        // Designer's input fixture (`flowInput`) — both opaque JSON to the backend.
        let json = r#"{
            "version": "2.0",
            "projectName": "Flow WS",
            "createdAt": "",
            "updatedAt": "",
            "requests": [],
            "flow": [{"id":"n1","type":"logger","label":"L","x":0,"y":0,"config":{},"status":"idle"}],
            "flowInput": {"payload":"{}","mime":"application/json","attributesJson":"{}"}
        }"#;
        let ws = parse_workspace(json).expect("v2 flow workspace should parse");
        assert!(ws.flow.is_some(), "flow node tree should survive");
        let fi = ws.flow_input.expect("flowInput should survive");
        assert_eq!(fi["mime"].as_str(), Some("application/json"));
    }

    #[test]
    fn test_flows_collection_roundtrip_through_parse() {
        // A multi-flow document persists the whole collection in `flows`
        // (each `{ name, nodes, isSubFlow }`) plus the active index. `flow`
        // mirrors the active flow for backward compat. All opaque JSON.
        let json = r#"{
            "version": "2.0",
            "projectName": "Multi WS",
            "createdAt": "",
            "updatedAt": "",
            "requests": [],
            "flow": [{"id":"b1","type":"transform","label":"T","x":0,"y":0,"config":{},"status":"idle"}],
            "flows": [
                {"name":"main","isSubFlow":false,"nodes":[{"id":"a1","type":"logger","label":"L","x":0,"y":0,"config":{},"status":"idle"}]},
                {"name":"helper","isSubFlow":true,"nodes":[{"id":"b1","type":"transform","label":"T","x":0,"y":0,"config":{},"status":"idle"}]}
            ],
            "activeFlowIdx": 1
        }"#;
        let ws = parse_workspace(json).expect("multi-flow workspace should parse");
        let flows = ws.flows.expect("flows collection should survive");
        assert_eq!(flows.len(), 2);
        assert_eq!(flows[0]["name"].as_str(), Some("main"));
        assert_eq!(flows[1]["isSubFlow"].as_bool(), Some(true));
        assert_eq!(flows[1]["nodes"][0]["id"].as_str(), Some("b1"));
        assert_eq!(ws.active_flow_idx, Some(1));
        // `flow` (active mirror) stays present for the meta "flow"-mode probe.
        assert!(ws.flow.is_some());
    }

    #[test]
    fn test_legacy_single_flow_has_no_flows_collection() {
        // A pre-multi-flow workspace carries only `flow`. It must parse with
        // `flows: None` so the frontend falls back to the 1-element path.
        let json = r#"{
            "version": "2.0",
            "projectName": "Old Flow WS",
            "createdAt": "",
            "updatedAt": "",
            "requests": [],
            "flow": [{"id":"n1","type":"logger","label":"L","x":0,"y":0,"config":{},"status":"idle"}]
        }"#;
        let ws = parse_workspace(json).expect("single-flow workspace should parse");
        assert!(ws.flow.is_some(), "flow nodes should survive");
        assert!(ws.flows.is_none(), "no flows collection on a legacy single-flow file");
        assert!(ws.active_flow_idx.is_none());
    }

    #[test]
    fn test_uuid_like_id() {
        let id1 = uuid_like_id();
        let id2 = uuid_like_id();
        assert!(!id1.is_empty());
        assert_ne!(id1, id2);
        // Should be alphanumeric/hex
        assert!(id1.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_parse_workspace_v2() {
        let v2_json = r#"{
            "version": "2.0",
            "projectName": "Test Project",
            "createdAt": "2026-05-31T00:00:00Z",
            "updatedAt": "2026-05-31T00:00:00Z",
            "requests": [
                {
                    "id": "req-123",
                    "name": "My Request",
                    "script": "payload",
                    "payload": "{}",
                    "payloadMimeType": "application/json",
                    "nodeLabel": "Transform",
                    "namedInputs": [],
                    "queryTemplate": "",
                    "classpath": [],
                    "multipartParts": [],
                    "context": {
                        "method": "POST",
                        "queryParams": [],
                        "headers": [],
                        "vars": [],
                        "configYaml": "",
                        "secureConfigYaml": ""
                    },
                    "tests": []
                }
            ],
            "activeRequestId": "req-123"
        }"#;

        let parsed = parse_workspace(v2_json);
        assert!(parsed.is_ok());
        let ws = parsed.unwrap();
        assert_eq!(ws.project_name, "Test Project");
        assert_eq!(ws.requests.len(), 1);
        assert_eq!(ws.requests[0].id, "req-123");
        assert_eq!(ws.requests[0].context.method, "POST");
    }

    #[test]
    fn test_parse_workspace_v1_migration() {
        let v1_json = r#"{
            "version": "1.0",
            "projectName": "Legacy Project",
            "createdAt": "2026-05-31T00:00:00Z",
            "updatedAt": "2026-05-31T00:00:00Z",
            "mode": "single",
            "singleTransform": {
                "script": "payload",
                "payload": "{}",
                "payloadMimeType": "application/json",
                "nodeLabel": "Transform",
                "namedInputs": [],
                "queryTemplate": "",
                "classpath": [],
                "multipartParts": []
            },
            "context": {
                "method": "GET",
                "queryParams": [],
                "headers": [],
                "vars": [],
                "configYaml": "",
                "secureConfigYaml": ""
            }
        }"#;

        let parsed = parse_workspace(v1_json);
        assert!(parsed.is_ok());
        let ws = parsed.unwrap();
        assert_eq!(ws.project_name, "Legacy Project");
        assert_eq!(ws.version, "2.0"); // auto-migrated version
        assert_eq!(ws.requests.len(), 1);
        assert_eq!(ws.requests[0].name, "Legacy Project"); // migrated request name
        assert_eq!(ws.requests[0].script, "payload");
        assert_eq!(ws.requests[0].context.method, "GET");
        assert!(ws.active_request_id.is_some());
    }
}
