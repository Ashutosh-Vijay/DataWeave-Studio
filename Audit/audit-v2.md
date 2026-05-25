# DataWeave Studio - Component-Level Architectural & Functional Audit (v2)

This document synthesizes findings from parallel sub-agent audits targeting Mule 4 compatibility, engine execution mechanics, tech stack underutilization, and UI/UX state management.

## 1. Critical Engine & Syntax Violations

### 1.1 DataWeave Output Pane (`output application/java`)
**Severity:** Critical (Silent Failure)
**File:** `dw-server/src/main/scala/com/dwstudio/DwServer.scala`

**Issue:** The server uses a regex to rewrite `output application/java` to `application/json` so it can render on the frontend. The current regex rigidly expects an end-of-line after `application/java`. If a user adds properties (e.g., `class="..."`) or a `---` separator on the same line, the rewrite is bypassed. The server runs the script with the Java writer, and the resulting `ByteArrayOutputStream` is entirely empty, silently failing the UI.

**Fix (Lines 134-137):**
Update the regex to consume trailing unsupported properties while halting at the separator or newline.
```scala
// Replace:
// val script = rawScript.replaceAll(
//   "(?m)^(\\s*output\\s+)application/java(\\s*)$",
//   "$1application/json$2"
// )

// With:
val script = rawScript.replaceAll(
  "(?m)^(\\s*output\\s+)application/java([^\\n\\r\\-]*)",
  "$1application/json "
)
```

### 1.2 DataWeave Input Payload Crash (`input payload application/java`)
**Severity:** Critical (Engine Crash)
**File:** `src-tauri/src/dw_runner.rs`

**Issue:** When input is set to `application/java`, the Rust runner writes the mock JSON to a file and passes `input payload application/java`. DataWeave's `JavaReader` strictly requires a live, in-memory Java Object and throws a `ClassCastException` trying to parse the file. 

**Fix (Lines 378 & 396):**
Force a downcast to `application/json` for any `java` inputs before execution to parse mock data correctly. Both `run_dataweave` and `warm_dataweave_script` must include this logic.

```rust
// 1. Make the argument mutable:
mut payload_mime_type: String,

// 2. Add coercion logic before spawning:
if payload_mime_type == "application/java" {
    payload_mime_type = "application/json".to_string();
}

let mut named_inputs: Vec<NamedInput> = if named_inputs_json.trim().is_empty() || named_inputs_json.trim() == "[]" {
    vec![]
} else {
    serde_json::from_str(&named_inputs_json)
        .map_err(|e| format!("Failed to parse named inputs: {}", e))?
};

for ni in &mut named_inputs {
    if ni.mime_type == "application/java" {
        ni.mime_type = "application/json".to_string();
    }
}
```

### 1.3 Flow Designer State-Sync Data Race (Concurrent Scopes)
**Severity:** Critical (State Corruption)
**File:** `src/components/FlowDesigner.tsx`

**Issue:** Concurrent nodes (`parallel-for-each`, `scatter-gather`, `async`) temporarily swap a single shared closure variable (`ctx`) using `Object.assign` before awaiting `runList`. Yielding to the microtask queue allows concurrent branches to simultaneously mutate and destroy the shared context.

**Fix:**
Refactor the execution engine to explicitly accept `ctx` and clone the context for concurrent branches so they execute in isolation.
```typescript
// Refactor all run* functions to accept `ctx` explicitly
const runLeaf = async (node: FlowNode, ctx: typeof baseCtx): Promise<boolean> => { /* ... */ };
const runScope = async (node: FlowNode, ctx: typeof baseCtx): Promise<boolean> => { /* ... */ };
const runList = async (ns: FlowNode[], ctx: typeof baseCtx): Promise<boolean> => { /* ... */ };

// 1. Fix in runForEach (parallel iter):
const runOneIter = async (item: unknown, index: number): Promise<string | null> => {
  const iterCtx = {
    ...ctx,
    payload: typeof item === 'string' ? item : JSON.stringify(item),
    variables: { ...ctx.variables, [counterName]: String(index) },
  };
  const ok = await runList(body.nodes, iterCtx);
  return ok ? iterCtx.payload : null;
};

// 2. Fix in runScatterGather:
const runOneRoute = async (branch: Branch): Promise<{ name: string; output: string | null }> => {
  const name = (branch.label && branch.label.trim()) || `route${(node.branches!.indexOf(branch) + 1)}`;
  const branchCtx = { ...ctx, variables: { ...ctx.variables } };
  const ok = await runList(branch.nodes, branchCtx);
  return { name, output: ok ? branchCtx.payload : null };
};

// 3. Fix in runAsync:
const runAsync = async (node: FlowNode, ctx: typeof baseCtx): Promise<{ ok: boolean; summary: string }> => {
  const body = node.branches?.[0];
  if (!body || body.nodes.length === 0) return { ok: true, summary: '(empty)' };
  
  const prevSkip = skipUntilNodeRef.current;
  skipUntilNodeRef.current = node.id;
  
  const asyncCtx = { ...ctx, variables: { ...ctx.variables } };
  void (async () => {
    try { await runList(body.nodes, asyncCtx); } catch {}
  })();
  
  skipUntilNodeRef.current = prevSkip;
  return { ok: true, summary: `Spawned ${body.nodes.length} nodes asynchronously.` };
};
```

