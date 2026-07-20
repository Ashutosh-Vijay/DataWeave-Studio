/**
 * Node port of src-tauri/src/workspace.rs. Workspaces are `.dwstudio` JSON files
 * in a per-extension storage dir. The frontend sends/expects camelCase JSON, and
 * we persist it verbatim — so unlike the Rust side there's no serde renaming;
 * we just parse, lightly normalize, and write back. v1 files are migrated to v2
 * on load (same shape the Rust migration produced).
 */
import * as fs from 'fs';
import * as path from 'path';

function ensureDir(storageDir: string): string {
  const dir = path.join(storageDir, 'workspaces');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function validateFilename(filename: string): void {
  if (!filename) throw new Error('Filename cannot be empty');
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid filename: path traversal detected');
  }
  if (!filename.endsWith('.dwstudio')) {
    throw new Error('Invalid filename: must end with .dwstudio');
  }
}

function uuidLikeId(): string {
  const ms = Date.now().toString(16);
  const rnd = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return ms + rnd;
}

/** v2 passthrough; v1 (has `singleTransform`) → migrate to a one-request v2. */
function parseWorkspace(contents: string): any {
  const raw = JSON.parse(contents);
  if (Array.isArray(raw.requests)) return raw; // already v2
  if (raw.singleTransform) {
    const id = `req-${uuidLikeId()}`;
    const st = raw.singleTransform;
    return {
      version: '2.0',
      projectName: raw.projectName,
      createdAt: raw.createdAt ?? '',
      updatedAt: raw.updatedAt ?? '',
      requests: [
        {
          id,
          name: raw.projectName || 'Request',
          script: st.script,
          payload: st.payload,
          payloadMimeType: st.payloadMimeType,
          nodeLabel: st.nodeLabel,
          namedInputs: st.namedInputs ?? [],
          queryTemplate: st.queryTemplate ?? '',
          classpath: st.classpath ?? [],
          timeoutMs: st.timeoutMs,
          payloadFilePath: st.payloadFilePath,
          multipartParts: st.multipartParts ?? [],
          context: raw.context ?? {},
          tests: [],
        },
      ],
      activeRequestId: id,
      flow: raw.flowNodes ?? undefined,
    };
  }
  throw new Error('Unrecognized workspace format — missing both `requests` and `singleTransform`.');
}

/** Sanitize a project name into a filename stem (mirrors workspace.rs). */
function sanitizeStem(projectName: string): string {
  const safe = (projectName || '')
    .split('')
    .map((c: string) => (/[a-zA-Z0-9_]/.test(c) ? c : '-'))
    .join('')
    .split('-')
    .filter((s: string) => s.length > 0)
    .join('-');
  return safe || 'untitled';
}

export function saveWorkspace(storageDir: string, workspace: any): string {
  const dir = ensureDir(storageDir);
  const filePath = path.join(dir, `${sanitizeStem(workspace.projectName)}.dwstudio`);

  const ws = { ...workspace };
  ws.version = '2.0';
  ws.updatedAt = new Date().toISOString();
  if (!ws.createdAt) ws.createdAt = ws.updatedAt;

  // Defense in depth: keep at least one request unless this is a flow-only file.
  if ((!ws.requests || ws.requests.length === 0) && !ws.flow) {
    const id = `req-${uuidLikeId()}`;
    ws.requests = [
      {
        id,
        name: 'Request',
        script: '%dw 2.0\noutput application/json\n---\npayload',
        payload: '{}',
        payloadMimeType: 'application/json',
        nodeLabel: 'Transform',
        namedInputs: [],
        queryTemplate: '',
        classpath: [],
        multipartParts: [],
        context: {},
        tests: [],
      },
    ];
    ws.activeRequestId = id;
  }

  fs.writeFileSync(filePath, JSON.stringify(ws, null, 2));
  return filePath;
}

export function loadWorkspace(storageDir: string, filename: string): any {
  validateFilename(filename);
  const dir = ensureDir(storageDir);
  const contents = fs.readFileSync(path.join(dir, filename), 'utf8');
  return parseWorkspace(contents);
}

export function listWorkspaces(storageDir: string): string[] {
  const dir = ensureDir(storageDir);
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.dwstudio'))
    .sort();
}

