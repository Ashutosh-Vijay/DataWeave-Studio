import { useState, useCallback, useRef, useMemo } from 'react';
import { invoke } from '../bridge';
import { findInlineScripts, replaceInlineScript, InlineScript } from '../muleInline';
import {
  WorkspaceFile,
  ContextState,
  MimeType,
  NamedInput,
  MultipartPart,
  Request,
  RequestKind,
} from '../types';

// ===========================================================================
// useWorkspace v2 — a workspace is a *collection* of requests.
//
// State shape:
//   - workspace-level: projectName, requests[], activeRequestId, flow
//   - per-request (mutated through the setters below): script, payload,
//     context, etc.
//
// The setters operate on the active request. Components that need to read
// the active request's fields use `request` (the memoized active object).
// ===========================================================================

const DEFAULT_CONTEXT: ContextState = {
  method: 'GET',
  queryParams: [],
  headers: [],
  vars: [],
};

const DEFAULT_SCRIPT = `%dw 2.0
output application/json
---
{
  hello: payload.message
}`;

const DEFAULT_PAYLOAD = `{
  "message": "world"
}`;

const DEFAULT_SCRIPTS: Record<string, string> = {
  Transform: DEFAULT_SCRIPT,
  'Salesforce Query': '%dw 2.0\noutput application/json\n---\n{\n  drink: payload.drink\n}',
  'DB Query': '%dw 2.0\noutput application/json\n---\n{\n  id: payload.id\n}',
};

function defaultScriptFor(label: string): string {
  return DEFAULT_SCRIPTS[label] ?? DEFAULT_SCRIPT;
}

const inlineKey = (s: InlineScript) => `${s.flow}\n${s.transform}\n${s.target}`;

/** Which inline script of `xml` an entry is linked to: its saved position if
 *  that still holds the same text, or the same flow, transform and target;
 *  else wherever either now sits. -1 when it cannot be told apart. */
function xmlSlot(xml: string, r: { xmlIndex?: number; xmlKey?: string }, known: string | undefined): number {
  const all = findInlineScripts(xml);
  const at = all[r.xmlIndex ?? -1];
  if (at && (at.text === known || inlineKey(at) === r.xmlKey)) return at.index;
  const byText = all.filter((s) => s.text === known);
  if (byText.length === 1) return byText[0].index;
  const byKey = all.filter((s) => inlineKey(s) === r.xmlKey);
  return byKey.length === 1 ? byKey[0].index : -1;
}

/** What a linked entry's file holds for it right now. */
async function readLinked(r: Request, known: string | undefined): Promise<{ text: string; xmlIndex?: number }> {
  const file = await invoke<string>('read_text_file', { path: r.filePath });
  if (r.xmlIndex === undefined) return { text: file };
  const slot = xmlSlot(file, r, known);
  if (slot < 0) throw new Error(`${r.name} is no longer where it was in the XML.`);
  return { text: findInlineScripts(file)[slot].text, xmlIndex: slot };
}

