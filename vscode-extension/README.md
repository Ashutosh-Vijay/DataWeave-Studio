# DataWeave Studio for VS Code

The real DataWeave 2.12 engine, inside VS Code. Write a script, drop a payload, hit Run — results in about 20 milliseconds.

No Anypoint Studio. No Maven project, no `pom.xml`, no scenario files to hand-write. Java ships inside the extension. Install, open the playground, start transforming.

![Script editor with autocomplete and live output](https://raw.githubusercontent.com/Ashutosh-Vijay/DataWeave-Studio/main/docs/screenshots/auto_suggestion_on_typing_monaco_dark_mode.png)

## Why this exists

Testing a four-line transform currently means picking one of three bad options:

- **Boot Anypoint Studio** — 2 GB, minutes to start, and you need a Mule project before you can evaluate an expression.
- **Run the playground container** — you need Docker Desktop installed and running, which most companies license commercially and plenty of IT departments don't allow at all.
- **Use the online playground** — which means pasting production-shaped payloads into a website. That's the one that should stop you: customer records, account numbers, tokens in headers. Fine for a toy example, not for the data you actually debug.

This is the fourth option. It installs like any extension, runs entirely on your machine, and never sends your data anywhere — there's no account, no telemetry, and no network call required to run a script. The engine starts warm in the background, so by the time you've typed your script, runs are instant.

And because it runs MuleSoft's actual DataWeave runtime — not a reimplementation — what works here works in your Mule app.

## What you get

- **Instant runs** — a warm, long-lived engine executes scripts in ~10–20 ms. Flip on Auto-run to re-execute as you type.
- **Real input modeling** — payload plus extra named inputs in 14+ formats: JSON, XML, CSV, YAML, NDJSON, Java properties, Excel, Avro, Protobuf, flat file, binary, and a visual multipart/form-data builder.
- **HTTP context** — simulate method, headers, query params, and variables; your script sees real `attributes` and `vars`.
- **Config & Secure Properties, fully offline** — paste `application.yaml` and `secure-config.yaml` (with `![encrypted]` values), provide the key at runtime, and `${key}` / `${secure::key}` resolve before each run. Includes a standalone encrypt/decrypt tool compatible with MuleSoft's secure-properties-tool (AES, Blowfish, DES, DESede, RC2). Keys never touch disk.
- **Message Flow designer** — chain Set Payload, Transform, Set Variable, HTTP, Salesforce, Database, and Logger nodes. Run the whole pipeline or step through node by node, inspecting payload, variables, and attributes at each stage. Imports real `<flow>` XML from your Mule projects.
- **Real `dw::test` suites** — write named assertions, run them in-app against the bundled engine, and get the engine's own failure messages with the line each assertion failed on.
- **Share a whole setup in one link** — copy a link carrying the script, payload, variables and headers, for one request or the entire workspace. The other person opens it and presses Run. The data rides in the part of the URL browsers never send to a server, so nothing is uploaded to create one — and if your network blocks the site, **Copy code only** works without a URL at all.
- **cURL import** — paste any `curl` command (from Postman, browser devtools, a teammate); method, headers, params, and body fill themselves in, with a starter script generated to match.
- **An editor that knows DataWeave** — syntax highlighting, autocomplete for all 361 functions with signature hints, hover docs, error markers on the failing line, formatting, snippets, and a built-in function reference browser.
- **DW 1.0 → 2.0 migration** — paste a legacy script, get the converted version with a side-by-side diff.
- **Multi-request workspaces** — group related transforms Postman-style, each with its own script, inputs, context, and tests.

![Message Flow designer with step-through debugging](https://raw.githubusercontent.com/Ashutosh-Vijay/DataWeave-Studio/main/docs/screenshots/message_flow_dark_mode.png)

## Getting started

1. Install the extension.
2. Open the Command Palette and run **DataWeave Studio: Open Playground** — or click the `<W>` icon in the activity bar.
3. The first open takes a couple of seconds while the engine warms up. After that, every run is instant.

## Requirements

None. The DataWeave 2.12 runtime and a Java 17 runtime are bundled inside the extension and run fully offline. Nothing to install, and nothing touches your system Java, `JAVA_HOME`, or `PATH` — safe alongside Anypoint Studio's Java 8.

Works on **Windows**, **macOS** (Apple Silicon and Intel), and **Linux** — the Marketplace picks the right build for your machine automatically.

## Privacy

Everything runs on your machine. No telemetry, no analytics, no accounts, no network calls. Scripts, payloads, and workspaces stay local; encryption keys are held in memory only. Full statement: [PRIVACY.md](https://github.com/Ashutosh-Vijay/DataWeave-Studio/blob/main/vscode-extension/PRIVACY.md).

## Prefer a standalone app?

The same tool ships as a desktop app for Windows, macOS, and Linux — same engine, same features, no VS Code required.

- **Windows:** [get it from the Microsoft Store](https://apps.microsoft.com/detail/9NWD4L4J7D92) — signed by Microsoft, so no SmartScreen prompt and updates arrive automatically.
- **macOS, Linux, or a direct installer:** [ashutosh-vijay.dev/dataweave](https://ashutosh-vijay.dev/dataweave/)

If your workplace blocks the Store or unsigned installers, this extension is the way in — it needs no admin rights and no installer.

## Feedback

Bugs and ideas: [GitHub issues](https://github.com/Ashutosh-Vijay/DataWeave-Studio/issues). If the extension saves you time, a review on the Marketplace or a star on the repo genuinely helps.

---

Embeds the DataWeave engine published by MuleSoft / Salesforce, pinned at `2.12.2-20260715` (Apache License 2.0; `excel-module`, which backs xlsx payloads, is under MuleSoft's Main Services Agreement). DataWeave Studio is not affiliated with, endorsed by, or sponsored by MuleSoft or Salesforce.
