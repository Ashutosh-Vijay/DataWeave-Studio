/**
 * Browser backend. Implements the same `invoke()` command surface as the Rust
 * commands (desktop) and extension.ts (VS Code), but entirely inside the page:
 *
 *   - The DataWeave engine is dw-server compiled to WebAssembly with GraalVM
 *     Web Image (web-wasm/), running in a Web Worker. It speaks DwServer's JSON
 *     protocol; inputs travel inline because there is no disk to put them on.
 *   - Workspaces and modules live in localStorage. Saved encryption keys are
 *     held in memory only, like the desktop's memory-only keys.
 *   - Files come from the browser's file picker and leave as downloads.
 *
 * The script-assembly helpers are ports of vscode-extension/src/dwHost.ts and
 * must stay in step with it (and with dw_runner.rs), or compile-cache keys and
 * error line numbers drift between hosts.
 */

const ENGINE_URL = `${import.meta.env.BASE_URL}wasm/dwengine.js`;
const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? '0.0.0';

// --- Engine (Web Worker) -----------------------------------------------------

interface EngineResponse {
  id: number;
  ok: boolean;
  output: string;
  error: string | null;
  executionTimeMs: number;
  logs?: string[];
  trace?: unknown[];
  result?: unknown;
  results?: (string | null)[];
  errors?: (string | null)[];
}

let worker: Worker | null = null;
let ready: Promise<string> | null = null;
let warmed = false;
let warmupError: string | null = null;
let weaveVersion: string | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (r: EngineResponse) => void; reject: (e: Error) => void }>();

function rejectAll(message: string): void {
  for (const p of pending.values()) p.reject(new Error(message));
  pending.clear();
}

export function startEngine(): Promise<string> {
  if (ready) return ready;
  warmupError = null;
  ready = new Promise<string>((resolve, reject) => {
    const w = new Worker(ENGINE_URL);
    worker = w;
    w.onmessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (d && typeof d === 'object' && 'ready' in d) {
        weaveVersion = String(d.ready);
        warmed = true;
        resolve(weaveVersion);
        return;
      }
      const p = pending.get(d?.id);
      if (!p) return;
      pending.delete(d.id);
      try {
        p.resolve(JSON.parse(d.resp) as EngineResponse);
      } catch (e) {
        p.reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    w.onerror = (ev: ErrorEvent) => {
      ev.preventDefault();
      warmupError = `DataWeave engine failed to load: ${ev.message || 'unknown error'}`;
      rejectAll(warmupError);
      reject(new Error(warmupError));
    };
  });
  ready.catch(() => { /* surfaced through get_warmup_status */ });
  return ready;
}

function stopEngine(): void {
  worker?.terminate();
  worker = null;
  ready = null;
  warmed = false;
  rejectAll('The engine was restarted.');
}

async function engine(req: Record<string, unknown>, timeoutMs = 0): Promise<EngineResponse> {
  await startEngine();
  const w = worker!;
  const id = nextId++;
  return new Promise<EngineResponse>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    pending.set(id, {
      resolve: (r) => { if (timer) clearTimeout(timer); resolve(r); },
      reject: (e) => { if (timer) clearTimeout(timer); reject(e); },
    });
    if (timeoutMs > 0) {
      // The worker is single-threaded and busy, so the only way to stop a
      // runaway script is to kill it and boot a fresh engine.
      timer = setTimeout(() => {
        pending.delete(id);
        stopEngine();
        void startEngine();
        reject(new Error(`__TIMEOUT__:${timeoutMs}`));
      }, timeoutMs);
    }
    w.postMessage({ id, req: JSON.stringify({ id, ...req }) });
  });
}

// --- Script assembly (port of dwHost.ts / dw_runner.rs) ----------------------

interface NamedInput {
  name: string;
  content: string;
  mimeType: string;
  filePath?: string | null;
}

