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

export function saveWorkspace(storageDir: string, workspace: any): string {
  const dir = ensureDir(storageDir);

  const safe = (workspace.projectName || '')
    .split('')
    .map((c: string) => (/[a-zA-Z0-9_]/.test(c) ? c : '-'))
    .join('')
    .split('-')
    .filter((s: string) => s.length > 0)
    .join('-');
  const filename = safe || 'untitled';
  const filePath = path.join(dir, `${filename}.dwstudio`);

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

export function listWorkspacesMeta(
  storageDir: string
): { filename: string; projectName: string; mode: string; requestCount: number }[] {
  const dir = ensureDir(storageDir);
  const metas = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.dwstudio'))
    .map((name) => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
        const projectName = raw.projectName ?? 'Untitled';
        let mode: string;
        let requestCount: number;
        if (Array.isArray(raw.requests)) {
          const hasFlow = raw.flow != null;
          mode = hasFlow && raw.requests.length === 0 ? 'flow' : 'collection';
          requestCount = raw.requests.length;
        } else {
          mode = raw.mode ?? 'single';
          requestCount = 1;
        }
        return { filename: name, projectName, mode, requestCount };
      } catch {
        return null;
      }
    })
    .filter((m): m is { filename: string; projectName: string; mode: string; requestCount: number } => m !== null);
  metas.sort((a, b) => a.filename.localeCompare(b.filename));
  return metas;
}

export function deleteWorkspace(storageDir: string, filename: string): void {
  validateFilename(filename);
  const dir = ensureDir(storageDir);
  fs.rmSync(path.join(dir, filename), { force: true });
}

export function getWorkspacesDir(storageDir: string): string {
  return ensureDir(storageDir);
}
