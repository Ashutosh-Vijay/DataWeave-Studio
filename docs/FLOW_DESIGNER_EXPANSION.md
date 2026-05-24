# Flow Designer Expansion Plan

**Status:** Plan only — not yet implemented.
**Goal:** Add Mule-style branching/parallel/iterative scopes (Choice, Scatter-Gather, For Each, Try, etc.) to the Flow Designer canvas.
**Current scope:** Sequential flow with 7 node types, ordered by X position.

---

## 1. Why this is a significant change

The current `FlowDesigner.tsx` (~1870 lines) models a flow as a **flat list** of `FlowNode { x, y, config, status, output }`. Connections are inferred by sorting nodes by `x` and pairing `i → i+1`. Execution is a linear `for` loop over that order, threading `payload` and `vars` through each node.

That model can't express:

- **Branching** — Choice (when/otherwise) needs multiple downstream paths
- **Parallelism** — Scatter-Gather runs N branches concurrently and aggregates
- **Iteration** — For Each repeats a sub-flow per element of a collection
- **Error scopes** — Try/Catch wraps a sub-flow and routes errors

All of these require a **tree / graph model** where a node can own a list of child sub-flows, and the executor needs to recurse into them. That's the core refactor.

---

## 2. Data model changes

### Today

```ts
type NodeType = 'set-payload' | 'transform' | 'set-variable' | 'salesforce' | 'database' | 'http-request' | 'logger';

interface FlowNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  disabled?: boolean;
  config: { /* big union of every node's fields */ };
  output?: string;
  error?: string;
  status: 'idle' | 'running' | 'success' | 'error';
}
```

### Proposed

Add a `kind` discriminator and a `branches` field for container nodes.

```ts
// Two top-level kinds: "leaf" nodes do work, "scope" nodes own children.
type NodeKind = 'leaf' | 'scope';

type LeafType =
  | 'set-payload' | 'transform' | 'set-variable'
  | 'salesforce' | 'database' | 'http-request' | 'logger';

type ScopeType =
  | 'choice'             // when/otherwise router (one branch executes)
  | 'scatter-gather'     // all branches in parallel, aggregate
  | 'for-each'           // iterate over collection, sub-flow per element
  | 'try'                // try sub-flow + catch sub-flow
  | 'async'              // fire-and-forget sub-flow (display only — no waiting)
  | 'parallel-for-each'  // for-each but branches run concurrently
  | 'first-successful'   // try routes in order until one succeeds
  | 'round-robin';       // rotate which route gets called (display: shows first)

type NodeType = LeafType | ScopeType;

interface LeafNode {
  id: string;
  kind: 'leaf';
  type: LeafType;
  label: string;
  x: number; y: number;
  disabled?: boolean;
  config: LeafConfig; // unchanged shape
  output?: string; error?: string;
  executionTimeMs?: number;
  status: NodeStatus;
}

interface ScopeNode {
  id: string;
  kind: 'scope';
  type: ScopeType;
  label: string;
  x: number; y: number;
  disabled?: boolean;
  /** Sub-flows owned by this scope. Each branch is itself a list of FlowNode. */
  branches: Branch[];
  /** Scope-specific config — predicates, collection expression, error handler ref */
  config: ScopeConfig;
  output?: string; error?: string;
  executionTimeMs?: number;
  status: NodeStatus;
}

interface Branch {
  id: string;
  /** Branch label — e.g. for Choice this is the predicate ("payload.age > 18"),
   *  for Scatter-Gather this is the route name ("route1", "route2"),
   *  for Try it's "main" or "error", for For Each it's "iter" (always single). */
  label: string;
  /** Optional predicate / config specific to the branch within its parent scope */
  branchConfig?: { predicate?: string; isOtherwise?: boolean; isErrorHandler?: boolean };
  /** Nodes inside this branch — can themselves be scope nodes (recursion). */
  nodes: FlowNode[];
}

type FlowNode = LeafNode | ScopeNode;
type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped';
```

### What this preserves

- All existing leaf nodes work unchanged — only the discriminator field is new.
- The `.dwstudio` workspace JSON schema bumps from v2 → v3 with a migration step:
  - On load, if a node has no `kind`, treat it as `kind: 'leaf'`.
  - Wrap the old `nodes: FlowNode[]` array as the root branch of an implicit "main" scope, OR keep it flat at the top level (recommended).

### What this adds