function buildFullScript(
  userScript: string,
  payloadMime: string,
  hasAttributes: boolean,
  hasVars: boolean,
  namedInputs: NamedInput[],
): string {
  const lines = userScript.split('\n');
  const header: string[] = [];

  const hasDwHeader = lines.some((l) => l.trim().startsWith('%dw'));
  const hasSeparator = lines.some((l) => l.trim() === '---');
  const hasOutput = lines.some((l) => l.trim().startsWith('output '));

  if (!hasDwHeader) header.push('%dw 2.0');

  const hasPayloadInput = lines.some((l) => {
    const t = l.trim();
    return t.startsWith('input payload') || t.startsWith('input  payload');
  });
  if (!hasPayloadInput) header.push(`input payload ${payloadMime}`);

  if (hasAttributes && !lines.some((l) => l.trim().startsWith('input attributes'))) {
    header.push('input attributes application/json');
  }
  if (hasVars && !lines.some((l) => l.trim().startsWith('input vars'))) {
    header.push('input vars application/json');
  }
  for (const ni of namedInputs) {
    const prefix = `input ${ni.name}`;
    if (!lines.some((l) => l.trim().startsWith(prefix))) {
      header.push(`input ${ni.name} ${ni.mimeType}`);
    }
  }

  if (!hasOutput && !hasSeparator) {
    header.push('output application/json');
    header.push('---');
  }

  if (header.length === 0) return userScript;

  if (hasDwHeader) {
    const result: string[] = [];
    let inserted = false;
    for (const line of lines) {
      if (!hasOutput && hasSeparator && !inserted && line.trim() === '---') {
        result.push(...header, 'output application/json');
        inserted = true;
      }
      result.push(line);
      if (!inserted && line.trim().startsWith('%dw')) {
        result.push(...header);
        inserted = true;
      }
    }
    return result.join('\n');
  }
  return [...header, ...lines].join('\n');
}

function parseErrorLocation(stderr: string): [number | null, number | null] {
  const m = stderr.match(/line:?\s*(\d+),?\s*column:?\s*(\d+)/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  return [null, null];
}

function shiftStderrLines(stderr: string, offset: number): string {
  if (offset <= 0) return stderr;
  let out = stderr.replace(/line:?\s*(\d+)/g, (full, num) => {
    const mapped = Math.max(1, parseInt(num, 10) - offset);
    const prefix = full.slice(0, full.length - num.length);
    return `${prefix}${mapped}`;
  });
  out = out.replace(/^(\s*)(\d+)\|/gm, (_full, indent, num) => {
    const mapped = Math.max(1, parseInt(num, 10) - offset);
    return `${indent}${mapped}|`;
  });
  return out;
}

interface MultipartPartData {
  name: string;
  value: string;
  contentType: string;
  isFile: boolean;
  filePath?: string;
  filename?: string;
  contentBase64?: string;
}

async function buildMultipartBody(parts: MultipartPartData[]): Promise<Uint8Array> {
  const boundary = `dwstudio${Date.now()}`;
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    chunks.push(enc.encode(`--${boundary}\r\n`));
    const filename = part.filename ?? (part.filePath ? part.filePath.split(/[\\/]/).pop() : undefined);
    chunks.push(enc.encode(
      filename
        ? `Content-Disposition: form-data; name="${part.name}"; filename="${filename}"\r\n`
        : `Content-Disposition: form-data; name="${part.name}"\r\n`,
    ));
    chunks.push(enc.encode(`Content-Type: ${part.contentType}\r\n\r\n`));
    if (part.contentBase64) {
      try { chunks.push(fromBase64(part.contentBase64.trim())); } catch { /* invalid base64 -> empty part */ }
    } else if (part.isFile) {
      const f = part.filePath ? pickedFiles.get(part.filePath) : undefined;
      if (f) chunks.push(new Uint8Array(await f.arrayBuffer()));
    } else {
      chunks.push(enc.encode(part.value));
    }
    chunks.push(enc.encode('\r\n'));
  }
  chunks.push(enc.encode(`--${boundary}--\r\n`));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const body = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { body.set(c, at); at += c.length; }
  return body;
}

// --- Run -----------------------------------------------------------------------

interface RunArgs {
  script: string;
  payload: string;
  payloadMimeType: string;
  attributesJson: string;
  varsJson: string;
  namedInputsJson: string;
  payloadFilePath?: string | null;
  timeoutMs?: number;
  multipartPartsJson?: string | null;
  modulesJson?: string | null;
  trace?: boolean;
  valueTrace?: boolean;
  debug?: boolean;
  debugBreakpoints?: number[];
  languageLevel?: string | null;
}

let runsInFlight = 0;

