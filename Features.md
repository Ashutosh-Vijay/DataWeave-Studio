# DataWeave Studio — Feature Reference

Everything the app currently supports.

---

## Script Editor

- **DataWeave 2.0 syntax highlighting** — custom Monaco grammar with keyword, operator, type, and string coloring
- **Autocomplete** — context-aware suggestions for `payload`, `attributes`, `vars`, named inputs, config YAML keys, and DW built-in functions
- **Error highlighting** — failed runs mark the exact error line in red with a gutter glyph and scroll to it
- **Ctrl+Enter to run** — keyboard shortcut fires execution from anywhere in the editor
- **Auto-closing brackets and quotes** — `(`, `[`, `{`, `"`, `'` are auto-paired
- **Auto-surround** — selecting text and typing a bracket wraps the selection
- **Auto-indent** — full smart indentation on Enter
- **DW 1.0 → 2.0 migration** — "1.0→2.0" button rewrites a DW 1.0 script in-place:
  - `%dw 1.0` → `%dw 2.0`
  - `%input` / `%output` / `%var` → drop the `%`
  - `%function` → `fun`
  - `flowVars` → `vars`
  - `inboundProperties` → `attributes.headers`
  - `as :string` / `:number` / `:boolean` / `:date` etc. → `as String` / `as Number` …
  - Inserts `// ⚠` warning comments for `%namespace`, `lookup()`, `outboundProperties`, `sessionVars`, `p()` (Mule runtime functions not available in the standalone DW CLI)
  - Shows result in an overlay with a **Replace Script** button

---

## Payload

- **Text payload editor** — Monaco editor for JSON, XML, CSV, plain text, form-urlencoded, DataWeave, flat file
- **Input format selector** — dropdown sets the payload MIME type passed to the DW CLI
- **Binary payload** — select `application/octet-stream` to pick any file from disk; the file path is passed directly to the DW CLI (no content limit, no encoding)
- **Multipart form-data parts builder** — visual builder when mime is `multipart/form-data`:
  - Add any number of named parts
  - Each part can be **text** (inline value) or **file** (native file picker)
  - Content-Type auto-detected from file extension (PDF, JPG, PNG, ZIP → `application/octet-stream`; JSON → `application/json`; etc.)
  - Content-Type field is editable per-part
  - A real multipart body with MIME boundaries is constructed in Rust at run time and passed to the DW CLI — scripts access parts via `payload.parts.partName.content`

---

## Named Inputs

- Add extra DW inputs beyond `payload` (e.g. `lookup`, `config`, `reference`)
- Each input has its own tab in the payload area with its own Monaco editor
- Each input has an independently configurable name and MIME type
- Supports binary inputs (`application/octet-stream`) — pick a file from disk
- Named inputs are passed to the DW CLI as `-i name=file`
- Inputs persist in workspace save/load

---

## Context Panel

- **HTTP Method** — GET / POST / PUT / DELETE / PATCH — exposed as `attributes.method`
- **Query Parameters** — key/value pairs exposed as `attributes.queryParams`
- **Headers** — key/value pairs exposed as `attributes.headers`
- **Variables (`vars`)** — key/value pairs with per-entry type (`string` or `json`) — exposed as `vars`
- **Config YAML** — paste `application.yaml` / `mule-artifact.json` style config; `${key}` placeholders in script and payload are substituted before each run
- **Secure Config YAML** — paste encrypted YAML; `${secure::key}` placeholders are decrypted and substituted using the configured encryption key and settings

---

## Property Placeholder Substitution

- `${key}` resolved from Config YAML before run
- `${secure::key}` (and `${key}`) resolved from Secure Config YAML before run
- Supports nested dot-notation keys (e.g. `${salesforce.username}`)
- Works in both the script and the payload

---

## Secure Properties Tool

- Standalone dialog (lock icon in header) for offline encrypt/decrypt
- **Encrypt** — enter a plaintext value and key, get a Base64 result wrapped as `![...]`
- **Decrypt** — paste a `![...]` or raw Base64 value, get plaintext back
- Compatible with **MuleSoft `secure-properties-tool.jar`** (AES/CBC)
- Settings: Algorithm (AES, Blowfish, DES, DESede, RC2), Mode (CBC, CFB, ECB, OFB), Random IVs toggle
- Show/hide key field
- One-click copy of result
- Everything runs locally — no network calls

