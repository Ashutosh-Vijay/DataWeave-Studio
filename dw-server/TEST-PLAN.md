# dw-server branch — manual test plan

How to use: paste each script into the editor, set the payload + mime to
match, click Run, check the **Expected** matches what you see.

Each test calls out **What it verifies** so if a single one breaks you can
narrow the regression fast.

---

## Performance — boot, warmup, idle

### T1. First-run cost is hidden behind splash
1. Close the app entirely
2. `npm run tauri dev`
3. Watch the splash — look for the static boot loader on first frame (no
   white flash)
4. Once splash clears, hit Run on the default `{ hello: payload.message }`
   with payload `{"message":"world"}`

**Expected:** First run executes in ~10–50 ms (NOT 1 s). The compiler
primer ran during splash, so the user-visible first eval is on the warm path.

**Verifies:** boot loader, primer, splash hand-off.

### T2. Slow-boot subtitle
1. Restart `npm run tauri dev`
2. If the JVM takes more than 5 s, the splash should show a subtitle that
   reads roughly "DataWeave runtime takes a few extra seconds on slow /
   heavily-monitored machines…"

**Expected:** Subtitle fades in 5 s after splash starts (only on slow boots —
on a fast machine you may never see it).

**Verifies:** Q5 splash subtitle (`SplashScreen.tsx`).

### T3. Keepalive defeats idle re-warmup
1. Open the app, run any script — note the time (~10 ms).
2. Walk away for ~3 minutes. Don't touch the app.
3. Come back, click Run on the same script.

**Expected:** Still ~10–50 ms, NOT a 1–2 s soft warmup.

**Verifies:** keepalive ping (`dw_server.rs`, 60-s interval).

---

## Core DataWeave — sanity checks

### T4. Basic JSON in / JSON out

```dataweave
%dw 2.0
output application/json
---
{
  greeting: "Hello, " ++ (payload.name default "world"),
  upper: upper(payload.name default "x")
}
```
- Payload: `{"name":"Alice"}` (mime `application/json`)

**Expected:** `{ "greeting": "Hello, Alice", "upper": "ALICE" }`

**Verifies:** end-to-end script eval, payload binding, output.

### T5. Map / filter / reduce on an array

```dataweave
%dw 2.0
output application/json
---
{
  doubled: payload map ((n) -> n * 2),
  evens: payload filter ((n) -> n mod 2 == 0),
  sum: payload reduce ((n, acc = 0) -> acc + n)
}
```
- Payload: `[1, 2, 3, 4, 5]` (mime `application/json`)

**Expected:** `{ "doubled": [2,4,6,8,10], "evens": [2,4], "sum": 15 }`

### T6. JSON → XML
```dataweave
%dw 2.0
output application/xml
---
{
  root: {
    item: payload.items map ((i) -> { name: i.name, price: i.price })
  }
}
```
- Payload: `{"items":[{"name":"Pen","price":2},{"name":"Pad","price":5}]}`

**Expected:** Valid XML with `<root><item>...</item><item>...</item></root>`.

**Verifies:** the XML writer is bundled and works.

---

## Java interop (NEW capability)

### T7. java.lang.Math
```dataweave
%dw 2.0
import java!java::lang::Math
output application/json
---
{
  sqrt2: Math::sqrt(2.0),
  absNeg: Math::abs(-7),
  max: Math::max(10, 20)
}
```
- Payload: `{}` (anything; ignored)

**Expected:** `{ "sqrt2": 1.4142..., "absNeg": 7, "max": 20 }`

**Verifies:** `java-module` is bundled and can resolve JDK classes.

### T8. java.util.UUID
```dataweave
%dw 2.0
import java!java::util::UUID
output application/json
---
{ uuid: UUID::randomUUID() as String }
```
**Expected:** `{ "uuid": "<some-uuid-v4>" }`. Different value each run.

**Verifies:** Java reflection works (UUID was banned by GraalVM native image
in the old CLI).

