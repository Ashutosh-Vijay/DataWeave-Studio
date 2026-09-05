# DataWeave engine capability gap analysis

## 1. What this is

A source-level audit of the bundled DataWeave engine (**2.12.2-20260715**, extracted Scala sources for `parser` / `runtime` / `core` / `tooling-api` / `debugger`) against what DataWeave Studio actually calls today, done **2026-09-04**. Four subsystems were read line-by-line (debugger, inspector, scaffolding, weavedoc), the previous "jar census" claims were re-verified against both the 2.11 and 2.12 jars, and the strongest claims were then attacked by a skeptic pass. Where the skeptic contradicted the survey, the skeptic's verdict stands below. Every capability cites a file and a real signature; nothing here is inferred from a class name.

---

## 2. Bottom line

- **The single highest-value change in this whole audit is one expression.** Studio pipes raw AsciiDoc into a Monaco *markdown* hover, so `=== Parameters`, `|===`, `----` and `[%header, cols="1,3"]` leak literally into every hover — for the user's own functions *and* all 309 stdlib functions. `HoverMessage.markdownDocs` already exists and already runs the engine's own AsciiDoc→Markdown converter.
- **Sample-data generation is a whole shipped subsystem nobody in the engine calls.** `ScaffoldingService` turns a `WeaveType` into a runnable DW script that yields realistic fake data (name-aware: `email`, `ssn`, `creditCard`, `phone` all get format-correct values). Both halves — getting the type, running the script — are already on objects DwServer holds. This is the fix for the Flow Designer's hand-typed entry fixtures.
- **`semanticTokens()` is a zero-argument method on the document service we already hold**, new in 2.12, returning LSP-standard token types with locations. It is the replacement for the regex tokenizer in `src/dataweaveGrammar.ts`.
- **The debugger is real but not reachable.** Everything the survey claimed about the engine mechanism is true and confirmed. It still fails, because a pause is `sessionLock.wait()` on the executing thread and both DwServer *and* the Rust host are strictly one-request-one-response with a mutex held across write→read_line. Shipping it is a protocol rewrite on three layers plus a debugger UI, twice (desktop + VS Code). **Weeks, not days.** What survives is a non-blocking value-trace listener — worth doing, and it kills the `log()`-based trace mode.
- **The reference has a real coverage hole the census missed:** the bundled jar ships 90 functions the reference documents zero of, including all 25 of `dw::test::Asserts` — which `src/components/TestsView.tsx:28` already auto-imports. Users get no hover on the assertions Studio itself injects.
- **One live bug found in passing:** `DwServer.scala:100` still announces `weaveVersion = "2.11.0"` while the jar is 2.12.2-20260715.

---

## 3. Ranked opportunities

Ranked by value per unit of effort.

| # | Capability | Subsystem | What the user gets | Effort | Reachability | Confidence |
|---|---|---|---|---|---|---|
| 1 | `HoverMessage.markdownDocs` instead of `.documentation` | weavedoc | Hovers stop showing raw AsciiDoc markup — for 309 stdlib fns and the user's own | ~1 hour | callable on what we hold | confirmed |
| 2 | Sample data from a `WeaveType` (`ScaffoldingService.scaffold` + `loadType`/`typeOfMapping`) | scaffolding | "Generate me an input" / "show me what my output looks like" instead of hand-typing fixtures | 1–2 days | callable on what we hold | confirmed |
| 3 | `WeaveDocumentToolingService.semanticTokens()` | (2.12 new) | Real semantic colouring in Monaco — params, calls, type refs, date literals — replacing regex tokens | 2–3 days (Monaco side) | callable on what we hold | confirmed |
| 4 | Markdown docs in completion + signature help (`Suggestion.markdownDocumentation()`, `FunctionSignatureData.docAsMarkdown()`) | weavedoc | Formatted completion/signature popups; render lazily on resolve | hours + care | callable on what we hold | confirmed |
| 5 | Docs for the 90 undocumented bundled functions (`availableFunctions()` → `FunctionDefinition.parseDoc()`) | weavedoc | Hover/reference for `dw::test::Asserts` (25), `dw::io::file::FileSystem` (21), NDJson, protobuf | days | callable on what we hold | confirmed |
| 6 | Non-blocking `WeaveExecutionListener` value trace | debugger (surviving part) | Trace mode without editing the script — every intermediate value with its source location | days | callable on what we hold (needs cache eviction) | confirmed |
| 7 | `getDeclaredOutputMimeType` + `writeDWResult(..., outputMimeType)` | runtime (2.12 new) | Deletes the `output application/java` regex rewrite in DwServer | hours | callable on what we hold | confirmed |
| 8 | `WeaveDocumentToolingService.documentation()` — module header doc | weavedoc | Module descriptions in the Custom Module library instead of filenames | hours | callable on what we hold | confirmed |
| 9 | Structured hover (`WeaveDocParser.parseDocumentation`) | weavedoc | Params table + syntax-highlighted example blocks instead of one text blob | days | callable on what we hold | confirmed |
| 10 | `ScaffoldingFilter` + `ScaffoldingConfiguration` | scaffolding | "Only these fields" / "3 rows vs 1" on generated samples | hours (on top of #2) | callable on what we hold | confirmed |
| 11 | Custom lint rules via `CodeInspectorProvider` SPI | inspector | Studio-specific lint (e.g. flag `dw::Mule` usage) flowing through the existing quick-fix path | days | needs new wiring | **partial** — SPI merge confirmed, classloader visibility not tested |
| 12 | Crypto taint analysis (`CryptographicTaintAnalysisPhase`) | parser (2.12 new) | Warns on `hashWith("MD5")` etc. | days | needs new wiring (off by default, no tooling setter) | **medium** — reachability unproven |
| 13 | Full step debugger | debugger | Breakpoints, frames, stepping, watch | **weeks** | protocol rewrite on 3 layers | confirmed mechanism, ruled out on cost — see §6 |

---

## 4. What we could replace

Hand-rolled Studio code the engine already does, verified against both sides:

**a) AsciiDoc rendering — there is no converter in `src/` at all.**
`src/dataweaveEngineLanguage.ts:179` does `if (res.doc) contents.push({ value: res.doc })` — an `IMarkdownString` — fed by `DwServer.scala:522` `h.documentation.foreach(d => payload.add("doc", d))`. The engine ships `org.mule.weave.v2.utils.AsciiDocMigrator.toMarkDown`, exposed as `HoverService.scala:229 def markdownDocs: Option[String] = documentation.map(AsciiDocMigrator.toMarkDown)`. Same story at `DwServer.scala:513` → `dataweaveEngineLanguage.ts:618 documentation: s.doc`. This is *the* converter MuleSoft's own tooling uses, so hovers match the official extension.

