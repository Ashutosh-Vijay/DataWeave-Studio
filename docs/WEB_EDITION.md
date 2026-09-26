# DataWeave Studio — Web Edition (WebAssembly)

*DataWeave Studio is by Ashutosh Vijay. The Web Edition (WebAssembly build
and GitHub Pages deployment) was contributed by Venkatesh Omkaram.*

The Web Edition runs DataWeave Studio entirely in the browser. The real
MuleSoft DataWeave engine (2.12.2) is compiled to WebAssembly with GraalVM Web
Image, and the existing React/Monaco UI is built as a static site. It needs no
server, no Java install and no MuleSoft cloud playground: scripts, payloads and
outputs never leave the browser. The site can be hosted on any static host,
including GitHub Pages.

- [How to run it](#how-to-run-it)
- [How it works](#how-it-works)
- [What was changed](#what-was-changed)
- [How it was built: steps and roadblocks](#how-it-was-built-steps-and-roadblocks)
- [Limitations](#limitations)

---

## How to run it

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22+ | Same as the other workflows in this repo. |
| Oracle GraalVM | JDK 25 | **Oracle** GraalVM, not Community: only Oracle GraalVM ships Web Image (`native-image --tool:svm-wasm`). Point `JAVA_HOME` at it. Download: https://www.graalvm.org/downloads/ |
| Maven | 3.9+ | Builds `dw-server/target/dwstudio-server.jar`. |
| binaryen | 119+ (133 tested) | Web Image calls its `wasm-as`, which must be on `PATH`. macOS: `brew install binaryen`. Others: https://github.com/WebAssembly/binaryen/releases |

Everything below works the same on Linux, macOS and Windows.

### Set up GraalVM

GraalVM doesn't need installing: unpack it anywhere and point `JAVA_HOME` at
it. The commands below unpack it into `.tools/` in the repo, which is
gitignored. Run them from the repo root.

**macOS (Apple Silicon)**. For an Intel Mac, replace `aarch64` with `x64`.

```bash
mkdir -p .tools && cd .tools
curl -LO https://download.oracle.com/graalvm/25/latest/graalvm-jdk-25_macos-aarch64_bin.tar.gz
tar xzf graalvm-jdk-25_macos-aarch64_bin.tar.gz && rm graalvm-jdk-25_macos-aarch64_bin.tar.gz
cd ..
export JAVA_HOME="$(echo "$PWD"/.tools/graalvm-jdk-25*/Contents/Home)"
```

**Linux (x64)**

```bash
mkdir -p .tools && cd .tools
curl -LO https://download.oracle.com/graalvm/25/latest/graalvm-jdk-25_linux-x64_bin.tar.gz
tar xzf graalvm-jdk-25_linux-x64_bin.tar.gz && rm graalvm-jdk-25_linux-x64_bin.tar.gz
cd ..
export JAVA_HOME="$(echo "$PWD"/.tools/graalvm-jdk-25*)"
```

**Windows (x64, PowerShell)**

```powershell
New-Item -ItemType Directory -Force .tools | Out-Null
Invoke-WebRequest https://download.oracle.com/graalvm/25/latest/graalvm-jdk-25_windows-x64_bin.zip -OutFile .tools\graalvm.zip
Expand-Archive .tools\graalvm.zip .tools; Remove-Item .tools\graalvm.zip
$env:JAVA_HOME = (Get-ChildItem .tools -Directory -Filter 'graalvm-jdk-25*').FullName
```

The unpacked folder name includes the exact version (for example
`graalvm-jdk-25.0.4+7.1`), so the commands above find it with a wildcard.
`JAVA_HOME` only lasts for the current terminal session, so set it again in
each new terminal you build from.

If your default Maven settings (`~/.m2/settings.xml`) point at a slow or
unreachable mirror, give the build an empty settings file so Maven uses Maven
Central instead:

```bash
echo '<settings/>' > .tools/settings-public.xml
export MVN_SETTINGS=.tools/settings-public.xml
```

### Build and run locally

With `JAVA_HOME` set as above:

```bash
npm ci

# 1. Compile the DataWeave engine to WebAssembly (about 2–4 minutes).
#    Builds dw-server/target/dwstudio-server.jar, then
#    web-wasm/target/dwengine.js and dwengine.js.wasm.
npm run build:wasm

# 2. Check the engine (runs in Node, prints PASS/FAIL per case).
node web-wasm/smoke-test.cjs

# 3a. Develop: UI with hot reload, engine served from web-wasm/target.
npm run dev:web            # http://localhost:1430/

# 3b. Or build the static site and serve it the way a host would.
npm run build:web          # output: dist-web/
npm run preview:web        # http://localhost:1430/
```

Environment variables for `npm run build:wasm`:

| Variable | Effect |
|---|---|
| `SKIP_MVN=1` | Reuse the existing `dw-server/target/dwstudio-server.jar` instead of running Maven. Use it when only `web-wasm/src` changed. |
| `NATIVE_IMAGE_ARGS=-Ob` | native-image quick build mode: faster build, somewhat larger and slower engine. Fine for local work. |
| `MVN_OFFLINE=1` | Run Maven offline (`mvn -o`). |
| `MVN_SETTINGS=<file>` | Use a different Maven settings file (`mvn -s`). Useful when your default Maven settings point at a slow mirror. |

`dist-web/` has to be served over HTTP. Opening `index.html` from disk
(`file://`) does not work, because browsers won't load WebAssembly from `file://`.

### Publish to GitHub Pages

The workflow `.github/workflows/pages.yml` builds and deploys on every push to
`main`, and can also be started by hand from the Actions tab.

1. Push the code to your own repository (a fork).
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The site appears at `https://<user>.github.io/<repo>/`.

The workflow builds and smoke-tests the engine on Linux, macOS and Windows,
and deploys only if all three pass. The macOS and Windows runs use quick mode
(`-Ob`) because their only job is to prove the build is portable. The Linux
build, fully optimised, is what gets published.

No `index.html` needs to be written by hand. Vite generates it, and every path
in it is relative (`base: './'`), so the site works under any sub-path.

### Where the engine file comes from, and what visitors download

The engine (`dwengine.js.wasm`, about 60 MB) is **never committed to git**.
The Actions run compiles it from source on each push to `main`, zips it with
the rest of `dist-web/`, and uploads that to Pages with `upload-pages-artifact`.
Pages serves that upload, not files from the repository. This keeps the repo
small and avoids GitHub's 50 MB file warning and 100 MB file limit.

The engine is built **once per deploy, never per visit**. For a visitor:

1. The browser downloads `index.html` and the UI (a few MB), and the page appears.
2. A Web Worker downloads the engine file and starts it. The status bar reads
   **Ready DW 2.12.2…** when it is done.
3. Every Run after that executes locally in a few milliseconds, with no network
   traffic.

The browser caches the engine file, so later visits reuse the cached copy. It
is downloaded again only after a new deploy or if the visitor clears their
cache. The engine is restarted from that copy on every page load, which takes
a moment but involves no download.

The fonts (Inter, JetBrains Mono) are still loaded from Google Fonts by
`index.html`. That is the only external request, and it carries no user data.

### Browser support

The engine uses WebAssembly garbage collection and exception handling, so it
needs a current browser: recent Chrome, Edge, Firefox or Safari.

---

## How it works

The UI talks to its backend through one function, `invoke(cmd, args)` in
`src/bridge.ts`. Before this work there were two backends:

- **Desktop (Tauri):** Rust starts the Java `dwstudio-server.jar` and talks to it
  as newline-delimited JSON over stdin and stdout.
- **VS Code extension:** Node starts the same JAR with a bundled JRE 17.

The browser can't start a JVM, so the Web Edition adds a third route that runs
the **same JAR code**, compiled to WebAssembly:

```
React UI ──invoke()──► src/bridge.ts
                          ├─ Tauri        → Rust → java -jar dwstudio-server.jar
                          ├─ VS Code      → Node → java -jar dwstudio-server.jar
                          └─ plain browser → src/webBackend.ts
                                               └─ Web Worker: wasm/dwengine.js(.wasm)
                                                    = WasmMain + DwServer + DataWeave 2.12.2
```

- `web-wasm/src/com/dwstudio/WasmMain.java` is the WebAssembly entry point. It
  accepts the same JSON requests as the JAR's stdin loop and hands them to the
  unchanged `DwServer.handleRequest`. A browser has no files to pass the engine
  by path, so inputs arrive inline (`payloadContent`, `payloadBase64`,
  `varsContent`, `namedInputs[].content` and so on). `WasmMain` writes them to
  the in-memory filesystem that Web Image provides and substitutes the paths
  `DwServer` expects.
- `src/webBackend.ts` implements the UI's commands for the browser. It runs the
  engine in a Web Worker so the UI stays responsive, and replaces a stuck
  worker on timeout. Files open through a file picker and save as downloads.
  Workspaces and modules persist in `localStorage`. It is a port of the VS Code
  host logic (`dwHost.ts`, `workspaceStore.ts`).
- `vite.config.web.ts` builds the UI with the existing `src/shims/*` in place of
  the Tauri plugins, and copies the engine into `dist-web/wasm/`.

Performance, measured locally: the first run after load takes about 250 ms,
and later runs take 5–10 ms.

### What the 60 MB engine file is (and isn't)

`dwengine.js.wasm` is **not a virtual machine**, and it isn't a JVM running
inside the browser. It is the DataWeave engine itself, already compiled to
WebAssembly, the low-level code format that every modern browser runs natively.

The desktop app keeps the engine and the machine that runs it separate:

| | Desktop / VS Code | Web Edition |
|---|---|---|
| What ships | A Java runtime (JVM) plus `dwstudio-server.jar` (64 MB of Java/Scala bytecode) | `dwengine.js.wasm` (60 MB) plus `dwengine.js` (0.1 MB launcher) |
| When the code is compiled | At runtime: the JVM interprets the bytecode and compiles hot parts on the fly | At build time, once, by GraalVM |
| What runs it | The JVM | The browser |

GraalVM Web Image does at build time what the JVM would do at runtime:

1. **Reachability analysis.** Starting from `WasmMain`, it follows every method
   call to find exactly which code can ever run: the studio's server code,
   MuleSoft's DataWeave runtime, the Scala library, and the parts of the Java
   standard library they use. For this project that is about 149,000 methods
   in 23,000 classes. Everything else is dropped.
2. **Ahead-of-time compilation.** It compiles that code straight to WebAssembly.
3. **Resources.** It bakes in the files the engine reads at runtime, such as
   DataWeave's built-in `.dwl` modules, into the program as class-path
   resources.

The result is a finished program, closer to an `.exe` than to a JVM. It
contains no bytecode interpreter and no just-in-time compiler, and it can't
load new Java classes at runtime (which is why the Java tester and custom JARs
are unavailable). Memory is reclaimed by the browser's own garbage collector,
which WebAssembly now exposes (WebAssembly GC). `dwengine.js` is the small
JavaScript launcher that fetches the `.wasm`, connects it to the page, and
answers the UI's messages in a Web Worker.

**Why 60 MB?** The DataWeave runtime is large: `dwstudio-server.jar` is 64 MB
compressed and 160 MB unpacked, across about 30,000 files. The engine keeps only
the reachable code, so it ends up slightly smaller than the JAR, and about
22 MB when compressed for download. For comparison, the desktop app ships that
JAR *and* a full Java runtime.

---

## What was changed

The goal was to change as little of the existing code as possible. The
desktop app and the VS Code extension behave exactly as before.

**Existing files (small edits):**

| File | Change |
|---|---|
| `dw-server/src/main/scala/com/dwstudio/DwServer.scala` | `createEngine` and `handleRequest` changed from `private` to `private[dwstudio]` so `WasmMain` can call them. Added the flag `bindInputsAsBytes` (default `false`), under which inputs are bound as bytes rather than files. |
| `src/bridge.ts` | Adds `isVsCode` and `isWeb`, and routes `invoke` to `webBackend.ts` in a plain browser. |
| `src/ThemeContext.tsx`, `src/main.tsx` | Test for "running in VS Code" explicitly instead of assuming "not Tauri means VS Code". |
| `package.json` | Scripts `build:wasm`, `dev:web`, `build:web`, `preview:web`. |
| `.gitignore` | Ignores `web-wasm/target/`, `dist-web/` and `.tools/`. |

**New files:**

| File | Purpose |
|---|---|
| `web-wasm/src/com/dwstudio/WasmMain.java` | WebAssembly entry point and Web Worker message handler. |
| `web-wasm/build.mjs` | Cross-platform build: Maven, then javac, then reflection config, then `native-image --tool:svm-wasm`. |
| `web-wasm/smoke-test.cjs` | Loads the engine in Node and runs 8 checks: JSON, CSV→XML with vars, format, compile error, YAML, completion, secure-properties round trip, and the traced parse error. |
| `src/webBackend.ts` | Browser implementation of the command surface. |
| `vite.config.web.ts` | Static-site build config. |
| `.github/workflows/pages.yml` | Build on three OSes, then deploy to GitHub Pages. |

---

## How it was built: steps and roadblocks

### 1. Finding the approach

DataWeave Studio doesn't carry its own DataWeave implementation. It drives
MuleSoft's JVM DataWeave runtime inside `dwstudio-server.jar`, and "no Java
install required" only means the desktop and VS Code builds bundle a JRE. A
browser can't run a JRE, so there were two options:

- **Call MuleSoft's online playground.** Rejected: data would leave the browser,
  and the whole point is that the studio is self-contained.
- **Compile the JVM code itself to WebAssembly.** This is what was done, with
  **GraalVM Web Image**. It compiles the existing server JAR and the DataWeave
  runtime ahead of time into one `.wasm` file, so the engine code is unchanged.

The VS Code extension showed where to cut in. Its UI is the same React app, and
it only swaps `invoke()` for a message channel. A browser build swaps it once
more, for the worker.

### 2. Getting a toolchain

| Roadblock | Fix |
|---|---|
| No JDK on the machine. | Downloaded Oracle GraalVM 25 into `.tools/` (gitignored) without installing anything system-wide. |
| The Maven build crawled at 1–23 kB/s. | The machine's default Maven settings sent downloads through a slow mirror. The build used a separate empty settings file (`MVN_SETTINGS`), which falls back to Maven Central, and left the default settings untouched. |
| `javac --release 25` failed with *module not found: org.graalvm.webimage.api*. | The Web Image JavaScript interop API is a GraalVM JDK module, and `--release` hides JDK-specific modules. Dropped `--release` and kept `--add-modules org.graalvm.webimage.api`. |
| The local checkout path contained a space, which broke the bash build script's unquoted arguments. | Quoted everything. The script was later rewritten in Node (step 7), which removes the problem. |

### 3. First WebAssembly engine

`native-image --tool:svm-wasm` compiled `WasmMain` together with the server
JAR into `dwengine.js` plus `dwengine.js.wasm` in about 2 minutes (quick mode).

| Roadblock | Fix |
|---|---|
| Node refused to load `dwengine.js`: the repo's `"type": "module"` makes Node treat `.js` as an ES module, and the Web Image launcher is a classic script. | The smoke test copies it to `dwengine.cjs` and places the `.wasm` next to it. Browsers load it as a classic worker script, so they are unaffected. |
| Every transform failed with `ExceptionInInitializerError`, then `NoClassDefFoundError: RandomAccessFile`. Web Image prints no stack traces, so the cause had to be found with temporary diagnostics. | The root cause was `UnsupportedOperationException: RandomAccessFile.initIDs`: Web Image has no `RandomAccessFile`, and DataWeave reads file-backed inputs through it. Added `DwServer.bindInputsAsBytes`, which `WasmMain` switches on, so inputs are bound as byte arrays. That code path already existed for debug runs. The temporary diagnostics were removed. |
| The Secure Properties tool failed with `NoSuchMethodException` on `org.mule.encryption.jce.JCEEncrypter.encrypt`. | `DwServer` loads `secure-properties-tool.jar` through reflection, and ahead-of-time compilation only keeps reflected code it is told about. The build generates a reflection config covering every class under `com/mulesoft` and `org/mule/encryption` in that JAR. |
| The completion test failed. | The test itself was wrong: it used cursor offset 31 instead of 39. |

With those fixes, JSON, CSV, XML and YAML transforms, formatting, compile
errors, completion and secure properties all worked in Node.

### 4. Browser backend and UI

- Ported the VS Code host's run logic (`buildFullScript`, error-location
  parsing, multipart bodies, inputs) into `src/webBackend.ts`, running the
  engine in a Web Worker.
- Replaced disk access with browser equivalents: a file picker for opening,
  downloads for saving, and `localStorage` for workspaces and modules.
- Added the `isWeb` route in `bridge.ts`, and fixed two places that assumed
  "not Tauri" meant "VS Code".
- Created `vite.config.web.ts`. The Tauri plugins are aliased to the existing
  shims, so no UI component had to change.

A pre-existing test failure (`openApiReader.test.ts`) turned out to depend on a
gitignored example file. Running with the changes stashed confirmed it has
nothing to do with this work.

### 5. Testing in the browser

The production build at `http://localhost:1430/` loaded, showed **Ready DW
2.12.2**, and ran transforms in 8–22 ms, with the value trace panel populated.
A `groupBy`/`mapObject` script produced the correct output.

| Roadblock | Fix |
|---|---|
| Automated typing into the Monaco editors kept missing, and left a malformed payload (`{ [...]d" }`) in the payload editor. | Tested instead by sending the UI's exact requests to the engine worker from the page. The user also fixed the payload by hand. |
| That malformed payload produced **"Unable to parse empty input"** rather than the real error, `Unexpected character '[' at payload@[2:1]`. | Reproduced it on the desktop JVM, so it is not specific to WebAssembly. With the value trace on, the trace listener reads each input first. When that read fails it swallows the error by design, and the script's second read of the same bytes reports "empty input". Desktop debug runs, which also bind bytes, have the same quirk. It was fixed in `WasmMain` only, leaving the shared code alone: when a traced run fails, it reruns once without tracing and reports that error, keeping the trace rows. A smoke test now covers it. |

Several other checks turned out not to be bugs. Inputs such as `[1,2` parse as
`[1, 2]`, and trailing junk after a JSON value is ignored, identically on the
JVM. That is DataWeave's own behaviour.

### 6. Hosting on GitHub Pages

`dist-web/` is a complete static site with relative paths. Deployment uses
GitHub Actions rather than committing the build to a branch, because the
engine file is large (see
[where the engine file comes from](#where-the-engine-file-comes-from-and-what-visitors-download)).

### 7. Removing OS dependencies

The first build script was bash and used `unzip`, `grep`, `sed`, `awk` and a
`:` classpath separator, none of which work on Windows. It was replaced by
`web-wasm/build.mjs`:

- The classpath is joined with `path.delimiter` (`;` on Windows, `:` elsewhere).
- The JAR is listed with the JDK's own `jar tf` instead of `unzip`, and the
  filtering happens in JavaScript.
- On Windows it calls `javac.exe`, `jar.exe`, `native-image.cmd` and `mvn.cmd`.
  The `.cmd` files run through a shell with their arguments quoted, which
  protects the `|` characters in the resource regex from `cmd.exe`.
- The smoke test copies the engine file instead of symlinking it, since
  symlinks need admin rights on Windows.

The Pages workflow builds on Linux, macOS and Windows on every push, so any
platform-specific step that creeps in fails the build.

---

## Limitations

These features need a real JVM, operating system processes or network ports,
so they are disabled in the browser build and say so when used:

- **Java tester and custom JARs:** loading user Java classes at runtime is impossible in an ahead-of-time compiled engine.
- **MCP server and local HTTP API:** a web page can't open a listening port.

Other differences:

- **Debugger:** untested in the browser. The desktop debugger pauses the script on a separate thread, and Web Image is single-threaded, so expect it not to work.
- **Saved secure-properties keys** are held in memory only and are lost on reload. This is deliberate: keys are never written to `localStorage`.
- **Files and folders:** single files open through the browser's file picker, and saves become downloads. Picking whole folders (Mule projects) isn't supported.
- **Workspaces** live in the browser's `localStorage`, per browser and per site. Clearing site data deletes them.
- **Engine size:** about 60 MB, cached after the first download.