async function runDataweave(args: RunArgs) {
  const start = performance.now();
  let payloadMime = args.payloadMimeType;
  const hasAttributes = args.attributesJson.trim() !== '{}' && args.attributesJson.trim() !== '';
  const hasVars = args.varsJson.trim() !== '{}' && args.varsJson.trim() !== '';
  const namedInputs: NamedInput[] =
    !args.namedInputsJson.trim() || args.namedInputsJson.trim() === '[]' ? [] : JSON.parse(args.namedInputsJson);

  if (payloadMime === 'application/java') payloadMime = 'application/json';
  for (const ni of namedInputs) if (ni.mimeType === 'application/java') ni.mimeType = 'application/json';

  let effectivePayload = args.payload;
  if (!effectivePayload.trim()) {
    if (payloadMime.includes('json') || payloadMime.includes('java')) effectivePayload = '{}';
    else if (payloadMime.includes('xml')) effectivePayload = '<root/>';
    else effectivePayload = '';
  }

  const payloadFields: Record<string, unknown> = {};
  const parts: MultipartPartData[] = args.multipartPartsJson ? JSON.parse(args.multipartPartsJson) : [];
  if (parts.length > 0) {
    payloadFields.payloadBase64 = toBase64(await buildMultipartBody(parts));
  } else if (args.payloadFilePath && pickedFiles.has(args.payloadFilePath)) {
    payloadFields.payloadBase64 = await fileBase64(args.payloadFilePath);
  } else {
    payloadFields.payloadContent = effectivePayload;
  }

  const fullScript = args.valueTrace || args.debug
    ? args.script
    : buildFullScript(args.script, payloadMime, hasAttributes, hasVars, namedInputs);
  const lineOffset = Math.max(0, fullScript.split('\n').length - args.script.split('\n').length);

  const engineNamedInputs = await Promise.all(namedInputs.map(async (ni) =>
    ni.filePath && pickedFiles.has(ni.filePath)
      ? { name: ni.name, mime: ni.mimeType, base64: await fileBase64(ni.filePath) }
      : { name: ni.name, mime: ni.mimeType, content: ni.content },
  ));

  const modules: { name: string; content: string }[] =
    args.modulesJson && args.modulesJson.trim() && args.modulesJson.trim() !== '[]' ? JSON.parse(args.modulesJson) : [];

  const timeout = args.timeoutMs ?? 30000;
  let resp: EngineResponse;
  runsInFlight++;
  try {
    resp = await engine({
      script: fullScript,
      ...payloadFields,
      payloadMime,
      attributesContent: hasAttributes ? args.attributesJson : undefined,
      varsContent: hasVars ? args.varsJson : undefined,
      namedInputs: engineNamedInputs,
      outputMime: 'application/json',
      compileOnly: false,
      modules: modules.length ? modules : undefined,
      trace: args.trace || undefined,
      valueTrace: args.valueTrace || undefined,
      languageLevel: args.languageLevel || undefined,
      op: args.debug ? 'debug' : undefined,
      action: args.debug ? 'start' : undefined,
      breakpoints: args.debug ? (args.debugBreakpoints ?? []) : undefined,
    }, timeout);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith('__TIMEOUT__:')) {
      return {
        output: '',
        error: `Script timed out after ${msg.split(':')[1]}ms. Increase the timeout in Settings if your script needs more time.`,
        execution_time_ms: timeout,
        error_line: null,
        error_column: null,
      };
    }
    throw e;
  } finally {
    runsInFlight--;
  }

  const execMs = Math.round(performance.now() - start);
  if (resp.ok) {
    return {
      output: resp.output,
      error: null,
      execution_time_ms: execMs,
      error_line: null,
      error_column: null,
      logs: resp.logs ?? null,
      trace: resp.trace ?? null,
    };
  }
  const shifted = shiftStderrLines(resp.error ?? '(no error message)', lineOffset);
  const [line, col] = parseErrorLocation(shifted);
  return {
    output: resp.output,
    error: shifted,
    execution_time_ms: execMs,
    error_line: line,
    error_column: col,
    logs: resp.logs ?? null,
    trace: resp.trace ?? null,
  };
}

async function warmDataweave(args: { script: string; payloadMimeType: string; hasAttributes: boolean; hasVars: boolean; namedInputsJson: string }) {
  if (!args.script.trim()) return;
  let payloadMime = args.payloadMimeType;
  const namedInputs: NamedInput[] =
    !args.namedInputsJson.trim() || args.namedInputsJson.trim() === '[]' ? [] : JSON.parse(args.namedInputsJson);
  if (payloadMime === 'application/java') payloadMime = 'application/json';
  for (const ni of namedInputs) if (ni.mimeType === 'application/java') ni.mimeType = 'application/json';
  const merged = buildFullScript(args.script, payloadMime, args.hasAttributes, args.hasVars, namedInputs);
  await engine({ script: merged, payloadMime: 'application/json', namedInputs: [], outputMime: 'application/json', compileOnly: true }, 15000)
    .catch(() => undefined);
}

