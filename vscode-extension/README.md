# DataWeave Studio for VS Code

The real DataWeave 2.12 engine, inside VS Code. Write a script, drop a payload, hit Run — results in about 20 milliseconds. No Anypoint Studio, no Maven project, no Docker, no account. Java ships inside the extension.

![Script editor with autocomplete and live output](https://raw.githubusercontent.com/Ashutosh-Vijay/DataWeave-Studio/main/docs/screenshots/auto_suggestion_on_typing_monaco_dark_mode.png)

## Why this exists

Almost nobody boots Anypoint Studio to check a four-line transform. They open the online playground — because it's one tab and it works.

Then they hit its edges:

- **No variables, no attributes.** Your script reads `vars.correlationId` or `attributes.headers.authorization`, and there's nowhere to put them. So you fake it with a `var` at the top, get it working, and then find out it behaves differently in the flow.
- **Real payloads are too big for it.** The response you're actually debugging is 4 MB of nested JSON. The answer is the command-line tool — which is a wall if you don't live in a terminal.
- **It's a website.** Pasting a production-shaped payload — customer records, account numbers, a bearer token in a header — into someone else's server is the part that should stop you. Fine for a toy example. Not for the data you actually debug.

This is the playground with those edges removed. It installs like any extension, runs entirely on your machine, and has no account and no network call in the path of a run.

| | This extension | Online playground | DataWeave CLI | Anypoint Studio |
|---|---|---|---|---|
| Variables, attributes, headers | **Yes, in a form** | No | Flags | Yes |
| Large payloads | **Yes, from a file** | Practical limit | Yes | Yes |
| Data leaves your machine | **Never** | Yes | No | No |
| Step debugger with breakpoints | **Yes** | No | No | No |
| Secure properties (`![…]`) | **Yes, offline** | No | No | Runtime only |
| Needs a project / install / account | **No** | No account | Install | 2 GB, a Mule project |
| Works with your AI assistant | **Yes, free** | No | No | Subscription |

And it runs MuleSoft's actual DataWeave runtime — not a reimplementation — so what works here works in your Mule app.

## What you get

**Run and understand**

- **Instant runs.** A warm, long-lived engine executes scripts in ~10–20 ms. Auto-run is on by default, so output re-renders about a second after you stop typing.
- **Every expression's value, without a single `log()`.** The Trace panel lists what each expression in your script evaluated to, in source order — click a row to jump to it. A `map` body that ran 500 times is one row with a count. A script that throws still shows everything it worked out before the throw.
- **A real step debugger.** Click the gutter to set a breakpoint. The script stops there and you get the call stack, every variable in scope, step over / into / out, and a box to evaluate any expression against the paused frame.
- **Check against the Mule you deploy to.** Point it at Mule 4.1 through 4.12 and a 2.10 function on a 4.4 runtime fails here, in the editor, naming the version that introduced it — instead of on the server.

**Feed it real inputs**

- **HTTP context in a form.** Method, headers, query params, URI params and variables — your script sees genuine `attributes` and `vars`, not a `var` you invented to stand in for them.
- **14+ input formats.** JSON, XML, CSV, YAML, NDJSON, Java properties, Excel, Avro, Protobuf, flat file, binary, plus extra named inputs and a visual multipart/form-data builder.
- **cURL import.** Paste any `curl` command — from Postman, browser devtools, a teammate — and method, headers, params and body fill themselves in, with a starter script generated to match.
- **OpenAPI / Swagger import.** Open a spec, pick an endpoint, and its request and response shapes become a working request with realistic sample data.

**Secure properties, fully offline**

Paste an `application.yaml` and a `secure-config.yaml` with `![encrypted]` values, provide the key at runtime, and `${key}` / `${secure::key}` resolve before each run. There's a standalone encrypt/decrypt tool byte-compatible with MuleSoft's `secure-properties-tool` (AES, Blowfish, DES, DESede, RC2) — and a whole-file mode that encrypts every value in a config at once, leaves anything already written as `![…]` alone, and preserves your comments and layout. Keys are held in memory and never written to disk.

**Prove it, then share it**

- **Real `dw::test` suites.** Named assertions, run in-app against the bundled engine, with the engine's own failure messages and the line each one failed on.
- **A whole setup in one link.** Script, payload, variables and headers — for one request or an entire workspace. The other person opens it and presses Run. The data rides in the part of the URL browsers never send to a server, so nothing is uploaded to create one. If your network blocks the site, **Copy code only** works with no URL at all.
- **Message Flow designer.** Chain Set Payload, Transform, Set Variable, HTTP, Salesforce, Database and Logger nodes. Run the pipeline or step node by node, inspecting payload, variables and attributes at each stage. Imports real `<flow>` XML from your Mule projects.

**An editor that knows DataWeave**

Autocomplete over all 361 functions with signature hints, typed against your actual payload's shape. Hover docs, go-to-definition, find-references, rename, outline, folding. Live diagnostics with fixes you can apply. Warnings when a script hashes with MD5 or leaves a `log()` behind. Formatting via the engine's own formatter, snippets, a searchable function reference, and DW 1.0 → 2.0 migration with a side-by-side diff.

![Step debugger paused on a breakpoint](https://raw.githubusercontent.com/Ashutosh-Vijay/DataWeave-Studio/main/docs/screenshots/debugger_paused_dark_mode.png)

![dw::test suite, five assertions passing](https://raw.githubusercontent.com/Ashutosh-Vijay/DataWeave-Studio/main/docs/screenshots/tests_suite_dark_mode.png)

![Message Flow designer with step-through debugging](https://raw.githubusercontent.com/Ashutosh-Vijay/DataWeave-Studio/main/docs/screenshots/message_flow_dark_mode.png)

## Give your AI assistant a real DataWeave engine

Ask Copilot or Claude for a DataWeave script today and you get something plausible. It has no way to check.

This extension ships an **MCP server** that hands the assistant the actual engine. It can run a script against your payload and read the real error, type-check without running, run a `dw::test` suite and see which assertions passed, ask what every expression evaluated to when the output looks wrong, and look up any of the 361 functions and 172 recipes offline. The result is scripts that are verified before you see them, not guessed.

It also answers plain HTTP: `POST /run` takes `{ script, payload, vars, attributes }`, and a `rows` array runs one script over every row. That turns "test this transform against a month of production data" into a short Python loop instead of deploying an API to do it.

Both are **off until you start them**, bound to loopback only, and Safe mode refuses Java interop and file/network access so an agent can transform data but can't reach your machine. No API key, no subscription, no account — the assistant you already pay for, pointed at an engine that's already on your laptop.

## Getting started

1. Install the extension.
2. Open the Command Palette and run **DataWeave Studio: Open Playground** — or click the `<W>` icon in the activity bar.
3. The first open takes a couple of seconds while the engine warms up. After that, every run is instant.

## Requirements

None. The DataWeave 2.12 runtime and a Java 17 runtime are bundled inside the extension and run fully offline. Nothing to install, and nothing touches your system Java, `JAVA_HOME` or `PATH` — safe alongside Anypoint Studio's Java 8.

Works on **Windows**, **macOS** (Apple Silicon and Intel) and **Linux** — the Marketplace picks the right build for your machine automatically.

## Privacy

Everything runs on your machine. No telemetry, no analytics, no accounts, no network calls. Scripts, payloads and workspaces stay local; encryption keys are held in memory only. Full statement: [PRIVACY.md](https://github.com/Ashutosh-Vijay/DataWeave-Studio/blob/main/vscode-extension/PRIVACY.md).

## Prefer a standalone app?

The same tool ships as a desktop app for Windows, macOS and Linux — same engine, same features, no VS Code required.

- **Windows:** [get it from the Microsoft Store](https://apps.microsoft.com/detail/9NWD4L4J7D92) — signed by Microsoft, so no SmartScreen prompt and updates arrive automatically.
- **macOS, Linux, or a direct installer:** [ashutosh-vijay.dev/dataweave](https://ashutosh-vijay.dev/dataweave/)

If your workplace blocks the Store or unsigned installers, this extension is the way in — it needs no admin rights and no installer.

## Feedback

Bugs and ideas: [GitHub issues](https://github.com/Ashutosh-Vijay/DataWeave-Studio/issues). If the extension saves you time, a review on the Marketplace or a star on the repo genuinely helps.

---

Embeds the DataWeave engine published by MuleSoft / Salesforce, pinned at `2.12.2-20260715` (Apache License 2.0; `excel-module`, which backs xlsx payloads, is under MuleSoft's Main Services Agreement). DataWeave Studio is not affiliated with, endorsed by, or sponsored by MuleSoft or Salesforce.