### T9. java.lang.System
```dataweave
%dw 2.0
import java!java::lang::System
output application/json
---
{
  javaVersion: System::getProperty("java.version"),
  os: System::getProperty("os.name")
}
```
**Expected:** Real values from your JRE (e.g. `"17.0.18"`, `"Windows 11"`).

---

## Output application/java handling

### T10. application/java renders as JSON
```dataweave
%dw 2.0
output application/java
---
{ requestBody: payload }
```
- Payload: `{"x":1}`

**Expected:** Output shows the Java object rendered as JSON:
```json
{
  "requestBody": {
    "x": 1
  }
}
```

**Verifies:** Server rewrites `output application/java` → `output application/json`
internally so the Playground-style display works (`DwServer.scala`).

---

## Secure config + decryption

### T11. ${secure::key} substitution end-to-end
1. Open Context panel → Config tab
2. Paste into **secure-config.yaml**:
   ```yaml
   db:
     password: ![skHsH2RTu0aYjmyxqCDhJg==]
   ```
3. Set **Encryption key** to `1234567890123456` (16-char AES key)
4. Confirm "Encrypted values detected · AES · CBC" appears
5. Script:
   ```dataweave
   %dw 2.0
   output application/json
   ---
   { dbPassword: "${secure::db.password}" }
   ```

**Expected:** `{ "dbPassword": "<plaintext>" }` (the decrypted value).

**Verifies:** YAML pre-processing for `![...]` values + decryption via the
bundled secure-properties-tool.jar + substitution before sending to server.

### T12. ${configKey} substitution
Same flow with **config.yaml** instead:
```yaml
api:
  baseUrl: "https://api.example.com"
```
Script:
```dataweave
%dw 2.0
output application/json
---
{ url: "${api.baseUrl}" }
```
**Expected:** `{ "url": "https://api.example.com" }`

---

## Vars + attributes

### T13. Vars
1. Context → Vars → Add a var: `tax = 0.2` (type: JSON, value: `0.2`)
2. Add another: `region = "us-east"` (type: String, value: `us-east`)
3. Script:
   ```dataweave
   %dw 2.0
   output application/json
   ---
   {
     priceWithTax: payload.price * (1 + vars.tax),
     region: vars.region
   }
   ```
- Payload: `{"price":100}`

**Expected:** `{ "priceWithTax": 120, "region": "us-east" }`

### T14. Attributes (HTTP context)
1. Context → Request → set Method `POST`
2. Add header: `X-Trace = abc123`
3. Add query param: `q = test`
4. Script:
   ```dataweave
   %dw 2.0
   output application/json
   ---
   {
     method: attributes.method,
     trace: attributes.headers."X-Trace",
     query: attributes.queryParams.q
   }
   ```

**Expected:** `{ "method": "POST", "trace": "abc123", "query": "test" }`

---

## Named inputs

### T15. Multiple named inputs
1. Payload Tabs → click `+` → name it `accounts`, set mime JSON, paste:
   `[{"id":1,"name":"Acme"},{"id":2,"name":"Beta"}]`
2. Add another: `regions`, JSON, `["us","eu","apac"]`
3. Script:
   ```dataweave
   %dw 2.0
   input accounts application/json
   input regions application/json
   output application/json
   ---
   {
     names: accounts map ((a) -> a.name),
     regionCount: sizeOf(regions)
   }
   ```

**Expected:** `{ "names": ["Acme","Beta"], "regionCount": 3 }`

---

## Error reporting

### T16. Syntax error — line numbers correct
```dataweave
%dw 2.0
output application/json
var item =  (payload is Object)[payload] else payload
---
item map (i, index) -> { hello: i.message }
```
**Expected:**
- Error red-line on **user line 3** (the `var item = ...` line), NOT line 5
- Error message body includes the actual reason: `Invalid input "else"...`
  (not just "at line N")

**Verifies:** stderr line-offset shifting + error body extraction.

### T17. Unresolved reference
```dataweave
%dw 2.0
output application/json
---
{ value: undefinedThing }
```
**Expected:** `Unable to resolve reference of: \`undefinedThing\`` — clearly
visible in the Output pane, not just "[ERROR] Error while executing".

