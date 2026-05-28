# Mule Project Support — Plan

**Status:** Plan only — implementation queued across v1.5.1 / v1.6.0 / (maybe) v1.7.0.
**Goal:** Take Studio's Mule XML round-trip from "one flow at a time" to "real multi-file Mule project."

The current `muleXmlIO.ts` picks the first `<flow>` element in a pasted XML and ignores everything else. Real Mule projects have N flows across M files, linked by `<flow-ref>`, sharing `<error-handler>` definitions and `<config>` blocks. This plan adds that — but in three sized releases, because doing it all in one go is meaningfully worse than incremental ships (see the trade-off section at the bottom).

---

## Tier 1 — Multi-flow import, single workspace (v1.5.1)

**What the user gets:** drop one or more `.xml` files; every `<flow>` and `<sub-flow>` becomes a request in the active workspace; `<flow-ref>` calls render as labeled chips so the user can see (and click through) the relationships, even though execution still treats them as no-ops.

**Effort:** ~1-2 hours focused. Single commit.

### Tier 1 task list

1. **Iterate ALL `<flow>` elements** during import, not just `doc.querySelector('flow')`. Today this is a silent data loss bug — a file with five flows imports as one.
2. **Multi-file ingestion in the Import dialog:**
   - Accept multiple files via the existing file input
   - Accept drag-drop of multiple files into the dialog
   - For each file, parse all flows; aggregate into a single result
3. **One flow → one workspace request.** Each imported flow becomes its own entry in the requests list, labeled with the flow's `name="..."` attribute. Duplicate names get suffixed `(2)`, `(3)`, etc.
4. **`<sub-flow>` support** — same shape as `<flow>` (no trigger source, called via `flow-ref`). Imported as a request with a `[sub]` prefix on the label.
5. **`<flow-ref>` rendering:** new placeholder leaf type `flow-ref` with config `{ targetFlowName, targetVariable?, targetValueExpression? }`. Renders as a chip that says `→ flow-name` in the importing flow. Click → switch active request to the matching flow. Does NOT execute the target — execution is Tier 2.
6. **Shared `<error-handler>` definitions** — top-level `<error-handler name="...">` blocks become read-only reference requests labeled `[error-handler] name`. References from flows (`<error-handler ref="..." />`) become labeled placeholders.
7. **`<on-error-propagate>` import:** today only `<on-error-continue>` is recognized inside Try. Add propagate as another Try variant with a flag `propagateOnError: true` on the error-handler branch. Visually the same; execution differs slightly (re-throws after handler runs). Tier 2 wires the execution; Tier 1 just preserves the data so the round-trip survives.
8. **Preserve unsupported sub-elements as comments instead of dropping them:**
   - `<error-mapping sourceType="..." targetType="..." />` — appended to the parent leaf's metadata
   - `<salesforce:parameters>` — preserved on the SF node as a `parameters` config field (for display only; not used at execute time yet)
9. **Multi-flow workspace JSON** — workspace shape v3 → v4. Workspaces gain a top-level `flows: { id, name, nodes: FlowNode[] }[]` instead of a single `nodes`. v3 → v4 migration: a v3 workspace with one flow becomes a v4 workspace with one entry.
10. **Sidebar updates** — show a tree of flows in the workspace panel: regular flows, sub-flows, error-handlers grouped under sections. Active flow highlighted. Switch between flows by click.
11. **`raise-error type="X"` support** — new leaf type. Config: `errorType` (string). Renders as a red-tinted chip. Tier 1 treats as a no-op; Tier 2 actually raises.
12. **README + Comparison docs** — document the new multi-flow import. List exactly what still falls through to placeholders so users know the boundary.

**Ship gate:** importing the user's `example/example-xml.txt` should produce one workspace with 5+ requests (one per flow), every `flow-ref` rendered as a clickable chip pointing to the right target.

---

## Tier 2 — `flow-ref` as a real executable scope (v1.6.0)

**What the user gets:** import + RUN. The recursive walker now follows `flow-ref` calls, executes the target flow with current ctx, captures its output. `<on-error-propagate>` re-throws. `raise-error` actually raises. Shared error handlers attach to flows.

**Effort:** ~1-2 weeks of focused work. Multiple commits.

### Tier 2 task list

1. **`flow-ref` execution semantics:**
   - At run time, look up the target flow by name in the workspace
   - If found, run its node list with the current ctx (recurse via runList)
   - If `target="varname"`, save the resulting payload into `ctx.variables[varname]` instead of overwriting payload
   - If `targetValue="#[…]"`, evaluate the expression against the target flow's output and save THAT into the variable
   - Loop detection: max recursion depth (default 50), abort with a clear error
