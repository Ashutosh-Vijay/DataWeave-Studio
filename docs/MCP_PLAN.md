# DataWeave Studio — MCP Server Project Plan

Status: **roadmap / not started** · Target: v2–v3 of the VS Code extension (after the extension is stable)
Last updated: 2026-06-11

## 1. Goal

Expose DataWeave Studio's execution engine to AI coding agents (VS Code Copilot
Agent Mode, Cursor, Claude Desktop) as a **local, offline, stdio MCP server**, so
an agent can write a DataWeave script, **run it locally to validate it, read the
real error, fix it, and only then hand the user a tested script** — collapsing
the copy→paste→error→copy loop to zero.

The whole value prop of this product is *execution* (real DataWeave 2.12 without
Anypoint). MCP's whole purpose is *letting a model execute things*. The fit is the
point.

## 2. Non-goals

- **Not** a rewrite. No Docker, no WASM, no Axum/HTTP server, no "compile Rust to
  musl headless binary." The execution layer is already a stdio JSON service.
- **Not** GUI puppeteering (the "LLM types into our Monaco panel" idea). The MCP
  process can't share memory with the webview; a 3-hop bridge for a demo-only
  payoff. The agent wants code in *its own* `.dwl` file, not our panel.
- **Not** replacing the GUI. The playground still owns exploration/learning; MCP
  owns the agent loop. Additive second consumption mode.
- **Not** opening network ports. stdio transport only.

## 3. Why this is cheap *for this codebase*

The engine is already MCP-shaped:

- `vscode-extension/src/dwHost.ts` already spawns `dwstudio-server.jar`, keeps it
  warm (prime + 60s keepalive), and speaks newline-delimited JSON over stdio.
- `runDataweave(server, args)` already returns
  `{ output, error, execution_time_ms, error_line, error_column }` — a near-perfect
  MCP tool-result shape.
- MCP-over-stdio is *also* JSON-RPC over stdio. The port is: wrap the same
  `runDataweave` call in MCP framing using `@modelcontextprotocol/sdk`, importing
  `DwServer` / `runDataweave` from `dwHost.ts`.

So the MCP server and the webview host share `dwHost.ts` the same way desktop and
webview already share `bridge.ts`. Same spirit as the rest of the project.

## 4. Architecture

```
VS Code / Cursor / Claude Desktop  (MCP client, runs the agent loop)
        │  stdio JSON-RPC (MCP)
        ▼
node dist/mcp.js  (our MCP server — a SEPARATE process from the extension host)
        │  imports
        ▼
dwHost.ts  →  DwServer (its OWN JVM)  →  dwstudio-server.jar
                                          (LOCKED-DOWN: no Java interop)
```

Key facts that shape the design:

- The MCP server is a **separate process** launched by the client. It cannot reuse
  the extension host's warm JVM — it must instantiate its **own** `DwServer` and
  **prime on launch**, or the agent's first `validate_and_run` eats the ~1.7s cold
  start mid-conversation (the same cold-start we already solved for the panel).
- No frontend, no Monaco, no React. Pure execution.
- Two registration paths, **one** server binary:
  1. **VS Code** — auto-registered via `registerMcpServerDefinitionProvider`
     (zero user config; installs with the extension).
  2. **Cursor / Claude Desktop** — user adds a stdio entry pointing at the bundled
     `node .../dist/mcp.js`. Works with the identical binary.

## 5. BLOCKING prerequisite — Java interop lockdown (Phase 0)

**This gates everything. Do not expose `run` to an agent until it's done.**

`dw-server/src/main/scala/com/dwstudio/DwServer.scala` runs scripts with DataWeave's
**Java interop enabled** — line ~149: `// Hot-add any user-provided JARs ... so
'import java!...'`. A script can `import java!java::lang::Runtime` and shell out,
or `java::io::File`-read `~/.ssh`. With a human typing in the GUI that's their own
choice; with an LLM running generated scripts against untrusted payloads on a
corporate laptop it's remote code execution.

Tasks:

