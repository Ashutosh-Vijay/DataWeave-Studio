/**
 * DataWeave Studio — MCP server (stdio).
 *
 * A headless Model Context Protocol server that exposes the local DataWeave
 * engine to AI agents (Cursor, Claude Desktop, VS Code Copilot agent mode).
 * Reuses the SAME execution layer as the extension/desktop — dwHost spawns the
 * same dwstudio-server.jar and speaks the same NDJSON — so a script behaves
 * identically here. See docs/MCP_PLAN.md.
 *
 * Runs as a separate process from the extension host, so it owns its OWN JVM and
 * primes it on launch (DwServer.start) — otherwise the agent's first tool call
 * would eat the ~1.7s cold start mid-conversation.
 *
 * Transport is stdio: the MCP JSON-RPC stream is on process.stdout, so NOTHING
 * else here may write to stdout (logging goes to stderr via console.error).
 *
 * Run standalone:  node dist/mcp.js   (point a client's stdio config at it)
 * VS Code wiring (registerMcpServerDefinitionProvider) is a documented next
 * step — see src/mcp/README.md. ⚠ Do not enable for agents until MCP_PLAN
 * Phase 0 (Java-interop lockdown) is done — see tools.ts.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as path from 'path';
import { DwServer, resolveJava, resolveServerJar } from '../dwHost';
import { registerTools } from './tools';

async function main(): Promise<void> {
  // dist/mcp.js → extension root is one level up.
  const extensionRoot = path.join(__dirname, '..');

  const dw = new DwServer(resolveJava(extensionRoot), resolveServerJar(extensionRoot));
  await dw.start(); // spawn + prime, so the first tool call is warm

  const mcp = new McpServer({ name: 'dataweave-studio', version: '0.0.5' });
  registerTools(mcp, dw);

  await mcp.connect(new StdioServerTransport());
  console.error('[dataweave-mcp] ready');
}

main().catch((e) => {
  console.error('[dataweave-mcp] fatal:', e);
  process.exit(1);
});
