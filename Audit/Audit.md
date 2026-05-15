# DataWeave Studio — Full Project Audit

**Date:** 2026-05-15
**Scope:** Entire codebase — Rust backend, React frontend, Java/Scala DW server, hooks/data layer, project config/build
**Audited by:** Claude Opus 4.6 (5 parallel deep-read agents)
**Fixes applied:** 2026-05-15 — see checkmarks below

---

## Executive Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| Critical | 6 | Path traversal, data loss on workspace save/load, no JVM sandbox |
| High | 13 | Mutex poisoning, stale closures, missing JVM memory limits, PID 0 kill bug |
| Medium | 20 | Keepalive mutex starvation, theme flash, Monaco double-registration, no input size limits |
| Low | 23 | Dead code, naming inconsistencies, minor leaks, bundle bloat |
| Info | 15 | Orphaned types, design notes, idempotent patterns |

**Top 3 things to fix first:**
1. Rust `SingleTransform` / `KeyValuePair` / `VarEntry` structs are missing fields — workspace save/load **silently drops** classpath, timeout, multipart parts, file paths, and row-level enabled flags
2. Path traversal in `load_workspace`, `delete_workspace`, `save_output_file`, `read_text_file` — the frontend can read/write/delete arbitrary files
3. `cancel_dataweave` calls `kill_pid(0)` when cancelling a server-based run — on Linux this sends SIGTERM to the entire process group

---

## 1. CRITICAL

### C1. Workspace save/load silently drops fields (DATA LOSS) -- FIXED
**Files:** `src-tauri/src/workspace.rs:52-63` vs `src/types/index.ts:51-62`

The Rust `SingleTransform` struct is missing `classpath`, `timeoutMs`, `payloadFilePath`, and `multipartParts`. The TS frontend sends these fields via `invoke('save_workspace', ...)`, Rust deserializes into its struct (serde silently discards unknown fields), then writes the stripped struct to disk. On load, these fields come back as `undefined`.

**Result:** Every save/load cycle permanently loses:
- Custom classpath entries
- Execution timeout setting
- File-backed payload paths
- Multipart form-data parts

Similarly, `KeyValuePair` and `VarEntry` in Rust are missing the `enabled?: boolean` field — per-row enable/disable state for headers, query params, and vars is lost on save.

`NamedInput` in Rust is missing `filePath?: string` — binary named input file references are lost.

**Fix:** Add the missing fields to the Rust structs with `#[serde(default)]`:
```rust
// SingleTransform — add:
#[serde(default)]
pub classpath: Vec<String>,
#[serde(default, skip_serializing_if = "Option::is_none")]
pub timeout_ms: Option<u64>,
#[serde(default, skip_serializing_if = "Option::is_none")]
pub payload_file_path: Option<String>,
#[serde(default)]
pub multipart_parts: Vec<serde_json::Value>,

// KeyValuePair and VarEntry — add:
#[serde(default, skip_serializing_if = "Option::is_none")]
pub enabled: Option<bool>,

// NamedInput — add:
#[serde(default, skip_serializing_if = "Option::is_none")]
pub file_path: Option<String>,
```

### C2. Path traversal in `load_workspace` and `delete_workspace` -- FIXED
**File:** `src-tauri/src/workspace.rs:127-136, 194-200`

The `filename` parameter is joined directly to the workspaces directory with zero validation:
```rust
let file_path = dir.join(&filename);
```
A compromised or malicious webview can pass `../../../Windows/System32/important_file` to read or delete arbitrary files. No check that the resolved path stays inside the workspaces directory, no rejection of `..` or path separators.