1. Determine how to **disable DataWeave Java module resolution** (`java!`) and
   arbitrary class loading in the dwstudio-server runtime — either a runtime
   config/flag on the DW engine, or a restrictive `ClassLoader` that refuses
   `java.lang.Runtime`, `java.lang.ProcessBuilder`, `java.io.*`, `java.nio.file.*`,
   reflection, etc. Likely a new "safe mode" request flag the server honors.
2. The MCP runner **never** sets the `classpath` field (don't let the agent
   hot-add JARs). Strip it from the MCP tool's input schema entirely.
3. Add a test fixture under `dw-server/test-fixtures/` proving `java!` imports and
   `Runtime.exec` are rejected in safe mode (and still work in the GUI's normal
   mode, so we don't regress the desktop app).
4. Decide: is safe-mode the default for the *desktop/webview* GUI too, with an
   explicit opt-in toggle for power users who want Java interop? (Recommended:
   GUI keeps interop, MCP forces safe mode. One flag, two callers.)

Until Phase 0 passes, the only safe-to-ship tools are non-executing ones
(`migrate`, `format`) — but those alone don't deliver the self-correct loop, so
Phase 0 is genuinely the critical path.

## 6. What to expose (MCP primitives)

Start minimal; the self-correct loop is the whole story.

### Tools (v1 — ship just the first)
- **`validate_and_run_dataweave`** — the loop. Inputs: `script`, `payload`,
  `inputMimeType`, optional `outputMimeType`, optional named inputs. Returns the
  `runDataweave` result (output or remapped error+line). **No `classpath` input.**
  Aggressive description: "You MUST call this to execute and validate EVERY script
  before presenting it; if it errors, fix and re-run until success; never output an
  untested script." (A nudge, not a contract — see §8.)

### Tools (v2 — later, reuse existing handlers)
- `migrate_dw_1_to_2` — reuse the migration path the editor already exposes.
- `secure_properties` — encrypt/decrypt, reuse `securePropertiesInvoke`. (Mark
  carefully — this one *does* take secrets; not read-only.)
- `format_dataweave` — pretty-print.

### Resources (v2 — lazy-loaded docs, save context tokens)
- `dw://reference/functions` — the 309-function reference the app already bundles.
- `dw://reference/migration` — DW 1.0→2.0 rules.
  (Requires a system-prompt nudge to actually get fetched — see §8.)

### Prompts (optional, v3)
- `debug-dataweave` — pre-baked "analyze this error log, test fixes locally with
  validate_and_run, return a zero-loss mapping" workflow template.

## 7. Tool annotations & UX details

- Set `annotations: { readOnlyHint: true, idempotentHint: true }` on
  `validate_and_run_dataweave` — **but only honest once Phase 0 lands** (interop off
  ⇒ a pure transform genuinely has no side effects ⇒ clients won't re-prompt for
  permission on every retry). Annotations are hints, never a security boundary.
- `secure_properties` is **not** read-only/idempotent — annotate accordingly.
- Send `notifications/progress` during JVM cold start so the IDE shows
  "Starting DataWeave engine…" instead of hanging silently for ~1.7s.
- Return clear, structured errors so the agent can stop and ask the user instead of
  spiraling on an unresolvable type-coercion error (cap retries at the agent layer;
  make our error text unambiguous about "this is a logic error, not a syntax fix").

## 8. Known limits to design around (the "will bite" list)

1. **No protocol-level "must validate first."** The tool description nudges hard
   and is the intended pattern, but a context-compressed/streaming model can skip
   it. For closer-to-guaranteed behavior, add a **chat-participant / system-prompt
   layer** (VS Code chat participant) — still best-effort. Sell it as "usually
   self-corrects," not "always tested."
2. **Resources aren't fetched proactively** unless prompted. Pair the resource with
   a system-prompt line: "when unsure about a DW function, read
   `dw://reference/functions` before generating code," else the model hallucinates
   from training data.
3. **VS Code version floor.** The MCP provider API
   (`registerMcpServerDefinitionProvider`, `contributes.mcpServerDefinitionProviders`)
   landed ~VS Code 1.101 (mid-2025). The extension currently targets
   `engines.vscode: ^1.85.0`. Options: (a) **feature-detect at runtime**
   (`if (vscode.lm?.registerMcpServerDefinitionProvider) …`) and only bump the
   engine if the *contribution point* requires it; (b) accept the floor bump and
   drop pre-1.101 users. Verify the exact API shape against the installed
   `@types/vscode` after bumping — it's `provideMcpServerDefinitions` (plural,
   returns `McpStdioServerDefinition[]`), not Gemini's singular version.
