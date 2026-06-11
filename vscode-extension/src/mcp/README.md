# DataWeave Studio — MCP server (scaffold)

A headless [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes the local DataWeave engine to AI agents over **stdio**. It reuses the
exact execution layer as the extension/desktop (`../dwHost.ts` → the same
`dwstudio-server.jar`, same NDJSON), so a script behaves identically.

This is a **framework scaffold** — one functional tool, wired end-to-end. The
fuller interface (more tools, `dw://` reference resources, prompts, polished
descriptions) is the design layer, intentionally left open. See
[`docs/MCP_PLAN.md`](../../../docs/MCP_PLAN.md).

## Files
- `server.ts` — bootstrap: spawns + primes its own JVM (`DwServer.start`), then
  serves MCP over stdio. Bundled by esbuild to `dist/mcp.js`.
- `tools.ts` — the tool surface. Currently: `validate_and_run_dataweave`.

## Run it standalone (for testing in Cursor / Claude Desktop)
```bash
npm run compile          # builds dist/mcp.js (and dist/extension.js)
npm run bundle:resources # optional: copies the bundled JRE + jars locally
node dist/mcp.js         # speaks MCP over stdio
```
Point a client's stdio MCP config at it, e.g.:
```jsonc
{
  "mcpServers": {
    "dataweave-studio": { "command": "node", "args": ["<abs>/vscode-extension/dist/mcp.js"] }
  }
}
```
(In dev without `bundle:resources`, it falls back to system Java + the sibling
`src-tauri/resources` jar.)

## ⚠ Phase 0 — security gate (blocking before any agent use)
The engine runs DataWeave with **Java interop on** (`import java!…`), so a script
can shell out / read files — an RCE surface once an *LLM* runs generated scripts.
Lock down Java interop in `dwstudio-server` (and keep `classpath` out of the tool
input — we already do) before enabling this for agents. Tracked as Phase 0 in
`MCP_PLAN.md`.

## Next step — VS Code auto-registration (not wired yet)
To surface this inside VS Code (Copilot agent mode) with zero user config, register
the server via `vscode.lm.registerMcpServerDefinitionProvider` pointing at
`dist/mcp.js`, plus the `contributes.mcpServerDefinitionProviders` manifest entry.
That API needs VS Code ~1.101 (we target `^1.85.0`), so **feature-detect at
runtime** and only bump the engine floor if required — see `MCP_PLAN.md` §8.3.
Left out of `extension.ts` deliberately so the shipping extension is untouched.