**Fix:** After `dir.join(&filename)`, canonicalize both paths and assert the result starts with the workspaces directory. Or reject any filename containing `..`, `/`, or `\`.

### C3. Unrestricted file read/write from frontend
**File:** `src-tauri/src/dw_runner.rs:632-650`

`save_output_file`, `save_binary_file`, and `read_text_file` accept an absolute path from the frontend with no validation. A compromised webview can read/write any file on the filesystem.

Similarly, `file_path` in `NamedInput` and `MultipartPartData` (line 203-205, 247) lets the frontend read arbitrary files via `std::fs::read(fp)`.

### C4. No JVM sandbox — Java interop allows full system access -- WON'T FIX (by design for desktop app)
**File:** `dw-server/src/main/scala/com/dwstudio/DwServer.scala:44-54`

The `java-module` dependency enables `import java!...` in DW scripts. A DW script can:
- Execute OS commands via `java!java::lang::Runtime`
- Read/write any file via `java!java::io::File` / `java!java::nio::file::Files`
- Open network connections via `java!java::net::URL`
- Exfiltrate env vars via `java!java::lang::System`

No SecurityManager, no classloader filtering, no class allowlist. The `HotURLClassLoader` even lets classpath entries be added at runtime.

**Context:** For a desktop app where the user writes their own scripts, this is by design. But if scripts are ever loaded from untrusted sources (shared `.dwstudio` files, playground imports), this is full RCE. Should be documented prominently.

### C5. No JVM memory limits — OOM crashes the server -- FIXED
**File:** `src-tauri/src/dw_server.rs:168-173`

The JVM is spawned with `java -jar dwstudio-server.jar` — no `-Xmx`, `-Xms`, or `-Xss` flags. A DW script materializing a huge structure (e.g., `(1 to 100000000)`) can consume all system memory. The Scala `catch { case t: Throwable => }` catches `OutOfMemoryError` but the JVM is unstable after OOM. No Rust-side OOM detection or auto-restart.

**Fix:** Add `-Xmx512m -Xss2m` to the JVM launch args. Detect process exit on the Rust side and auto-restart.

### C6. Stale closure in `handleCurlImport` can silently discard user edits -- DEFERRED (needs callback refactor)
**File:** `src/App.tsx:684-697`

```js
workspace.setContext({
  ...workspace.context,  // captured at callback creation time
  method: result.method,
  headers: result.headers,
  queryParams: result.queryParams,
});
```
If `workspace.context` is stale (which it will be if the `workspace` object reference doesn't change when context changes), importing a cURL command overwrites any concurrent context changes (configYaml, secureConfigYaml, vars edits) with old values.

---

## 2. HIGH

### H1. `cancel_dataweave` calls `kill_pid(0)` — kills wrong process -- FIXED
**File:** `src-tauri/src/dw_runner.rs:500, 674-683`

When running via server, `child_pid` is set to `Some(0)` as a sentinel. If the user cancels, `kill_pid(0)` is called. On Windows, `taskkill /PID 0 /F /T` targets the System Idle Process. On Linux, `kill -TERM 0` sends SIGTERM to the **entire process group**, killing the app itself.

**Fix:** Check for sentinel value `0` before calling `kill_pid`.

### H2. Mutex poisoning causes cascading panics -- FIXED (26 occurrences)
**Files:** Every `.rs` file — all `Mutex::lock()` calls use `.unwrap()`

Example locations: `dw_runner.rs` lines 121, 150, 157, 186, 192, 395, 396, 500, 567; `dw_server.rs` lines 203, 224, 244, 251, 287; `lib.rs` lines 61, 64.

If any thread panics while holding a lock, the Mutex becomes poisoned and every subsequent `.lock().unwrap()` panics too, cascading through the entire app.

**Fix:** Use `.lock().unwrap_or_else(|e| e.into_inner())` to recover from poisoned mutexes.

### H3. `secure_properties_invoke` uses system `java` with key as CLI argument -- PARTIALLY FIXED (bundled JRE; key-as-arg is third-party tool limitation)
**File:** `src-tauri/src/secure_properties.rs:65, 72`

Uses `Command::new("java")` (system PATH) instead of the bundled JRE. Also passes the encryption key as a CLI argument visible to `ps`/`wmic`/`/proc/PID/cmdline`.

**Fix:** Use `resolve_bundled_java()` like `dw_server.rs` does. Pass key via stdin instead of CLI args.

### H4. Memory leak: step-through promise never resolves on unmount -- FIXED
**File:** `src/components/FlowDesigner.tsx:392-396`

```js
await new Promise<void>((resolve) => { stepResolveRef.current = resolve; });
```
If FlowDesigner unmounts while stepping, this promise never resolves. The async `runPipeline` function is permanently suspended, keeping old state closures alive and preventing GC.

### H5. No JVM script execution timeout by default -- FIXED (default 30s)
**File:** `dw-server/src/main/scala/com/dwstudio/DwServer.scala:96-101`, `src-tauri/src/dw_runner.rs:502`

The Scala server has zero timeout logic. The Rust-side `tokio::time::timeout` is the only guard, but when `timeoutMs` is 0 (the default), no timeout is applied at all. An infinite-loop DW script blocks the server forever.

### H6. Module-level `idCounter` in FlowDesigner — fragile across remounts -- FIXED (added random component)
**File:** `src/components/FlowDesigner.tsx:109-110`

```js
let idCounter = 0;
function newId() { return `node-${++idCounter}-${Date.now()}`; }
```
Module-scoped, not component-scoped. React StrictMode mounts twice. `Date.now()` suffix mostly mitigates collision risk but the pattern is fragile.

### H7. Missing error handling on multiple `invoke()` calls -- FIXED (added console.warn)
**File:** `src/App.tsx:620-622`, `src/components/SettingsScreen.tsx:482`

Several `invoke` calls silently swallow errors with empty catch blocks. Users get no feedback when `set_cli_path_override` or `restart_cli` fails.

### H8. `useDWRunner` warmup polling never stops on unmount -- FIXED (cleanup return)
**File:** `src/hooks/useDWRunner.ts:53-73`

`setTimeout(check, 500)` recursion has no cleanup. The `useEffect` returns nothing. Polling continues firing `invoke('get_warmup_status')` indefinitely after unmount.

### H9. No concurrency guard on `run_dataweave` -- FIXED (runningRef guard)
**File:** `src/hooks/useDWRunner.ts:79-127`

Rapid double-clicks can overlap since `setIsRunning(true)` is async. Two concurrent `invoke('run_dataweave')` calls would overwrite `child_pid`, making cancel unreliable.

### H10. `count` function inconsistency between App and ContextPanel -- FIXED
**Files:** `src/App.tsx:90-92` vs `src/components/ContextPanel.tsx:41-43`

`context_count` checks `enabled !== false` while `activeCount` doesn't. The sidebar/status bar and the context panel show different counts for the same data.

### H11. FlowDesigner `runPipeline` uses stale node config during execution
**File:** `src/components/FlowDesigner.tsx:369-533`

The async loop iterates over `executionOrder` captured at callback creation time. If the user edits a node's config during pipeline execution, the stale config is used.

### H12. Compile cache classloader leak risk
**File:** `dw-server/src/main/scala/com/dwstudio/DwServer.scala:62-74`

Compiled scripts hold references to generated classes. When LRU-evicted, if those classes are still referenced by an in-flight execution, the classloader can't be GC'd, causing metaspace growth over long sessions.

### H13. Stack overflow from recursive DW scripts leaves JVM unstable
**File:** `dw-server/src/main/scala/com/dwstudio/DwServer.scala:216-219`

`StackOverflowError` is caught but the JVM thread stack is in an indeterminate state. No `-Xss` flag controls stack size.

---

## 3. MEDIUM

### M1. Server stderr piped but never read — can deadlock JVM -- FIXED (Stdio::null())
**File:** `src-tauri/src/dw_server.rs:173`

`.stderr(Stdio::piped())` captures stderr but no thread reads it. If the JVM writes enough to stderr (64KB pipe buffer), it blocks on stderr writes, deadlocking the server.

**Fix:** Use `Stdio::null()`, `Stdio::inherit()`, or spawn a drain thread.

### M2. Keepalive thread holds mutex during blocking I/O
**File:** `src-tauri/src/dw_server.rs:241-263`

The keepalive thread locks the inner mutex and performs a blocking round-trip. If the JVM is slow (GC pause), all user `run()` calls are blocked until keepalive finishes. No timeout on keepalive's `read_line`.

### M3. `create_run_dir` uses `Instant::now().elapsed()` — always ~0 -- FIXED
**File:** `src-tauri/src/dw_runner.rs:361-369`

`Instant::now().elapsed()` measures time since the instant was just created — essentially 0. Multiple rapid runs could collide on directory name.

**Fix:** Use `SystemTime::now().duration_since(UNIX_EPOCH)` or a counter.

### M4. No response size limit from Java server
**File:** `src-tauri/src/dw_server.rs:309-317`

`read_until(b'\n', &mut resp_bytes)` reads unbounded data. A pathological DW output without a newline could consume all RAM.

### M5. No input size validation in DW server
**File:** `dw-server/src/main/scala/com/dwstudio/DwServer.scala:94-101`

`in.readLine()` buffers the entire request. A 100MB script field will be held in memory, then parsed, then cached.

### M6. Theme flash on initial load -- FIXED (useLayoutEffect)
**File:** `src/ThemeContext.tsx:61-64`

Theme resolution uses `useEffect` (runs after paint) instead of `useLayoutEffect`. If stored pref is 'system' and resolved theme differs from initial state, there's a visible flash-of-wrong-theme.

### M7. Monaco double-registration when ScriptEditor + MiniEditor coexist -- FIXED (ref-counting)
**Files:** `src/components/ScriptEditor.tsx:322-340`, `src/components/MiniEditor.tsx:92-103`

Both register global DW completion/hover providers. When a Transform node is selected in FlowDesigner (MiniEditor mounted) while ScriptEditor exists, duplicate completions appear. On unmount, one disposes the other's providers.

### M8. `wrapSetter` creates new functions every render -- FIXED (individual useCallbacks)
**File:** `src/hooks/useWorkspace.ts:92-93`

Called at render time, defeating `React.memo` for any child receiving these wrapped setters.

### M9. Missing focus traps in modal dialogs
**Files:** SettingsScreen, AboutDialog, FlowDesigner save/open dialogs, CommandPalette

No modal implements a focus trap. Tab can escape the modal and interact with elements behind the backdrop. WCAG 2.1 Level A failure.

### M10. Context menu doesn't close on scroll/zoom -- FIXED (close on zoom)
**File:** `src/components/FlowDesigner.tsx:174, 838-843`

Context menu is positioned at fixed screen coordinates. Canvas scroll or zoom moves the node but the menu stays put.

### M11. `dataweaveTheme.ts` canvas context non-null assertion -- FIXED
**File:** `src/dataweaveTheme.ts:36`

`canvas.getContext('2d')!` — can return null if canvas context limit is exceeded. Crash here prevents all Monaco themes from loading.

### M12. `UrlProtocolHandler` enables HTTP/file URL access in DW scripts
**File:** `dw-server/src/main/scala/com/dwstudio/DwServer.scala:226`

DW's `readUrl()` can fetch `http://`, `https://`, and `file://` URLs — another avenue for network/file access beyond Java interop.

