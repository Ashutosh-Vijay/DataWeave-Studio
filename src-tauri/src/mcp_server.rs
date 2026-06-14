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
use rmcp::model::{CallToolResult, Content, ServerCapabilities, ServerInfo};
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
    /// Optional multipart/form-data parts, as a JSON array. Use this instead of
    /// `payload` to build a real multipart body (binary-safe). Each part:
    /// `{"name":"f","filename":"a.pdf","contentType":"application/pdf", <ONE OF> }`
    /// where the content is exactly one of:
    ///   `"value":"text..."` (text part),
    ///   `"contentBase64":"<base64>"` (binary file — works in any mode),
    ///   `"filePath":"C:/abs/path"` (server reads the file off disk — ADVANCED mode only).
    /// In the script read parts via `payload.parts.<name>.content`. When set, the
    /// input is multipart/form-data and the `payload` field is ignored.
    #[serde(default)]
    multipart: Option<String>,
    /// Decryption key for encrypted `![...]` values in `config`/`secure_config`
    /// (MuleSoft secure properties). Overrides any key set in the MCP panel. If a
    /// config contains `![...]` and no key is available (here or in the panel), the
    /// run is REJECTED with an error rather than passing ciphertext to the script.
    #[serde(default)]
    secure_key: Option<String>,
    /// Cipher for decryption: AES (default) | Blowfish | DES | DESede | RC2.
    #[serde(default)]
    secure_algorithm: Option<String>,
    /// Cipher mode for decryption: CBC (default) | CFB | ECB | OFB.
    #[serde(default)]
    secure_mode: Option<String>,
    /// Whether the encrypted values used a random IV (MuleSoft `--use-random-iv`). Default false.
    #[serde(default)]
    secure_random_iv: Option<bool>,
    /// Extra named inputs beyond payload/attributes/vars, as a JSON array. Each:
    /// `{"name":"account","mimeType":"application/json", <ONE OF> }` where content is
    /// `"content":"{...}"` (inline data) or `"filePath":"C:/abs/path"` (server reads
    /// it — ADVANCED mode only). Read in the script by name, e.g. `account.id`. The
    /// engine adds `input <name> <mime>` for each automatically.
    #[serde(default)]
    named_inputs: Option<String>,
}
fn default_mime() -> String {
    "application/json".to_string()
}

/// Input for the `secure_properties` tool (MuleSoft encrypt/decrypt).
#[derive(Deserialize, schemars::JsonSchema)]
struct SecurePropsInput {
    /// "encrypt" (plaintext → `![base64]`) or "decrypt" (`![...]`/base64 → plaintext).
    operation: String,
    /// The value: plaintext to encrypt, or the ciphertext (inner base64 or full `![...]`) to decrypt.
    value: String,
    /// The MuleSoft secure-properties key (e.g. a 16/24/32-char AES key).
    key: String,
    /// Cipher: AES (default) | Blowfish | DES | DESede | RC2.
    #[serde(default)]
    algorithm: Option<String>,
    /// Mode: CBC (default) | CFB | ECB | OFB.
    #[serde(default)]
    mode: Option<String>,
    /// Whether a random IV was/should be used (MuleSoft `--use-random-iv`). Default false.
    #[serde(default)]
    use_random_iv: Option<bool>,
}

/// One extra named input as supplied by an MCP agent (parsed from `named_inputs`).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpNamedInput {
    name: String,
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    mime_type: Option<String>,
    #[serde(default)]
    file_path: Option<String>,
}

/// One multipart part as supplied by an MCP agent (parsed from the `multipart` JSON).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpPart {
    name: String,
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    content_base64: Option<String>,
    #[serde(default)]
    file_path: Option<String>,
    #[serde(default)]
    content_type: Option<String>,
    #[serde(default)]
    filename: Option<String>,
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

/// A MuleSoft secure value looks like `![base64]`. We decrypt those before they
/// reach the script — passing the ciphertext through would silently produce wrong
/// data (no error, just the encrypted blob).
fn is_encrypted_value(v: &str) -> bool {
    let t = v.trim();
    t.len() > 3 && t.starts_with("![") && t.ends_with(']')
}