2. **Sub-flow vs flow distinction:** sub-flows can only be invoked via `flow-ref`, never auto-executed. Mark with a "sub-flow only" badge in the sidebar.
3. **Shared error-handler attachment:** when a flow has `<error-handler ref="X" />`, at run time look up handler X and apply it to the flow. Implement as a wrapper around `runList` that catches errors and runs the handler's nodes with `vars.error` set.
4. **`on-error-propagate` execution:**
   - Run the handler branch like on-error-continue
   - After the handler completes, re-throw the original error so the parent catches it too
   - Update `runTry` to distinguish the two cases via the new `propagateOnError` branch flag
5. **`raise-error` execution:** raises a typed error that propagates up to the nearest error handler. Config: `errorType`, optional `description`. The error type is stored in `vars.error.type`.
6. **`error-mapping` execution:** when a connector throws and an error-mapping matches the `sourceType`, transform the error into the `targetType` before propagation. Implement in connector node executors.
7. **`salesforce:parameters` execution:** when a `<salesforce:query>` has a parameters block, evaluate the DW expression to produce a params object, substitute into the SOQL via the existing `substituteQueryParams` logic.
8. **Workspace-level error handlers** — first-class concept. Config panel exposes which flows reference them. Renaming a handler updates all references.
9. **Step-through across `flow-ref`:**
   - Step Into a flow-ref → pause at the first node of the target flow
   - Step Over → run the whole target flow, pause at the next sibling
   - Breadcrumb in the step controls showing "main-flow → query-account-id → ...."
10. **Flow picker for `flow-ref` config panel:** when a flow-ref is selected, the config panel shows a dropdown of all flows + sub-flows in the workspace. Typing creates a new placeholder reference.
11. **Visualize the flow graph** — new sidebar tab "Graph" showing flows as nodes with `flow-ref` calls as edges. Click an edge → jump to the call site.

**Ship gate:** the user's `example-xml.txt` runs end-to-end if you provide mock payload + mock SOQL responses. Stepping into `Create_Lead_Flow` walks into `accountId-referralCustId`, `Query-Vendor-Id`, etc.

---

## Tier 3 — Full Mule project import / export (v1.7.0 — needs explicit go-ahead)

**What the user gets:** import an entire Mule project directory. Parse `mule-artifact.json`, all `*.xml` files in `src/main/mule/`, all configs in `src/main/resources/`. Export back to a deployable project zip.

**Effort:** ~4-6 weeks of focused work. Multiple major commits.

### Tier 3 task list

1. **Project root detection** — Studio recognizes a Mule project directory by `pom.xml` + `mule-artifact.json` + `src/main/mule/` layout. New "Import Mule Project" menu item opens a folder picker (vs the existing paste-XML dialog).
2. **`mule-artifact.json` parsing** — read project metadata: minMuleVersion, secureProperties, redeploymentEnabled, classLoaderModelLoaderDescriptor.
3. **Recursive XML discovery** — walk `src/main/mule/` for all `.xml` files. Pre-resolve all `<flow>`, `<sub-flow>`, `<configuration>`, `<error-handler>` elements across files.
4. **Connector configs as first-class objects:**
   - `<salesforce:config>` — store as a workspace-level Config object with name + properties (username, security-token, endpoint)
   - `<http:request-config>`, `<http:listener-config>` — same
   - `<db:config>` — same
   - Config-ref resolution: when a node has `config-ref="Salesforce_Config"`, link to the actual config
