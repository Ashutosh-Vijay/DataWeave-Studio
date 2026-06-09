# DataWeave Studio for VS Code

The real DataWeave 2.11 engine, inside VS Code. Write a script, drop a payload, hit Run — results in about 20 milliseconds.

No Anypoint Studio. No Maven project, no `pom.xml`, no scenario files to hand-write. Java ships inside the extension. Install, open the playground, start transforming.

![Script editor with autocomplete and live output](https://raw.githubusercontent.com/Ashutosh-Vijay/DataWeave-Studio/main/docs/screenshots/auto_suggestion_on_typing_monaco_dark_mode.png)

## Why this exists

Testing a four-line transform shouldn't mean booting a 2 GB IDE or pasting work data into a browser playground. DataWeave Studio keeps the whole loop local and fast: the engine starts warm in the background, so by the time you've typed your script, runs are instant.

And because it runs MuleSoft's actual DataWeave runtime — not a reimplementation — what works here works in your Mule app.

## What you get

- **Instant runs** — a warm, long-lived engine executes scripts in ~10–20 ms. Flip on Auto-run to re-execute as you type.
- **Real input modeling** — payload plus extra named inputs in 14+ formats: JSON, XML, CSV, YAML, NDJSON, Java properties, Excel, Avro, Protobuf, flat file, binary, and a visual multipart/form-data builder.
- **HTTP context** — simulate method, headers, query params, and variables; your script sees real `attributes` and `vars`.
- **Config & Secure Properties, fully offline** — paste `application.yaml` and `secure-config.yaml` (with `![encrypted]` values), provide the key at runtime, and `${key}` / `${secure::key}` resolve before each run. Includes a standalone encrypt/decrypt tool compatible with MuleSoft's secure-properties-tool (AES, Blowfish, DES, DESede, RC2). Keys never touch disk.
- **Message Flow designer** — chain Set Payload, Transform, Set Variable, HTTP, Salesforce, Database, and Logger nodes. Run the whole pipeline or step through node by node, inspecting payload, variables, and attributes at each stage. Imports real `<flow>` XML from your Mule projects.
- **Tests with visual diff** — snapshot an expected output per request, re-run anytime, see exactly what changed when something breaks.
- **cURL import** — paste any `curl` command (from Postman, browser devtools, a teammate); method, headers, params, and body fill themselves in, with a starter script generated to match.
- **An editor that knows DataWeave** — syntax highlighting, autocomplete for all 309 functions with signature hints, hover docs, error markers on the failing line, formatting, snippets, and a built-in function reference browser.
- **DW 1.0 → 2.0 migration** — paste a legacy script, get the converted version with a side-by-side diff.
- **Multi-request workspaces** — group related transforms Postman-style, each with its own script, inputs, context, and tests.

![Message Flow designer with step-through debugging](https://raw.githubusercontent.com/Ashutosh-Vijay/DataWeave-Studio/main/docs/screenshots/message_flow_dark_mode.png)

## Getting started

1. Install the extension.
2. Open the Command Palette and run **DataWeave Studio: Open Playground** — or click the `<W>` icon in the activity bar.
3. The first open takes a couple of seconds while the engine warms up. After that, every run is instant.

## Requirements

None. The DataWeave 2.11 runtime and a Java 17 runtime are bundled inside the extension and run fully offline. Nothing to install, and nothing touches your system Java, `JAVA_HOME`, or `PATH` — safe alongside Anypoint Studio's Java 8.

## Privacy

Everything runs on your machine. No telemetry, no analytics, no accounts, no network calls. Scripts, payloads, and workspaces stay local; encryption keys are held in memory only. Full statement: [PRIVACY.md](https://github.com/Ashutosh-Vijay/DataWeave-Studio/blob/main/vscode-extension/PRIVACY.md).

## Prefer a standalone app?

The same tool ships as a desktop app for Windows, macOS, and Linux — same engine, same features, no VS Code required: **[ashutosh-vijay.dev/dataweave](https://ashutosh-vijay.dev/dataweave/)**

## Feedback

Bugs and ideas: [GitHub issues](https://github.com/Ashutosh-Vijay/DataWeave-Studio/issues). If the extension saves you time, a review on the Marketplace or a star on the repo genuinely helps.

---

Embeds the [DataWeave runtime](https://github.com/mulesoft/data-weave) by MuleSoft / Salesforce (BSD-3-Clause). DataWeave Studio is not affiliated with, endorsed by, or sponsored by MuleSoft or Salesforce.
