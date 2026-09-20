# Changelog

All notable changes to DataWeave Studio for VS Code.

## 3.1.0 — 2026-09-20

**Stop retyping the key.**

- **Name your encryption key once.** Encrypting a value meant pasting the same key every single time and picking the right one out of your head — uat or prod. Save them under names you choose and pick one from a row of chips instead. The key goes into VS Code's own secret storage, which puts it in the operating system keychain — never into a workspace file, never into a share link. Rename one, rotate the value behind a name, or forget it entirely.
- **A whole config encrypts in the time one value used to.** Secure properties used to start a fresh JVM per value — a quarter of a second each, so a thirty-field config took the better part of eight seconds. The same work now happens inside the engine already running: 3ms a value, and that config finishes in under a tenth of a second. It also fixed a silent corruption on Windows, where non-English characters were encrypted as `?` because the key and value travelled as command-line arguments.
- **An encrypted config is inert until Mule is told about it.** After an encrypt, a Mule config button writes out the snippet the runtime needs: the pom dependency, the namespace, the `<secure-properties:config>` with your algorithm and mode already filled in, and the deploy-time flag that supplies the key. The key stays a placeholder, so it is safe to commit.
- **The Side Bar does the work now, instead of opening the app.** It held one button that opened the panel. It now has three views that answer things without leaving the editor: your saved workspaces, with a click to open one; a search across all 361 DataWeave functions, with Insert and Copy on any signature; and secure properties, encrypting or decrypting a value on the spot with your saved keys.
- **Replay a request that only exists in a log.** Mule's wire logger prints the whole outbound request when DEBUG is on for `HttpMessageLogger` — the only trace of what actually left an environment you cannot attach to, and unusable, because you retype it into cURL by hand. Paste the log instead: every request in it comes back as a cURL command, and Import hands one to the cURL importer, which turns it into a payload, a context and a starting transform.
- **A cURL can leave as the connector call that makes it.** A pasted cURL now also exports as the Mule elements that perform it — an `<http:request-config>` for the host and an `<http:request>` carrying headers, query params and body — as a tab beside the generated script. It keeps what the command actually said: `-u` becomes basic auth (with the password left as a property placeholder, so the snippet is safe to commit), `-L` becomes `followRedirects`, `--max-time` becomes `responseTimeout`. A toggle switches the values between the ones the cURL used and `attributes.queryParams.region` — the second is what a flow behind an HTTP listener wants, forwarding what it was given with no transform in between. And config encryption grew a To properties / To YAML button, because Mule reads both and which one a project uses was decided years ago by somebody else.
- **The engine writes the test.** Put the cursor on a `fun` declaration and press Ctrl+. — the engine generates a `dw::test` suite for that function, with its cases laid out and the function carried in, as a new Tests entry ready to run. Doc comments are checked as you type too, in the same pass as the type checker.
- **Your AI assistant can ask what a lambda parameter actually is.** A tenth MCP tool. Inside `items map ((item, i) -> …)`, writing the body means knowing what `item` is — and the engine knows: `{ price: Number, name: String }`, inferred from your sample payload. Until now the only way to find out was to run the thing and read the error. It answers at any line and column, which is what run and lint already report.
- **The app knows what day it is.** On Diwali, Holi, Halloween, Christmas and New Year the startup screen dresses up — lamps, gulal, a burning scarecrow, a tree that draws itself on, a snowman — and the bars and empty panels get a little of it too. Never over an editor, never over a line of text. Keeping the colours for the whole app is a question asked once per festival, and Settings → Appearance turns the lot off. Vampire is in there as well, for any day you like.
- **Fixes.** A workspace saved with a partial request context took the whole app down on open. Every backend error in the crypto tools rendered as an empty red box. Two refactor entries in the lightbulb menu did nothing at all — the engine declines every selection — so they are gone.

## 3.0.0 — 2026-09-13

> Jumps from 1.5.0 to match the desktop app. The two have shipped in lockstep every release — v2.4.0 with 1.4.0, v2.5.0 with 1.5.0 — and the leading digit was the only thing out of step. One version number now means one thing, whichever one you are running.

**Stop guessing what your script did.**