**b) Trace mode.**
`DwServer.scala:253-256` gates on `req.get("trace")` and installs a `CapturingLogger` (`DwServer.scala:932`) that records `log()` calls — which requires the user to edit their script and wrap expressions in `log()`. `runtime/org/mule/weave/v2/interpreted/listener/WeaveExecutionListener.scala` gives `postExecution(node: ValueNode[_], result: Value[_])(implicit ctx: ExecutionContext)` per node, with the node's exact `location()`, and `DebuggerValueFactory.create(value, maxElements, maxDepth)` produces a depth/width-capped snapshot from a sealed serializable ADT (`debugger/org/mule/weave/v2/debugger/DebuggerValue.scala`). Same data, no script edits. This is the one part of the debugger that survives the skeptic pass — it never calls `stopExecution`, so it never blocks.

**c) The `output application/java` regex.**
`DwServer.scala:155-171` rewrites the output directive with `"(?m)^(\\s*output\\s+)application/java(?:[^\\r\\n-]|-(?!-))*"` — a regex that has already been revised once for the `class="..."` case. 2.12 added `runtime/org/mule/weave/v2/runtime/api/DWScript.scala:79 def writeDWResult(bindings: DWScriptingBindings, serviceManager: ServiceManager, outputMimeType: String): DWResult` and `:17 def getDeclaredOutputMimeType: Optional[String]`. Override the MIME at execution time; stop rewriting user text.

**d) Entry fixtures in the Flow Designer.**
`src/components/FlowDesigner.tsx:4389` is a bare textarea with placeholder `{"example": "starting payload"}`. There is no sample generator anywhere in the repo (grepped: `generateSample`/`sampleData`/`sampleFromType` → zero hits). The replacement is `WeaveToolingService.loadType(catalog)` (`WeaveToolingService.scala:353`) or `doc.typeOfMapping()` (`WeaveDocumentToolingService.scala:368`) → `new ScaffoldingService().scaffold(wt, "application/json", Map(), ScaffoldingConfiguration(2))` → run the returned script through the `DataWeaveScriptingEngine` DwServer already holds. This respects the "explicit fixtures, never auto-inject a guessed payload" rule: the user asks for generation and can edit the result.

**e) `UnusedImportElement` never gets greyed out.**
`dataweaveEngineLanguage.ts:546` tags `monaco.MarkerTag.Unnecessary` only when `m.code === 'UnusedImportModule'`, fed by `getClass.getSimpleName`. The sibling case class `UnusedImportElement` (an unused element in `import a, b from x`) is a real, distinct diagnostic that never gets the tag. **Fix by adding the second class name to that check** — *not* by switching to `Message.kind`, which is the shared, less-specific string `"UnusedImport"` and would break the branch (see §6).

---

## 5. Per-subsystem findings

### 5.1 weavedoc — the documentation pipeline (highest value/effort ratio)

**Internal structure.** The package `org/mule/weave/v2/weavedoc/` is only 2 files / 518 lines, and a class census badly understates it: it is the visible tip of a five-package pipeline.