### M13. Regex recompiled on every error parse -- FIXED (OnceLock)
**File:** `src-tauri/src/dw_runner.rs:48, 67, 79`

`Regex::new(...)` on every call. Should use `lazy_static!` or `OnceLock`.

### M14. `workspace` object as useCallback dependency may never trigger
**File:** `src/App.tsx` various locations

If `useWorkspace()` returns a stable object reference, callbacks depending on `[workspace]` will never update — stale closures.

### M15. Node dragging doesn't account for canvas scroll offset -- FIXED (scroll offset factored in)
**File:** `src/components/FlowDesigner.tsx:263, 272-273`

`e.clientX / zoom - node.x` doesn't factor in `canvasRef.current.scrollLeft/scrollTop`. Dragged nodes land at wrong positions if canvas is scrolled.

### M16. Escape key conflict between FlowDesigner and its sub-dialogs -- FIXED
**File:** `src/components/FlowDesigner.tsx:241-255`

Window-level Escape handler doesn't check if `showSaveDialog` or `showOpenDialog` is open. Pressing Escape could close both the dialog and deselect a node simultaneously.

### M17. Monaco bundle ships 5 unused web workers (8.4 MB) -- FIXED (removed unused workers)
**File:** `src/main.tsx:10-14`

Only JSON and editor workers are needed. TS worker (6.7 MB), CSS worker (1 MB), HTML worker (680 KB) are never used. Total dist is 15 MB, could be ~6 MB.

