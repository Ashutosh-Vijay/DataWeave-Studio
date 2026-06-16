/**
 * DataWeave Studio — MCP server (stdio).
 *
 * A headless Model Context Protocol server that exposes the local DataWeave
 * engine to AI agents (VS Code Copilot agent mode, Cursor, Claude Desktop).
 * Reuses the SAME execution layer as the extension/desktop — dwHost spawns the
 * same dwstudio-server.jar and speaks the same NDJSON — so a script behaves
 * identically here. At parity with the desktop's rmcp server: six tools, the
 * Safe-mode RCE gate, and ![…] decryption (see tools.ts).
 *
 * Runs as a separate process from the extension host, so it owns its OWN JVM and
 * primes it on launch (DwServer.start) — otherwise the agent's first tool call
 * would eat the ~1.7s cold start mid-conversation.
 *
 * Transport is stdio: the MCP JSON-RPC stream is on process.stdout, so NOTHING
 * else here may write to stdout (logging goes to stderr via console.error).
 *
 * Wiring: VS Code discovers this via registerMcpServerDefinitionProvider (see
 * extension.ts). Standalone: `node dist/mcp.js`.
 *
 * SECURITY: Safe mode is the default (pure-transform sandbox). Set the env var
 * DWSTUDIO_MCP_ADVANCED=1 to lift the gate for FULL local access (java! / file /
 * network) — only when you trust every script the agent will run.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as path from 'path';
import * as fs from 'fs';
import { DwServer, resolveJava, resolveServerJar } from '../dwHost';
import { registerTools } from './tools';

/** Liveness heartbeat: while this process is up, refresh a file the extension
 *  watches so the in-app MCP panel can show a truthful running/stopped state
 *  (VS Code spawns us on demand, so the panel can't otherwise know). Path comes
 *  from the extension via DWSTUDIO_HEARTBEAT; no-op when unset (standalone run). */
function startHeartbeat(): void {
  const file = process.env.DWSTUDIO_HEARTBEAT;
  if (!file) return;
  const touch = () => { try { fs.writeFileSync(file, JSON.stringify({ pid: process.pid, ts: Date.now() })); } catch { /* ignore */ } };
  touch();
  // Refresh often so the panel's "Idle" transition is snappy when the process
  // dies (on Windows the SIGTERM cleanup below won't run — staleness is the
  // real signal; the extension treats a >12s-old file as stopped).
  const timer = setInterval(touch, 5000);
  timer.unref();
  const cleanup = () => { try { fs.unlinkSync(file); } catch { /* ignore */ } process.exit(0); };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}

const ADVANCED = process.env.DWSTUDIO_MCP_ADVANCED === '1' || process.env.DWSTUDIO_MCP_ADVANCED === 'true';

const SAFE_LINE =
  '- Safe mode (the default) is a PURE-TRANSFORM SANDBOX: `import java!…`, `readUrl`, and `dw::io` are rejected ' +
  'before running — no file or network access. A script sees only the payload/inputs you pass.';
const ADVANCED_LINE =
  '- Advanced mode is ON: scripts have FULL local access — `import java!…` works, and `readUrl` / `dw::io` can read ' +
  'local files (file://) and reach the network. Treat results like code you ran locally.';

const INSTRUCTIONS = [
  '# DataWeave Studio — local DataWeave 2.0 engine\n',
  "You can run REAL DataWeave 2.0 against a payload on the user's machine via `validate_and_run_dataweave`. ",
  'This is the genuine DataWeave 2.11 runtime, so its output and errors are authoritative.\n\n',
  '## Rules (always follow)\n',
  '1. VALIDATE BEFORE PRESENTING — never show the user a DataWeave script you have not run successfully with ',
  "`validate_and_run_dataweave`. Don't reason about whether it compiles; run it.\n",
  '2. FIX-AND-RETRY — on error, read the line/column + message, correct the script, and call the tool again until ',
  "it succeeds. Do NOT web-search DataWeave syntax — the tool's error is the ground truth.\n",
  '3. Present only verified scripts; ideally show the sample input and the confirmed output.\n',
  '4. RUN ≠ CORRECT — success means it COMPILED and produced output, not that every field was captured. ',
  'DataWeave plain selectors return only the FIRST match for a repeated name, so a script can silently drop data. ',
  'For repeated element/key names (common in XML/SOAP), compare `payload…*name` (all) against `payload…name` (first).\n\n',
  '## Other tools\n',
  '- `dw_function_reference` (309 stdlib fns) and `dw_cookbook` (83 verified recipes) — consult these instead of ',
  'recalling syntax. `format_dataweave` pretty-prints. `migrate_dw_1_to_2` ports DW 1.0 → 2.0 (then validate it). ',
  '`secure_properties` encrypts/decrypts MuleSoft `![…]` values.\n\n',
  '## Optional run inputs (pass only when used)\n',
  '- `attributes`/`vars` (JSON objects), `named_inputs` (JSON array), `config`/`secure_config` (YAML for ${key} / ',
  '${secure::key}; encrypted `![…]` decrypt if a key is available), `modules` (custom `.dwl` for `import x from M`), ',
  '`multipart` (form-data; binary via `contentBase64`).\n\n',
  '## Limits\n',
  ADVANCED ? ADVANCED_LINE : SAFE_LINE,
  '\n- `payload` is TEXT (json/xml/csv/yaml/x-www-form-urlencoded via input_mime_type). For binary multipart, pass ',
  'bytes as `contentBase64` — never as raw text in `payload`, which corrupts bytes.',
].join('');

async function main(): Promise<void> {
  // dist/mcp.js → extension root is one level up.
  const extensionRoot = path.join(__dirname, '..');

  const dw = new DwServer(resolveJava(extensionRoot), resolveServerJar(extensionRoot));
  await dw.start(); // spawn + prime, so the first tool call is warm
  startHeartbeat(); // signal "running" to the in-app MCP panel

  const mcp = new McpServer(
    { name: 'dataweave-studio', version: '0.0.6' },
    { instructions: INSTRUCTIONS },
  );
  registerTools(mcp, dw, extensionRoot, ADVANCED);

  await mcp.connect(new StdioServerTransport());
  console.error(`[dataweave-mcp] ready (${ADVANCED ? 'ADVANCED' : 'safe'} mode)`);
}

main().catch((e) => {
  console.error('[dataweave-mcp] fatal:', e);
  process.exit(1);
});
