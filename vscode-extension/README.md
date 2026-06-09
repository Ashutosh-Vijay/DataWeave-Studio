# DataWeave Studio — VS Code extension

Brings the DataWeave Studio playground into VS Code by hosting the **same React
UI** as the desktop (Tauri) app inside a webview panel. The desktop's Rust
backend (`src-tauri/`) is reimplemented in Node here, in the extension host.

## How it shares code with the desktop app

- `../src/` is the shared React UI — used verbatim by both runtimes.
- `../src/bridge.ts` routes every `invoke('cmd', args)` call to the right
  backend:
  - **Desktop:** Tauri `invoke()` → Rust commands in `../src-tauri/`.
  - **VS Code:** `postMessage` → this extension host, over the wire protocol:
    - webview → host: `{ kind: 'invoke', id, cmd, args }`
    - host → webview: `{ kind: 'invoke:result', id, ok, value?, error? }`
- `src/dwHost.ts` is the Node port of `dw_server.rs` + `dw_runner.rs`: it spawns
  the `dwstudio-server.jar` once, keeps it warm, and speaks newline-delimited
  JSON over stdin/stdout — identical protocol to the desktop app.

## Java

Prefers a **bundled JRE** (`resources/jre/`), falling back to system Java
(`JAVA_HOME` → `PATH`) only in dev before a JRE is bundled. Bundled-first is
deliberate: the audience (banks / MuleSoft shops) is often locked to Java 8 for
Anypoint Studio, but DataWeave 2.11 needs Java 11+. The bundled Java 17 is
invoked by absolute path — it never touches `JAVA_HOME`/`PATH`, so it can't
disturb other tooling, and it works offline (air-gapped networks). If neither is
found, a clear "Download Java" notification points at Adoptium.

## Packaging the .vsix (self-contained, per-platform)

The JRE is platform-specific, so build/publish once per target OS:

```bash
# 0. Build the desktop app first so a jlinked JRE exists at
#    src-tauri/resources/jre/ for THIS platform.

# 1. Build the webview UI (repo root)
npm run build:vscode

# 2. In vscode-extension/: compile + assemble resources (JRE + jars)
cd vscode-extension
npm run compile
npm run bundle:resources        # copies jre/ + both jars into resources/

# 3. Package for the current platform target
npx @vscode/vsce package --target win32-x64    # or darwin-arm64, linux-x64, ...
```

The Marketplace serves the matching platform build automatically. `resources/`
and `webview-dist/` are gitignored (assembled at package time).

## Run it (dev)

```bash
# 1. Build the shared React UI for the webview (from the repo root):
npm install
npm run build:vscode        # outputs vscode-extension/webview-dist/

# 2. Build the extension host:
cd vscode-extension
npm install
npm run compile             # or: npm run watch
```

Then press **F5** in VS Code (launches the Extension Development Host), and run
the command **“DataWeave Studio: Open Playground”** from the Command Palette.

During development the jars are found in the sibling desktop repo
(`../src-tauri/resources/dw-server/dwstudio-server.jar` and
`../src-tauri/resources/secure-properties/secure-properties-tool.jar`). When
packaged, bundle them under the extension's own `resources/`.

### How the UI loads
`npm run build:vscode` uses `vite.config.vscode.ts`, which (a) sets `base: "./"`
so assets use relative URLs, and (b) aliases the Tauri-only plugins to webview
shims in `src/shims/`. The host loads the built `index.html`, injects a
`<base href>` at the webview resource root + a strict CSP, and overlays the boot
loader. Monaco's workers load from the webview origin via the base href; the CSP
allows `worker-src`/`script-src` from `webview.cspSource`.

## Status

**Real UI + full backend ported.** The webview now loads the actual React app
(`webview-dist/`), and the extension host reimplements the whole Tauri command
surface in Node:

- `run_dataweave`, `warm_dataweave_script`, `cancel_dataweave`, `restart_engine`,
  `is_warmed_up`, `get_warmup_status`
- `save_workspace`, `load_workspace`, `list_workspaces`, `list_workspaces_meta`,
  `delete_workspace`, `get_workspaces_dir` (stored under the extension's global
  storage; v1 files migrated on load)
- `read_text_file`, `save_output_file`, `save_binary_file`, `get_log_dir`,
  `get_app_version`
- `secure_properties_invoke` (spawns MuleSoft's secure-properties-tool.jar)
- VS Code dialog/opener bridges: `vscode_open_dialog`, `vscode_save_dialog`,
  `vscode_open_path`, `vscode_open_external`

Tauri-only plugins are swapped at build time via `src/shims/` (dialog → VS Code
dialogs, opener → `vscode.env.openExternal`, updater/process → no-ops since the
Marketplace handles updates). Window controls render nothing in the webview (a
tab has no min/max/close).

The host spawns the JVM and **primes** it (3 warm-up evals) on panel open, so
the JVM/JIT cold-start (~2s) is paid once, up front — every Run after that is
~10–20ms. A 60s keepalive holds the engine warm. The boot loader hides once the
engine reports warm.

## Privacy

DataWeave Studio runs **entirely on your machine**:

- **No telemetry, no analytics, no accounts.** Nothing is collected or sent.
- **No network calls.** Transforms run against a local Java process (the bundled
  DataWeave runtime). Updates are handled by the VS Code Marketplace, not the
  extension.
- **Your data stays local.** Scripts, payloads, and workspaces live only on disk
  (workspaces in the extension's storage folder); files are read/written only
  when you pick them via a dialog. Encryption keys for Secure Properties are held
  in memory and never written to disk.
- **Java** is the bundled JRE, invoked by absolute path — it never reads or
  modifies your `JAVA_HOME`/`PATH` or any system Java setup.

See [PRIVACY.md](PRIVACY.md) for the full statement.
