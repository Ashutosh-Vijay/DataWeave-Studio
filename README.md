# DataWeave Studio

Run and debug DataWeave scripts locally — no Anypoint Studio, no browser limits, no nonsense.

> **Anypoint Studio is 2GB. The online playground doesn't support full context. DataWeave Studio runs locally, offline, instant.**

Built with Tauri v2 (Rust) + React + TypeScript + Monaco Editor. Embeds the DataWeave runtime directly with a bundled JRE 17 — no Java install required.

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

## Why?

DataWeave testing today is painful:

- **Anypoint Studio** is 2GB, Eclipse-based, and takes minutes to start. Testing a single DataWeave script requires deploying an entire Mule app locally.
- **The online playground** lacks full execution context — no `vars`, no config properties, no real headers — and hangs or crashes on large payloads.
- **The VSCode DataWeave extension** requires a specific folder structure (`src/main/dw/inputs/`), a separate file for every input — payload, attributes, vars, each written by hand — and switches between panes just to see output. High friction for something you do dozens of times a day.

DataWeave Studio fixes all of it — one window, everything from a UI, no file management.

---

## 3 Things No Other Tool Does

**1. Visual Message Flow Designer**
Drag-and-drop flow canvas inspired by Anypoint Studio. Chain Set Payload, Transform, Set Variable, HTTP Request, Salesforce, Database, and Logger connectors into a pipeline. Run all at once or step through one node at a time with interactive debugging — inspect payload, variables, and attributes at each stage.

**2. Test with your real secure config — offline, nothing sent anywhere**
Paste your actual `secure-config.yaml` (with `![Base64Encrypted...]` values), provide your encryption key at runtime. Your script runs with real decrypted values. The key is never saved to disk. No other DataWeave tool supports this.

**3. 309-Function Autocomplete + Built-In Reference**
Every DataWeave function with signature hints, snippet insertion, and module grouping. Plus a searchable function reference browser — no tab-switching to MuleSoft docs. Context-aware suggestions from your payload, vars, attributes, and config properties.

---

## Who is this for?

- MuleSoft developers tired of opening Anypoint Studio just to test a script
- Engineers using the VSCode extension but fed up with maintaining input folders and hand-written JSON files just to set `vars` or `attributes`
- Anyone who needs to test scripts that reference `${secure::key}` values without running the full stack
- Anyone building or debugging DataWeave with real production payloads, headers, and config

---

## vs. The Alternatives

| Feature | Anypoint Studio | Online Playground | VSCode Extension | DataWeave Studio |
|---|---|---|---|---|
| Startup | Minutes | Instant | Instant | Instant |
| Offline | Yes | No | Yes | Yes |
| Large payload support | Yes | Hangs/crashes | Yes | Yes |
| Visual flow designer | Yes | No | No | Yes |
| Context (vars, attrs, headers) | Yes | Limited | Manual JSON files | UI — no files |
| Config YAML (`${key}`) | Yes | No | No | Yes |
| Secure config (`![encrypted]`) | Yes (full runtime) | No | No | Yes — offline |
| SOQL/SQL query rendering | Yes (full runtime) | No | No | Yes — instant |
| cURL import | No | No | No | Yes |
| DW function autocomplete | Basic | Basic | Basic | 309 functions + signatures |
| Function reference browser | No | No | No | Yes — built-in |
| Multipart/form-data testing | Yes (full runtime) | No | No | Yes — visual builder |
| DW 1.0 → 2.0 migration | Yes | No | No | Yes |
| Themes | Dark only | Light only | VSCode themes | Dusk + Paper + 5 accents |
| Footprint | 2GB+ | N/A | Needs VSCode | ~150MB standalone |

---

## Installation