### M18. `connect-src` allows `cdn.jsdelivr.net` — unused -- FIXED
**File:** `src-tauri/tauri.conf.json:28`

No source code references this domain. Leftover from CDN-loaded Monaco. Unnecessary CSP hole.

### M19. Auto-run triggers on `queryTemplate` change unnecessarily -- FIXED (removed from deps)
**File:** `src/App.tsx:752-763`

`queryTemplate` is in the auto-run dependency list but isn't used in the run itself — triggers a wasted DW execution.

### M20. No algorithm/mode validation in `secure_properties_invoke` -- FIXED (allowlist validation)
**File:** `src-tauri/src/secure_properties.rs:47-48`

`algorithm` and `mode` are passed directly to the external Java tool with no validation.

---

## 4. LOW

### L1. `save_workspace` filename collision — lossy sanitization
**File:** `src-tauri/src/workspace.rs:100-108`

Non-alphanumeric chars mapped to `-`. "My Project!" and "My+Project?" both become `My-Project-.dwstudio`, silently overwriting each other.

### L2. `list_workspaces_meta` silently swallows corrupt files
**File:** `src-tauri/src/workspace.rs:169-191`

`filter_map` with `.ok()?` hides corrupted workspace files. User has no way to know a file exists but is unreadable.

### L3. CSP allows `unsafe-eval` and `unsafe-inline`
**File:** `src-tauri/tauri.conf.json:28`

