# DataWeave Studio

A local desktop app for MuleSoft developers to test DataWeave scripts without Anypoint Studio, browser limitations, or complex project setups.

Built with Tauri v2 (Rust) + React + TypeScript + Monaco Editor.

## Features

- **DataWeave script editor** with syntax highlighting, autocomplete, and error line highlighting
- **Context-aware autocomplete** — suggests actual field names from your payload, vars, attributes, and config properties
- **Full context panel** — set `attributes.method`, `headers`, `queryParams`, and `vars` from the UI
- **Config properties (YAML)** — define `${key}` and `${secure::key}` properties in YAML format, just like MuleSoft's config.yaml / secure-config.yaml
- **Secure property decryption** — decrypt `![encrypted]` values from production secure-config.yaml using AES-CBC (provide your encryption key at runtime — never saved to disk)
- **Offline Secure Properties Tool** — encrypt and decrypt values locally, just like MuleSoft's online tool but without sending your secrets to any server
- **Salesforce Query mode** — SOQL editor with `:paramName` parameter binding (literal replace, you control quoting)
- **DB Query mode** — SQL editor with `:paramName` parameters (simulated JDBC prepared statements, auto-quoting)
- **Named inputs** — add extra input streams as tabs alongside payload, accessible by name in DW scripts
- **cURL importer** — paste a cURL command to auto-fill payload, headers, and generate a DW transform
- **Auto-run** — toggle live preview with 1.5s debounce
- **Workspace management** — save/load `.dwstudio` files with full editor state
- **No payload size limit** — handles large Base64, nested JSON, XML, CSV locally (inputs written to temp files, not passed as CLI args)
- **Splash screen** with animated progress while the DW CLI warms up
- **First-launch guided tour** explaining each panel and feature
- **About dialog** with author info and project credits

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Run the current script |
| `Ctrl+S` | Save the current workspace |
| `Escape` | Close dialogs (About, cURL importer, tour) |
| Arrow keys | Navigate the welcome tour |

## Requirements

- Windows 10+ / macOS / Linux
- DataWeave CLI v1.0.36+

## Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Download the DataWeave CLI (not included in git — 144MB)
#    Get it from: https://github.com/mulesoft/data-weave-cli/releases
#    Extract platform binaries into:
#      src-tauri/resources/dw-cli/windows/   (dw.exe + libs/)
#      src-tauri/resources/dw-cli/macos/     (dw + libs/)
#      src-tauri/resources/dw-cli/linux/     (dw + libs/)

# 3. Run in development mode
npx tauri dev

# 4. Build for production
npx tauri build
```

## Project Structure

```
src/                    # React frontend
  components/           # UI components (ScriptEditor, PayloadTabs, OutputPane, etc.)
  hooks/                # useDWRunner, useWorkspace
  types/                # TypeScript types
  dataweaveGrammar.ts   # Monarch tokenizer for DW syntax highlighting
  dataweaveCompletions.ts  # Autocomplete provider with context-aware suggestions
  dataweaveTheme.ts     # Custom Monaco theme (vs-dark + config property colors)
src-tauri/              # Rust backend
  src/dw_runner.rs      # DW CLI execution engine (temp-file based, no arg length limits)
  src/workspace.rs      # Workspace save/load
  resources/dw-cli/     # Bundled DataWeave CLI binary
licenses/               # Third-party licenses
```

## Known Limitations

- The DW CLI warmup takes a few seconds on first launch (the splash screen covers this)
- Undo/redo is handled by Monaco Editor per-session; it does not persist across workspace reloads
- Config property autocomplete triggers on `$` — type `${` to see suggestions

## Third-Party Licenses

This application bundles the [DataWeave CLI](https://github.com/mulesoft/data-weave-cli) by MuleSoft/Salesforce, licensed under the BSD 3-Clause License. See [licenses/DATAWEAVE-CLI-LICENSE.txt](licenses/DATAWEAVE-CLI-LICENSE.txt).

DataWeave Studio is not affiliated with, endorsed by, or sponsored by MuleSoft or Salesforce.