- **Every value, without a single `log()`.** A Trace panel under the output lists what each expression in your script evaluated to, in source order — click a row to jump to it. A `map` body that ran 500 times is one row with a count rather than 500 rows, and a script that fails shows everything it worked out before the throw. It replaces wrapping an expression in `log()` and then having to take it back out, and it is on by default. (The step debugger this shares its machinery with is desktop-only for now.)
- **Tests you can actually trust.** The snapshot runner is gone. In its place are real `dw::test` suites — the same framework MuleSoft ships — with named assertions, the engine's own failure messages and the line that failed. The old runner only ever answered "did the output change", and went stale the moment a transform legitimately changed. Run follows the pane you are in, so pressing Run with the Tests panel open runs the suite.
- **Check against the Mule you actually deploy to.** Point Studio at your runtime — Mule 4.1 through 4.12 — and anything newer stops being a surprise on the server. A 2.10 function on a 4.4 runtime now fails in the editor, naming the version that introduced it. It gates the compiler *and* the runtime's version-dependent behaviour, not just a lint, and it applies to Run, the Tests panel and diagnostics alike. Asked once on first run; changeable from the status bar or Settings → Runtime.
- **Encrypt a whole config, not one value at a time.** A new page takes a YAML or `.properties` config and encrypts every value at once, or decrypts one so you can read it. Values already written as `![…]` are left alone rather than encrypted twice, comments and layout survive untouched, and every field is listed with what will happen to it before anything runs.
- **The editor caught up with the engine.** Diagnostics now come with fixes you can apply; colouring comes from the parsed syntax tree instead of text patterns; hovers render real documentation instead of the raw AsciiDoc markup they had been leaking. Studio can generate a doc comment from a function's signature and realistic sample data from a declared type, and it warns when a script hashes with MD5 or leaves a `log()` behind.
- **DataWeave 2.12, and 52 functions nobody documented.** The bundled engine moves to 2.12 and the reference was regenerated against it. The reference now also covers the modules MuleSoft's own docs leave out entirely — all 25 `dw::test::Asserts` matchers, the file module, protobuf — read from the doc comments inside the engine itself. 309 functions to 361.
- **Your AI assistant can test and lint, not just run.** The MCP server grew from six tools to eight. An agent can now run a `dw::test` suite and get back which assertions passed, type-check a script without running it at all — useful when there is no sample payload to run against — and ask for every expression's value when a transform compiles but the output is wrong. Encrypting a config over MCP is one call for the whole file rather than one per secret. Its offline reference had also been stuck at 309 functions and 83 recipes since June; it now serves the same 361 and 172 the editor does.
- **Less in the way.** The target runtime moved to the status bar and auto-run and trace moved into a caret beside Run, taking several controls out of the top bar. Auto-run is on by default. Pasting into a config or module editor no longer reindents what you pasted.

## 1.5.0 — 2026-08-26

**Type-aware, and scriptable.**

- **The editor knows your data's shape.** Typing `payload.` now lists the fields your payload actually has, and inside a `map` the lambda's parameter resolves to the element type — so `item.` suggests that element's own fields. Hover shows inferred types; signature help shows which argument you're on. These come from the DataWeave language service inside the bundled engine, the same one Anypoint Studio uses, so the types are the engine's truth rather than a guess made by reading your sample. The old suggestions remain as an instant fallback while the engine warms up.
- **Run scripts from anything — no endpoint to deploy.** The Local Server now answers plain HTTP as well as MCP. `POST /run` takes `{ script, payload, vars, attributes }` and returns the output; send a `rows` array and one script runs over every row, one result each. That turns "test this transform against a month of production data" into a Python loop instead of publishing an API just to exercise it. The engine compiles once and caches, so the first row costs about a second and the rest run in milliseconds. Loopback only, off until you start it, and Safe mode applies. There's a full reference inside the app — **Local Server → HTTP API → How to use it** — covering vars, headers, non-JSON payloads and a worked Python driver.
- **Format uses the real DataWeave formatter.** `Alt+Shift+F` ran a generic re-indent that did nothing to a script written on one line. It now calls the engine's own formatter, which restructures the whole script. Payloads get a **Format** button too, for JSON and XML — done locally, so attributes, comments and CDATA survive untouched.
- **Share links survive a blocked domain.** **Copy share code — no link** copies just the `dws1.…` blob, so a share still works when a corporate filter blocks the site the link points at. Sharing is findable now too: a button in the top bar and a Share group in the command palette, instead of one item in a menu nobody opened. A shared multipart body also shows its parts and their values on the web page instead of just naming them.
- **cURL import mirrors the input format.** CSV in now means CSV out, and multipart in means multipart out — with the `{ parts: { name: { headers, content } } }` shape the engine actually requires, so the generated script runs rather than failing on a missing `parts` field.
- **`p('key')` tolerates the import legacy projects actually have.** `import p from mule` in lowercase was left in place and then failed on a module that doesn't exist — after every `p()` call had already been rewritten, so the error named something the script no longer needed.
- **Brackets auto-close in the vars, headers and query-param fields.** They're plain text boxes, not editors, so typing `{` left you to close it yourself. Now pairs, steps over closers, opens an indented block on Enter, and deletes both halves on Backspace. Quotes only pair where the field holds JSON.
- **A blocked jar download says so.** A filtering proxy answers with an HTML block page, which failed the archive check and reported "not a valid JAR" — sending you after a corrupt file instead of a blocked request.
- **Fixed: black scrollbars** on light themes, caused by the webview's colour scheme never being told which theme was active.
- **Fixed: the first keystroke after a drag-select** being swallowed — select a word, type "payload", get "ayload".
- **Fixed: the OpenAPI reader's Add button**, which promised "paste or open a spec file" and did neither.