## 2. Mule 4 XML Generation Issues

### 2.1 Hallucinated Legacy Tag for Salesforce
**Severity:** High
**File:** `src/muleXmlIO.ts`

**Issue:** Exporting non-query Salesforce operations hallucinates a `<salesforce:records>` child element (from Mule 3). In Mule 4, data must be passed via the `records` attribute on the element, and a `type` attribute is required.

**Fix (Lines 161-172):**
```typescript
    case 'salesforce': {
      const op = node.config.operation || 'query';
      const query = node.config.request || '';
      const saveTo = node.config.saveToVariable;
      const isQuery = op === 'query' || op === 'select';
      const opTag = isQuery ? 'query' : op;
      
      const innerEl = isQuery
        ? `<salesforce:salesforce-query>${cdata(query)}</salesforce:salesforce-query>`
        : '';
        
      const targetAttr = saveTo ? ` target="${escXml(saveTo)}"` : '';
      const typeAttr = isQuery ? '' : ' type="UnknownObject"'; // Requires user input or placeholder
      const recordsAttr = (!isQuery && query) ? attr('records', query.trim().startsWith('#[') ? query : `#[${cdataish(query)}]`) : '';
      
      const lines: string[] = [
        `<salesforce:${opTag}${attr('config-ref', 'Salesforce_Config')}${typeAttr}${recordsAttr}${targetAttr}${docAttrs(node)}>${innerEl ? '\n' + indent(innerEl, 1) + '\n</salesforce:' + opTag + '>' : '/>'}`,
      ];
      // ...
```

### 2.2 Incorrect Literal Wrapping in Set Payload / Variables
**Severity:** High
**File:** `src/muleXmlIO.ts`

**Issue:** The ternary forces plain string values into `#[... ]`, making Mule 4 evaluate them as DataWeave 2.0 expressions. This causes runtime errors (e.g. `#[Hello]` evaluates as an undefined variable instead of a literal string "Hello").

**Fix (`set-payload` Lines 114-118, `set-variable` Lines 149-151):**
```typescript
      // Fix for set-payload
      const looksLikeExpr = value.trim().startsWith('#[');
      const lines: string[] = [
        `<set-payload${attr('value', looksLikeExpr ? value : cdataish(value))}${attr('mimeType', mime)}${docAttrs(node)}/>`,
      ];

      // Fix for set-variable
      const raw = node.config.variableValue || '';
      const value = raw.trim().startsWith('#[') ? raw : cdataish(raw);
      return `<set-variable${attr('variableName', name)}${attr('value', value)}${docAttrs(node)}/>`;
```

## 3. UI/UX & Flow Designer Optimizations

### 3.1 O(N) Deep Cloning Keystroke Bottleneck
**Severity:** High (Performance)
**File:** `src/components/FlowDesigner.tsx`

**Issue:** `mapNodesDeep` unconditionally clones arrays and recurse into all branches even when unmodified, stripping referential equality and destroying React's memoization, causing lag on keystrokes in large flows.

**Fix:**
```typescript
function mapNodesDeep(nodes: FlowNode[], fn: (n: FlowNode) => FlowNode): FlowNode[] {
  let arrayChanged = false;
  const newNodes = nodes.map((n) => {
    const mapped = fn(n);
    if (mapped !== n) arrayChanged = true;
    
    if (mapped.branches) {
      let branchesChanged = false;
      const newBranches = mapped.branches.map((b) => {
        const newInnerNodes = mapNodesDeep(b.nodes, fn);
        if (newInnerNodes !== b.nodes) branchesChanged = true;
        return newInnerNodes !== b.nodes ? { ...b, nodes: newInnerNodes } : b;
      });
      if (branchesChanged) {
        arrayChanged = true;
        return { ...mapped, branches: newBranches };
      }
    }
    return mapped;
  });
  return arrayChanged ? newNodes : nodes;
}
```

### 3.2 Shallow Clone on Node Duplication
**Severity:** High (State-Sync)
**File:** `src/components/FlowDesigner.tsx`

**Issue:** Duplicating nodes copies deeply nested branches by reference, silently altering the original node tree when the duplicate is mutated.