---

## Query Modes (Node Labels)

- **Transform** — standard DW 2.0 transform, full payload → output
- **Salesforce Query (SOQL)** — enter a SOQL template with `:param` placeholders; run the DW script to produce a params object; the final SOQL with substituted values is shown in the output pane
  - Literal replace (Salesforce connector behavior) — user controls quoting in the template
- **DB Query (SQL)** — same flow for SQL; DB connector JDBC behavior:
  - Strings auto-wrapped in single quotes
  - Numbers and booleans bare
  - `null` → `NULL`

---

## Output Pane

- Monaco editor with syntax highlighting (JSON / XML / raw)
- Format toggle: JSON / XML / Raw
- **Copy** — copies output to clipboard
- **Export** — native save dialog to write output to any file (`.json`, `.xml`, `.txt`, etc.)
- Execution time badge (ms)
- Error display with pre-formatted monospace output

---

## cURL Importer

- Paste any `curl` command — auto-detects method, headers, query params, and payload
- Supports: JSON, XML, CSV, form-urlencoded, multipart (`-F`)
- For `-F` multipart commands: populates the multipart parts builder with part names and types; file parts show the filename from `@filepath` (user picks the actual local file)
- Generates a matching DW 2.0 script scaffold from the payload shape:
  - JSON: maps object fields and arrays
  - XML: maps root and child elements
  - CSV: maps column headers
  - Form-urlencoded: maps field names
  - Multipart: maps `payload.parts.name.content` per part
- Preview before import (shows method, type, generated script, payload)

---

## Classpath / Custom Modules

- Add directories or `.jar` / `.dwl` files to the classpath via the Sidebar
- Passed to the DW CLI via `-cp` on every run
- Enables `%import` of custom DW modules, custom DataWeave libraries, and additional JARs
- Multiple entries supported; each shown with filename and a remove button
- Persists in workspace save/load

---

## Timeout Control

- Configurable per-workspace execution timeout (milliseconds) in the Sidebar
- Default: 30,000 ms (30 seconds)
- `0` = no timeout
- Script process is killed and a clear error is shown if the limit is exceeded

---

## Workspace Management

- **Save / Load** — workspaces saved as `.dwstudio` JSON files in `AppData/Local/com.dwstudio.desktop`
- **Ctrl+S** — global save shortcut
- **Unsaved changes indicator** — `*` in the header and yellow dot in the sidebar
- **Workspace list** — sidebar shows all saved workspaces; click to load, ✕ to delete
- **New workspace** — resets all state to defaults
- **Per-label script isolation** — Transform / Salesforce Query / DB Query each remember their own script independently; switching node labels restores the correct script
- **Persisted fields**: project name, script (per label), payload, payload MIME type, payload file path, named inputs, query template, context (method, params, headers, vars, config YAML, secure config YAML, encryption settings), classpath, timeout, multipart parts

---

## Auto-Run

- Toggle in the header — re-executes automatically after 1.5 s of inactivity
- Debounced — only fires when the CLI is warmed up and not already running
- Triggers on changes to: script, payload, payload MIME type, context, named inputs, query template

---

## Theme

- **Dark mode** and **light mode** — toggle in the header
- All editors (script, payload, named inputs, output, config YAML) switch theme together
- Custom DataWeave syntax theme in both dark and light variants

---

## Guided Tour

- First-launch walkthrough highlights the main areas: sidebar, script editor, payload, context panel, output, run controls
- Can be re-launched any time via the `?` button in the header

---

## DW CLI Integration

- Bundled DataWeave CLI (MuleSoft, BSD-3-Clause) — no installation required
- CLI is warmed up at launch in a background thread (splash screen until ready)
- All inputs written to temp files — no Windows command-line length limit issues
- Script header auto-generated: `%dw 2.0`, `input payload <mime>`, `input attributes`, `input vars`, named input declarations — only what the user hasn't already written
- Stderr cleaned: ANSI codes stripped, Java `WARNING:` lines filtered
- Friendly error messages for binary-not-found and permission-denied

---

## About / Version

- About dialog with version, links, and license info
- Version badge in the header