// --- Files (picker in, downloads out) -----------------------------------------

const pickedFiles = new Map<string, File>();
let pickSeq = 0;

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function fileBase64(path: string): Promise<string> {
  return toBase64(new Uint8Array(await pickedFiles.get(path)!.arrayBuffer()));
}

interface DialogOptions {
  multiple?: boolean;
  directory?: boolean;
  filters?: { name: string; extensions: string[] }[];
  defaultPath?: string;
}

function openDialog(o: DialogOptions): Promise<string | string[] | null> {
  if (o.directory) return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = !!o.multiple;
    const exts = (o.filters ?? []).flatMap((f) => f.extensions).filter((e) => e && e !== '*');
    if (exts.length) input.accept = exts.map((e) => `.${e}`).join(',');
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const paths = Array.from(input.files ?? []).map((f) => {
        const p = `browser-file://${++pickSeq}/${f.name}`;
        pickedFiles.set(p, f);
        return p;
      });
      input.remove();
      if (!paths.length) resolve(null);
      else resolve(o.multiple ? paths : paths[0]);
    });
    input.addEventListener('cancel', () => { input.remove(); resolve(null); });
    document.body.appendChild(input);
    input.click();
  });
}

function download(path: string, data: BlobPart): void {
  const name = path.replace(/^download:\/\//, '').split(/[\\/]/).pop() || 'output.txt';
  const url = URL.createObjectURL(new Blob([data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Workspaces + modules (localStorage; port of workspaceStore.ts) -----------

const WS_KEY = 'dwstudio.web.workspaces';
const MODULES_KEY = 'dwstudio.web.modules';

type WsStore = Record<string, string>;

function readWs(): WsStore {
  try { return JSON.parse(localStorage.getItem(WS_KEY) || '{}'); } catch { return {}; }
}
function writeWs(s: WsStore): void {
  localStorage.setItem(WS_KEY, JSON.stringify(s));
}

function validateFilename(filename: string): void {
  if (!filename) throw new Error('Filename cannot be empty');
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid filename: path traversal detected');
  }
  if (!filename.endsWith('.dwstudio')) throw new Error('Invalid filename: must end with .dwstudio');
}

function uuidLikeId(): string {
  return Date.now().toString(16) + Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
}

function sanitizeStem(projectName: string): string {
  const safe = (projectName || '')
    .split('')
    .map((c) => (/[a-zA-Z0-9_]/.test(c) ? c : '-'))
    .join('')
    .split('-')
    .filter((s) => s.length > 0)
    .join('-');
  return safe || 'untitled';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseWorkspace(contents: string): any {
  const raw = JSON.parse(contents);
  if (Array.isArray(raw.requests)) return raw;
  if (raw.singleTransform) {
    const id = `req-${uuidLikeId()}`;
    const st = raw.singleTransform;
    return {
      version: '2.0',
      projectName: raw.projectName,
      createdAt: raw.createdAt ?? '',
      updatedAt: raw.updatedAt ?? '',
      requests: [{
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
      }],
      activeRequestId: id,
      flow: raw.flowNodes ?? undefined,
    };
  }
  throw new Error('Unrecognized workspace format — missing both `requests` and `singleTransform`.');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function saveWorkspace(workspace: any): string {
  const filename = `${sanitizeStem(workspace.projectName)}.dwstudio`;
  const ws = { ...workspace, version: '2.0', updatedAt: new Date().toISOString() };
  if (!ws.createdAt) ws.createdAt = ws.updatedAt;
  if ((!ws.requests || ws.requests.length === 0) && !ws.flow) {
    const id = `req-${uuidLikeId()}`;
    ws.requests = [{
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
    }];
    ws.activeRequestId = id;
  }
  const store = readWs();
  store[filename] = JSON.stringify(ws, null, 2);
  writeWs(store);
  return filename;
}

function loadWorkspace(filename: string) {
  validateFilename(filename);
  const s = readWs()[filename];
  if (s === undefined) throw new Error(`Workspace not found: ${filename}`);
  return parseWorkspace(s);
}

function listWorkspacesMeta() {
  const store = readWs();
  return Object.keys(store).sort().map((filename) => {
    try {
      const raw = JSON.parse(store[filename]);
      const isV2 = Array.isArray(raw.requests);
      return {
        filename,
        projectName: raw.projectName ?? 'Untitled',
        mode: isV2 ? (raw.flow != null && raw.requests.length === 0 ? 'flow' : 'collection') : (raw.mode ?? 'single'),
        requestCount: isV2 ? raw.requests.length : 1,
        updatedAt: raw.updatedAt || '',
        createdAt: raw.createdAt || '',
        flowCount: Array.isArray(raw.flows) ? raw.flows.length : (raw.flow != null ? 1 : 0),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        requests: isV2 ? raw.requests.slice(0, 16).map((r: any) => ({ name: r?.name || 'Request', nodeLabel: r?.nodeLabel || 'Transform' })) : [],
      };
    } catch {
      return null;
    }
  }).filter((m) => m !== null);
}

function renameWorkspace(filename: string, newName: string): string {
  validateFilename(filename);
  const trimmed = (newName || '').trim();
  if (!trimmed) throw new Error('Name cannot be empty');
  const store = readWs();
  const ws = parseWorkspace(store[filename] ?? '{}');
  const newFilename = `${sanitizeStem(trimmed)}.dwstudio`;
  if (newFilename !== filename && store[newFilename] !== undefined) {
    throw new Error(`A workspace named "${trimmed}" already exists`);
  }
  ws.projectName = trimmed;
  ws.updatedAt = new Date().toISOString();
  store[newFilename] = JSON.stringify(ws, null, 2);
  if (newFilename !== filename) delete store[filename];
  writeWs(store);
  return newFilename;
}

function duplicateWorkspace(filename: string): string {
  validateFilename(filename);
  const store = readWs();
  const ws = parseWorkspace(store[filename] ?? '{}');
  const base = (ws.projectName || '').trim() || 'Untitled';
  let candidate = `${base} copy`;
  let n = 2;
  while (store[`${sanitizeStem(candidate)}.dwstudio`] !== undefined) {
    candidate = `${base} copy ${n}`;
    n += 1;
    if (n > 99) throw new Error('Too many copies');
  }
  const now = new Date().toISOString();
  ws.projectName = candidate;
  ws.createdAt = now;
  ws.updatedAt = now;
  const newFilename = `${sanitizeStem(candidate)}.dwstudio`;
  store[newFilename] = JSON.stringify(ws, null, 2);
  writeWs(store);
  return newFilename;
}

// --- Saved encryption keys (memory only) ---------------------------------------

const secureKeys = new Map<string, string>();
const keyNames = () => Array.from(secureKeys.keys()).sort();

// --- Command dispatch ------------------------------------------------------------

const notInBrowser = (what: string) =>
  new Error(`${what} isn't available in the browser build — it needs the desktop app or the VS Code extension.`);

export async function webInvoke<T>(cmd: string, a: Record<string, unknown> = {}): Promise<T> {
  return (await dispatch(cmd, a)) as T;
}

async function dispatch(cmd: string, a: Record<string, unknown>): Promise<unknown> {
  switch (cmd) {
    // Engine
    case 'run_dataweave':
      return runDataweave(a as unknown as RunArgs);
    case 'warm_dataweave_script':
      await warmDataweave(a as never);
      return null;
    case 'is_warmed_up':
      void startEngine();
      return warmed;
    case 'get_warmup_status':
      void startEngine();
      return { ready: warmed, error: warmupError, encodingOk: true, weaveVersion };
    case 'cancel_dataweave':
      if (runsInFlight === 0) return false;
      stopEngine();
      void startEngine();
      return true;
    case 'restart_engine':
      stopEngine();
      await startEngine();
      return null;
    case 'dw_tooling': {
      const r = await engine({ ...a, op: 'tooling' }, 15000);
      if (!r.ok) throw new Error(r.error ?? 'tooling failed');
      return r.result ?? null;
    }
    case 'dw_format': {
      const r = await engine({ op: 'format', script: String(a.script ?? '') }, 15000);
      if (!r.ok) throw new Error(r.error ?? 'Format failed');
      return r.output;
    }
    case 'dw_debug': {
      const r = await engine({ op: 'debug', action: String(a.action ?? 'state'), expression: String(a.expression ?? ''), frameIndex: Number(a.frameIndex ?? -1) }, 20000);
      if (!r.ok) throw new Error(r.error ?? 'Debug command failed');
      return r.output ? JSON.parse(r.output) : null;
    }
    case 'secure_properties_invoke': {
      const keyName = String(a.keyName ?? '').trim();
      let key = String(a.key ?? '');
      if (keyName) {
        const saved = secureKeys.get(keyName);
        if (saved === undefined) throw new Error(`Saved key "${keyName}" is no longer available — type it in again.`);
        key = saved;
      }
      const r = await engine({
        op: 'secureProps',
        operation: String(a.operation ?? ''),
        algorithm: String(a.algorithm ?? 'AES'),
        mode: String(a.mode ?? 'CBC'),
        key,
        values: [String(a.value ?? '')],
        useRandomIv: !!a.useRandomIv,
      }, 30000);
      if (!r.ok) throw new Error(r.error ?? 'secureProps failed');
      if (r.errors?.[0]) throw new Error(r.errors[0]);
      return r.results?.[0] ?? '';
    }

    // Saved keys
    case 'secure_key_names':
      return keyNames();
    case 'secure_key_save': {
      const name = String(a.name ?? '').trim();
      if (!name) throw new Error('Give the key a name.');
      if (!a.value) throw new Error('Type a key before saving it.');
      secureKeys.set(name, String(a.value));
      return keyNames();
    }
    case 'secure_key_delete':
      secureKeys.delete(String(a.name ?? ''));
      return keyNames();
    case 'secure_key_rename': {
      const from = String(a.from ?? '');
      const to = String(a.to ?? '').trim();
      if (!to) throw new Error('Give the key a name.');
      const v = secureKeys.get(from);
      if (v !== undefined && to !== from) { secureKeys.delete(from); secureKeys.set(to, v); }
      return keyNames();
    }

    // Workspaces + modules
    case 'save_workspace':
      return saveWorkspace(a.workspace);
    case 'load_workspace':
      return loadWorkspace(String(a.filename));
    case 'list_workspaces':
      return Object.keys(readWs()).sort();
    case 'list_workspaces_meta':
      return listWorkspacesMeta();
    case 'delete_workspace': {
      validateFilename(String(a.filename));
      const s = readWs();
      delete s[String(a.filename)];
      writeWs(s);
      return null;
    }
    case 'rename_workspace':
      return renameWorkspace(String(a.filename), String(a.newName ?? ''));
    case 'duplicate_workspace_file':
      return duplicateWorkspace(String(a.filename));
    case 'take_pending_workspace':
      return null;
    case 'get_workspaces_dir':
    case 'get_log_dir':
      return 'Browser storage (this site only)';
    case 'load_modules':
      return localStorage.getItem(MODULES_KEY) || '[]';
    case 'save_modules': {
      const json = String(a.json ?? '[]');
      if (!Array.isArray(JSON.parse(json))) throw new Error('Modules must be a JSON array');
      localStorage.setItem(MODULES_KEY, json);
      return null;
    }

    // Files and dialogs
    case 'vscode_open_dialog':
      return openDialog((a.options ?? {}) as DialogOptions);
    case 'vscode_save_dialog': {
      const o = (a.options ?? {}) as DialogOptions;
      const ext = o.filters?.[0]?.extensions?.[0];
      return `download://${o.defaultPath?.split(/[\\/]/).pop() || (ext ? `output.${ext}` : 'output.txt')}`;
    }
    case 'read_text_file': {
      const f = pickedFiles.get(String(a.path));
      if (!f) throw new Error(`File is no longer available: ${a.path}. Pick it again.`);
      return f.text();
    }
    case 'save_output_file':
      download(String(a.path), String(a.content ?? ''));
      return null;
    case 'save_binary_file':
      download(String(a.path), new Uint8Array(a.contents as number[]));
      return null;
    case 'vscode_open_external':
      window.open(String(a.url), '_blank', 'noopener,noreferrer');
      return null;
    case 'vscode_open_path':
      return null;
    case 'get_app_version':
      return APP_VERSION;

    // Desktop/extension-only features
    case 'mcp_status':
      return { running: false, requests: 0 };
    case 'mcp_heartbeat':
    case 'http_api_status':
      return { running: false, port: null };
    case 'list_managed_jars':
      return [];
    case 'mcp_start':
    case 'mcp_stop':
    case 'mcp_set_decrypt':
    case 'mcp_set_advanced':
    case 'mcp_write_config':
    case 'mcp_stdio_config':
      throw notInBrowser('The MCP server');
    case 'http_api_start':
    case 'http_api_stop':
      throw notInBrowser('The local HTTP API');
    case 'import_jar_file':
    case 'remove_managed_jar':
    case 'download_maven_jar':
    case 'compile_java':
      throw notInBrowser('Java classes and JARs');

    default:
      throw new Error(`Command not implemented in the browser build: ${cmd}`);
  }
}