function genId(prefix: string): string {
  // Short pseudo-unique ID. Not crypto, just enough to disambiguate within
  // a workspace. Format matches the Rust side's uuid_like_id().
  const ms = Date.now().toString(16);
  const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${prefix}-${ms}${rand}`;
}

/** The suite a new test starts from — the shape of a dw::test file, with one
 *  assertion that passes, so Run does something on the first press. */
const DEFAULT_SUITE = [
  '%dw 2.0',
  'import * from dw::test::Tests',
  'import * from dw::test::Asserts',
  '---',
  '"my transform" describedBy [',
  '    "adds correctly" in do {',
  '        (1 + 1) must equalTo(2)',
  '    },',
  ']',
].join('\n');

function blankRequest(name = 'Script'): Request {
  return {
    id: genId('req'),
    name,
    kind: 'script',
    script: DEFAULT_SCRIPT,
    payload: DEFAULT_PAYLOAD,
    payloadMimeType: 'application/json',
    nodeLabel: 'Transform',
    namedInputs: [],
    queryTemplate: '',
    classpath: [],
    timeoutMs: undefined,
    payloadFilePath: undefined,
    multipartParts: [],
    context: { ...DEFAULT_CONTEXT },
    tests: [],
  };
}

/** A test entry. Payload and context are left at their defaults and never
 *  shown: a dw::test suite supplies its own fixtures. */
function blankTest(name = 'Tests'): Request {
  return { ...blankRequest(name), id: genId('test'), kind: 'test', script: DEFAULT_SUITE };
}

/**
 * Pull suites that used to live in `testScript` out into entries of their own.
 *
 * Runs on every load, so a workspace saved before tests were separate opens
 * with its suite intact and visible in the list rather than hidden inside a
 * script entry. Idempotent: `testScript` is cleared as it is migrated, and a
 * file with none passes through untouched.
 */
function migrateEmbeddedTests(reqs: Request[]): Request[] {
  const out: Request[] = [];
  for (const r of reqs) {
    const suite = (r.testScript ?? '').trim();
    out.push(suite ? { ...r, kind: r.kind ?? 'script', testScript: undefined } : { ...r, kind: r.kind ?? 'script' });
    if (suite) {
      out.push({ ...blankTest(`${r.name} tests`), script: r.testScript as string });
    }
  }
  return out;
}

interface UseWorkspaceReturn {
  // Workspace-level
  projectName: string;
  /** This workspace's target runtime. Undefined = inherit the app-wide one. */
  languageLevel: string | undefined;
  /** Set this workspace's target runtime (per-workspace override only). */
  setWorkspaceTarget: (level: string) => void;
  requests: Request[];
  activeRequestId: string;
  flow: unknown;
  isDirty: boolean;
  currentFile: string | null;
  setProjectName: (name: string) => void;
  setFlow: (flow: unknown) => void;

  // Active request — read these for the editors
  request: Request;
  // Convenience aliases that read from `request` so existing UI code keeps
  // working without a tree-wide rename.
  script: string;
  payload: string;
  payloadMimeType: MimeType;
  payloadFilePath: string | null;
  multipartParts: MultipartPart[];
  nodeLabel: string;
  context: ContextState;
  namedInputs: NamedInput[];
  queryTemplate: string;
  classpath: string[];
  timeoutMs: number;

  // Per-active-request setters
  setScript: (script: string) => void;
  setPayload: (payload: string) => void;
  setPayloadMimeType: (mime: MimeType) => void;
  setPayloadFilePath: (path: string | null) => void;
  setMultipartParts: (parts: MultipartPart[]) => void;
  setNodeLabel: (label: string) => void;
  setContext: (ctx: ContextState) => void;
  setNamedInputs: (inputs: NamedInput[]) => void;
  setQueryTemplate: (query: string) => void;
  setClasspath: (cp: string[]) => void;
  setTimeoutMs: (ms: number) => void;
  /** Replace this request's dw::test suite. */

  // Request collection management
  addRequest: (name?: string, kind?: RequestKind, script?: string) => void;
  removeRequest: (id: string) => void;
  renameRequest: (id: string, name: string) => void;
  selectRequest: (id: string) => void;
  duplicateRequest: (id: string) => void;

  // Persistence
  /** Also writes every linked .dwl whose script changed. Throws "changed on
   *  disk" when one was modified outside the app, unless `overwriteChanged`. */
  saveWorkspace: (nameOverride?: string, overwriteChanged?: boolean) => Promise<string>;
  /** Open a .dwl file as a script entry linked to that path. */
  openScriptFile: (path: string) => Promise<void>;
  /** Open inline transform `index` of a Mule XML file as a script entry that saves back into it. */
  openInlineScript: (path: string, index: number) => Promise<void>;
  /** Write the active script to a .dwl file and link the entry to it. */
  saveScriptAs: (path: string) => Promise<void>;
  /** Replace linked scripts with the file's text where the file changed outside the app. */
  reloadScriptFiles: () => Promise<void>;
  /** The .dwl paths the last save wrote. */
  lastWrittenFiles: { current: string[] };
  loadWorkspace: (filename: string) => Promise<void>;
  listWorkspaces: () => Promise<{ filename: string; projectName: string; requestCount: number; updatedAt: string; createdAt: string; flowCount: number; requests: { name: string; nodeLabel: string }[] }[]>;
  deleteWorkspace: (filename: string) => Promise<void>;
  /** Rename a saved workspace on disk (no need to open it). Keeps in-memory
   *  name/file refs in sync when the renamed one is currently open. */
  renameWorkspaceFile: (filename: string, newName: string) => Promise<string>;
  /** Duplicate a saved workspace on disk ("X" → "X copy"). */
  duplicateWorkspaceFile: (filename: string) => Promise<string>;
  newWorkspace: () => void;
  duplicateWorkspace: () => void;
  /** Restore a whole workspace state from a snapshot (used for draft
   *  resume). Pass the full collection; the hook replaces its state. */
  restoreSnapshot: (snap: { projectName: string; requests: Request[]; activeRequestId?: string; languageLevel?: string; flow?: unknown; currentFile?: string | null }) => void;
}

export function useWorkspace(): UseWorkspaceReturn {
  const [projectName, setProjectNameState] = useState('Untitled');
  const [languageLevel, setLanguageLevelState] = useState<string | undefined>(undefined);
  const initial = blankRequest('Script');
  const [requests, setRequests] = useState<Request[]>([initial]);
  const [activeRequestId, setActiveRequestIdState] = useState<string>(initial.id);
  // The active id, readable before the next render. Setters called straight
  // after newWorkspace() / addRequest() in the same tick used to write to the
  // entry that had just been replaced, so the write vanished.
  const activeIdRef = useRef(initial.id);
  const setActiveRequestId = useCallback((id: string) => { activeIdRef.current = id; setActiveRequestIdState(id); }, []);
  const [flow, setFlowState] = useState<unknown>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [currentFile, setCurrentFile] = useState<string | null>(null);

  // Keep per-(request, label) scripts in sync without extra re-renders. Map
  // key is `${requestId}::${nodeLabel}` so each request has its own
  // remembered scripts per role.
  const scriptsByLabel = useRef<Map<string, string>>(new Map());
  const labelKey = (reqId: string, label: string) => `${reqId}::${label}`;

  // Linked scripts (a .dwl, or one transform inside a Mule XML): entry id →
  // the text last read from or written to disk. A script that differs from
  // this needs writing; a file that differs from this was changed outside the app.
  const diskScripts = useRef<Map<string, string>>(new Map());
  const lastWrittenFiles = useRef<string[]>([]);

  // Find & update the active request — used by every per-request setter.
  const updateActive = useCallback((mutator: (r: Request) => Request) => {
    setRequests((prev) => prev.map((r) => (r.id === activeIdRef.current ? mutator(r) : r)));
    setIsDirty(true);
  }, []);

  const active: Request = useMemo(
    () => requests.find((r) => r.id === activeRequestId) || requests[0] || blankRequest(),
    [requests, activeRequestId],
  );

  // ── Workspace-level setters ──────────────────────────────────────────
  const setProjectName = useCallback((name: string) => { setProjectNameState(name); setIsDirty(true); }, []);
  const setWorkspaceTarget = useCallback((level: string) => { setLanguageLevelState(level); setIsDirty(true); }, []);
  const setFlow = useCallback((f: unknown) => { setFlowState(f); setIsDirty(true); }, []);

  // ── Per-request setters ──────────────────────────────────────────────
  const setScript = useCallback((val: string) => {
    scriptsByLabel.current.set(labelKey(activeIdRef.current, active.nodeLabel), val);
    updateActive((r) => ({ ...r, script: val }));
  }, [activeRequestId, active.nodeLabel, updateActive]);

  const setPayload = useCallback((val: string) => updateActive((r) => ({ ...r, payload: val })), [updateActive]);
  const setPayloadMimeType = useCallback((mime: MimeType) => updateActive((r) => ({
    ...r,
    payloadMimeType: mime,
    // Leaving a binary format must drop the picked file — the runner prefers
    // payloadFilePath over the editor text, so a stale file would silently
    // override what the user sees in the payload editor.
    payloadFilePath: ['application/octet-stream', 'application/xlsx', 'application/avro', 'application/protobuf'].includes(mime)
      ? r.payloadFilePath
      : undefined,
  })), [updateActive]);
  const setPayloadFilePath = useCallback((path: string | null) => updateActive((r) => ({ ...r, payloadFilePath: path ?? undefined })), [updateActive]);
  const setMultipartParts = useCallback((parts: MultipartPart[]) => updateActive((r) => ({ ...r, multipartParts: parts })), [updateActive]);
  const setContext = useCallback((ctx: ContextState) => updateActive((r) => ({ ...r, context: ctx })), [updateActive]);
  const setNamedInputs = useCallback((inputs: NamedInput[]) => updateActive((r) => ({ ...r, namedInputs: inputs })), [updateActive]);
  const setQueryTemplate = useCallback((q: string) => updateActive((r) => ({ ...r, queryTemplate: q })), [updateActive]);
  // Classpath and timeout are set in Settings, where nothing says "for this
  // script", so they apply to every entry in the workspace.
  const setClasspath = useCallback((cp: string[]) => { setRequests((prev) => prev.map((r) => ({ ...r, classpath: cp }))); setIsDirty(true); }, []);
  const setTimeoutMs = useCallback((ms: number) => { setRequests((prev) => prev.map((r) => ({ ...r, timeoutMs: ms }))); setIsDirty(true); }, []);

  const setNodeLabel = useCallback((label: string) => {
    // Switching role: stash the current script for this request+label,
    // restore the previous script for the new label (or fall back to the
    // role's default starter template).
    setRequests((prev) => prev.map((r) => {
      if (r.id !== activeRequestId) return r;
      if (label === r.nodeLabel) return r;
      // Save current script under (requestId, currentLabel).
      scriptsByLabel.current.set(labelKey(r.id, r.nodeLabel), r.script);
      const restored = scriptsByLabel.current.get(labelKey(r.id, label)) ?? defaultScriptFor(label);
      return { ...r, nodeLabel: label, script: restored };
    }));
    setIsDirty(true);
  }, [activeRequestId]);

  // ── Request-collection management ────────────────────────────────────
  /** `script` seeds the new entry's source. It has to be passed in rather than
   *  set afterwards: every per-entry setter writes to whatever was active when
   *  the render closed over it, so a `setScript` straight after this would land
   *  on the PREVIOUS entry. */
  const addRequest = useCallback((name?: string, kind: RequestKind = 'script', script?: string) => {
    const base = kind === 'test'
      ? blankTest(name ?? 'New tests')
      : blankRequest(name ?? 'New script');
    const req = script === undefined ? base : { ...base, script };
    setRequests((prev) => [...prev, { ...req, classpath: prev[0]?.classpath ?? [], timeoutMs: prev[0]?.timeoutMs }]);
    setActiveRequestId(req.id);
    setIsDirty(true);
  }, []);

  const removeRequest = useCallback((id: string) => {
    setRequests((prev) => {
      // A workspace always keeps at least one SCRIPT; tests can all be deleted.
      const target = prev.find((r) => r.id === id);
      const scripts = prev.filter((r) => (r.kind ?? 'script') === 'script');
      if (target && (target.kind ?? 'script') === 'script' && scripts.length <= 1) return prev;
      const next = prev.filter((r) => r.id !== id);
      // If we removed the active one, pick a neighbor.
      if (id === activeRequestId) {
        const idx = prev.findIndex((r) => r.id === id);
        const fallback = next[Math.max(0, Math.min(idx, next.length - 1))];
        setActiveRequestId(fallback.id);
      }
      return next;
    });
    setIsDirty(true);
  }, [activeRequestId]);

  const renameRequest = useCallback((id: string, name: string) => {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
    setIsDirty(true);
  }, []);

  const selectRequest = useCallback((id: string) => {
    setActiveRequestId(id);
    // Don't mark dirty — purely a view-state change.
  }, []);

  const duplicateRequest = useCallback((id: string) => {
    setRequests((prev) => {
      const src = prev.find((r) => r.id === id);
      if (!src) return prev;
      // The copy is not linked to the .dwl: two entries saving to one file would fight.
      const copy: Request = { ...src, id: genId('req'), name: `${src.name} copy`, filePath: undefined, xmlIndex: undefined, xmlKey: undefined };
      const idx = prev.findIndex((r) => r.id === id);
      const next = [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
      setActiveRequestId(copy.id);
      return next;
    });
    setIsDirty(true);
  }, []);

  // ── Persistence ──────────────────────────────────────────────────────
  const openScriptFile = useCallback(async (path: string) => {
    // Already open: go to it, keeping whatever edits it has.
    const existing = requests.find((r) => r.xmlIndex === undefined && r.filePath?.toLowerCase() === path.toLowerCase());
    if (existing) { setActiveRequestId(existing.id); return; }
    const text = await invoke<string>('read_text_file', { path });
    const name = path.split(/[/\\]/).pop() || 'script.dwl';
    const base = /^\s*import\b.*\bdw::test::Tests\b/m.test(text) ? blankTest(name) : blankRequest(name);
    const req: Request = { ...base, script: text, filePath: path };
    diskScripts.current.set(req.id, text);
    scriptsByLabel.current.set(labelKey(req.id, req.nodeLabel), text);
    setRequests((prev) => [...prev, { ...req, classpath: prev[0]?.classpath ?? [], timeoutMs: prev[0]?.timeoutMs }]);
    setActiveRequestId(req.id);
    setIsDirty(true);
  }, [requests]);

  const openInlineScript = useCallback(async (path: string, index: number) => {
    const existing = requests.find((r) => r.xmlIndex === index && r.filePath?.toLowerCase() === path.toLowerCase());
    if (existing) { setActiveRequestId(existing.id); return; }
    const s = findInlineScripts(await invoke<string>('read_text_file', { path }))[index];
    if (!s) throw new Error('That transform is no longer in the file.');
    const req: Request = {
      ...blankRequest(`${s.transform || s.flow || path.split(/[/\\]/).pop()} · ${s.target}`),
      script: s.text, filePath: path, xmlIndex: index, xmlKey: inlineKey(s),
    };
    diskScripts.current.set(req.id, s.text);
    scriptsByLabel.current.set(labelKey(req.id, req.nodeLabel), s.text);
    setRequests((prev) => [...prev, { ...req, classpath: prev[0]?.classpath ?? [], timeoutMs: prev[0]?.timeoutMs }]);
    setActiveRequestId(req.id);
    setIsDirty(true);
  }, [requests]);

  const saveScriptAs = useCallback(async (path: string) => {
    await invoke('save_output_file', { path, content: active.script });
    diskScripts.current.set(active.id, active.script);
    updateActive((r) => ({ ...r, filePath: path, xmlIndex: undefined, xmlKey: undefined, name: path.split(/[/\\]/).pop() || r.name }));
  }, [active.id, active.script, updateActive]);

  const reloadScriptFiles = useCallback(async () => {
    const fresh = new Map<string, { text: string; xmlIndex?: number }>();
    for (const r of requests) {
      if (!r.filePath) continue;
      const known = diskScripts.current.get(r.id);
      const got = await readLinked(r, known).catch(() => null);
      if (got && got.text !== known) fresh.set(r.id, got);
    }
    fresh.forEach((got, id) => diskScripts.current.set(id, got.text));
    setRequests((prev) => prev.map((r) => {
      const got = fresh.get(r.id);
      if (!got) return r;
      scriptsByLabel.current.set(labelKey(r.id, r.nodeLabel), got.text);
      return { ...r, script: got.text, xmlIndex: got.xmlIndex };
    }));
  }, [requests]);

  const saveWorkspace = useCallback(async (nameOverride?: string, overwriteChanged?: boolean) => {
    // Linked files first: the file is where the script lives, the workspace
    // only keeps a copy next to its payload and context.
    lastWrittenFiles.current = [];
    for (const r of requests) {
      const known = diskScripts.current.get(r.id);
      if (!r.filePath || r.script === known) continue;
      const file = await invoke<string>('read_text_file', { path: r.filePath }).catch(() => null);
      let content = r.script;
      if (r.xmlIndex !== undefined) {
        // One transform inside a Mule XML: put it back where it came from and
        // leave the rest of the file as it is on disk right now.
        if (file === null) throw new Error(`Could not read ${r.filePath}.`);
        const slot = xmlSlot(file, r, known);
        if (slot < 0) throw new Error(`${r.name} is no longer where it was in the XML. Use "Save script as .dwl" to keep your edits.`);
        if (!overwriteChanged && known !== undefined && findInlineScripts(file)[slot].text !== known) {
          throw new Error(`${r.name} changed on disk since it was opened.`);
        }
        content = replaceInlineScript(file, slot, r.script);
      } else if (!overwriteChanged && known !== undefined && file !== null && file !== known) {
        throw new Error(`${r.name} changed on disk since it was opened.`);
      }
      await invoke('save_output_file', { path: r.filePath, content });
      diskScripts.current.set(r.id, r.script);
      lastWrittenFiles.current.push(r.filePath);
    }
    // A name passed in wins over state: a caller that has just called
    // setProjectName() would otherwise save under the previous name.
    const name = typeof nameOverride === 'string' ? nameOverride : projectName;
    const workspace: WorkspaceFile = {
      version: '2.0',
      projectName: name,
      createdAt: '',
      updatedAt: '',
      requests,
      activeRequestId,
      languageLevel,
      flow: flow ?? undefined,
    };
    // A new workspace whose name is already taken (a second "Untitled") is
    // saved as "Untitled 2" rather than over the first one.
    let path = '';
    for (let n = 2; ; n++) {
      try {
        path = await invoke<string>('save_workspace', { workspace, currentFile });
        break;
      } catch (e) {
        if (currentFile || n > 50 || !String((e as Error)?.message ?? e).includes('is already saved')) throw e;
        workspace.projectName = `${name} ${n}`;
      }
    }
    if (workspace.projectName !== projectName) setProjectNameState(workspace.projectName);
    setIsDirty(false);
    const filename = path.split(/[/\\]/).pop() || '';
    // Rename semantics: the filename derives from the project name, so a
    // renamed workspace saves to a NEW file — remove the old one instead of
    // leaving a stale ghost in every workspace list.
    // Compared without case: on Windows "Orders" and "orders" are one file, and
    // deleting the "old" one would delete what was just written.
    const previous = currentFile && currentFile.toLowerCase() !== filename.toLowerCase() ? currentFile : null;
    if (previous) {
      try { await invoke('delete_workspace', { filename: previous }); } catch { /* best-effort */ }
    }
    setCurrentFile(filename);
    // Let list surfaces (sidebar) refresh + migrate pinned entries on rename.
    window.dispatchEvent(new CustomEvent('dw:workspaces-changed', {
      detail: previous ? { renamedFrom: previous, renamedTo: filename } : undefined,
    }));
    return path;
  }, [projectName, requests, activeRequestId, languageLevel, flow, currentFile]);

  const loadWorkspace = useCallback(async (filename: string) => {
    const ws = await invoke<WorkspaceFile>('load_workspace', { filename });
    scriptsByLabel.current = new Map();
    const reqs = migrateEmbeddedTests(
      ws.requests && ws.requests.length > 0 ? ws.requests : [blankRequest()],
    );
    // A workspace can legitimately arrive with a partial context: the v1→v2
    // migration writes `context: raw.context ?? {}`, and the blank-request
    // fallback in both backends writes `context: {}`. ContextPanel reads
    // .queryParams/.headers/.vars unguarded, so one missing array takes the
    // whole app down behind the error boundary rather than just showing an
    // empty tab. Fresh arrays per request — DEFAULT_CONTEXT's are shared.
    for (const r of reqs) {
      const c = (r.context ?? {}) as Partial<ContextState>;
      r.context = {
        ...c,
        method: c.method ?? 'GET',
        queryParams: c.queryParams ?? [],
        headers: c.headers ?? [],
        vars: c.vars ?? [],
      };
    }
    // A linked .dwl is the script: what the file says now wins over the copy
    // saved in the workspace. A file that is gone keeps the saved copy.
    for (const r of reqs) {
      if (!r.filePath) continue;
      try {
        // The saved copy says which transform this was, should the XML have
        // been edited around it since.
        const got = await readLinked(r, r.script);
        r.script = got.text;
        r.xmlIndex = got.xmlIndex;
        diskScripts.current.set(r.id, r.script);
      } catch { diskScripts.current.delete(r.id); }
    }
    // Seed the per-(request, label) script cache from the loaded data so
    // role-switching remembers what was on disk.
    for (const r of reqs) {
      scriptsByLabel.current.set(labelKey(r.id, r.nodeLabel), r.script);
    }
    setProjectNameState(ws.projectName);
    setRequests(reqs);
    setActiveRequestId(ws.activeRequestId || reqs[0].id);
    setLanguageLevelState(ws.languageLevel);
    setFlowState(ws.flow ?? null);
    setCurrentFile(filename);
    setIsDirty(false);
  }, []);

  const listWorkspaces = useCallback(async () => {
    const metas = await invoke<{ filename: string; projectName: string; mode: string; requestCount?: number; updatedAt?: string; createdAt?: string; flowCount?: number; requests?: { name: string; nodeLabel: string }[] }[]>('list_workspaces_meta');
    // "flow"-only legacy files have no requests; v2 always has at least 1.
    // Most-recently-saved first — every list surface shows true recency.
    return metas
      .filter((m) => m.mode !== 'flow')
      .map((m) => ({
        filename: m.filename,
        projectName: m.projectName,
        requestCount: m.requestCount ?? 1,
        updatedAt: m.updatedAt ?? '',
        createdAt: m.createdAt ?? '',
        flowCount: m.flowCount ?? 0,
        requests: m.requests ?? [],
      }))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, []);

  const deleteWorkspace = useCallback(async (filename: string) => {
    await invoke('delete_workspace', { filename });
    if (currentFile === filename) setCurrentFile(null);
    window.dispatchEvent(new CustomEvent('dw:workspaces-changed'));
  }, [currentFile]);

  const renameWorkspaceFile = useCallback(async (filename: string, newName: string) => {
    const newFilename = await invoke<string>('rename_workspace', { filename, newName });
    // Renaming the OPEN workspace: sync the in-memory name + file ref, or the
    // next ⌘S would re-save under the old name and effectively undo the rename.
    if (currentFile === filename) {
      setProjectNameState(newName.trim());
      setCurrentFile(newFilename);
    }
    window.dispatchEvent(new CustomEvent('dw:workspaces-changed', {
      detail: newFilename !== filename ? { renamedFrom: filename, renamedTo: newFilename } : undefined,
    }));
    return newFilename;
  }, [currentFile]);

  const duplicateWorkspaceFile = useCallback(async (filename: string) => {
    const newFilename = await invoke<string>('duplicate_workspace_file', { filename });
    window.dispatchEvent(new CustomEvent('dw:workspaces-changed'));
    return newFilename;
  }, []);

  const duplicateWorkspace = useCallback(() => {
    const base = projectName.replace(/\s+copy(?:\s+\d+)?$/i, '');
    setProjectNameState(`${base} copy`);
    setCurrentFile(null);
    setIsDirty(true);
  }, [projectName]);

  const newWorkspace = useCallback(() => {
    scriptsByLabel.current = new Map();
    const req = blankRequest('Script');
    setProjectNameState('Untitled');
    setRequests([req]);
    setActiveRequestId(req.id);
    setLanguageLevelState(undefined);
    setFlowState(null);
    setCurrentFile(null);
    setIsDirty(false);
  }, []);

  const restoreSnapshot = useCallback((snap: { projectName: string; requests: Request[]; activeRequestId?: string; languageLevel?: string; flow?: unknown; currentFile?: string | null }) => {
    scriptsByLabel.current = new Map();
    const reqs = snap.requests.length > 0 ? snap.requests : [blankRequest()];
    for (const r of reqs) {
      scriptsByLabel.current.set(labelKey(r.id, r.nodeLabel), r.script);
      // A draft holds unsaved edits; learn what its linked files hold now so
      // the next save can tell an edit from a change made outside the app.
      if (r.filePath) readLinked(r, undefined).then((got) => diskScripts.current.set(r.id, got.text), () => {});
    }
    setProjectNameState(snap.projectName);
    setRequests(reqs);
    setActiveRequestId(snap.activeRequestId || reqs[0].id);
    setLanguageLevelState(snap.languageLevel);
    setFlowState(snap.flow ?? null);
    // A draft of a saved workspace still belongs to that file, so Save goes
    // back to it instead of being treated as a second workspace of that name.
    setCurrentFile(snap.currentFile ?? null);
    setIsDirty(true); // a restored draft is by definition unsaved
  }, []);

  return {
    // Workspace-level
    projectName,
    languageLevel,
    setWorkspaceTarget,
    requests,
    activeRequestId,
    flow,
    isDirty,
    currentFile,
    setProjectName,
    setFlow,

    // Active-request mirrors
    request: active,
    script: active.script,
    payload: active.payload,
    payloadMimeType: active.payloadMimeType,
    payloadFilePath: active.payloadFilePath ?? null,
    multipartParts: active.multipartParts,
    nodeLabel: active.nodeLabel,
    context: active.context,
    namedInputs: active.namedInputs,
    queryTemplate: active.queryTemplate,
    classpath: active.classpath,
    timeoutMs: active.timeoutMs ?? 30000,

    setScript,
    setPayload,
    setPayloadMimeType,
    setPayloadFilePath,
    setMultipartParts,
    setNodeLabel,
    setContext,
    setNamedInputs,
    setQueryTemplate,
    setClasspath,
    setTimeoutMs,

    addRequest,
    removeRequest,
    renameRequest,
    selectRequest,
    duplicateRequest,

    saveWorkspace,
    openScriptFile,
    openInlineScript,
    saveScriptAs,
    reloadScriptFiles,
    lastWrittenFiles,
    loadWorkspace,
    listWorkspaces,
    deleteWorkspace,
    renameWorkspaceFile,
    duplicateWorkspaceFile,
    newWorkspace,
    duplicateWorkspace,
    restoreSnapshot,
  };
}