1. **Capture** — `parser/org/mule/weave/v2/grammar/WhiteSpaceHandling.scala`: `docComment: Rule0` matches `/** … */`; `extractWeaveDocText()` hand-strips the `*` gutter. Everything is gated on `def attachDocumentation: Boolean`.
2. **Attachment** — `Grammar.assignCommentNodes`: `case CommentType.DocComment => lineToNodeCache.lookFirstOnNextLine(commentEndLine)`. A comment at index 0 binds to the document node — that is how module-level docs work.
3. **AST API** — `parser/ast/AstNode.scala`: `def weaveDoc: Option[CommentNode] = _comments.find(_.commentType == CommentType.DocComment)`. `literalValue` is the raw gutter-stripped AsciiDoc. This is the only interface between parser and everything downstream.
4. **Grammar** — `weavedoc/WeaveDocGrammar.scala`: a parboiled2 PEG for an AsciiDoc *subset*, recognising exactly six literal keywords (`=== Parameters`, `=== Example`, `=== More Examples`, `==== Source`, `==== Input`, `==== Output`) plus `|===`, `|`, `----`. 14 doc-AST case classes extending the engine's own `AstNode`, so every node carries a `WeaveLocation` and a `DWAstNodeKind`.
5. **Propagation — the part no census can see.** Six independent resolver sites copy the doc string off the AstNode onto the inferred `WeaveType` as `Metadata.DOCUMENTATION_ANNOTATION`: `ts/resolvers/FunctionTypeResolver.scala`, `ts/resolvers/KeyValuePairTypeResolver.scala:21-32`, `ts/TypeGraphBuilder.scala` (typed `var`), `ts/resolvers/PassThroughWithDocs.scala` (untyped `var`), `ts/WeaveTypeReferenceResolver.scala` (`type` directives), `ts/WeaveType.scala:572`. **Hover and signature help read from there, not from the weavedoc AST.**
6. **Rendering** — `parser/org/mule/weave/v2/utils/AsciiDocMigrator.scala`, ~110 lines, ~12 regex passes plus a hand-written state machine for `[%header,cols=…] |=== … |===` → markdown pipe tables. Its own comment notes it avoids named groups because Scala.js doesn't support them.
7. **Consumers** — five wrappers, all offering markdown, none of which Studio calls (verified above): `HoverService.scala:229`, `AutoCompletionService.scala:2205`, `FunctionSignatureHelpService.scala:94`, `FunctionDefinition.scala:23`, `WeaveDocumentToolingService.scala:1703`.
8. **Producer/validator** — `WeaveDocumentToolingService.scala:518 scaffoldDocs` and `:473 validateDocs` (both already wired in DwServer at 766 / 788).

**Capabilities worth taking.**

