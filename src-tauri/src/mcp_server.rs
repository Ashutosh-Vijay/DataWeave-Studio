//! In-process MCP server (Streamable HTTP) exposing the DataWeave engine to AI
//! agents (Claude Desktop, Cursor, Copilot). Hosted inside the Tauri backend via
//! the official Rust SDK (`rmcp`) served over axum — no extra runtime to bundle.
//!
//! Safe mode (the default) is the Phase-0 RCE gate: a generated script that uses
//! Java interop (`import java!…`) is *rejected before it runs* and no classpath
//! is ever passed, so an agent can transform data but can't reach Java or the
//! filesystem. Advanced mode lifts that — only for fully-trusted local agents.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use rmcp::handler::server::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, Content, ServerInfo};
use rmcp::schemars;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use rmcp::{tool, tool_handler, tool_router, ServerHandler};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

// ── Tool surface ───────────────────────────────────────────────────────────

#[derive(Deserialize, schemars::JsonSchema)]
struct RunInput {
    /// A DataWeave 2.0 script. A bare body works — `payload map (x) -> x * 2` runs
    /// as `%dw 2.0` with `output application/json`. For any other output format you
    /// MUST supply the full header, e.g.:
    /// `%dw 2.0\noutput application/xml\n---\n{ root: payload }`. `payload` refers
    /// to the input below.
    script: String,
    /// Sample input payload as a string, matching `input_mime_type`. JSON example:
    /// `[1, 2, 3]`. XML example: `<items><item>1</item></items>`. Pass `{}` if the
    /// script doesn't read the payload.
    payload: String,
    /// MIME type of `payload`: application/json (default), application/xml,
    /// application/csv, application/yaml, etc.
    #[serde(default = "default_mime")]
    input_mime_type: String,
    /// Optional inbound attributes as a JSON object — accessed as `attributes.*`
    /// in the script. Shape: `{"method":"GET","headers":{...},"queryParams":{...},"uriParams":{...}}`.
    #[serde(default)]
    attributes: Option<String>,
    /// Optional flow variables as a JSON object `{"name": value}` — accessed as `vars.*`.
    #[serde(default)]
    vars: Option<String>,
    /// Optional Config YAML. `${key}` placeholders in the script/payload are
    /// replaced before running, e.g. `db:\n  host: localhost` lets the script use `${db.host}`.
    #[serde(default)]
    config: Option<String>,
    /// Optional Secure Config YAML (plaintext — encrypted ![…] values aren't
    /// decrypted here). Replaces `${secure::key}` (and `${key}`) placeholders.
    #[serde(default)]
    secure_config: Option<String>,
}
fn default_mime() -> String {
    "application/json".to_string()
}

/// Flatten a YAML/JSON object into dot-notation keys (mirrors the single-script app).
fn flatten_yaml(value: &serde_json::Value, prefix: &str, out: &mut std::collections::HashMap<String, String>) {
    if let Some(map) = value.as_object() {
        for (k, v) in map {
            let key = if prefix.is_empty() { k.clone() } else { format!("{}.{}", prefix, k) };
            if v.is_object() {
                flatten_yaml(v, &key, out);
            } else if let Some(s) = v.as_str() {
                out.insert(key, s.to_string());
            } else if v.is_null() {
                out.insert(key, String::new());
            } else {
                out.insert(key, v.to_string());
            }
        }
    }
}

/// Replace ${key} / ${secure::key} placeholders using the given YAML configs.
fn substitute_props(mut text: String, config_yaml: Option<&str>, secure_yaml: Option<&str>) -> String {
    for (yaml_opt, secure) in [(config_yaml, false), (secure_yaml, true)] {
        let y = match yaml_opt {
            Some(y) if !y.trim().is_empty() => y,
            _ => continue,
        };
        if let Ok(v) = serde_yaml::from_str::<serde_json::Value>(y) {
            let mut flat = std::collections::HashMap::new();
            flatten_yaml(&v, "", &mut flat);
            for (k, val) in &flat {
                if secure {
                    text = text.replace(&format!("${{secure::{}}}", k), val);
                }
                text = text.replace(&format!("${{{}}}", k), val);
            }
        }
    }
    text
}

#[derive(Clone)]
pub struct DwTools {
    app: AppHandle,
    /// When false (Safe mode), scripts using Java interop are refused.
    advanced: Arc<AtomicBool>,
    /// Tool calls served — surfaced as the "requests" stat.
    requests: Arc<AtomicU64>,
    tool_router: ToolRouter<DwTools>,
}

