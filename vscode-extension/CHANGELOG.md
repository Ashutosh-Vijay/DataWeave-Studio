# Changelog

All notable changes to DataWeave Studio for VS Code.

## 1.2.1 — 2026-06-26

**Flow Designer & editor fixes.**

- **Choice routes the way you wrote it.** A query param you leave blank now reads as `null` (not an empty string), so a Choice that branches on whether a param is set takes the right `when`/`otherwise` branch instead of silently falling through.
- **Set Variable runs full DataWeave.** A variable's fx value can now be a complete `%dw 2.0 … ---` script (`output application/java`, `if/else`, and so on), not just a one-liner — no need to reach for a Transform node.
- **Salesforce & Database bind parameters import.** Importing a flow now brings in each connector's `:param` bindings (the `<salesforce:parameters>` / `<db:input-parameters>` block) and exports them back out, so they round-trip instead of being dropped.
- **Editor scrolls to the last line.** Opening the bottom panel no longer hides the end of your script — the editor relays out so you can scroll all the way down.

## 1.2.0 — 2026-06-24

**Read OpenAPI & Swagger specs.**

- **OpenAPI / Swagger reader.** Open or paste an OpenAPI 3.x or Swagger 2.0 spec (JSON or YAML) and browse its operations and reusable types. Pick any request, response, or named example — every scenario, not just the first — and drop a ready-to-edit sample payload plus a DataWeave skeleton straight into your workspace. It resolves `$ref`s, enums, and `allOf`/`oneOf`/`anyOf`, and surfaces auth, servers, webhooks, and callbacks. Open it from the left rail or the Tools menu. Fully offline — nothing leaves your machine.
- **Spec library.** Save the specs you use often and reopen them from the reader’s sidebar in one click; rename or remove them anytime.
- **Editor syntax follows your theme.** With “Match VS Code theme” on, the DataWeave editor’s token colors (keywords, strings, numbers, types, brackets) now map to your theme too — previously only the surfaces and text adopted it.
- **Clearer full-screen tools.** The Java tester and Module library now have a Back button to return to your workspace, so navigation is consistent across every tool.

## 1.1.0 — 2026-06-20

**Right at home in VS Code.**

- **Matches your VS Code theme.** The app now adopts your active editor color theme — surfaces, text, and accent — and follows light/dark automatically, so it stops feeling like a separate window inside VS Code. Prefer the original look? **Settings → Appearance → turn off “Match VS Code theme.”**
- **Editor resizes with the panel.** Opening the bottom panel (Terminal, Output) no longer clips the last lines of your script — the editor relays out to fit.
- **Enter behaves in the editor.** Pressing Enter now inserts a line break instead of accepting whatever suggestion was highlighted (the stray `%dw 2.0` mid-code). Tab still accepts a suggestion.
- **Secure properties with special characters.** Decrypted secrets containing a `$` (and other special characters) now substitute and run correctly instead of throwing a compilation error — both in the editor and via the MCP tools.
- **Send feedback.** A new **Tools → Send feedback** (also in the command palette) composes a pre-filled GitHub issue and opens it in your browser — report a bug or request a feature. The app still sends nothing itself.

## 1.0.1 — 2026-06-17

- Documentation: the full **1.0.0** release notes (below) are now on the Marketplace listing. No functional changes.

## 1.0.0 — 2026-06-17

**Serve your DataWeave engine to AI agents — and reuse your own modules.**

- **MCP Server, built in.** The extension now runs a Model Context Protocol server so agents in **Claude Code, Cursor, and GitHub Copilot** can use your engine: the agent writes a script, runs it against the real DataWeave 2.11 runtime to get the *actual* error, fixes it, and hands you tested code. Six tools — run/validate, secure-properties encrypt & decrypt, 1.0→2.0 migration, the IDE formatter, the 309-function reference, and the cookbook.
- **One-click client setup.** Add the server to Claude Code / Cursor / Claude Desktop straight from the MCP panel — no hand-editing JSON. It runs via VS Code's own Node runtime, so there's nothing extra to install.
- **Safe by default.** Agents can transform data but can't reach Java, the filesystem, or the network unless you explicitly enable advanced mode — and module bodies are scanned too.
- **Live server status.** The MCP panel shows a green pulse when the server is running and red when it's idle, at a glance.
- **Custom module library.** Save reusable `.dwl` modules once and `import x from MyModule` from any script — they're sent to the engine on every run.
- **Logs panel.** Your script's `log()` output now shows under the result, so you can inspect intermediate values mid-transform.
- **Guided feature hints.** The first time you open a tool — cURL import, cookbook, flows, modules — a one-time tip explains what it does.
- **cURL import opens directly** as a dialog, instead of expanding a near-empty side panel.
- **Flow Designer Choice router** now takes a plain DataWeave predicate (with an `fx` affordance) — no hand-written `#[…]` needed.
- **Compare** keeps your pasted text when you switch screens and come back.

## 0.0.6 — 2026-06-13

**Test Java, wire up property config, and a more resilient engine.**

- **New Java tester.** Compile your own `src/main/java` classes (or add a library JAR from disk / fetch one from Maven Central) and call them from DataWeave against a sample payload — see the result, or the compile error inline. Open it from the sidebar rail or the Tools menu.
- **Config & secure properties in the Flow Designer.** The flow's Input panel now takes **Config** and **Secure Config** YAML (plus a decryption key for `![…]` values); `${key}` / `${secure::key}` placeholders resolve on every node run.
- **`p()` just works.** Pasted Mule scripts using `p("key")` / `Mule::p(...)` now run directly — resolved against your config automatically. (The one-click convert to `${...}` is still there, and now quotes the value and drops a dead `import p from Mule`.)
- **Compare tool:** a word-wrap toggle.
- **Output:** the code-folding controls are always visible now.
- **Flow Designer:** `Ctrl/Cmd+S` saves the *flow* (not the single-script workspace); Flow References work inside scopes.
- **More resilient engine:** it self-heals if the Java process dies, instead of getting stuck on "server not running".

## 0.0.5 — 2026-06-11

**Redesigned layout — it now reads the way DataWeave works.**

- **Input → Script → Output flow.** The workspace now lays out left-to-right the way you think about a transform: your **payload and context** (request attributes, variables, config) sit together on the left, the **script** in the middle, the **output** on the right. Previously the transform led and inputs were split around it.
- **New Playground layout** (formerly "Focus"). A clean three-pane view like the online DataWeave playground — and, unlike before, it now has full access to **Settings** and every tool. Switch layouts anytime from the top bar, or with `Ctrl/Cmd+Shift+1` (Workbench) and `Ctrl/Cmd+Shift+2` (Playground).
- **Tools menu + Settings in the top bar.** The function reference, cookbook, flow designer, secure-properties tool, cURL import, snippets, and keyboard-shortcut list are now one click away in either layout.

## 0.0.4 — 2026-06-10

- Fixed **paste** in the script and input editors — `Ctrl+V`, right-click → Paste, and `Shift+Insert` now work everywhere.

## 0.0.3 — 2026-06-10

- Fixed the **Find widget** (`Ctrl+F`): the close button no longer flickers and is reliably clickable.

## 0.0.2 — 2026-06-10

- Polished the Marketplace listing and documentation.

## 0.0.1 — 2026-06-10

- First release. The real **DataWeave 2.11** engine inside VS Code — run, test, and design MuleSoft transforms, fully offline, with a bundled Java runtime. No Anypoint Studio, no Maven project required.