## 1.4.0 — 2026-08-23

**Share a whole setup in one link.**

- **Send your whole setup in one link.** Copy a link that carries the script, payload, variables, headers and query params — one request or the entire workspace. Whoever opens it gets an identical setup and can press Run, instead of a snippet they have to rebuild. The blob rides in the URL fragment, which browsers never send to a server, so nothing is uploaded to create a link. Paste one back under **Import → From share link** (`⌘⇧I`). Anything backed by a file on your disk can't travel inside a link, so the copy confirmation names it rather than dropping it silently, and a payload too large to survive chat clients points you at the Playground zip export instead.
- **Output and input options finally autocomplete.** Typing after `output application/json ` now suggests the real reader and writer options for all 16 formats — including `skipNullOn`, which was previously undiscoverable — correctly split between the ones that apply to reading input and writing output. They're generated from MuleSoft's docs and cross-checked against the engine's own list of valid options.
- **Lambda parameters know what they're iterating.** In `payload.items map ((item) -> item.` the suggestions are now that element's own fields, instead of nothing.
- **89 official cookbook recipes, every one verified.** MuleSoft's cookbook examples are now in the recipe browser. Each was executed against the bundled engine and kept only if it actually runs, with the engine's real output as the expected result — so nothing you open is a broken snippet. Opening a recipe now seeds its variables too; previously some opened as scripts that couldn't compile.
- **Compare: ignore `doc:id` and UUID noise.** Anypoint Studio stamps a fresh `doc:id` on every element it touches, so two functionally identical flows diff as almost entirely different and the real change is lost. The new **Ignore IDs** toggle blanks `doc:id` and UUID values on both sides before diffing. It masks a copy rather than the text you pasted, and the panes go read-only while it's on so nothing can overwrite your content.

## 1.3.1 — 2026-08-06

**Your data, in any language.**

- **Non-English text no longer comes back as “?”.** Hindi, Chinese, Arabic, Japanese, emoji and accented characters now survive a transform intact. Previously the engine wrote its result using your system’s default character set, silently replacing anything it couldn’t represent with `?` — and reported success, so there was no way to tell the data was wrong. This affected every transform, in both the editor and the MCP tools.
- **Java tester reads your sources as UTF-8.** Compiling a `.java` file containing non-English string literals or comments now works instead of failing or mangling them.
- **Secure properties tells you when it can’t encrypt a value.** Windows can’t pass non-English characters through to the encryption tool, so it would encrypt `?` instead of what you typed. The tool now flags this while you type rather than handing you a wrong secret.

## 1.3.0 — 2026-07-19

**The Workspace Manager.**

- **See inside a workspace before opening it.** The ⌘O dialog is now a full Workspace Manager: hover any workspace and a live preview shows its requests (color-coded by type — Transform, Salesforce, Database), flows, and when it was last saved. No more opening three workspaces to find the right one.
- **Rename, duplicate, delete — without opening.** Manage saved workspaces directly from ⌘O: `F2` renames in place, `⌘D` duplicates, `Del` deletes (with confirmation), and pinning keeps your go-to workspaces at the top. Everything works from the keyboard; pins stay in sync with the sidebar.
- **Search looks inside workspaces.** The ⌘O search matches request names too — type “invoice” and find the workspace containing your “Invoice lookup” request, even if the workspace is named something else.
- **Enter can accept suggestions again — your choice.** A new **Settings → Editor → “Enter accepts suggestion”** toggle: when on, Enter inserts the highlighted autocomplete instead of a line break. Off by default; Tab always accepts either way. Applies to every editor in the app.
- **Switching can’t lose your work.** Opening another workspace (or starting a new one) with unsaved changes now asks first — save and switch, discard, or stay. Previously one click could silently throw away edits.
- **Request types at a glance.** Sidebar request rows now carry the same type colors as the Flow designer, and workspaces with flows are labeled in every list.

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