- Each scope node holds `branches: Branch[]`.
- A branch is `{ id, label, nodes: FlowNode[] }`, so branches can nest scope nodes (Choice inside Scatter-Gather, etc.).
- The top-level workspace can stay as a flat array of `FlowNode` — scope nodes simply appear in that array and recursion happens inside their branches.

---

## 3. Connection model

### Today

```ts
const executionOrder = nodes.filter(n => !n.disabled).sort((a, b) => a.x - b.x);
const connections = executionOrder.slice(0, -1).map((from, i) => ({ from, to: executionOrder[i + 1] }));
```

### Proposed

Same X-sort logic stays for the **outer flow** — top-level nodes still connect left-to-right.

The change is inside scope nodes: when rendering a scope node, render its branches as **labeled sub-canvases** stacked vertically inside the node's body. Each branch is internally still X-sorted.

Visual model:

```
┌──────────────────────────────┐
│ Choice                       │   ← top-level node (scope)
│ ┌──────────────────────────┐ │
│ │ when payload.x > 0       │ │   ← branch 1 (predicate label)
│ │ [SetPayload] → [Transform]│ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ otherwise                │ │   ← branch 2 (default)
│ │ [Logger]                 │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

Width grows with the longest branch. Each branch gets a fold/collapse toggle for visual hygiene when not editing.

### Drag-and-drop into a scope

The palette drag handler already does point-to-canvas math. Extend it: if the drop point hits a branch's drop zone (hit-test the branch rect), append the new node to that branch's `nodes` array instead of the top-level list.

---

## 4. Execution model

### Today

```ts
async function runFlow() {
  let payload = '...';
  let vars = {};
  for (const node of executionOrder) {
    const result = await executeNode(node, payload, vars);
    payload = result.output;
    if (node.config.saveToVariable) vars[node.config.saveToVariable] = result.output;
    // status updates, error handling, etc.
  }
}
```

### Proposed

Recursive tree-walk. Each scope node defines its own semantics.

```ts
async function executeNodeList(nodes: FlowNode[], context: ExecContext): Promise<ExecContext> {
  let ctx = context;
  for (const node of nodes.filter(n => !n.disabled).sort(byX)) {
    if (node.kind === 'leaf') {
      ctx = await executeLeaf(node, ctx);
    } else {
      ctx = await executeScope(node, ctx);
    }
    if (ctx.aborted) return ctx;
  }
  return ctx;
}