Download the latest installer for your platform from the [Releases page](https://github.com/Ashutosh-Vijay/DataWeave-Studio/releases) or from the [download site](https://ashutosh-vijay.dev/dataweave/):

- **Windows** — `.exe` (NSIS installer), `.msi`, or `.zip`
- **macOS** — `.dmg` (Intel + Apple Silicon)
- **Linux** — `.AppImage`, `.deb`, or `.rpm`

> **Note:** The app is not code-signed. On Windows, click "More info → Run anyway". On macOS, right-click → Open.

JRE 17 and the DataWeave runtime are bundled — no separate Java installation needed.

---

## Features

### Message Flow Designer
- **Visual flow canvas** — drag connectors (Set Payload, Transform, Set Variable, HTTP Request, Salesforce, Database, Logger) onto a canvas and chain them into a pipeline
- **Step-through debugging** — run all nodes at once or step through one at a time, inspecting payload, variables, and attributes at each stage
- **Connector config panels** — configure each node with Monaco editors (syntax highlighting, autocomplete in flow config too)
- **Set Variable** — store transform output into `vars` instead of replacing payload, just like Anypoint's Transform Message
- **Disable/enable nodes** — right-click to disable a node without deleting it (skipped during execution)
- **Canvas zoom** — Ctrl+scroll or +/- buttons

### Context & Config
- **Full context panel** — set `attributes.method`, `headers`, `queryParams`, and `vars` from the UI
- **Config properties (YAML)** — define `${key}` and `${secure::key}` properties just like MuleSoft's `config.yaml` / `secure-config.yaml`
- **Secure property decryption** — paste your production `secure-config.yaml`, provide the key, and your script runs with real decrypted values. Key is never saved to disk.
- **Offline Secure Properties Tool** — encrypt/decrypt values locally, without sending secrets to any server

### Payload
- **Inline MIME type selector** — switch payload type (JSON, XML, CSV, multipart, binary…) directly from the tab bar
- **Load file into payload** — pick any CSV, JSON, XML, or text file from disk and load it straight into the payload editor
- **Multipart/form-data builder** — add parts visually (name, content-type, text value or file path); real MIME boundaries constructed in Rust
- **Binary payload support** — pick any binary file (`application/octet-stream`) as payload or as a named input part
- **Named inputs** — add extra input streams as tabs alongside payload, accessible by name in DW scripts

### Workflow
- **cURL importer** — paste a request from Postman or browser devtools, get a DataWeave transform template instantly
- **Snippets** — reusable templates for common patterns (map, filter, group-by, reduce, sort, conditional output, etc.)
- **DW 1.0 → 2.0 migration** — paste a DataWeave 1.0 script, click Migrate, review a diff overlay, and replace with one click
- **Workspace management** — save/load `.dwstudio` files with full editor state (scripts, flows, payloads, config)
- **Command palette** — quick access to all actions via Cmd/Ctrl+K
- **Export output** — save script output to any file via a native save dialog
- **Auto-run** — toggle live preview with debounce

### Editor
- **309-function autocomplete** — every DataWeave function with signature hints and snippet insertion
- **Function reference browser** — searchable catalog of all DW functions grouped by module, with descriptions
- **Context-aware suggestions** — suggests actual field names from your payload, vars, attributes, and config properties
- **Bracket pair colorization** — matching brackets colored for readability
- **Resizable panels** — drag to resize script editor, payload area, context panel, and output pane
- **No payload size limit** — handles large Base64, nested JSON, XML, CSV locally

### Appearance
- **Dusk & Paper themes** — full dark and light mode with custom DataWeave syntax themes
- **5 accent colors** — Emerald, Sky, Violet, Amber, Rose
- **2 layouts** — Workbench (icon rail + tabbed context) and Focus (editor-first with right drawer)

### Advanced
- **Custom classpath** — add directories or JARs so the runtime can resolve custom DW modules and libraries
- **Execution timeout** — set a per-run timeout (in ms) to kill runaway scripts automatically

### Query Modes
- **Salesforce Query mode** — SOQL editor with `:paramName` binding, see the exact final query rendered before it hits Salesforce
- **DB Query mode** — SQL editor with `:paramName` parameters (auto-quoting, simulated JDBC)

---

## Privacy & Security

- **Local execution** — no code or data ever leaves your machine
- **Zero telemetry** — no tracking, no analytics, no phone-home
- **Memory-only keys** — secure encryption keys are held in memory only and never written to disk

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` / `Cmd+Enter` | Run the current script |
| `Ctrl+S` / `Cmd+S` | Save the current workspace |
| `Ctrl+K` / `Cmd+K` | Open command palette |
| `Ctrl+N` / `Cmd+N` | New blank transform |
| `Ctrl+I` / `Cmd+I` | Import cURL |
| `Ctrl+L` / `Cmd+L` | Open from snippets |
| `Escape` | Close dialogs |

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

## Architecture

DataWeave Studio does **not** shell out to the MuleSoft CLI for each run. Instead:

1. On first launch, the Rust backend spawns a **long-lived Java server** (`dwstudio-server.jar`) using the bundled JRE 17
2. The server loads the DataWeave 2.x runtime libraries (runtime, core-modules, java-module, yaml-module, etc.) once
3. Each script execution is a **JSON request/response over stdin/stdout** — no subprocess spawning per run
4. A 64-entry LRU compile cache skips recompilation for repeated scripts
5. Result: ~10-50ms per run after warm-up (vs ~700ms with the native CLI)

---

## Known Limitations

- First launch boots the DataWeave runtime — about 1-2 seconds, hidden behind the splash. Subsequent runs are ~10-50ms.
- Undo/redo is per-session and does not persist across workspace reloads.
- Config property autocomplete triggers on `$` — type `${` to see suggestions.
- Trackpad pinch-to-zoom in the flow designer is limited by WebView2 — use Ctrl+scroll or the +/- buttons instead.

**What actually works that you might expect not to:**

- `import java!java::lang::Math`, `import java!java::util::UUID`, etc. — any standard JDK class works via the `java!` module. The runtime is a real JVM with full reflection.
- Secure config (`![encrypted]`) — implemented in-app, works fully offline without the Mule runtime.
- Hot-add classpath — drop JARs into the classpath panel and `import java!` resolves them immediately without restart.

**Genuinely Mule runtime-only features (still not available)** — these need a deployed Mule application's message context, not just a JVM:

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
