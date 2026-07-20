import { useState, useCallback, useRef, useMemo } from 'react';
import { invoke } from '../bridge';
import {
  WorkspaceFile,
  ContextState,
  MimeType,
  NamedInput,
  MultipartPart,
  Request,
  TestCase,
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

function genId(prefix: string): string {
  // Short pseudo-unique ID. Not crypto, just enough to disambiguate within
  // a workspace. Format matches the Rust side's uuid_like_id().
  const ms = Date.now().toString(16);
  const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${prefix}-${ms}${rand}`;
}

function blankRequest(name = 'Request'): Request {
  return {
    id: genId('req'),
    name,
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

interface UseWorkspaceReturn {
  // Workspace-level
  projectName: string;
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
  tests: TestCase[];

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
  setTests: (tests: TestCase[]) => void;

  // Request collection management
  addRequest: (name?: string) => void;
  removeRequest: (id: string) => void;
  renameRequest: (id: string, name: string) => void;
  selectRequest: (id: string) => void;
  duplicateRequest: (id: string) => void;

  // Persistence
  saveWorkspace: () => Promise<string>;
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
  restoreSnapshot: (snap: { projectName: string; requests: Request[]; activeRequestId?: string; flow?: unknown }) => void;
}

export function useWorkspace(): UseWorkspaceReturn {
  const [projectName, setProjectNameState] = useState('Untitled');
  const initial = blankRequest('Request');
  const [requests, setRequests] = useState<Request[]>([initial]);
  const [activeRequestId, setActiveRequestId] = useState<string>(initial.id);
  const [flow, setFlowState] = useState<unknown>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [currentFile, setCurrentFile] = useState<string | null>(null);

  // Keep per-(request, label) scripts in sync without extra re-renders. Map
  // key is `${requestId}::${nodeLabel}` so each request has its own
  // remembered scripts per role.
  const scriptsByLabel = useRef<Map<string, string>>(new Map());
  const labelKey = (reqId: string, label: string) => `${reqId}::${label}`;

  // Find & update the active request — used by every per-request setter.
  const updateActive = useCallback((mutator: (r: Request) => Request) => {
    setRequests((prev) => prev.map((r) => (r.id === activeRequestId ? mutator(r) : r)));
    setIsDirty(true);
  }, [activeRequestId]);

  const active: Request = useMemo(
    () => requests.find((r) => r.id === activeRequestId) || requests[0] || blankRequest(),
    [requests, activeRequestId],
  );

  // ── Workspace-level setters ──────────────────────────────────────────
  const setProjectName = useCallback((name: string) => { setProjectNameState(name); setIsDirty(true); }, []);
  const setFlow = useCallback((f: unknown) => { setFlowState(f); setIsDirty(true); }, []);

  // ── Per-request setters ──────────────────────────────────────────────
  const setScript = useCallback((val: string) => {
    scriptsByLabel.current.set(labelKey(activeRequestId, active.nodeLabel), val);
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
  const setClasspath = useCallback((cp: string[]) => updateActive((r) => ({ ...r, classpath: cp })), [updateActive]);
  const setTimeoutMs = useCallback((ms: number) => updateActive((r) => ({ ...r, timeoutMs: ms })), [updateActive]);
  const setTests = useCallback((tests: TestCase[]) => updateActive((r) => ({ ...r, tests })), [updateActive]);

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
  const addRequest = useCallback((name = 'New request') => {
    const req = blankRequest(name);
    setRequests((prev) => [...prev, req]);
    setActiveRequestId(req.id);
    setIsDirty(true);
  }, []);

  const removeRequest = useCallback((id: string) => {
    setRequests((prev) => {
      if (prev.length <= 1) return prev; // never let a workspace go empty
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
      const copy: Request = { ...src, id: genId('req'), name: `${src.name} copy` };
      const idx = prev.findIndex((r) => r.id === id);
      const next = [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
      setActiveRequestId(copy.id);
      return next;
    });
    setIsDirty(true);
  }, []);

  // ── Persistence ──────────────────────────────────────────────────────
  const saveWorkspace = useCallback(async () => {
    const workspace: WorkspaceFile = {
      version: '2.0',
      projectName,
      createdAt: '',
      updatedAt: '',
      requests,
      activeRequestId,
      flow: flow ?? undefined,
    };
    const path = await invoke<string>('save_workspace', { workspace });
    setIsDirty(false);
    const filename = path.split(/[/\\]/).pop() || '';
    // Rename semantics: the filename derives from the project name, so a
    // renamed workspace saves to a NEW file — remove the old one instead of
    // leaving a stale ghost in every workspace list.
    const previous = currentFile;
    if (previous && previous !== filename) {
      try { await invoke('delete_workspace', { filename: previous }); } catch { /* best-effort */ }
    }
    setCurrentFile(filename);
    // Let list surfaces (sidebar) refresh + migrate pinned entries on rename.
    window.dispatchEvent(new CustomEvent('dw:workspaces-changed', {
      detail: previous && previous !== filename ? { renamedFrom: previous, renamedTo: filename } : undefined,
    }));
    return path;
  }, [projectName, requests, activeRequestId, flow, currentFile]);

  const loadWorkspace = useCallback(async (filename: string) => {
    const ws = await invoke<WorkspaceFile>('load_workspace', { filename });
    scriptsByLabel.current = new Map();
    const reqs = ws.requests && ws.requests.length > 0 ? ws.requests : [blankRequest()];
    // Seed the per-(request, label) script cache from the loaded data so
    // role-switching remembers what was on disk.
    for (const r of reqs) {
      scriptsByLabel.current.set(labelKey(r.id, r.nodeLabel), r.script);
    }
    setProjectNameState(ws.projectName);
    setRequests(reqs);
    setActiveRequestId(ws.activeRequestId || reqs[0].id);
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
    const req = blankRequest('Request');
    setProjectNameState('Untitled');
    setRequests([req]);
    setActiveRequestId(req.id);
    setFlowState(null);
    setCurrentFile(null);
    setIsDirty(false);
  }, []);

  const restoreSnapshot = useCallback((snap: { projectName: string; requests: Request[]; activeRequestId?: string; flow?: unknown }) => {
    scriptsByLabel.current = new Map();
    const reqs = snap.requests.length > 0 ? snap.requests : [blankRequest()];
    for (const r of reqs) {
      scriptsByLabel.current.set(labelKey(r.id, r.nodeLabel), r.script);
    }
    setProjectNameState(snap.projectName);
    setRequests(reqs);
    setActiveRequestId(snap.activeRequestId || reqs[0].id);
    setFlowState(snap.flow ?? null);
    setCurrentFile(null);
    setIsDirty(true); // a restored draft is by definition unsaved
  }, []);

  return {
    // Workspace-level
    projectName,
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
    tests: active.tests,

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
    setTests,

    addRequest,
    removeRequest,
    renameRequest,
    selectRequest,
    duplicateRequest,

    saveWorkspace,
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