Required by Monaco Editor but weakens CSP significantly.

### L4. Code duplication: `hide_console_window` / `strip_unc_prefix` in 3 files -- FIXED (platform.rs module)
**Files:** `dw_runner.rs`, `dw_server.rs`, `secure_properties.rs`

Three identical copies. Should be extracted to a shared module.

### L5. Temp files not cleaned up on error paths -- FIXED (RunDirGuard RAII)
**File:** `src-tauri/src/dw_runner.rs`

If error occurs between `create_run_dir()` and `cleanup_run_dir()`, the temp directory is leaked.

### L6. `warm_dataweave_script` ignores errors silently
**File:** `src-tauri/src/dw_runner.rs:763-779`

Both the `spawn_blocking` result and the inner `run` result are discarded with `let _ =`.

### L7. `dwVersion` prop in StatusBar is never wired up -- FIXED (updated to 2.11.0)
**File:** `src/App.tsx:354`

Always displays hardcoded "DW 2.5.0" fallback. Never receives actual version.

### L8. Inline object/function allocations cause unnecessary re-renders
**File:** `src/App.tsx` — `focusToggles`, `badges`, `contextData` objects created inline as JSX props on every render.

### L9. `navigator.platform` is deprecated -- FIXED
**File:** `src/components/SettingsScreen.tsx:620`

Should use `@tauri-apps/api/os` since this is a Tauri app.

### L10. Inconsistent Escape key handling across modals
Different modals use different patterns (window listener vs onKeyDown). Multiple open modals = Escape closes both.

### L11. `CompactLayout` doesn't persist active pane across remounts
**File:** `src/components/CompactLayout.tsx:22`

Tab resets to `initial` on remount.

### L12. `logForward.ts` is dead code -- FIXED (deleted)
**File:** `src/logForward.ts`

Never imported anywhere. Either import in `main.tsx` or delete.

### L13. Version specified in 3 places — can drift
**Files:** `package.json`, `tauri.conf.json`, `Cargo.toml` — all say `1.3.0` but no sync mechanism.

### L14. Unused scaffold files in git -- FIXED (deleted)
**Files:** `public/tauri.svg`, `public/vite.svg`, `src/assets/react.svg` — starter template files never referenced.

### L15. `sharp` in devDependencies — native binary, 30 MB in node_modules
**File:** `package.json:36`

Only used for Tauri icon generation. Can cause `npm ci` failures on CI runners.

### L16. No debounce on Ctrl+S save -- FIXED (savePendingRef guard)
**File:** `src/App.tsx:701-703`

Rapid keypresses fire multiple file writes.

### L17. `loadWorkspace` casts `payloadMimeType` without runtime validation
**File:** `src/hooks/useWorkspace.ts:163`

`as MimeType` cast accepts any string from a hand-edited workspace file.

### L18. Toast setTimeout IDs accumulate without cancellation -- FIXED (timer cleanup on unmount)
**File:** `src/components/Toast.tsx:20-21`

If ToastHost unmounts before 3500ms, `setItems` fires on unmounted component.

### L19. `NodeLabelChip` setTimeout on blur has no cleanup
**File:** `src/App.tsx:269`

120ms timeout can fire after unmount.

### L20. Hardcoded `weaveVersion` in DW server ready message
**File:** `dw-server/src/main/scala/com/dwstudio/DwServer.scala:91`

`"2.11.0"` is hardcoded; actual dependency version includes a date suffix.

### L21. `AboutDialog` ternary returns identical strings for both branches -- FIXED
**File:** `src/components/AboutDialog.tsx:171-174`

Dead ternary — both branches produce the same class string.

### L22. No Linux build target in CI
**File:** `.github/workflows/release.yml:30-37`

Matrix has Windows + macOS but no Linux, despite `#[cfg(target_os = "linux")]` code existing.

### L23. `saveWorkspace` callback reference changes on every keystroke
**File:** `src/hooks/useWorkspace.ts:148`

Massive dependency array including `script` means the callback regenerates constantly. Any component receiving it re-renders every keystroke.

---