async function executeScope(node: ScopeNode, ctx: ExecContext): Promise<ExecContext> {
  switch (node.type) {
    case 'choice': {
      // Find the first branch whose predicate (DW expression) evaluates truthy.
      for (const branch of node.branches) {
        if (branch.branchConfig?.isOtherwise) continue;
        const ok = await evalPredicate(branch.branchConfig?.predicate ?? 'false', ctx);
        if (ok) return executeNodeList(branch.nodes, ctx);
      }
      const otherwise = node.branches.find(b => b.branchConfig?.isOtherwise);
      return otherwise ? executeNodeList(otherwise.nodes, ctx) : ctx;
    }

    case 'scatter-gather': {
      // Run all branches concurrently against the SAME input context.
      // Aggregate results as { route1: {...}, route2: {...}, ... }.
      const branchResults = await Promise.all(
        node.branches.map(async (b) => {
          const result = await executeNodeList(b.nodes, { ...ctx, payload: ctx.payload });
          return [b.label, JSON.parse(result.payload)] as const;
        })
      );
      return { ...ctx, payload: JSON.stringify(Object.fromEntries(branchResults)) };
    }

    case 'for-each': {
      // The single branch runs once per element of the collection expression.
      const collection = JSON.parse(await evalExpr(node.config.collection ?? 'payload', ctx));
      if (!Array.isArray(collection)) throw new Error('for-each: collection is not an Array');
      const branch = node.branches[0];
      const results = [];
      for (const item of collection) {
        const sub = await executeNodeList(branch.nodes, { ...ctx, payload: JSON.stringify(item) });
        results.push(JSON.parse(sub.payload));
      }
      return { ...ctx, payload: JSON.stringify(results) };
    }

    case 'try': {
      const main = node.branches.find(b => !b.branchConfig?.isErrorHandler);
      const errorHandler = node.branches.find(b => b.branchConfig?.isErrorHandler);
      try {
        return await executeNodeList(main!.nodes, ctx);
      } catch (err) {
        if (!errorHandler) throw err;
        // Set the error info into vars so the error branch can read it
        const errCtx = { ...ctx, vars: { ...ctx.vars, error: String(err) } };
        return executeNodeList(errorHandler.nodes, errCtx);
      }
    }

    case 'parallel-for-each':
      // Like for-each but Promise.all the iterations.
      // ... (same shape as for-each but parallel)

    case 'first-successful':
      // Try each branch in order; first one that doesn't throw wins.
      // ...

    case 'round-robin':
      // For Studio, just always pick branch 0 (no real load balancing).
      return executeNodeList(node.branches[0].nodes, ctx);

    case 'async':
      // Fire and forget. In Studio: launch the sub-flow but don't await.
      // Show it as "started" status. Main flow continues with unchanged ctx.
      executeNodeList(node.branches[0].nodes, ctx).catch(() => {/* swallow */});
      return ctx;
  }
}
```

### Predicate evaluation

For Choice's `when` predicate and For Each's `collection` expression: feed them through the existing DW runner as standalone scripts that return a Boolean or Array. Cache compiled predicates by hash (the existing compile cache helps here).

---

## 5. UI changes

### Palette

Group the palette into sections:

- **Leaf nodes** (current 7): Set Payload, Transform, Set Variable, Salesforce, Database, HTTP Request, Logger
- **Scopes** (new): Choice, Scatter-Gather, For Each, Try, Parallel For Each, First Successful, Round Robin, Async

Each scope drags onto the canvas with a default branch shape:
- Choice: 2 branches (`when payload.x > 0`, `otherwise`)
- Scatter-Gather: 2 branches (`route1`, `route2`) with `+ Add route` button
- For Each: 1 branch (`iter`)
- Try: 2 branches (`main`, `on-error`)

### Scope node rendering

A scope node is a larger rectangle than a leaf. Inside its body:

- Top bar: scope type icon, label, status pill, edit/delete/duplicate buttons
- Branches: each branch is its own bordered rectangle with:
  - Branch label (editable for Choice predicates, fixed for Try `main`/`on-error`)
  - Inline mini-canvas where leaf and scope nodes can be dropped
  - `+ Add node` palette mini-trigger inside the branch
- For Scatter-Gather: `+ Add route` button under the last branch
- For Choice: `+ Add when branch` button (the `otherwise` branch stays at the bottom)

### Config panel

When a scope is selected, the right-side config panel shows scope-specific fields:

| Scope | Config fields |
|---|---|
| Choice | (none at scope level — predicates live on each branch) |
| Scatter-Gather | `timeout` (ms, optional), `aggregator strategy` (object \| array) |
| For Each | `collection` (DW expression), `batchSize` (informational, no batching in Studio), `counterVariable` |
| Parallel For Each | same as For Each + `maxConcurrency` (informational) |
| Try | (none — error info auto-routed to `vars.error`) |
| Async | (none — fire and forget) |
| First Successful | (none — branches tried in order) |
| Round Robin | informational note: "Studio always runs branch 0" |

When a branch's *label* row is selected, show that branch's config:
- Choice branches: `predicate` text input (DW boolean expression) or `Set as otherwise` toggle
- Try branches: `Mark as error handler` toggle (read-only — fixed at creation)

### Status visualization during execution

- A scope node's status is `running` while any child is running.
- A scope's status becomes `success` only when all required children succeed.
- For Scatter-Gather: branches show their individual status badges + aggregate result rolls up.
- For Choice: only the taken branch's nodes run; other branches show `skipped` (greyed).
- For Try: if `main` fails, `on-error` runs; main branch shows `error`, error branch shows `success` (or both `error` if the handler also fails).
- For For Each: a small counter badge shows `iter 3 / 10`.

### Step-through debugging

Current step-through pauses between leaf nodes. With scopes:
- Pausing at a scope boundary lets the user choose: "Step Into" (enter the branch), "Step Over" (run the whole scope and pause at the next sibling).
- For Choice: before entering, show the evaluated predicate values so the user understands which branch was picked.
- For For Each: step at each iteration (default), with a "Run remaining iterations" button.

---

## 6. Workspace JSON migration

Bump `.dwstudio` `version` field from `2` → `3`.

```ts
// workspace.rs / workspace.ts loader
function migrateV2toV3(ws: WorkspaceV2): WorkspaceV3 {
  return {
    ...ws,
    version: 3,
    flow: ws.flow?.map(addKindField) ?? [],
  };
}