5. **Property files:**
   - Parse `src/main/resources/*.yaml` and `*.properties` files
   - Store as `properties` object on the workspace
   - `${key}` substitution at run time uses the imported properties (matches Mule's behavior)
6. **Secure properties:**
   - Parse `secure.properties` files
   - Detect encrypted values (the `![…]` wrapper)
   - Studio's existing Secure Properties tool decrypts them at run time
7. **Maven-style dependency declaration:**
   - Parse `<dependencies>` from `pom.xml`
   - Display as an informational list (we don't actually fetch JARs)
   - Document that custom modules need to be added to the classpath panel manually
8. **Workspace structure v4 → v5:**
   - Add `configs: ConnectorConfig[]`, `properties: Record<string, string>`, `secureProperties: Record<string, string>`
   - v4 → v5 migration is trivial (empty new fields)
9. **Project view in sidebar** — a new sidebar tab "Project" showing the imported tree: flows / sub-flows / error-handlers / configs / properties. Mirrors the Anypoint Studio project explorer at a basic level.
10. **Export to project zip:**
    - Regenerate `src/main/mule/<flow-group>.xml` files
    - Regenerate `src/main/resources/*.yaml`
    - Regenerate a minimal `mule-artifact.json` and `pom.xml`
    - Zip everything → save as `<project-name>.zip`
    - User extracts it into a real Mule workspace and it deploys
11. **Round-trip CI test:** for every example project in `examples/`, import → run → export → import → diff. Byte-identical for round-trip integrity.
12. **Connector config UI** — config-ref nodes show the resolved config inline (read-only) in their config panel. Editing the config in one place updates every node that references it.
13. **Decide explicitly whether Studio wants to be this thing.** Tier 3 is a positioning shift. See trade-off section below.

**Ship gate:** import a small real-world Mule 4 project (e.g., a 5-flow API with HTTP listener, DB select, error handlers, secure properties). All flows render. Mock the connector responses. Run end-to-end. Export back. Diff the exported XML against the original — should be semantically equivalent.

---

## Cross-cutting concerns (all tiers)

- **Cargo.toml dependency for Mule XML schema validation?** No — keep it as DOM parsing. Adding XSD validation would tie us to MuleSoft's schema URLs and break offline use.
- **What about Mule 3 XML?** Out of scope. The importer should reject Mule 3 namespaces with a clear error message and a link to Mule's official 3 → 4 migration tooling.
- **Anypoint Platform integration?** Explicitly out of scope. Studio stays local-only / offline.
- **Auto-update of imports when the source XML changes?** No — import is one-shot. Re-import overwrites.

---

## Trade-off section: doing it all in one release would be worse, here's why

The temptation: "v1.5.0 was nesting + Mule XML. v1.6.0 should be Multi-flow + execution + project import. One release, big bang." Tempting because it feels like a clean major milestone. **Don't do it.** Six reasons:

1. **Tier 3 is a positioning shift.** Studio's identity is "fast offline workbench for DataWeave 2.0 transforms." Tier 3 makes it "Anypoint Studio Lite." That's a different product. Tier 1 + Tier 2 strengthen the existing positioning; Tier 3 expands it sideways. Don't make that pivot by accident.

2. **Each tier's bugs would compound.** Tier 1 decides how `flow-ref` is REPRESENTED in the workspace JSON. Tier 2 decides how it EXECUTES. Tier 3 decides how it ROUND-TRIPS to the project zip. If Tier 1's data model is wrong, Tiers 2 and 3 inherit the bug. Smaller releases give you feedback loops.

3. **You can't validate Mule semantics without using them.** `flow-ref` recursion, variable scoping across flows, error propagation through `on-error-propagate` — these have edge cases that only surface in real flows. If we bundle T1+T2+T3, you're discovering all of those at the same time, against a much larger diff.

4. **Timeline risk is asymmetric.** T1 ships in a session. T1+T2 ships in 2 weeks. T1+T2+T3 ships in 2 months. If you abandon halfway through a 2-month sprint (life happens), you have NOTHING shipped. If you ship T1 and abandon T2 halfway, you still have a v1.5.1 with multi-flow import on prod.

5. **Bug surface area scales superlinearly.** Three releases of `muleXmlIO.ts` changes ≠ one release of all three changes. Code review, debugging, bisecting are all easier on focused diffs.

6. **The "but you'll never finish Tier 3" worry is fake for your pace.** You've shipped 5+ commits to main in a single day. The "we'll do it next release" trap applies to teams that ship quarterly. You don't.

### Recommended release plan

| Release | Scope | Effort | Decision needed before starting |
|---|---|---|---|
| **v1.5.1** | Tier 1 | ~1-2h | None — start whenever |
| **v1.6.0** | Tier 2 | ~1-2 weeks | None — Tier 1's data model determines Tier 2's executor shape |
| **v1.7.0** | Tier 3 | ~4-6 weeks | **Yes — explicit go/no-go decision on positioning shift.** Reassess after Tier 2 ships and you've used it. Tier 3 might not be what Studio should be. |

Concretely: after v1.6.0 ships and a few weeks pass, look at how you and other users actually use multi-flow Studio. If the answer is "I design flows in Studio and deploy them to Mule projects manually," Tier 3 (full project I/O) becomes attractive. If it's "I edit and test individual flows extracted from Mule projects," Tier 3 is overkill and the right next thing is something else entirely (maybe a Mule project diff tool, or better connector mock fidelity).