/// Parse a YAML config into a flat dot-key map (lenient — bad YAML → empty map,
/// matching `substitute_props`).
fn flatten_yaml_to_map(yaml: Option<&str>) -> std::collections::HashMap<String, String> {
    let mut flat = std::collections::HashMap::new();
    if let Some(y) = yaml {
        if !y.trim().is_empty() {
            if let Ok(v) = serde_yaml::from_str::<serde_json::Value>(y) {
                flatten_yaml(&v, "", &mut flat);
            }
        }
    }
    flat
}

/// Substitute `${key}` / `${secure::key}` from a flat map into `text`. `secure`
/// also matches the `${secure::key}` form.
fn apply_map(mut text: String, map: &std::collections::HashMap<String, String>, secure: bool) -> String {
    for (k, val) in map {
        if secure {
            text = text.replace(&format!("${{secure::{}}}", k), val);
        }
        text = text.replace(&format!("${{{}}}", k), val);
    }
    text
}

/// In Safe mode a script must be a PURE transform — no Java interop and no file /
/// network I/O. DataWeave's own `readUrl` reads `file://` (any local file) and
/// reaches the network, and `dw::io::*` modules do I/O — none of these go through
/// `java!`, so they must be blocked too or "no file/network access" is a lie.
/// `read(...)` (which only parses an in-memory string) is fine and NOT matched.
/// Returns the human-readable reason when the script must be rejected.
fn safe_mode_block_reason(script: &str) -> Option<&'static str> {
    if script.contains("java!") {
        Some("Java interop (`import java!…`)")
    } else if script.contains("readUrl") {
        Some("`readUrl` (it reads local files via file:// and reaches the network)")
    } else if script.contains("dw::io") {
        Some("the `dw::io` module (file / network I/O)")
    } else {
        None
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

/// Panel-set decryption settings for `![...]` secure values. Session-only — held
/// in memory, never persisted to disk and never sent over MCP. The agent can
/// override `key` per call via `secure_key`.
#[derive(Clone)]
pub struct DecryptSettings {
    key: Option<String>,
    algorithm: String,
    mode: String,
    use_random_iv: bool,
}

impl Default for DecryptSettings {
    fn default() -> Self {
        Self {
            key: None,
            algorithm: "AES".to_string(),
            mode: "CBC".to_string(),
            use_random_iv: false,
        }
    }
}

#[derive(Clone)]
pub struct DwTools {
    app: AppHandle,
    /// When false (Safe mode), scripts using Java interop are refused.
    advanced: Arc<AtomicBool>,
    /// Tool calls served — surfaced as the "requests" stat.
    requests: Arc<AtomicU64>,
    /// Panel-set decryption key/cipher for `![...]` secure values (session-only).
    decrypt: Arc<Mutex<DecryptSettings>>,
    tool_router: ToolRouter<DwTools>,
}

#[tool_router]
impl DwTools {
    pub fn new(
        app: AppHandle,
        advanced: Arc<AtomicBool>,
        requests: Arc<AtomicU64>,
        decrypt: Arc<Mutex<DecryptSettings>>,
    ) -> Self {
        Self {
            app,
            advanced,
            requests,
            decrypt,
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
        // Resolve ${key} / ${secure::key} placeholders. Encrypted `![...]` values
        // are decrypted FIRST — passing ciphertext through would silently corrupt
        // the run. Effective decrypt settings: agent-supplied overrides the panel.
        let panel = self.decrypt.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let eff_key = input
            .secure_key
            .clone()
            .filter(|k| !k.is_empty())
            .or(panel.key.clone());
        let eff_algo = input.secure_algorithm.clone().unwrap_or(panel.algorithm.clone());
        let eff_mode = input.secure_mode.clone().unwrap_or(panel.mode.clone());
        let eff_riv = input.secure_random_iv.unwrap_or(panel.use_random_iv);

        let mut cfg_map = flatten_yaml_to_map(input.config.as_deref());
        let mut sec_map = flatten_yaml_to_map(input.secure_config.as_deref());

        // Decrypt any ![...] values; refuse loudly if encrypted but no key.
        for map in [&mut cfg_map, &mut sec_map] {
            for val in map.values_mut() {
                if !is_encrypted_value(val) {
                    continue;
                }
                let key = match eff_key.as_deref() {
                    Some(k) => k,
                    None => {
                        return Ok(CallToolResult::error(vec![Content::text(
                            "This config contains encrypted secure values (`![…]`) but no decryption key is \
                             available. The server will NOT pass ciphertext to the script. Either set the key in \
                             DataWeave Studio's MCP Server panel, or pass `secure_key` (plus `secure_algorithm` / \
                             `secure_mode` if not the AES/CBC default) with this call."
                                .to_string(),
                        )]));
                    }
                };
                let t = val.trim();
                let inner = t[2..t.len() - 1].to_string();
                match crate::secure_properties::secure_properties_invoke(
                    self.app.clone(),
                    "decrypt".to_string(),
                    eff_algo.clone(),
                    eff_mode.clone(),
                    key.to_string(),
                    inner,
                    eff_riv,
                ) {
                    Ok(plain) => *val = plain,
                    Err(e) => {
                        return Ok(CallToolResult::error(vec![Content::text(format!(
                            "Failed to decrypt a secure value (check the key/algorithm/mode): {}",
                            e
                        ))]))
                    }
                }
            }
        }

        let script = apply_map(apply_map(input.script, &cfg_map, false), &sec_map, true);
        let payload = apply_map(apply_map(input.payload, &cfg_map, false), &sec_map, true);

        // Safe-mode gate (Phase 0): refuse Java interop AND file/network I/O unless
        // Advanced is on. Checked on the SUBSTITUTED script so an injected config
        // value can't smuggle a readUrl past the gate.
        if !self.advanced.load(Ordering::Relaxed) {
            if let Some(reason) = safe_mode_block_reason(&script) {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Safe mode rejected this script: {} is not allowed here — this is a pure-transform sandbox \
                     with no file or network access, so it was NOT run. Rewrite it without that, or ask the user \
                     to enable Advanced mode in DataWeave Studio's MCP panel.",
                    reason
                ))]));
            }
        }

        // Build multipart parts (binary-safe) when provided. base64/value parts run
        // in any mode; filePath parts read the user's disk → Advanced mode only.
        let multipart_json = match input.multipart.as_deref() {
            Some(s) if !s.trim().is_empty() => {
                let parts: Vec<McpPart> = match serde_json::from_str(s) {
                    Ok(p) => p,
                    Err(e) => {
                        return Ok(CallToolResult::error(vec![Content::text(format!(
                            "Invalid `multipart` JSON: {}. Expected an array of {{name, contentType, filename, and one of value|contentBase64|filePath}}.",
                            e
                        ))]))
                    }
                };
                let advanced = self.advanced.load(Ordering::Relaxed);
                let mut normalized = Vec::with_capacity(parts.len());
                for p in parts {
                    if p.file_path.is_some() && !advanced {
                        return Ok(CallToolResult::error(vec![Content::text(format!(
                            "Part '{}' uses `filePath`, which reads the user's disk and is only allowed in Advanced mode. \
                             In Safe mode, pass the bytes yourself as `contentBase64` instead.",
                            p.name
                        ))]));
                    }
                    if let Some(ref b64) = p.content_base64 {
                        use base64::Engine;
                        if base64::engine::general_purpose::STANDARD.decode(b64.trim()).is_err() {
                            return Ok(CallToolResult::error(vec![Content::text(format!(
                                "Part '{}' has invalid base64 in `contentBase64`.",
                                p.name
                            ))]));
                        }
                    }
                    let is_file = p.file_path.is_some();
                    let content_type = p.content_type.unwrap_or_else(|| {
                        if p.value.is_some() { "text/plain".to_string() } else { "application/octet-stream".to_string() }
                    });
                    normalized.push(serde_json::json!({
                        "name": p.name,
                        "value": p.value.unwrap_or_default(),
                        "contentType": content_type,
                        "isFile": is_file,
                        "filePath": p.file_path,
                        "filename": p.filename,
                        "contentBase64": p.content_base64,
                    }));
                }
                Some(serde_json::Value::Array(normalized).to_string())
            }
            _ => None,
        };

        // Extra named inputs (e.g. `input account application/json`) — read in the
        // script as `account`, `lookup`, etc. `content` parts run in any mode;
        // `filePath` parts read the user's disk → Advanced mode only.
        let named_inputs_json = match input.named_inputs.as_deref() {
            Some(s) if !s.trim().is_empty() => {
                let inputs: Vec<McpNamedInput> = match serde_json::from_str(s) {
                    Ok(v) => v,
                    Err(e) => {
                        return Ok(CallToolResult::error(vec![Content::text(format!(
                            "Invalid `named_inputs` JSON: {}. Expected an array of {{name, mimeType, and one of content|filePath}}.",
                            e
                        ))]))
                    }
                };
                let advanced = self.advanced.load(Ordering::Relaxed);
                let mut normalized = Vec::with_capacity(inputs.len());
                for ni in inputs {
                    if ni.file_path.is_some() && !advanced {
                        return Ok(CallToolResult::error(vec![Content::text(format!(
                            "Named input '{}' uses `filePath`, which reads the user's disk and is only allowed in \
                             Advanced mode. In Safe mode, pass the data inline as `content` instead.",
                            ni.name
                        ))]));
                    }
                    normalized.push(serde_json::json!({
                        "name": ni.name,
                        "content": ni.content.unwrap_or_default(),
                        "mimeType": ni.mime_type.unwrap_or_else(|| "application/json".to_string()),
                        "filePath": ni.file_path,
                    }));
                }
                serde_json::Value::Array(normalized).to_string()
            }
            _ => "[]".to_string(),
        };

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
            named_inputs_json, // extra named inputs
            None,              // payload file
            None,              // classpath — never hand an agent a classpath
            None,              // timeout (default)
            multipart_json,    // multipart parts (binary-safe)
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

    #[tool(
        description = "Encrypt or decrypt a MuleSoft secure-properties value, byte-compatible with the Mule runtime (uses the official secure-properties-tool). Use `operation:\"encrypt\"` to turn a plaintext secret into the `![base64]` form you put in a secure config; use `operation:\"decrypt\"` to read one (accepts the inner base64 OR the full `![...]`). Default cipher is AES/CBC. This is pure local crypto — allowed in Safe mode."
    )]
    async fn secure_properties(
        &self,
        Parameters(input): Parameters<SecurePropsInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let op = input.operation.trim().to_lowercase();
        if op != "encrypt" && op != "decrypt" {
            return Ok(CallToolResult::error(vec![Content::text(
                "`operation` must be \"encrypt\" or \"decrypt\".".to_string(),
            )]));
        }
        // Be forgiving: for decrypt, accept the full `![...]` wrapper too.
        let value = if op == "decrypt" {
            let t = input.value.trim();
            if t.starts_with("![") && t.ends_with(']') {
                t[2..t.len() - 1].to_string()
            } else {
                input.value.clone()
            }
        } else {
            input.value.clone()
        };
        let algorithm = input.algorithm.unwrap_or_else(|| "AES".to_string());
        let mode = input.mode.unwrap_or_else(|| "CBC".to_string());
        let use_random_iv = input.use_random_iv.unwrap_or(false);
        self.requests.fetch_add(1, Ordering::Relaxed);
        match crate::secure_properties::secure_properties_invoke(
            self.app.clone(),
            op.clone(),
            algorithm,
            mode,
            input.key,
            value,
            use_random_iv,
        ) {
            // encrypt → wrap in ![...] so the agent can paste it straight into a config.
            Ok(out) => {
                let text = if op == "encrypt" { format!("![{}]", out) } else { out };
                Ok(CallToolResult::success(vec![Content::text(text)]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "secure-properties {} failed (check key / algorithm / mode): {}",
                op, e
            ))])),
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
            "- Advanced mode is ON: scripts have FULL local access — `import java!…` works, and `readUrl` / \
             `dw::io` can read local files (file://) and reach the network. Treat results like code you ran \
             locally."
        } else {
            "- Safe mode (the default) is a PURE-TRANSFORM SANDBOX: `import java!…`, `readUrl`, and `dw::io` \
             are rejected before running — no file or network access. A script sees only the payload/inputs you \
             pass. (`dw::core::Java` is not bundled either.)"
        };
        // Built by concatenation (not format!) — the text contains literal
        // ${key} braces that format! would try to parse as placeholders.
        let mut info = ServerInfo::default();
        // CRITICAL: advertise the `tools` capability. We override get_info (for
        // dynamic instructions), which means we DON'T inherit the tools capability
        // the #[tool_handler] macro would normally set — and ServerInfo::default()
        // has empty capabilities. Spec-compliant clients (Claude Code, Claude
        // Desktop, Cursor) read this during initialize; with no `tools` capability
        // they skip tools/list entirely and the agent sees ZERO tools (only the
        // instructions). curl/loose clients that call tools/list blindly still work,
        // which is why this hid for so long.
        info.capabilities = ServerCapabilities::builder().enable_tools().build();
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
                 3. Present only verified scripts; ideally show the sample input and the output you confirmed.\n\
                 4. RUN ≠ CORRECT — `isError:false` means the script COMPILED and produced output, not that every \
                 input field was captured. DataWeave's plain selectors return only the FIRST match for a repeated \
                 name, so a script can silently drop data with no error. When the input has repeated element/key \
                 names (common in XML/SOAP), compare `payload…*name` (all matches, as an array) against \
                 `payload…name` (first only) and confirm the count is what you expect.\n\n\
                 ## Writing the `script`\n\
                 - A bare body works: `payload map (x) -> x * 2` runs as `%dw 2.0` with `output application/json`.\n\
                 - For any non-JSON output you MUST write the header yourself: `%dw 2.0` / `output application/xml` / `---` / body.\n\
                 - `payload` refers to the input you pass; its format follows `input_mime_type`.\n\n\
                 ## Optional inputs (pass only when the script uses them)\n\
                 - `attributes` (JSON object): inbound HTTP attributes — `attributes.method`, `attributes.headers.*`, \
                 `attributes.queryParams.*`, `attributes.uriParams.*`.\n\
                 - `vars` (JSON object): flow variables, read as `vars.name`.\n\
                 - `named_inputs` (JSON array): extra inputs beyond payload, e.g. `[{\"name\":\"account\",\
                 \"mimeType\":\"application/json\",\"content\":\"{...}\"}]` — read in the script as `account`. \
                 The engine declares `input <name> <mime>` for each.\n\
                 - `config` / `secure_config` (YAML): values for ${key} / ${secure::key} placeholders, \
                 substituted before the run. Encrypted MuleSoft values (`![...]`) ARE decrypted first if a key \
                 is available (set in the panel, or pass `secure_key` + optional `secure_algorithm`/`secure_mode`); \
                 if a `![...]` value appears with no key, the run is rejected (never run with ciphertext).\n\n\
                 ## Limits\n",
                java_line,
                "\n- `payload` is TEXT: json, xml, csv, yaml, x-www-form-urlencoded all work via `input_mime_type`. \
                 For multipart/form-data use the `multipart` param (read parts as `payload.parts.<name>.content`); \
                 pass binary files as `contentBase64` (any mode) — never as raw text in `payload`, which corrupts bytes.",
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
    /// Session-only decryption settings for `![...]` secure values. Lives on the
    /// state (not Running) so it survives start/stop and can be set before start.
    decrypt: Arc<Mutex<DecryptSettings>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub advanced: bool,
    pub uptime_secs: u64,
    pub requests: u64,
    /// Whether a panel decryption key is currently set (never the key itself).
    pub decrypt_key_set: bool,
}