#[tool_router]
impl DwTools {
    pub fn new(app: AppHandle, advanced: Arc<AtomicBool>, requests: Arc<AtomicU64>) -> Self {
        Self {
            app,
            advanced,
            requests,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        description = "Run and validate a DataWeave 2.0 script against a sample payload on the local, real DataWeave 2.11 engine; returns the rendered output, or the exact compile/runtime error with line & column. MANDATORY: call this on EVERY DataWeave script you write BEFORE showing it to the user — never present unverified DataWeave. On error, fix the script using the reported line/column and re-run until it succeeds (don't web-search syntax — this tool's result is the ground truth). A bare body runs as `%dw 2.0` / `output application/json`; include your own `output <mime>` + `---` for any other output format."
    )]
    async fn validate_and_run_dataweave(
        &self,
        Parameters(input): Parameters<RunInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        // Resolve ${key} / ${secure::key} placeholders from the supplied configs.
        let script = substitute_props(input.script, input.config.as_deref(), input.secure_config.as_deref());
        let payload = substitute_props(input.payload, input.config.as_deref(), input.secure_config.as_deref());

        // Safe-mode gate (Phase 0): refuse Java interop unless Advanced is on.
        if !self.advanced.load(Ordering::Relaxed) && script.contains("java!") {
            return Ok(CallToolResult::error(vec![Content::text(
                "Safe mode: Java interop (`import java!…`) is disabled, so this script was NOT run. \
                 Rewrite it without Java, or ask the user to enable Advanced mode in DataWeave Studio's MCP panel."
                    .to_string(),
            )]));
        }

        self.requests.fetch_add(1, Ordering::Relaxed);
        let state = self.app.state::<crate::dw_runner::RunState>();
        let result = crate::dw_runner::run_dataweave(
            self.app.clone(),
            state,
            script,
            payload,
            input.input_mime_type,
            input.attributes.unwrap_or_else(|| "{}".to_string()),
            input.vars.unwrap_or_else(|| "{}".to_string()),
            "[]".to_string(),  // named inputs
            None,              // payload file
            None,              // classpath — never hand an agent a classpath
            None,              // timeout (default)
            None,              // multipart
        )
        .await
        .map_err(|e| rmcp::ErrorData::internal_error(e, None))?;

        if let Some(err) = result.error {
            let loc = match result.error_line {
                Some(l) => format!(
                    " (line {}{})",
                    l,
                    result
                        .error_column
                        .map(|c| format!(", col {}", c))
                        .unwrap_or_default()
                ),
                None => String::new(),
            };
            Ok(CallToolResult::error(vec![Content::text(format!(
                "ERROR{}:\n{}",
                loc, err
            ))]))
        } else {
            Ok(CallToolResult::success(vec![Content::text(result.output)]))
        }
    }
}

#[tool_handler]
impl ServerHandler for DwTools {
    fn get_info(&self) -> ServerInfo {
        // ServerInfo is #[non_exhaustive] — build from default, then set fields.
        // `instructions` is injected into the agent's system prompt by good MCP
        // clients, so this is where we make a cold agent verify-before-presenting
        // and know the exact input shape (no web-search, no trial-and-error).
        // The Java line is DYNAMIC on the live Safe/Advanced flag so the docs
        // never lie about whether `import java!` will be accepted.
        let java_line = if self.advanced.load(Ordering::Relaxed) {
            "- Java interop is ENABLED (Advanced mode): you MAY use `import java!java::lang::…` etc. \
             Still no filesystem / network / process access."
        } else {
            "- Java interop (`import java!…`) is BLOCKED in Safe mode (the default) — such scripts are \
             rejected before running. `dw::core::Java` is not available either."
        };
        // Built by concatenation (not format!) — the text contains literal
        // ${key} braces that format! would try to parse as placeholders.
        let mut info = ServerInfo::default();
        info.instructions = Some(
            [
                "# DataWeave Studio — local DataWeave 2.0 engine\n\
                 You can run REAL DataWeave 2.0 against a payload on the user's machine via the \
                 `validate_and_run_dataweave` tool. This is the genuine DataWeave 2.11 runtime, so its \
                 output and errors are authoritative.\n\n\
                 ## Rules (always follow)\n\
                 1. VALIDATE BEFORE PRESENTING — never show the user a DataWeave script you have not run \
                 successfully with `validate_and_run_dataweave`. Don't reason about whether it compiles; run it.\n\
                 2. FIX-AND-RETRY — on error, read the line/column + message, correct the script, and call \
                 the tool again. Repeat until `isError` is false. Do NOT web-search DataWeave syntax — the \
                 tool's error is the ground truth, and guessing just burns tokens.\n\
                 3. Present only verified scripts; ideally show the sample input and the output you confirmed.\n\n\
                 ## Writing the `script`\n\
                 - A bare body works: `payload map (x) -> x * 2` runs as `%dw 2.0` with `output application/json`.\n\
                 - For any non-JSON output you MUST write the header yourself: `%dw 2.0` / `output application/xml` / `---` / body.\n\
                 - `payload` refers to the input you pass; its format follows `input_mime_type`.\n\n\
                 ## Optional inputs (pass only when the script uses them)\n\
                 - `attributes` (JSON object): inbound HTTP attributes — `attributes.method`, `attributes.headers.*`, \
                 `attributes.queryParams.*`, `attributes.uriParams.*`.\n\
                 - `vars` (JSON object): flow variables, read as `vars.name`.\n\
                 - `config` / `secure_config` (YAML): values for ${key} / ${secure::key} placeholders, \
                 substituted before the run.\n\n\
                 ## Limits\n",
                java_line,
                "\n- No file or network access; this is a pure transform sandbox.",
            ]
            .concat(),
        );
        info
    }
}