4. **Cold start returns** (separate process can't share the panel's warm JVM) →
   prime on MCP-server launch.

## 9. Phased delivery

| Phase | Scope | Done when |
|------|-------|-----------|
| **0. Security gate** (critical path) | DW safe-mode: no `java!`/arbitrary class loading; MCP strips `classpath`; fixtures prove it | `Runtime.exec` / `java!` rejected in safe mode; GUI interop unaffected |
| **1. MVP server** | `@modelcontextprotocol/sdk` stdio server (`src/mcp/server.ts` → `dist/mcp.js`) reusing `DwServer`/`runDataweave`; prime on launch; `validate_and_run_dataweave` only (safe mode); progress notifications | A local agent (Claude Desktop / Cursor) runs a script, gets a real error, self-corrects, returns tested code |
| **2. VS Code wiring** | `mcpServerDefinitionProviders` contribution + runtime-feature-detected `registerMcpServerDefinitionProvider`; behind a feature flag so the shipping extension is untouched if disabled | Installing the extension exposes the tool in Copilot Agent Mode with zero user config |
| **3. More surface** | `migrate`, `format`, `secure_properties` tools; `dw://reference/*` resources; annotations; optional `debug-dataweave` prompt | Agent can migrate/format/decrypt and lazily consult function docs |
| **4. Polish & list** | README/PRIVACY updates; publish to an MCP registry (e.g. cursor.directory) for discovery beyond the 20–25 GUI users | Listed; install instructions for VS Code + Cursor + Claude Desktop |

## 10. File touchpoints

- **New:** `vscode-extension/src/mcp/server.ts` (MCP entry; imports `dwHost.ts`),
  `vscode-extension/src/mcp/tools.ts` (tool/resource/prompt defs).
- **New dep:** `@modelcontextprotocol/sdk` in `vscode-extension/package.json`.
- **Edit:** `vscode-extension/esbuild.js` — add a second bundle entry (`dist/mcp.js`,
  cjs/node).
- **Edit:** `vscode-extension/package.json` — `contributes.mcpServerDefinitionProviders`;
  engine floor decision (§8.3).
- **Edit:** `vscode-extension/src/extension.ts` — runtime-feature-detected provider
  registration pointing at `dist/mcp.js` with the bundled JRE in env.
- **Edit:** `dw-server/src/main/scala/com/dwstudio/DwServer.scala` — safe-mode flag
  (Phase 0); `dwHost.ts` `DwRequest` to pass it; `dw_runner.rs` parity if the GUI
  ever needs the toggle.
- **Edit:** `dw-server/test-fixtures/` + `dw-server/TEST-PLAN.md` — interop-lockdown
  fixtures.

## 11. Decisions needed before starting

1. **Engine floor:** feature-detect and keep `^1.85.0`, or bump to `^1.101` and drop
   old VS Code? (Recommend: feature-detect; bump only if the contribution point
   forces it.)
2. **Safe mode default for the GUI:** keep Java interop on in desktop/webview (opt-in
   power feature) while MCP forces it off? (Recommend: yes.)
3. **Scope of v1 tools:** just `validate_and_run`, or include `migrate`/`format` day
   one? (Recommend: `validate_and_run` only — prove the loop first.)
4. **Standalone distribution:** also document the Cursor/Claude Desktop stdio config,
   or VS Code-only at first? (Recommend: VS Code first, document standalone in
   Phase 4.)

## 12. Effort (solo, realistic)

- Phase 0: the real unknown — **a few evenings** depending on how the DW runtime
  exposes interop control. Could be a one-line config or a custom classloader.
- Phases 1–2: **a weekend** once Phase 0 is solved (the engine reuse is trivial).
- Phases 3–4: incremental, **as motivated**.

Verdict: genuinely worth doing *because* the engine is already a stdio service —
but it's additive and post-stability. Phase 0 is non-negotiable; everything else is
gravy.
