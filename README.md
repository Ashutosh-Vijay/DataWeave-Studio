# DataWeave Studio

A desktop IDE for DataWeave 2.0 — run, test, and debug transforms locally without Anypoint Studio.

> **Anypoint Studio is 2 GB. The online playground can't go offline. The VS Code extension needs Java + Maven. DataWeave Studio bundles everything in one ~90 MB installer.**

Built with Tauri v2 (Rust) + React + TypeScript + Monaco Editor. Ships with a bundled JRE 17 and the DataWeave runtime — no Java install required.

**[Download](https://ashutosh-vijay.dev/dataweave/)** | **[Landing Page](https://ashutosh-vijay.dev/dataweave/)** | **[Releases](https://github.com/Ashutosh-Vijay/DataWeave-Studio/releases)**

---

## Preview

![Welcome screen — start transforming](docs/screenshots/idle_page_start_transforming_dark_mode.png)
*Welcome screen — blank transform, open workspace, import cURL, snippets, message flow — all one click away*

![Script editor with 309-function autocomplete](docs/screenshots/auto_suggestion_on_typing_monaco_dark_mode.png)
*Monaco editor with DataWeave syntax highlighting, 309-function autocomplete with signature hints, and live output*

![Message Flow Designer — visual drag-and-drop canvas](docs/screenshots/message_flow_dark_mode.png)
*Message Flow Designer — chain Set Payload, Transform, HTTP, Salesforce, and Database connectors with step-through debugging*

![Message Flow Designer — Paper light theme](docs/screenshots/message_flow_paper_theme.png)
*Flow Designer in Paper (light) theme with Salesforce connector config*

![Function Reference Browser](docs/screenshots/dataweave_function_reference_dark_mode.png)
*Built-in function reference — searchable catalog of all 309 DataWeave functions with signatures and descriptions*

![cURL importer](docs/screenshots/import_curl_dark_mode.png)
*cURL importer — paste any cURL command, auto-fills payload and headers, generates a matching DW transform*

![Snippets sidebar](docs/screenshots/snippets_dark_mode.png)
*Snippets — reusable DW templates for common patterns like map, filter, group-by, reduce*

![Secure Properties Tool](docs/screenshots/secure_tool_encryption_dark_mode.png)
*Offline Secure Properties Tool — encrypt/decrypt values locally using AES-CBC, nothing sent to any server*

![Focus mode — Paper theme](docs/screenshots/focus_mode_paper_theme.png)
*Focus layout in Paper (light) theme — editor-first with right-side output drawer*

![Settings — appearance customization](docs/screenshots/settings_dark_mode.png)
*Settings — Dusk/Paper themes, 5 accent colors, Workbench and Focus layouts*

---

## Why This Exists

DataWeave testing today is painful:

- **Anypoint Studio** is 2 GB, Eclipse-based, and takes minutes to start. Testing a single DataWeave script requires deploying an entire Mule app locally.
- **The online Playground** runs in the browser (WASM) — no offline mode, no binary format support (Excel, Avro, Protobuf), payload size limited by browser memory, no version switching, no dark/light theme toggle, and no direct URL sharing of scripts.
- **The VS Code Extension** requires Java 8+ and Maven 3.6+ installed, a full Maven project structure (`pom.xml`, `src/main/dw/`, `src/test/dw/`), and manual scenario resource files for every input. Still in BETA after years.

DataWeave Studio fixes all of it — one window, everything from a UI, no file management, no setup beyond running the installer.

---

## What Sets It Apart

### Things no other DataWeave tool does:

**1. Visual Message Flow Designer**
Drag-and-drop flow canvas inspired by Anypoint Studio. Chain Set Payload, Transform, Set Variable, HTTP Request, Salesforce, Database, and Logger connectors into a pipeline. Run all at once or step through one node at a time — inspect payload, variables, and attributes at each stage.

**2. cURL Importer**
Paste any `curl` command from Postman, browser devtools, or manual copy. Method, headers, query params, and body auto-fill. Generates a matching DataWeave 2.0 script scaffold — JSON, XML, CSV, form-urlencoded, and multipart all handled. Live preview before import.

**3. Secure Properties — Fully Offline**
Paste your actual `secure-config.yaml` (with `![Base64Encrypted...]` values), provide your encryption key at runtime. Scripts run with real decrypted values. Key is never saved to disk. Also includes a standalone encrypt/decrypt tool (AES, Blowfish, DES, DESede, RC2) compatible with MuleSoft's `secure-properties-tool.jar`.

**4. SOQL & SQL Query Modes**
Write a SOQL or SQL template with `:paramName` placeholders, run a DW script to produce a params object, see the final substituted query. JDBC-style auto-quoting for SQL. No other DataWeave tool has this.

**5. Multi-Request Workspaces**
Postman-style collections — group multiple transforms inside a single `.dwstudio` workspace. Each request has its own script, payload, context, named inputs, tests, and query template. Switch between them instantly.

**6. DW 1.0 to 2.0 Migration**
Rewrites legacy scripts in-place. Converts directives, `flowVars`, `inboundProperties`, and type syntax automatically. Diff overlay shows old vs. new with one-click replacement.

**7. Bundled Runtime — Zero Config**
Ships JRE 17 and the DataWeave runtime inside the app. No Java install, no `JAVA_HOME`, no Maven, no `PATH` changes. Download, install, run.

---

## vs. The Alternatives

| Feature | DataWeave Studio | VS Code Extension | Online Playground | Anypoint Studio |
|---|---|---|---|---|
| **Setup** | Download + run | Java + Maven + project scaffold | Open browser | 2 GB download |
| **Startup time** | ~1-2s (first), instant after | Depends on project indexing | Instant | Minutes |
| **Offline** | Yes | Yes | No | Yes |
| **Java required** | No (bundled JRE 17) | Yes (Java 8+ & Maven 3.6+) | No | Yes (bundled) |
| **Visual flow designer** | Yes — drag-and-drop | No | No | Yes |
| **cURL import** | Yes | No | No | No |
| **Breakpoint debugging** | Flow-level step-through | Yes (full VS Code debugger) | No | Yes |
| **Go to Definition / Rename** | No | Yes (LSP) | No | Yes |
| **Type inference** | No | Yes (LSP) | No | Yes |
| **Autocomplete** | 309 functions + signatures | LSP, type-aware | Basic suggestions | Full LSP |
| **Context (vars, attrs, headers)** | UI — no files | Manual JSON scenario files | Partial | Full runtime |
| **Config YAML (`${key}`)** | Yes | No | No | Yes (full runtime) |
| **Secure config (`![encrypted]`)** | Yes — offline | No | No | Yes (full runtime) |
| **SOQL/SQL query rendering** | Yes | No | No | Yes (full runtime) |
| **Testing** | Snapshot tests + visual diff | Unit tests (`dw::test`) | No | MUnit |
| **Multi-request workspaces** | Yes (Postman-style) | One mapping per file | No | Per-flow |
| **Multipart form-data** | Visual builder | No | No | Yes (full runtime) |
| **DW 1.0 → 2.0 migration** | Yes | No | No | Yes |
| **Binary formats (xlsx, avro)** | Yes (file picker) | Yes (via Maven deps) | No | Yes |
| **Publish to Exchange** | No | Yes | No | Yes |
| **Dependency management** | Custom classpath | Maven (pom.xml) | No | Maven |
| **Interactive tutorials** | Guided tour | No | Yes (step-by-step) | No |
| **Themes** | Dusk + Paper + 5 accents | VS Code themes | Fixed dark | Dark only |
| **Footprint** | ~90 MB | VS Code + Java + Maven | N/A (browser) | 2 GB+ |
| **Live preview** | Auto-run (toggle) | AutoPreview (opt-in) | Always on | No |
| **Execution time display** | Yes (ms) | No | No | No |
| **Cancel running script** | Yes | No | No | No |
| **Configurable timeout** | Yes | No | No | No |

**In short:** Studio sits between the Playground and the VS Code extension. More powerful than the Playground (offline, testing, binary formats, real config). More convenient than the VS Code extension (no Java/Maven, no project scaffolding, everything in one window). Unique features like cURL import, Flow Designer, query modes, and secure properties that neither has.

---

## Features

### Script Editor (Monaco)
- DataWeave 2.0 syntax highlighting with custom Monarch tokenizer
- **309-function autocomplete** with signature hints and module grouping
- Context-aware suggestions from payload fields, variables, attributes, and config properties
- Error highlighting with line markers and gutter glyphs — auto-scrolls to the failing line
- Code formatting (Alt+Shift+F)
- Bracket pair colorization
- Auto-closing brackets/quotes, smart indentation
- Configurable font family, font size, line height, tab size, word wrap
- Minimap toggle

### Payload & Input Management
- **14+ MIME types** — JSON, XML, CSV, YAML, NDJSON, plain text, form-urlencoded, DataWeave, Java properties, Excel, Avro, Protocol Buffers, Flat File (COBOL copybooks), binary
- Load file into payload via native file picker
- **Named inputs** — add extra input streams as tabs (e.g., `lookup`, `config`, `schema`), each with its own editor and MIME type
- **Multipart form-data builder** — add/remove parts visually with name, content-type, and text or file value; real MIME boundaries constructed in Rust
- Binary payload support (`application/octet-stream`) with no size limit

### HTTP Context Panel
- HTTP method selector (GET, POST, PUT, DELETE, PATCH) — exposed as `attributes.method`
- Query parameters editor with key/value pairs and enable/disable toggles
- Headers editor with key/value pairs and enable/disable toggles
- Variables panel with type picker (string or JSON) and per-row enable/disable

### Configuration
- **Config YAML** — paste `application.yaml` style config, resolve `${key}` placeholders in script and payload
- **Secure Config YAML** — supports `![Base64Value]` encrypted notation, resolve `${secure::key}` placeholders
- Nested dot-notation keys (e.g., `${salesforce.username}`)
- Encryption settings per workspace: algorithm, mode, random IV toggle

### Secure Properties Tool
- Standalone encrypt/decrypt dialog (Cmd/Ctrl+Shift+E)
- **5 algorithms**: AES, Blowfish, DES, DESede, RC2
- **4 modes**: CBC, CFB, ECB, OFB
- Random IV toggle for AES
- One-click copy of result
- Fully offline — compatible with MuleSoft's `secure-properties-tool.jar`

### Message Flow Designer
- Visual drag-and-drop canvas for pipelining connectors
- **7 node types**: Set Payload, Transform, Set Variable, HTTP Request, Salesforce, Database, Logger
- Run all nodes at once or **step through individually** — inspect payload, variables, and attributes at each stage
- Variables carry through the pipeline (Set Variable stores into `vars`)
- Per-node Monaco editors with syntax highlighting and autocomplete
- Disable/enable nodes without deleting
- Canvas zoom (Ctrl+scroll or +/- buttons)
- Saved with workspace

### Query Modes
- **Salesforce Query (SOQL)** — write SOQL with `:paramName` template syntax, bind parameters from DW script output, see the final rendered query
- **DB Query (SQL)** — SQL with `:paramName` parameters and JDBC-style auto-quoting (strings quoted, numbers bare, `null` → `NULL`)
- Per-label script caching — switching between Transform / SOQL / SQL restores the previous script for that mode

### Testing
- **Per-request test collections** with status badges (pass / fail / untested)
- Add tests with independent payloads per test
- **Expected output capture** — run once, snapshot the output
- **Two comparators**: exact (byte-for-byte) or semantic JSON (parse + deep compare)
- **Visual diff on failure** — see exactly what changed
- Execution time tracking per test
- Filter by: all / failing / untested

### cURL Importer
- Paste any `curl` command (from Postman, browser devtools, or manual)
- Auto-extracts method, headers, query params, body
- Format detection: JSON, XML, CSV, form-urlencoded, multipart
- Generates matching DataWeave 2.0 script scaffold
- Multipart `-F` flag handling — parses part names, types, file paths
- Live preview before import

### Workspace Management
- **`.dwstudio` format** (v2) — JSON files with full project state
- **Multi-request collections** — multiple transforms per workspace (Postman-style)
- Per-request state: script, payload, context, named inputs, query template, classpath, timeout, tests
- Save / load / duplicate / delete workspaces
- Pin frequently used workspaces in the sidebar
- Resume last workspace on launch
- **Draft auto-save** to localStorage on every keystroke (debounced 500ms)

### Snippets Library
12 built-in templates: hello world, map array, filter array, sort, group by, reduce/sum, pluck (object → entries), conditional output, read named input, format date, JSON → XML, variable + function. Click to insert at cursor.

### Function Reference Browser
Searchable catalog of all 309 DataWeave functions with signatures, descriptions, and module grouping. Click to insert function name at cursor. Lazy-loaded for performance.

### DW 1.0 → 2.0 Migration
Rewrites legacy scripts in-place. Converts `%dw 1.0` directives, `flowVars`, `inboundProperties`, and type syntax. Diff overlay shows changes side-by-side with one-click replacement.

### Execution Engine
- **Long-lived Java server** — not CLI subprocess per run. ~10-50ms per execution after warm-up.
- 64-entry LRU compile cache — repeated scripts skip recompilation
- Background JVM warm-up on startup (hidden behind splash screen)
- Configurable per-run timeout (default 30s, 0 = unlimited)
- Cancel running scripts (kill by PID)
- Execution time display in milliseconds
- Custom classpath — add JARs and directories for `import java!` resolution

### Output
- Monaco editor with syntax highlighting
- Format toggle: JSON (pretty-printed) / XML / Raw text
- Error display with DW error codes, headline, details, and collapsible stack trace
- Mapped error line numbers (de-offset from auto-generated header lines)
- Copy to clipboard
- Export to file (native save dialog)

### Appearance & Layout
- **Dusk** (dark) and **Paper** (light) themes with custom DataWeave syntax highlighting
- **5 accent colors**: Emerald, Sky, Violet, Amber, Rose
- **Workbench layout** — 3-column: icon rail + sidebar + main editor area with resizable panes
- **Focus layout** — editor-first with toggleable right drawer for context
- Responsive compact mode at ≤720px viewport width
- Custom title bar with window controls
- Configurable editor font, size, line height, tab size, word wrap, bracket guides

### Command Palette & Shortcuts
Quick access to all actions via **Cmd/Ctrl+K**. Grouped commands: Run, Workspace, Editor, View, Output, Node Label, Tools.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Enter` / `Cmd+Enter` | Run script |
| `Ctrl+S` / `Cmd+S` | Save workspace |
| `Ctrl+K` / `Cmd+K` | Command palette |
| `Ctrl+N` / `Cmd+N` | New workspace |
| `Ctrl+O` / `Cmd+O` | Open workspace |
| `Ctrl+D` / `Cmd+D` | Duplicate workspace |
| `Ctrl+B` / `Cmd+B` | Toggle sidebar |
| `Ctrl+L` / `Cmd+L` | Snippets |
| `Ctrl+Shift+I` / `Cmd+Shift+I` | Import cURL |
| `Ctrl+Shift+E` / `Cmd+Shift+E` | Secure Properties Tool |
| `Ctrl+Shift+R` / `Cmd+Shift+R` | Toggle auto-run |
| `Ctrl+Shift+T` / `Cmd+Shift+T` | Toggle theme |
| `Ctrl+Shift+1` / `Cmd+Shift+1` | Workbench layout |
| `Ctrl+Shift+2` / `Cmd+Shift+2` | Focus layout |
| `Alt+Shift+F` | Format script |
| `Ctrl+.` / `Cmd+.` | Toggle context drawer (Focus) |
| `Ctrl+/` / `Cmd+/` | Show shortcuts |
| `Escape` | Close dialogs |

---

## Installation

Download the latest installer from the **[landing page](https://ashutosh-vijay.dev/dataweave/)** or the [Releases page](https://github.com/Ashutosh-Vijay/DataWeave-Studio/releases):

- **Windows** — `.exe` (NSIS installer), `.msi`, `_x64_portable.zip` (no install — unzip and run), or `_x64-setup.zip` (the installer, zipped, for proxy-blocked `.exe` downloads)
- **macOS** — `.dmg` for Apple Silicon and Intel
- **Linux** — `.AppImage`, `.deb`, or `.rpm`

> **The app isn't code-signed yet** (a free side-project — Apple notarization is ~$99/yr, a Windows EV cert ~$300+/yr). Your OS warns on first launch because the publisher isn't *verified* — not because the app is unsafe. See **[SECURITY.md](SECURITY.md)** for exactly what the app does and doesn't do on your network.
>
> Pick the path that matches what you're seeing:
>
> **Windows — "Windows protected your PC" (SmartScreen):** click **More info → Run anyway**.
>
> **Windows — "Smart App Control has blocked this app":** SmartScreen-style click-through won't appear here. Either use the **`_x64_portable.zip`** (unzip anywhere and run `DataWeave Studio.exe` — no installer), or, if Smart App Control is on, it can't be bypassed per-app without turning it off (which usually requires a Windows reset). On a personal machine without Smart App Control, the portable zip just runs.
>
> **Windows — "Your system administrator has prevented this install" (managed/work laptop):** that's a device-management policy on the *installer*. Try the **`_x64_portable.zip`** (no install step). If your IT also blocks running unapproved `.exe`s (common at banks), you'll need IT to whitelist it — no unsigned app gets around that.
>
> **macOS — "is damaged and can't be opened":** that's just the unsigned-app quarantine, not real damage.
> 1. Drag **DataWeave Studio** into **Applications**.
> 2. **System Settings → Privacy & Security**, scroll down, **Open Anyway**, then confirm on next launch.
> 3. If it still won't open, clear the quarantine flag and launch:
>    ```bash
>    xattr -cr "/Applications/DataWeave Studio.app"
>    ```
> *(On macOS Sequoia and later the old right-click → Open trick no longer works for unsigned apps — use the steps above.)*

JRE 17 and the DataWeave runtime are bundled — no separate Java installation needed.

**Auto-update:** On by default — the app checks for a newer version on startup and shows a toast when one is available (nothing downloads without your click). Turn it off in **Settings → Advanced → Privacy** to make the app fully offline. Details in [SECURITY.md](SECURITY.md).

---

## Privacy & Security

- **Local execution** — no code or data ever leaves your machine
- **Zero telemetry** — no tracking, no analytics, no accounts
- **Memory-only keys** — encryption keys held in memory only, never written to disk
- **One optional network call** — a startup update check (to the release server), which you can disable in **Settings → Advanced → Privacy** for a 100% no-network app

See **[SECURITY.md](SECURITY.md)** for the full breakdown of data handling and network activity — written for compliance/security reviewers.

---

## Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Build the DW server JAR (requires Maven + JDK 17)
cd dw-server && mvn package && cd ..
# This produces src-tauri/resources/dw-server/dwstudio-server.jar

# 3. Set up a JRE in resources (for dev, just symlink your system JDK)
#    Production builds use jlink to create a minimal JRE

# 4. Run in development mode
npx tauri dev

# 5. Build for production
npx tauri build
```

---

## Architecture

DataWeave Studio does **not** shell out to the MuleSoft CLI for each run. Instead:

1. On first launch, the Rust backend spawns a **long-lived Java server** (`dwstudio-server.jar`) using the bundled JRE 17
2. The server loads the DataWeave 2.x runtime libraries (runtime, core-modules, java-module, yaml-module, etc.) once
3. Each script execution is a **JSON request/response over stdin/stdout** — no subprocess spawning per run
4. A 64-entry LRU compile cache skips recompilation for repeated scripts
5. Result: ~10-50ms per run after warm-up (vs ~700ms with the native CLI)

---

## Project Structure

```
src/                        # React frontend
  components/               # UI components
    FlowDesigner.tsx        # Visual message flow designer canvas
    MiniEditor.tsx          # Lightweight Monaco wrapper for flow config panels
    Sidebar.tsx             # Icon rail with snippets, tools, settings
  hooks/                    # useDWRunner, useWorkspace, useEditorFont
  dataweaveGrammar.ts       # Monarch tokenizer for DW syntax highlighting
  dataweaveCompletions.ts   # 309-function autocomplete with signature parsing
  dataweaveDocs.ts          # Function reference data (signatures, descriptions)
  dataweaveHover.ts         # Hover provider for DW functions
  dataweaveTheme.ts         # Dusk + Paper Monaco themes
  ThemeContext.tsx           # Dark/light theme + accent color state
src-tauri/                  # Rust backend
  src/dw_runner.rs          # Script execution via long-lived Java server
  src/dw_server.rs          # Spawns and manages dwstudio-server.jar process
  src/workspace.rs          # Workspace save/load
  resources/dw-server/      # Bundled dwstudio-server.jar
  resources/jre/            # Bundled minimal JRE 17 (via jlink)
dw-server/                  # Scala/Java server (Maven project)
  src/main/scala/.../DwServer.scala  # Long-lived DW runtime with compile cache
licenses/                   # Third-party licenses
```

---

## Known Limitations

- First launch boots the DataWeave runtime — about 1-2 seconds, hidden behind the splash. Subsequent runs are ~10-50ms.
- Undo/redo is per-session and does not persist across workspace reloads.
- Config property autocomplete triggers on `$` — type `${` to see suggestions.
- Trackpad pinch-to-zoom in the flow designer is limited by WebView2 — use Ctrl+scroll or the +/- buttons instead.
- No Language Server Protocol (LSP) — no Go to Definition, Find References, Rename Symbol, or type inference. The VS Code extension has these via MuleSoft's LSP.
- No breakpoint-level debugging of DataWeave expressions (the Flow Designer offers node-level step-through instead).
- No Anypoint Exchange publishing or Maven dependency management.

**What actually works that you might expect not to:**

- `import java!java::lang::Math`, `import java!java::util::UUID`, etc. — any standard JDK class works via the `java!` module. The runtime is a real JVM with full reflection.
- Secure config (`![encrypted]`) — implemented in-app, works fully offline without the Mule runtime.
- Hot-add classpath — drop JARs into the classpath panel and `import java!` resolves them immediately without restart.

**Genuinely Mule runtime-only features (not available)** — these need a deployed Mule application's message context, not just a JVM:

| Feature | Workaround in DataWeave Studio |
|---|---|
| `p("key")` / `Mule::p("key")` property lookup | Use the **Config YAML** panel — `${key}` is substituted before each run |
| `Mule::lookup("flowName", payload)` | No equivalent — extract the logic into a named input or separate script |
| Connector-specific types (Salesforce `SObject`, DB `ResultSet`, etc.) | Pass a JSON mock of the data structure as payload |

> `output application/java` is supported — we render the Java object as JSON
> for display, so you can still see the value structure even though the actual
> JVM-object form only matters in a Mule flow.

---

## Third-Party Licenses

This application embeds the [DataWeave runtime](https://github.com/mulesoft/data-weave) and core modules by MuleSoft/Salesforce, licensed under the BSD 3-Clause License. See [licenses/DATAWEAVE-CLI-LICENSE.txt](licenses/DATAWEAVE-CLI-LICENSE.txt).

DataWeave Studio is not affiliated with, endorsed by, or sponsored by MuleSoft or Salesforce.