---

## Performance under load

### T18. 10 quick consecutive runs
Click Run 10 times in a row on a small script.

**Expected:** Run #1 may show ~50–100 ms (compile cache warming for that
exact script), runs #2–10 should be 5–20 ms each. None should exceed 100 ms.

**Verifies:** the per-run cost is genuinely amortised — we're not spawning
a process each time.

### T19. Run with timeout
1. Settings → set timeout to `2000` ms
2. Script:
   ```dataweave
   %dw 2.0
   output application/json
   ---
   (1 to 100000000) reduce ((n, acc = 0) -> acc + n)
   ```

**Expected:** After ~2 s, you see a "Script timed out after 2000ms" error.
Subsequent runs should still work (server should be respawned cleanly).

**Verifies:** timeout path triggers server restart, queue stays healthy.

### T20. Cancel mid-flight
Same long-running script as T19, but click Cancel before it finishes.

**Expected:** "Cancelled" appears in Output. The next run still works
(no zombie server).

---

## Resume / draft

### T21. Resume from in-progress draft
1. Open a fresh app (no saved workspace), click "Blank transform"
2. Edit the script — type `// hello world` somewhere
3. Wait ~1 s (lets the auto-draft fire)
4. Close the app entirely
5. Reopen with `npm run tauri dev`

**Expected:** Welcome screen shows a "Resume last session" button. Clicking
it restores your `// hello world` edit, NOT the default starter script.

**Verifies:** Resume bug fix, auto-draft round-trip.

### T22. Resume from saved file
1. Edit the script, then ⌘S → save as some name
2. Close the app
3. Reopen — Resume button should show. Click it.

**Expected:** Loads the saved file's content. No flash of default script.

### T23. Resume with a deleted file
1. Save a workspace, then delete its `.dwstudio` file from
   `%APPDATA%/com.dwstudio.desktop/` while the app is closed
2. Reopen the app, click Resume

**Expected:** Falls back to the in-progress draft (or shows the toast
"No previous session found to restore" if no draft either). The
`lastWorkspace` ref gets cleared so the welcome screen is normal next time.

---

## Settings — fonts

### T24. Font change is live across all editors
1. Open Settings → Editor → change font to `Geist Mono`
2. Without restarting, look at the script editor, payload editor, output
   pane, and any open YAML editor in Context.

**Expected:** All five Monaco editors flip to Geist Mono immediately. No
restart required.

**Verifies:** `useEditorFont` event-driven refresh.

### T25. Font size change is live
Same flow, change Font size to `16 px`. All editors should resize except
the small inline YAML editors (deliberately fixed at 11 px for layout).

---

## Function reference

### T26. Function browser opens and lists everything
1. Sidebar → click the `{}` rail icon (Function reference)
2. Expect a full-screen view with ~309 functions listed alphabetically
3. Search for `groupBy` — list narrows immediately
4. Click `groupBy` — right pane shows full signature, description, examples

**Verifies:** the bundled `dataweaveDocs.ts` is wired and the full-screen
layout works.

### T27. Hover docs in editor
Hover any DW function in the script editor — `map`, `filter`, `groupBy`,
etc.

**Expected:** Tooltip with signature + description appears, fully readable
(no clipping by Context panel, no transparent background).

---

## Playground import / export

### T28. Round-trip a Playground zip
1. Welcome screen → "Import from Playground"
2. Pick the zip from `example/dwProject (1).zip`

**Expected:** Workspace populates with the script + payload.

3. ⌘K → "Export as Playground zip" → save to disk
4. Re-import the file you just exported

**Expected:** Same content as the original.

**Verifies:** `playgroundImport.ts` round-trip.

---

## Quick smoke test (5 minutes total)

If you only have time for the essentials, run **T1, T4, T7, T11, T16, T21**
in that order. They cover: boot perf, basic eval, Java interop, secure
config, error reporting, resume. If those all pass the branch is
fundamentally working.