function addKindField(n: any): FlowNode {
  // V2 nodes had no kind. They were all leaves.
  return { ...n, kind: 'leaf' };
}
```

Saving in v3 always writes the new shape. Loading v2 silently migrates; loading v3 in an older Studio build fails with a clear error ("This workspace uses a newer flow format — please update DataWeave Studio").

---

## 7. Order of implementation

Build in 3 phases. Each phase is independently shippable.

### Phase 1: Foundation (Choice only)

- Refactor `FlowNode` into `LeafNode | ScopeNode` discriminated union.
- Migration code for v2 → v3.
- Implement Choice (smallest scope — 2 branches, predicate eval).
- New palette section, scope node rendering, branch drag-and-drop.
- Step-through "Step Into / Step Over" for Choice.

**Effort:** ~2-3 days of solid work. Self-contained — Choice is the prototype.

### Phase 2: Iteration + parallelism (For Each, Scatter-Gather)

- For Each: collection expression evaluation, iteration counter, per-iter status.
- Scatter-Gather: `Promise.all` over branches, aggregator strategy, route management UI.
- Parallel For Each: trivial after For Each + Promise.all pattern.

**Effort:** ~2-3 days.

### Phase 3: Error scopes + niche (Try, First Successful, Round Robin, Async)

- Try: error propagation, `vars.error` injection.
- First Successful: try-catch loop over branches.
- Round Robin: degenerate case (always run branch 0 in Studio).
- Async: fire-and-forget with visual badge.

**Effort:** ~1-2 days.

**Total:** ~5-8 working days, fully shipped.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Existing flows break after refactor | v2 → v3 migration is automatic, with a one-shot transformation. Add tests that load every v2 workspace in `example/` and assert they execute to the same output. |
| Deeply nested scopes become visually unreadable | Per-branch collapse/fold toggle. Default to collapsed once a scope has ≥2 nested levels. Add a "minimap" overview if flow gets >20 nodes. |
| Predicate eval (Choice's `when`) requires a DW run per check | Cache compiled predicates by `(branchId, predicateText)` hash. The existing 64-entry LRU compile cache absorbs this — predicate scripts are tiny. |
| Step-through UX for Scatter-Gather is confusing (which branch's turn?) | Pause once per branch boundary; show parallel-execution status badges instead of stepping into one branch at a time. Provide a "Run All Branches" override. |
| Save/load round-trip drift for branches | Snapshot tests: serialize → parse → serialize must produce byte-identical output for sample workspaces. Run on CI. |
| Performance with very wide Scatter-Gather (>10 routes) | `Promise.all` is fine; the bottleneck is the DW runner. Add a max-branch warning if a Scatter-Gather has >8 routes ("DataWeave runtime serializes script compilation — branches won't be fully parallel"). |

---

## 9. Out of scope (intentionally)

These are real Mule features that we will **not** simulate, to keep Studio's positioning as "design + iterate" rather than "production runtime":

- **Real connector calls** — no actual HTTP requests, no real Salesforce login, no JDBC. Mock responses stay as today.
- **Threading model** — `Promise.all` is concurrent but not parallel in JS; that's fine for design-time. Production behavior depends on Mule's thread pool.
- **Transaction semantics** — no XA, no rollback. Try/catch shows the shape, not the persistence layer.
- **Flow references** (`flow-ref`) — would require multi-flow workspaces. Defer until Studio supports more than one flow per `.dwstudio` file.
- **VM queues / async dispatch** — same as flow-ref. Out of scope.
- **Batch jobs** — different module, very different semantics. Not part of message flow.

If users need any of the above, the answer is "deploy to Mule and use the real connector." Studio's job ends at "I'm confident my DataWeave transforms work — now hand it to the runtime."

---

## 10. Open questions

1. **Should scope nodes auto-resize as branches grow, or have fixed-size internal canvases with scroll?**
   → Recommend auto-resize with a max-height cap and a "Open in Focus mode" button to view a scope full-screen.

2. **Where do execution metrics live for scope nodes? (sum of children? per-branch?)**
   → Both: scope shows `Σ children`, each branch shows its own. Selected branch's config panel shows per-branch breakdown.

3. **Can users disable a single branch of a Choice?**
   → Yes — disabling a branch's predicate is equivalent to `false`. Disabling the `otherwise` branch means "no fallback" — flag with a warning in the config panel.

4. **Do scope nodes have a `saveToVariable`?**
   → Yes for For Each (the aggregated array) and Scatter-Gather (the aggregated object). Choice and Try inherit whatever the executed branch sets. Document this explicitly in the config panel.
