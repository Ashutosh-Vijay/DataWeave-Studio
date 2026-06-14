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
    /// The complete DataWeave 2.0 script. May include its own %dw / output / ---
    /// header; missing parts are inferred.
    script: String,
    /// The input payload as a string (JSON, XML, CSV, YAML, …).
    payload: String,
    /// MIME type of the payload, e.g. application/json, application/xml.
    #[serde(default = "default_mime")]
    input_mime_type: String,
}
fn default_mime() -> String {
    "application/json".to_string()
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
        description = "Execute a DataWeave 2.0 script against an input payload using the local engine and return the rendered output, or the exact error with line/column. You MUST call this to validate EVERY DataWeave script you generate BEFORE presenting it to the user; if it returns an error, fix the script and re-run until it succeeds. Never output an untested DataWeave script."
    )]
    async fn validate_and_run_dataweave(
        &self,
        Parameters(input): Parameters<RunInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        // Safe-mode gate (Phase 0): refuse Java interop unless Advanced is on.
        if !self.advanced.load(Ordering::Relaxed) && input.script.contains("java!") {
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
            input.script,
            input.payload,
            input.input_mime_type,
            "{}".to_string(),  // attributes
            "{}".to_string(),  // vars
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
        let mut info = ServerInfo::default();
        info.instructions = Some(
            "DataWeave Studio — run and validate DataWeave 2.0 scripts against a payload on the \
             local engine. Always call validate_and_run_dataweave to test a script before \
             presenting it; if it errors, fix it and re-run."
                .to_string(),
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