// ── Lifecycle (start / stop / status) ───────────────────────────────────────

struct Running {
    shutdown: tokio::sync::oneshot::Sender<()>,
    port: u16,
    advanced: Arc<AtomicBool>,
    requests: Arc<AtomicU64>,
    started: Instant,
}

#[derive(Default)]
pub struct McpState {
    running: Mutex<Option<Running>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub advanced: bool,
    pub uptime_secs: u64,
    pub requests: u64,
}

fn stop_inner(state: &McpState) {
    if let Some(r) = state.running.lock().unwrap_or_else(|e| e.into_inner()).take() {
        let _ = r.shutdown.send(());
    }
}

#[tauri::command]
pub async fn mcp_start(
    app: AppHandle,
    state: tauri::State<'_, McpState>,
    port: u16,
    advanced: bool,
) -> Result<(), String> {
    stop_inner(&state); // idempotent — restart on re-start / port change

    let advanced_flag = Arc::new(AtomicBool::new(advanced));
    let requests = Arc::new(AtomicU64::new(0));
    let app_for_factory = app.clone();
    let flag_for_factory = advanced_flag.clone();
    let req_for_factory = requests.clone();

    let service = StreamableHttpService::new(
        move || {
            Ok(DwTools::new(
                app_for_factory.clone(),
                flag_for_factory.clone(),
                req_for_factory.clone(),
            ))
        },
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig::default(),
    );

    let router = axum::Router::new().nest_service("/mcp", service);
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Couldn't bind 127.0.0.1:{} — {}", port, e))?;

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                let _ = rx.await;
            })
            .await;
    });

    *state.running.lock().unwrap_or_else(|e| e.into_inner()) = Some(Running {
        shutdown: tx,
        port,
        advanced: advanced_flag,
        requests,
        started: Instant::now(),
    });
    Ok(())
}

#[tauri::command]
pub fn mcp_stop(state: tauri::State<'_, McpState>) -> Result<(), String> {
    stop_inner(&state);
    Ok(())
}

#[tauri::command]
pub fn mcp_set_advanced(state: tauri::State<'_, McpState>, advanced: bool) -> Result<(), String> {
    // Live-toggle safe/advanced without restarting the server.
    if let Some(r) = state.running.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        r.advanced.store(advanced, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub fn mcp_status(state: tauri::State<'_, McpState>) -> McpStatus {
    let g = state.running.lock().unwrap_or_else(|e| e.into_inner());
    match &*g {
        Some(r) => McpStatus {
            running: true,
            port: Some(r.port),
            advanced: r.advanced.load(Ordering::Relaxed),
            uptime_secs: r.started.elapsed().as_secs(),
            requests: r.requests.load(Ordering::Relaxed),
        },
        None => McpStatus {
            running: false,
            port: None,
            advanced: false,
            uptime_secs: 0,
            requests: 0,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::substitute_props;

    #[test]
    fn substitutes_config_and_secure_placeholders() {
        let script = "{ host: \"${db.host}\", pw: \"${secure::db.pw}\", port: ${db.port} }".to_string();
        let config = "db:\n  host: localhost\n  port: 5432";
        let secure = "db:\n  pw: s3cr3t";
        let out = substitute_props(script, Some(config), Some(secure));
        assert_eq!(out, "{ host: \"localhost\", pw: \"s3cr3t\", port: 5432 }");
    }

    #[test]
    fn no_config_is_a_noop() {
        let s = "payload map (x) -> x".to_string();
        assert_eq!(substitute_props(s.clone(), None, None), s);
        assert_eq!(substitute_props(s.clone(), Some("   "), None), s);
    }
}