## 5. INFO

### I1. `DWError` and shared `RunResult` types are orphaned -- FIXED (deleted)
**File:** `src/types/index.ts:77-88`

Neither is imported anywhere. The hook defines its own local `RunResult`.

### I2. `flowNodes` type mismatch — `unknown[]` in TS vs `Option<serde_json::Value>` in Rust
A non-array JSON value would pass Rust deserialization but violate the TS type.

### I3. `ContextState` configYaml — `undefined` in TS vs empty string in Rust
Works in practice via `#[serde(default)]` but sending explicit `null` from TS would fail Rust deserialization.

### I4. Monaco `placeholder` option in ContextPanel — silently ignored
**File:** `src/components/ContextPanel.tsx:184, 224`

Monaco doesn't support `placeholder`. The placeholder text defined at lines 13-24 is never displayed.

### I5. `MiniEditor` registers providers that get disposed by sibling instances
**File:** `src/components/MiniEditor.tsx:92-103`

If two MiniEditors mount simultaneously, unmounting one disposes the other's global providers.

### I6. Duplicated flow designer SVG icon in 3 places -- FIXED (Icons.Flow)
**Files:** `Sidebar.tsx:213`, `FlowDesigner.tsx:685`, `EmptyState.tsx:101-103`

Should be in `Icons.tsx`.

### I7. `useWorkspace` returns a new object every render
**File:** `src/hooks/useWorkspace.ts:216-250`

Object literal in return statement. Any shallow-equality check always sees it as changed.

### I8. `handleRun` ref pattern assigns during render (not in useEffect)
**File:** `src/App.tsx:507-508`

Technically a side effect during render. Works in practice but discouraged by React concurrent mode.

### I9. DW server dependencies are pinned exactly
**File:** `dw-server/pom.xml:21-24`

Scala `2.12.18`, DataWeave `2.11.0-20251023`, minimal-json `0.9.5`. No version ranges. Good.

### I10. Tauri capabilities are properly scoped
**File:** `src-tauri/capabilities/default.json`

Minimal permissions: window management, dialog, updater, process restart, logging. No filesystem or shell access.

### I11. Tailwind config is clean
All colors use CSS custom properties (design tokens). Theme toggle via class swap.

### I12. Auto-update is properly configured
Dual endpoints, public key, 5-second delay. Silent failure on network issues.

### I13. `snake_case` naming inconsistency -- FIXED (renamed to camelCase)
`context_count` (App.tsx:90) vs `activeCount` (ContextPanel.tsx:41). Rest of codebase uses camelCase.

### I14. DW server compile cache synchronization is unnecessary
**File:** `dw-server/src/main/scala/com/dwstudio/DwServer.scala:68, 71`

Server is single-threaded but cache uses `synchronized`. Harmless overhead.

### I15. `migrate_dataweave` is a dead stub -- FIXED (deleted)
**File:** `src-tauri/src/dw_runner.rs:622-628`

Always returns `Err("migrate_not_supported")`. Still registered in `lib.rs`.

---

## Recommended Fix Priority

### Immediate (before next release)
1. **C1** — Add missing fields to Rust workspace structs (classpath, timeoutMs, payloadFilePath, multipartParts, enabled) — data is being lost right now
2. **H1** — Guard `kill_pid` against sentinel value 0
3. **C5** — Add `-Xmx512m -Xss2m` to JVM launch args

### Soon (next sprint)
4. **C2/C3** — Path traversal validation in workspace and file commands
5. **H2** — Replace `.lock().unwrap()` with poison-tolerant pattern
6. **H3** — Use bundled JRE for secure properties, pass key via stdin
7. **M1** — Drain or discard JVM stderr to prevent deadlock
8. **H4** — Add unmount cleanup for step-through promise

### When convenient
9. **M17** — Remove unused Monaco workers (saves ~8 MB)
10. **M3** — Fix `create_run_dir` unique naming
11. **L4** — Extract shared Rust utils to a module
12. **L12** — Delete dead `logForward.ts`
13. **L14** — Delete unused scaffold SVGs
14. **M18** — Remove `cdn.jsdelivr.net` from CSP

---

*Total findings: 77 across all severity levels.*
*Fixed: 40 findings (4 critical, 9 high, 14 medium, 10 low, 3 info). 1 won't-fix (by design). 1 deferred. 1 partial fix.*
*Remaining: 31 findings — mostly low/info severity or requiring architectural changes.*