**Fix:**
```typescript
  const duplicateNode = useCallback((id: string) => {
    setNodes((prev) => {
      const src = prev.find((n) => n.id === id);
      if (!src) return prev;
      
      const deepClone = (n: FlowNode): FlowNode => ({
        ...n,
        id: newId(),
        status: 'idle',
        output: undefined,
        error: undefined,
        executionTimeMs: undefined,
        branches: n.branches?.map((b) => ({
          ...b,
          id: newId(),
          nodes: b.nodes.map(deepClone),
        })),
      });

      const clone = deepClone(src);
      clone.x = src.x + 40;
      clone.y = src.y + 40;
      return [...prev, clone];
    });
  }, []);
```

### 3.3 Canvas Zoom Desync & Jitter
**Severity:** Moderate (Visual)
**File:** `src/components/FlowDesigner.tsx`

**Issue:** Synchronously setting `canvas.scrollLeft` right after calling `setZoom` hits an unscaled boundary because React batches the scale update asynchronously.

**Fix:**
```typescript
        const next = Math.min(2, Math.max(0.25, z - e.deltaY * 0.002));
        setZoom(next);
        setContextMenu(null);
        
        // Wait for React to apply the new transform scale before setting scroll
        setTimeout(() => {
          if (canvasRef.current) {
            canvasRef.current.scrollLeft = wx * next - mx;
            canvasRef.current.scrollTop = wy * next - my;
          }
        }, 0);
```

## 4. Tech Stack Exploitation (Zero Dependency Feature Additions)

### 4.1 Zero-Friction Drag and Drop
**Underutilization:** No file drag-and-drop support. Dropping a file currently breaks the app.
**File:** `src/App.tsx`
**Fix:**
```tsx
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => e.preventDefault();
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const ext = file.name.split('.').pop()?.toLowerCase();
        
        if (ext === 'dwl') {
          workspace.setScript(text);
        } else if (ext === 'json') {
          workspace.setPayload(text);
          workspace.setPayloadMimeType('application/json');
        } else if (ext === 'xml') {
          workspace.setPayload(text);
          workspace.setPayloadMimeType('application/xml');
        } else if (ext === 'csv') {
          workspace.setPayload(text);
          workspace.setPayloadMimeType('application/csv');
        } else {
          workspace.setPayload(text);
        }
      } catch (err) {
        console.error("Failed to read dropped file", err);
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [workspace]);
```

### 4.2 Preserving Monaco Undo History
**Underutilization:** Changing tabs destroys undo history. Passing `path` caches the model in `@monaco-editor/react`.
**File:** `src/components/ScriptEditor.tsx` & `src/App.tsx`
**Fix:**
```tsx
// src/components/ScriptEditor.tsx
interface ScriptEditorProps {
  id?: string;
  code: string;
  // ...

// In render:
        <Editor
          path={id} // Automatically maintains multiple ITextModels
          height="100%"
          language="dataweave"
// ...
```
Pass the request/workspace ID from the parent.

### 4.3 Production Logging (`tauri-plugin-log`)
**Underutilization:** Logs are disabled in release builds.
**File:** `src-tauri/src/lib.rs`
**Fix:** Remove `cfg!(debug_assertions)` and add `TargetKind::LogDir`.
```rust
            use tauri_plugin_log::{Target, TargetKind};
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Warn) // Adjust as necessary
                    .targets([
                        Target::new(TargetKind::Stdout),
                        Target::new(TargetKind::Webview),
                        Target::new(TargetKind::LogDir),
                    ])
                    .build(),
            )?;
```

### 4.4 Window State Persistence
**Underutilization:** Window bounds reset every launch.
**File:** `src/main.tsx` or `App.tsx`
**Fix:**
```tsx
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize, LogicalPosition } from '@tauri-apps/api/dpi';

const win = getCurrentWindow();
try {
  const state = localStorage.getItem('dw.windowState');
  if (state) {
    const { width, height, x, y } = JSON.parse(state);
    win.setSize(new LogicalSize(width, height));
    win.setPosition(new LogicalPosition(x, y));
  }
} catch (e) { /* ignore */ }

let saveTimeout: any;
const saveState = async () => {
  try {
    const size = await win.innerSize();
    const pos = await win.innerPosition();
    localStorage.setItem('dw.windowState', JSON.stringify({ 
      width: size.width, height: size.height, x: pos.x, y: pos.y 
    }));
  } catch (e) { /* ignore */ }
};

win.listen('tauri://resize', () => { clearTimeout(saveTimeout); saveTimeout = setTimeout(saveState, 500); });
win.listen('tauri://move', () => { clearTimeout(saveTimeout); saveTimeout = setTimeout(saveState, 500); });
```