fn stop_inner(state: &McpState) {
    if let Some(r) = state.running.lock().unwrap_or_else(|e| e.into_inner()).take() {
        let _ = r.shutdown.send(());
    }
}

/// rmcp's Streamable-HTTP transport hard-rejects (HTTP 406) any request whose
/// `Accept` header doesn't list BOTH `application/json` and `text/event-stream`.
/// Compliant MCP clients send that, but several real clients send only
/// `application/json` (or nothing) and would fail to connect for no good reason.
/// This middleware normalizes the header before rmcp sees it, so every client
/// connects regardless of how picky its HTTP layer is.
async fn normalize_accept(
    mut req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let ok = req
        .headers()
        .get(axum::http::header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.contains("application/json") && s.contains("text/event-stream"))
        .unwrap_or(false);
    if !ok {
        req.headers_mut().insert(
            axum::http::header::ACCEPT,
            axum::http::HeaderValue::from_static("application/json, text/event-stream"),
        );
    }
    next.run(req).await
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
    let decrypt_for_factory = state.decrypt.clone();

    let service = StreamableHttpService::new(
        move || {
            Ok(DwTools::new(
                app_for_factory.clone(),
                flag_for_factory.clone(),
                req_for_factory.clone(),
                decrypt_for_factory.clone(),
            ))
        },
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig::default(),
    );

    let router = axum::Router::new()
        .nest_service("/mcp", service)
        .layer(axum::middleware::from_fn(normalize_accept));
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

/// Set (or clear) the session-only decryption key + cipher for `![...]` secure
/// values. Pass an empty/None key to clear. Never persisted; never sent over MCP.
#[tauri::command]
pub fn mcp_set_decrypt(
    state: tauri::State<'_, McpState>,
    key: Option<String>,
    algorithm: Option<String>,
    mode: Option<String>,
    use_random_iv: Option<bool>,
) -> Result<(), String> {
    let mut d = state.decrypt.lock().unwrap_or_else(|e| e.into_inner());
    d.key = key.filter(|k| !k.is_empty());
    if let Some(a) = algorithm {
        d.algorithm = a;
    }
    if let Some(m) = mode {
        d.mode = m;
    }
    if let Some(r) = use_random_iv {
        d.use_random_iv = r;
    }
    Ok(())
}

#[tauri::command]
pub fn mcp_status(state: tauri::State<'_, McpState>) -> McpStatus {
    let decrypt_key_set = state
        .decrypt
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .key
        .is_some();
    let g = state.running.lock().unwrap_or_else(|e| e.into_inner());
    match &*g {
        Some(r) => McpStatus {
            running: true,
            port: Some(r.port),
            advanced: r.advanced.load(Ordering::Relaxed),
            uptime_secs: r.started.elapsed().as_secs(),
            requests: r.requests.load(Ordering::Relaxed),
            decrypt_key_set,
        },
        None => McpStatus {
            running: false,
            port: None,
            advanced: false,
            uptime_secs: 0,
            requests: 0,
            decrypt_key_set,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{apply_map, flatten_yaml_to_map, is_encrypted_value, safe_mode_block_reason, substitute_props};

    #[test]
    fn safe_mode_blocks_io_and_java_but_allows_pure_transforms() {
        assert!(safe_mode_block_reason("payload map (x) -> x * 2").is_none());
        assert!(safe_mode_block_reason("read(payload, \"application/json\")").is_none()); // string parse, not I/O
        assert!(safe_mode_block_reason("import java!java::lang::System").is_some());
        assert!(safe_mode_block_reason("readUrl(\"file:///etc/passwd\", \"text/plain\")").is_some());
        assert!(safe_mode_block_reason("import http from dw::io::http::Client").is_some());
    }

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

    #[test]
    fn detects_encrypted_values() {
        assert!(is_encrypted_value("![r45dsfYG2T8x9KQ==]"));
        assert!(is_encrypted_value("  ![abc]  "));
        assert!(!is_encrypted_value("plaintext"));
        assert!(!is_encrypted_value("![]")); // empty inner — not a real secure value
        assert!(!is_encrypted_value("prefix ![x] suffix"));
    }

    #[test]
    fn flatten_then_apply_roundtrip_matches_substitute_props() {
        // The decrypting path builds maps then applies them; result must equal the
        // original substitute_props for plaintext configs.
        let cfg = flatten_yaml_to_map(Some("db:\n  host: localhost"));
        let sec = flatten_yaml_to_map(Some("db:\n  pw: s3cr3t"));
        let script = "{ h: \"${db.host}\", p: \"${secure::db.pw}\" }".to_string();
        let out = apply_map(apply_map(script, &cfg, false), &sec, true);
        assert_eq!(out, "{ h: \"localhost\", p: \"s3cr3t\" }");
    }

    #[test]
    fn encrypted_value_survives_flatten_for_decrypt_detection() {
        // Encrypted values land in the map verbatim so the run path can detect &
        // decrypt them (or reject when no key).
        let m = flatten_yaml_to_map(Some("db:\n  pw: \"![r45dsfYG2T8x9KQ==]\""));
        assert!(is_encrypted_value(m.get("db.pw").unwrap()));
    }
}