- **Markdown hover (#1).** `HoverService.scala:229 def markdownDocs: Option[String] = documentation.map(AsciiDocMigrator.toMarkDown)`. One expression at `DwServer.scala:522`.
- **Markdown completion/signature.** `AutoCompletionService.scala:2205 def markdownDocumentation(): Option[String]` and `FunctionSignatureHelpService.scala:94 def docAsMarkdown(): Option[String]`. Note `Suggestion.documentation()` is *smarter* than the type metadata — it walks the scope graph to the declaration and reads the `DocComment` directly, falling back to metadata, so it works for user functions the resolver did not annotate. Cost caveat: ~12 regex passes + a table state machine per suggestion; render lazily on Monaco's `completionItem/resolve`, not for every item in the list (DwServer already flags this concern at line 731).
- **Per-field docs, free.** `ts/resolvers/KeyValuePairTypeResolver.scala:21-32` — `node.astNode.weaveDoc.foreach(doc => keyValuePairType.withDocumentation(doc.literalValue, doc.location()))`. A `/** the id */` above an object key becomes a hover on that field. Nothing to call; it appears the moment hovers render properly. *Not verified end-to-end at runtime.*
- **Module header docs.** `WeaveDocumentToolingService.scala:247 def documentation(): Option[WeaveDoc]`. One new tooling kind; directly useful for the Custom Modules library.
- **Structured hover.** `WeaveDocParser.parseDocumentation(documentation: String): WeaveDocumentation` — a static object, no service instance, never throws (degrades to `WeaveDocumentation(Some(raw))`). Gives short description / description / parameter table / N examples with input+output+source code blocks.
- **Locations, if needed.** `WeaveDocParser.parseAst(documentation: String, messageCollector: MessageCollector): Option[WeaveDocNode]` — same content, keeps `location()`. The flattened `WeaveDocumentation` model throws locations away.

**The coverage hole.** The reference (309 entries in `src/dataweaveDocs.ts`) covers `wlang` almost exactly: 3 jar-only names (`isDefaultOperatorDisabledExceptionHandling`, `isLegacySizeOfNumber`, `logInternal` — all internal) and 3 docs-only (`p`, `lookup`, `causedby` — the absent `dw::Mule` trio). But the bundled fat jar carries 45 `.dwl` resources, not 25, and **90 further top-level public functions are documented nowhere**: `dw/test/Asserts.dwl` (25 — `must`, `equalTo`, `beGreaterThan`, `haveSize`, `beOneOf`, `equalToResource`, `eachItem`…), `dw/io/file/FileSystem.dwl` (21), `dw/test/Tests.dwl` (8), plus NDJson, protobuf `pack`/`unpack`, `dw/java/internal/Reflection.dwl`. Empirically confirmed by piping into the bundled jar: `import * from dw::test::Asserts … 1 must equalTo(1)` → ok. **Trap to record: there is no `dw::io::file` module** — the importable name is `dw::io::file::FileSystem`. Getting that wrong reads as "the file module isn't bundled", which is false.

---

### 5.2 scaffolding — sample data generation (the biggest unused subsystem)

**Internal structure.** 5 files, 1355 lines, ~79 compiled classes (every generator is a Scala `object`).

- **`ScaffoldingService`** — `doScaffold` is one large pattern match over ~30 `WeaveType` cases (Object, Array, Key, Name, Union, Intersection, Reference, all 8 date/time types, Range, Uri, Binary, Type, Regex, Null, Nothing, TypeParameter, Function, DynamicReturn), writing into a `CodeWriter` with indent/dedent, plus the `%dw 2.0` header, `ns` declarations and the `output <mime> k=v` directive.
- **`SampleDataGenerator`** — *not* a class-count artifact: 24 singletons in a deliberately ordered `Seq` (`IdGenerator` is last because its `handles` matches any key ending in `id`). `pick(name)` lowercases, strips `_ - space`, tries exact match, then a substring-distance search accepting the closest only if `distance < 6`, else `DefaultDataGenerator`.
- **`BinarySampleDataGenerator`** — base64s a real file off the classloader. Three binaries ship *inside* the jar and were confirmed present in `src-tauri/resources/dw-server/dwstudio-server.jar`: `dataweave_pdf.pdf` (26,791 b), `dataweave_icon.png` (8,528 b), `dataweave_icon.zip` (8,279 b).
- **`DataConstants`** — TITLES (~12), CITIES (15), COUNTRY (~35), NAMES (~320), LASTNAMES (~61), LOREM_IPSUM.
- **`ScaffoldingFilter`** / **`WeaveTypePath`** — the pruning hook and its addressing ADT (`ArrayTypeElement` → `[_]`, `FieldTypeElement(QName)`, `AttributeTypeElement(QName)`; `pathString()` gives stable ids like `order/[_]/@{http://x}id`).
- **`ScaffolderRecursionDetector`** — identity-based (`_ eq _`) stack around `ReferenceType.resolveType()`; on a cycle emits `{}` / `[]` / `null`. This is why self-referential types don't blow the stack.

**Entry point (verified verbatim from source):**
```scala
class ScaffoldingService {
  def scaffold(weaveType: WeaveType, mimeType: String,
               writerOptions: Map[String, Any],
               config: ScaffoldingConfiguration,
               filter: ScaffoldingFilter): String
  // + 3 overloads (java.util.Map variants, and filter-defaulted)
}
case class ScaffoldingConfiguration(repeatedElementsAmount: Int)
```
`parser/org/mule/weave/v2/scaffolding/ScaffoldingService.scala:51-64`. No-arg constructor, in the shipped jar.

**Feeders, all on objects DwServer already holds:**
- `WeaveToolingService.scala:353 def loadType(catalog: String): Option[WeaveType]` (and `:345 parseType`, deprecated — no namespace support).
- `WeaveDocumentToolingService.scala:368 def typeOfMapping(): Option[WeaveType]` — the type the current script *outputs*.
- `WeaveDocumentToolingService.scala:1146+ def typeOf(offset: Int): WeaveType` — already wired as `kind=typeOf`; this is the "select a `type Foo = {…}` and generate data" path.
- `DataWeaveScriptingEngine.inferTypeOf(script: String): Option[WeaveType]` (`DataWeaveScriptingEngine.scala:380`) and the 2.12 `inferDWTypeOf` (`:669`).
- Round-trip: `WeaveTypeEmitter.toCatalogString(wtype)` / `toString(wtype, prettyPrint, nameOnly, skipWeaveTypeMetadata)`.

**Shape of the work:** one new `kind = "sampleData"` in DwServer taking `{typeText | useOutputType | offset, mimeType, repeat}`, returning the scaffolded script *and* its executed output. `scaffold` returns **DataWeave source, not data** — the second hop through the existing `DataWeaveScriptingEngine` is mandatory (the body uses DW-native literals like `|2015-03-12T04:11:22Z|` and `"…" as Binary {base: "64"}`).

**Guards you must add before shipping it (all read from source):**
- Several `WeaveType` cases emit **nothing**: `case RegexType() =>`, `case NothingType() =>`, `case _: TypeParameter =>`, `case _: FunctionType =>`, `case _: DynamicReturnType =>` are empty bodies, producing broken output like `myField: ,`. Any type containing a regex, a function-typed field, or an unresolved type parameter scaffolds to a script that does not parse. **Validate with the existing `parsesCleanly()` before showing it.**
- `AnyType()` emits `{}` — a loosely-typed field silently becomes an empty object.
- Optional fields are **not** skipped: `KeyValuePairType.optional` is never consulted; only `repeated` is. Use `ScaffoldingFilter` for a "minimal payload" mode.
- Objects always end with a trailing comma before `}` (grammar-legal — `structure/Object.scala` has `hasTrailingComma` and a `TrailingCommaAnnotation` — but it looks wrong in a screenshot).
- Non-deterministic: `RandomPicker` holds one unseeded `new Random()`, no seed parameter anywhere. Two clicks give different data; no way to reproduce a sample for a regression test without capturing it.
- Data quality: `DataConstants.TITLES` is built from a `stripMargin.linesIterator`, so **element 0 is the empty string** — roughly 1 in 12 `title` fields scaffolds to `""`. Names/cities/countries are US/Latin-America biased; `AddressGenerator` has a typo ("Scaramento St").
- `WeaveTypeParser.parseExpression` does a bare `println` of errors to **stdout** — which *is* the JSON protocol channel. Go through `WeaveToolingService.loadType` (returns `None` silently), never the raw parser.

---

### 5.3 inspector — the linter that has been running all along

**Internal structure.** 21 files. It is *not* a service you invoke: two compilation phases welded into the normal parse pipeline. `ScopeCodeInspectorPhase` is chained into `MappingParser.scopePhasePhases()` (line 65), `TypeCodeInspectorPhase` into `typeCheckPhasePhases()` (line 102). Each resolves a `CodeInspectorService` from `ParsingContext.serviceManager`, falls back to `DefaultCodeInspectorService`, which `ServiceLoader`-loads `CodeInspectorProvider`. The jar's `META-INF/services/org.mule.weave.v2.inspector.CodeInspectorProvider` lists `BuiltInCodeInspectorProvider` (+ `JavaModuleInspectorProvider`). Each phase does `AstNodeHelper.traverse(rootNode, node => { inspectors.foreach(_.inspect(node, source, context)); true })`.

`CodeInspector.inspect` returns **`Unit`** — the only output channel is `parsingContext.messageCollector.warning(message, location)`. The quick fixes are not in the inspector: 14 case classes in `parser/MessageCollector.scala` extend `QuickFixAwareMessage` with `def quickFixes(): Array[QuickFix]`, and `WeaveDocumentToolingService.getQuickFix`'s first case is a one-line generic passthrough `case qfa: QuickFixAwareMessage => qfa.quickFixes()`.

**So: this is already fully wired and shipping.** All 9 rules (`ReplaceUsingWithDo`, `SizeOfEqualsZero`, `IfNotNull`, `TypeOf`, `UnnecessaryDefault`, `EqualsBoolean`, `UnnecessaryIfBlock`, `UnnecessaryDoubleNegation`, `ReduceConcatObjects`) plus unused-import detection surface through Studio's `typeCheck` today. The 2.12 addition is *only* the ServiceLoader plumbing, not new rules — the individual inspectors already existed at 2.11.

**The one genuinely new thing: the SPI.** `DefaultCodeInspectorService` aggregates *every* provider (`providers.flatMap(_.scopeInspectors) ++ …`), and `dw-server/pom.xml:204-217` already runs maven-shade with a `ServicesResourceTransformer`, which merges service files rather than clobbering them. So a second provider adds rules alongside the built-ins, and a custom `QuickFixAwareMessage` flows through `getQuickFix` with zero engine changes. **Confidence: partial** — the merge and aggregation are confirmed from source; that our jar's services entry is visible to `DefaultCodeInspectorService`'s classloader at runtime is *not* empirically tested. Test with a trivial provider first. Note `instance` is a `lazy val` cached for the JVM's life — rules cannot be added after the first inspection runs.

**Facts worth writing down about the existing rules:**
- `SizeOfEqualsZeroInspector` only fires when the literal is the bare token `"0"` on the *right*; `0 == sizeOf(x)` is not matched.
- `EqualsBooleanInspectorFixAction` inserts `!` with **no parentheses** — `a and b == false` becomes `!a and b`.
- `TypeOfQuickFixAction` takes the string literal verbatim as a type name, so `typeOf(x) ~= "NotAType"` produces `x is NotAType`, which won't compile. DwServer's existing `parsesCleanly()` check is the right defence.
- `ReduceConcatObjectsInspector` is the only type-aware rule and stays silent unless the type graph can prove `Array<Object>` — usually never, with no declared input type.
- `RemoveUnusedImport` deletes exactly the directive's span, leaving a blank line behind.

---

### 5.4 debugger — real, complete, and out of reach

**Internal structure** (worth recording, because it is genuinely well-built):

- **Command/event vocabulary** — `DebuggerCommand extends ClientCommand[WeaveDebuggerCommandInterpreter, DebuggerEvent]` with `def call(ctx): Option[DebuggerEvent]`. Commands carry their own behaviour, so a transport only has to move objects. 11 command classes; correlation via `RemoteServerMessage.commandId`.
- **The pause machine** — `runtime/.../server/WeaveDebuggerExecutor.scala`, a `WeaveExecutionListener` with 5 states (RESUMED / NEXT_STEP / STEP_IN / WAITING / STEP_OUT) and an `IdentityHashMap` value cache. Step semantics are stack-depth comparisons against `ctx.executionStack().frames().length`. Line granularity via `validateNewPositionOrFrame(activeFrame, pos) = pos != null && (pos.line != lastLine || activeFrame != lastFrame)`.
- **Session + transport SPI** — `class DefaultWeaveDebuggingSession(protocol: ServerProtocol = TcpServerProtocol())`. `ServerProtocol` is a 6-method trait with no socket assumption. TCP is one implementation, not a requirement.
- **Breakpoints** — `DefaultWeaveBreakpointManager`, matching `location.resourceName.name == breakpoint.nameIdentifier` then line/column; conditions are evaluated through the full expression evaluator at the current context.
- **Watch/REPL** — `evaluate` compiles the expression as an anonymous script declaring the frame's variables as implicit inputs, re-maps each slot to the live value, and executes in a child frame.
- **Value model** — sealed `DebuggerValue` ADT (7 cases), `DebuggerValueFactory.create(value, maxElements, maxDepth, currentDepth)`, caps `maxValueDepth = 30` / `maxValueElements = 100`.

**Why it does not ship — the skeptic wins on all four claims.** The engine APIs are public and correct; the architecture is what fails:

1. **Deadlock, unconditional.** `WeaveDebuggerExecutor.stopExecution` ends in `sessionLock.wait()` — untimed — on the *executing* thread. `DwServer.scala:104-110` is `while (line != null) { val resp = handleRequest(line, engine); println(resp); line = in.readLine() }`, with `compiled.write(...)` inline on that thread. `src-tauri/src/dw_server.rs` holds `Mutex<Option<DwServerInner>>` across `write_all` + `read_line` (lines 355, 380, 419-429, 492, 537, 587). First breakpoint hit → JVM stops reading stdin → the resume command can never arrive → the Rust mutex is pinned forever, taking tooling requests and the 60-second keepalive thread with it.
2. **The engine's own switch is TCP and it hangs.** `DataWeaveScriptingEngine.scala:140-143` — `private def startDebugSession(): Unit = { val session = new DefaultWeaveDebuggingSession(TcpServerProtocol(debuggerPort)); … }` — hardcoded, `debuggerExecutor` is a private var with no setter. Under `shouldDebug`, `write()` does not begin executing until a TCP client sends `InitializeSessionCommand`; it blocks on a `CountDownLatch` with no timeout. And `TcpServerProtocol` prints `[dw-debugger] Starting debugger at: <port>` to **System.out**, corrupting our JSON stream. So does `DefaultWeaveDebuggingSession`'s command handler on failure (stack trace to stdout).
3. **The in-process escape exists but is not the sanctioned API.** `DataWeaveScript.addExecutionListener` (`DataWeaveScriptingEngine.scala:966`) and `materializeValues` (`:971`) are public, `ServerProtocol` is implementable — but `executable` is a bare (non-`val`) constructor param at `:866`, so `DebugAwareWeave.debug(...)` is unreachable, and `DefaultWeaveBreakpointManager(session: DefaultWeaveDebuggingSession)` takes the **concrete** class, so a custom session means reimplementing breakpoint matching *and* conditional evaluation.
4. **Cache poisoning.** `DataWeaveScript` exposes `addExecutionListener` but **no** `removeExecutionListener` (it lives only on `ExecutableWeave.scala:200`), and `nodeListeners += listener` never clears. DwServer's `CompileCache` (`DwServer.scala:73-80`, used at `:237`) reuses compiled scripts, so one debug attach permanently routes every later *normal* run through `executeWithNotifications` and force-materializes every node — killing laziness and streaming (`DataWeaveScriptingEngine.scala:1188` gates streaming on `!shouldDebug`). Any debug run must bypass or evict the cache, paying the ~800ms compile each time.

Plus, if you did build it: `evaluate` throws `RuntimeException("Invalid variable name i.")` for any expression introducing its own name (lambda params go into the flat document-level `VariableTable`), so the canonical watch example `payload.items[0] filter ((i) -> …)` fails; module slots are written into the paused program's shared `ModuleContext` by index, which can crash or rebind the debugged script's imports; a parse error constructs `new InvalidScriptException(...)` and **never throws it**; `WeaveBreakpoint.equals`/`hashCode` compare only line and column, so two files collide and editing a condition is a silent no-op; column breakpoints only ever test the first node on a line; and key-not-found / index-out-of-bounds never trip exception breakpoints because `InvalidSelectionException extends InternalExecutionException`, which `ValueNode.executeWithNotifications` rethrows *before* the notifying catch.

**Verdict: weeks, and not next.** What to take instead is the non-blocking listener (#6 above) and, for error reporting, `ExecutionException.weaveStacktrace` / `messageSuffix` (`core/.../exception/ExecutionException.scala`), which already yields a DW-level stack trace with function names and line/column on the existing synchronous path.

---

### 5.5 The 2.12 delta (re-verified census)

Confirmed unchanged: **no Mule runtime in the jar** (`grep -oE 'org/mule/[a-z0-9]+/'` over all 30,458 entries returns exactly one line, `org/mule/weave/`; zero netty/grizzly/servlet hits). **No hidden data formats** — running the real `ServiceLoader.load(DataFormat.class)` against the bundled jar returns exactly 15, plus `ndjson::dataformat::NDJson` via `META-INF/dw-extensions.dwl` = 16, matching `src/dataweaveFormats.ts` 1:1. **`dw::Mule` is absent** — executed: `import dw::Mule` → `"Unable to resolve module with identifier dw::Mule."`

Worth knowing:
- **`semanticTokens()`** — `WeaveDocumentToolingService.scala:146 def semanticTokens(): Array[DWSemanticToken]`, confirmed absent from the 2.11 parser jar via `javap`. `case class DWSemanticToken(tokenType: String, tokenModifiers: Array[String], location: WeaveLocation)`, returned pre-sorted by start offset, LSP-standard type names.
- **New `DWScript` API** — `getDeclaredOutputMimeType`, `writeDWResult(…, outputMimeType)`, `setMaxTime`, `setProperty`, plus 21 new classes under `runtime/api/`. Nothing forces a migration.
- **Crypto taint analysis** — `CryptographicTaintAnalysisPhase`, chained into `MappingParser.scala:101`, flags `hashWith`/`HMACBinary` with a banned or non-literal algorithm. **Off by default**: `ParsingContext.scala:71 private var runCryptoTaintAnalysis: Boolean = false`, and `WeaveToolingService.createParsingContext` (`:330`) never enables it. The setters are public and `WeaveDocumentToolingService.apply(...)` is public (`:1716`), so a hand-built context would light it up — *not tested*.
- **Visibility (`private`/`internal`/`@VisibleTo`) and the component system** (`parser/component/*`, `dw/meta/Component.dwl`, `META-INF/dw-components.dwl`) are new. The component mechanism is precisely how an external jar contributes DW modules — relevant to the custom-module library, and it means "a `dw::Mule` shim is impossible" should be restated as "`lookup` can never work without a Mule runtime".
- **Live bug:** `DwServer.scala:100` `ready.add("weaveVersion", "2.11.0")`. Anything gating on that handshake — About dialog, target-runtime picker — is reading a stale literal.

---

## 6. Ruled out

Do not re-check these.

| Thing | Why not |
|---|---|
| **Full step debugger** | Engine mechanism is real; the transport is not. Untimed `sessionLock.wait()` vs. a strictly serial stdio loop and a Rust mutex held across write→read_line. Needs worker thread + duplex framing + event demux + keepalive suppression on three layers, plus breakpoint/frames/watch UI, duplicated for VS Code. Weeks. |
| **`DataWeaveScript.enableDebug()` / `debugPort()`** | Hardcodes `TcpServerProtocol`, prints to stdout (corrupting our protocol), and refuses to run until a TCP client connects. Wrong door, cannot be redirected. |
| **`DebuggerClient` / `TcpClientProtocol`** | Raw Java serialization over a `Socket`; only useful from a second JVM. |
| **A "Break Now" / pause button** | There is no Pause or Suspend command anywhere in `debugger/commands/`. Cannot be built from the shipped package. |
| **`RemoveExceptionBreakpointCommand`** | Does not exist. The interpreter method exists; no command class calls it. `ClearBreakpoints` clears line *and* exception breakpoints together. |
| **Swapping `getClass.getSimpleName` for `Message.kind`** | Skeptic verdict, and it holds: for all 12 `InspectorPhaseCategory` messages the class simple name is character-identical to the `kind` literal, so it changes nothing on the wire — and for unused imports `kind` is the *shared, less specific* `"UnusedImport"`, which would break the existing `MarkerTag.Unnecessary` branch. `pom.xml` has no minimize/relocate, so class names are stable anyway. Fix `UnusedImportElement` by adding the class name, not by switching fields. |
| **`Message.category` as a lint/error discriminator** | Poor split: `UnusedImport*` are lints but report `ScopePhaseCategory`; every inspector uses `messageCollector.warning`, so `severity` already carries most of it. And `category` is *not* `@WeaveApi` — only `kind` is. |
| **Turning individual lint rules off** | No config knob reachable from tooling. `WeaveToolingService.createParsingContext` (`:331`) uses the overload *without* a serviceManager, so `lookupService` always returns `None` and `NoOpCodeInspectorService` is unreachable. Filter downstream by kind. |
| **"Fix all" / batch quick fixes** | Every `QuickFixAction` is built from absolute character offsets captured during the parse that produced the message; the first `document.delete/insert` invalidates the rest, and DwServer's `StringDocument` clamps rather than throws — it will silently corrupt the script. Re-run typeCheck after each single fix. |
| **`TypeCheckCodeInspectorPhase`** | Dead code — referenced by nothing in the entire extracted tree. Superseded by `TypeCodeInspectorPhase`. |
| **A JSON Schema / XSD / OpenAPI / Avro → `WeaveType` bridge** | Does not exist. Grepping all five artifacts for `JsonSchema|XmlSchema|xsd|Xsd` hits one unrelated word match. Scaffolding only works from a type expressed *as DataWeave*. |
| **`doc.scaffoldDocs(...)` as "scaffolding is already wired"** | Name collision. `scaffoldDocs` generates a weavedoc comment block; `ExpressionMapper.scaffoldOutputForPath` rewrites a mapping AST. Neither touches `org.mule.weave.v2.scaffolding`, which is entirely unused. |
| **`asPrefixExample` / `WeaveDocumentation.asPrefix`** | Broken in the shipped engine: byte-for-byte identical to the infix version, both calling `CodeGenerator.generate(ast, CodeGeneratorSettings(InfixOptions.ALWAYS))`. Returns infix code. |
| **An engine-side doc *generator*** | Does not exist. `weavedoc` parses and validates; `AsciiDocMigrator` converts one string. "Generate docs for my module" is ours to build on `availableFunctions` + `parseDoc`. |
| **`InputElementFactory`** | Looks like debugger input plumbing; is a plain recursive `File → FileElement` reader wired to nothing. |
| **Combining debug with `withMaxTime`** | `WatchdogExecutionListener.preExecution` checks wall-clock per node — a script paused 30s would be killed on resume. DwServer sets no maxTime today, so this is a landmine, not a bug. |

---

## 7. Confidence and gaps

**Verified from source, with signatures quoted and file/line confirmed in this session:**
`HoverService.scala:229 markdownDocs`, `AutoCompletionService.scala:2205 markdownDocumentation`, `FunctionSignatureHelpService.scala:94 docAsMarkdown`, `FunctionDefinition.scala:23 markdownDoc`, `WeaveDocumentToolingService.scala:1703 markdownDoc`, `:146 semanticTokens`, `:247 documentation`, `:258 availableFunctions`, `:368 typeOfMapping`, `:473 validateDocs`, `:518 scaffoldDocs`, `WeaveToolingService.scala:345 parseType` / `:353 loadType`, `ScaffoldingService.scala:51-64` (all four `scaffold` overloads read directly), `WeaveExecutionListener.scala` (full trait), `DWScript.scala:17/25/79`. Studio side: `DwServer.scala:100` (stale version), `:253-256`/`:932` (trace mode), `:513`/`:522` (raw doc), `:155-171` (java-output regex), `:731`/`:766`/`:788`; `dataweaveEngineLanguage.ts:179`/`:546`/`:618`.

**Verified by execution against the bundled jar:** the 15+1 `DataFormat` census (real `ServiceLoader` run, not name inference); `dw::Mule` absent; `dw::test::Asserts` importable and working; `dw::io::file` *not* a module but `dw::io::file::FileSystem` is; `atBeginningOfWeek` native behaviour; the three scaffolding binary resources present in the jar.

**Partial / medium confidence — do not treat as fact:**
- **Custom lint via SPI (#11):** aggregation and shade-merge confirmed from source; runtime classloader visibility of *our* services entry is untested. Prove it with a trivial provider before committing.
- **Crypto taint reachability (#12):** the phase, the flags and the public setters are confirmed; that a hand-built `WeaveDocumentToolingService` with a crypto-enabled `ParsingContext` actually produces diagnostics was not run.
- **Per-field doc comments on object keys:** the resolver was read, not exercised. "It shows for every object key shape" is unproven.
- **`preCompile` / `ProjectPreCompilationResult`** (`DataWeaveScriptingEngine.scala:674-678`): plausibly relevant to the ~800ms first-compile, but I did not verify the binary artifact can be reloaded by this server. Unverified.

**Not covered / gaps:**
- The **code-generator survey (`CodeGenerator` / AST→source printer) arrived truncated** — only the first capability line survived transmission. `CodeGenerator.generate(node)` is cited throughout the inspector and weavedoc findings and is clearly load-bearing (every expression-rewriting quick fix round-trips through it, losing comments and custom whitespace inside the replaced span), but its own capability list, dead ends and formatting options were not available to this analysis. **A formatter / "prettify script" feature should be re-surveyed before being scoped.**
- No runtime measurement was taken for any proposed change: the `AsciiDocMigrator` per-suggestion cost (#4), the scaffolding round-trip time (#2), and the notification overhead of an always-on execution listener (#6) are all reasoned from source, not benchmarked.
- The VS Code extension host bridge was not read. Every "and again for VS Code" cost estimate above is inferred from the shared-UI architecture, not from that code.
- `dw/test/internal` (~32 helpers) and the `protobuf`/`ndjson` module surfaces were counted but not read.