interface WsMeta {
  filename: string;
  projectName: string;
  mode: string;
  requestCount: number;
  updatedAt: string;
  createdAt: string;
  flowCount: number;
  requests: { name: string; nodeLabel: string }[];
}

export function listWorkspacesMeta(storageDir: string): WsMeta[] {
  const dir = ensureDir(storageDir);
  const metas = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.dwstudio'))
    .map((name) => {
      try {
        const full = path.join(dir, name);
        const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
        const projectName = raw.projectName ?? 'Untitled';
        let mode: string;
        let requestCount: number;
        let requests: { name: string; nodeLabel: string }[] = [];
        if (Array.isArray(raw.requests)) {
          const hasFlow = raw.flow != null;
          mode = hasFlow && raw.requests.length === 0 ? 'flow' : 'collection';
          requestCount = raw.requests.length;
          requests = raw.requests.slice(0, 16).map((r: any) => ({
            name: r?.name || 'Request',
            nodeLabel: r?.nodeLabel || 'Transform',
          }));
        } else {
          mode = raw.mode ?? 'single';
          requestCount = 1;
        }
        const flowCount = Array.isArray(raw.flows) ? raw.flows.length : (raw.flow != null ? 1 : 0);
        // Pre-updatedAt files: fall back to filesystem mtime.
        let updatedAt: string = raw.updatedAt || '';
        if (!updatedAt) {
          try { updatedAt = fs.statSync(full).mtime.toISOString(); } catch { /* leave empty */ }
        }
        const createdAt: string = raw.createdAt || '';
        return { filename: name, projectName, mode, requestCount, updatedAt, createdAt, flowCount, requests };
      } catch {
        return null;
      }
    })
    .filter((m): m is WsMeta => m !== null);
  metas.sort((a, b) => a.filename.localeCompare(b.filename));
  return metas;
}

export function deleteWorkspace(storageDir: string, filename: string): void {
  validateFilename(filename);
  const dir = ensureDir(storageDir);
  fs.rmSync(path.join(dir, filename), { force: true });
}

/** Rename a saved workspace on disk (mirrors workspace.rs rename_workspace). */
export function renameWorkspace(storageDir: string, filename: string, newName: string): string {
  validateFilename(filename);
  const trimmed = (newName || '').trim();
  if (!trimmed) throw new Error('Name cannot be empty');
  const dir = ensureDir(storageDir);
  const ws = parseWorkspace(fs.readFileSync(path.join(dir, filename), 'utf8'));
  const newFilename = `${sanitizeStem(trimmed)}.dwstudio`;
  if (newFilename !== filename && fs.existsSync(path.join(dir, newFilename))) {
    throw new Error(`A workspace named "${trimmed}" already exists`);
  }
  ws.projectName = trimmed;
  ws.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, newFilename), JSON.stringify(ws, null, 2));
  if (newFilename !== filename) {
    try { fs.rmSync(path.join(dir, filename), { force: true }); } catch { /* best-effort */ }
  }
  return newFilename;
}

/** Duplicate a saved workspace: "X" → "X copy" (then "X copy 2", …). */
export function duplicateWorkspaceFile(storageDir: string, filename: string): string {
  validateFilename(filename);
  const dir = ensureDir(storageDir);
  const ws = parseWorkspace(fs.readFileSync(path.join(dir, filename), 'utf8'));
  const base = (ws.projectName || '').trim() || 'Untitled';
  let candidate = `${base} copy`;
  let n = 2;
  while (fs.existsSync(path.join(dir, `${sanitizeStem(candidate)}.dwstudio`))) {
    candidate = `${base} copy ${n}`;
    n += 1;
    if (n > 99) throw new Error('Too many copies');
  }
  ws.projectName = candidate;
  const now = new Date().toISOString();
  ws.createdAt = now;
  ws.updatedAt = now;
  const newFilename = `${sanitizeStem(candidate)}.dwstudio`;
  fs.writeFileSync(path.join(dir, newFilename), JSON.stringify(ws, null, 2));
  return newFilename;
}

export function getWorkspacesDir(storageDir: string): string {
  return ensureDir(storageDir);
}
