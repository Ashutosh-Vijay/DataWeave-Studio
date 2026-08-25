import { useEffect, useRef, useState } from 'react';
import { KeyValuePair, MimeType, MultipartPart } from '../types';

export interface CurlImportResult {
  method: string;
  headers: KeyValuePair[];
  queryParams: KeyValuePair[];
  payload: string;
  payloadMimeType: MimeType;
  generatedScript: string;
  multipartParts?: MultipartPart[];
}

// ========================================================
// Script generation per MIME type
// ========================================================

function generateDWScript(
  payload: string,
  mimeType: MimeType,
  queryParams: KeyValuePair[],
  headers: KeyValuePair[],
): string {
  const hints = buildHintComments(queryParams, headers);

  switch (mimeType) {
    case 'application/json':
      return generateJsonScript(payload, hints);
    case 'application/xml':
      return generateXmlScript(payload, hints);
    case 'application/csv':
      return generateCsvScript(payload, hints);
    case 'application/x-www-form-urlencoded':
      return generateFormUrlEncodedScript(payload, hints);
    case 'multipart/form-data':
      return generateMultipartScript(payload, hints);
    default:
      return buildScript('application/json', hints, 'payload');
  }
}

function buildHintComments(queryParams: KeyValuePair[], headers: KeyValuePair[]): string[] {
  const hints: string[] = [];
  if (queryParams.length > 0) {
    hints.push(`// Query params: ${queryParams.map((p) => `attributes.queryParams.${p.key}`).join(', ')}`);
  }
  const notable = headers.filter((h) => !['content-type', 'accept'].includes(h.key.toLowerCase()));
  if (notable.length > 0) {
    hints.push(`// Headers: ${notable.map((h) => `attributes.headers."${h.key}"`).join(', ')}`);
  }
  return hints;
}

function buildScript(outputMime: string, hints: string[], body: string): string {
  const lines = ['%dw 2.0', `output ${outputMime}`, '---'];
  if (hints.length > 0) lines.push(...hints);
  lines.push(body);
  return lines.join('\n');
}

// --- JSON ---

function generateJsonScript(payload: string, hints: string[]): string {
  let body: string;
  if (payload.trim()) {
    try {
      const parsed = JSON.parse(payload);
      body = jsonToDW(parsed, 'payload', 0);
    } catch {
      body = 'payload';
    }
  } else {
    body = 'payload';
  }
  return buildScript('application/json', hints, body);
}

function jsonToDW(value: unknown, path: string, depth: number): string {
  const indent = '  '.repeat(depth);
  const inner = '  '.repeat(depth + 1);

  if (value === null) return path;

  if (Array.isArray(value)) {
    if (value.length === 0) return path;
    const first = value[0];
    if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
      const itemVar = singularize(path.split('.').pop() || 'item');
      const fields = Object.keys(first).map((key) => {
        const sk = safeKey(key);
        const child = first[key];
        if (typeof child === 'object' && child !== null) {
          return `${inner}  ${sk}: ${jsonToDW(child, `${itemVar}.${safeDot(key)}`, depth + 2)}`;
        }
        return `${inner}  ${sk}: ${itemVar}.${safeDot(key)}`;
      });
      return `${path} map (${itemVar}) -> {\n${fields.join(',\n')}\n${inner}}`;
    }
    return path;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return path;
    const fields = keys.map((key) => {
      const sk = safeKey(key);
      const childPath = `${path}.${safeDot(key)}`;
      const child = obj[key];
      if (Array.isArray(child) && child.length > 0 && typeof child[0] === 'object') {
        return `${inner}${sk}: ${jsonToDW(child, childPath, depth + 1)}`;
      }
      if (typeof child === 'object' && child !== null) {
        return `${inner}${sk}: ${jsonToDW(child, childPath, depth + 1)}`;
      }
      return `${inner}${sk}: ${childPath}`;
    });
    return `{\n${fields.join(',\n')}\n${indent}}`;
  }

  return path;
}

// --- XML ---

function generateXmlScript(payload: string, hints: string[]): string {
  if (!payload.trim()) {
    return buildScript('application/xml', hints, 'payload');
  }

  // Extract XML element names to generate a mapping
  const elements = extractXmlElements(payload);
  if (elements.root && elements.children.length > 0) {
    const fields = elements.children.map((el) =>
      `    ${el}: payload.${elements.root}.${el}`
    );
    const body = `{\n  ${elements.root}: {\n${fields.join(',\n')}\n  }\n}`;
    return buildScript('application/xml', hints, body);
  }

  return buildScript('application/xml', hints, 'payload');
}

function extractXmlElements(xml: string): { root: string; children: string[] } {
  // Simple regex extraction — not a full parser, but good enough for scaffolding
  const rootMatch = xml.match(/<([a-zA-Z_][\w.-]*)[^>]*>/);
  if (!rootMatch) return { root: '', children: [] };

  const root = rootMatch[1];
  const children: string[] = [];
  // Find direct child elements inside the root
  const innerMatch = xml.match(new RegExp(`<${root}[^>]*>([\\s\\S]*?)</${root}>`));
  if (innerMatch) {
    const inner = innerMatch[1];
    const childRe = /<([a-zA-Z_][\w.-]*)[^>]*>/g;
    let m;
    const seen = new Set<string>();
    while ((m = childRe.exec(inner)) !== null) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        children.push(m[1]);
      }
    }
  }

  return { root, children };
}

// --- CSV ---

function generateCsvScript(payload: string, hints: string[]): string {
  if (!payload.trim()) {
    return buildScript('application/json', hints, 'payload');
  }

  // Try to detect column headers from first line
  const firstLine = payload.split('\n')[0];
  const separator = firstLine.includes('\t') ? '\t' : ',';
  const columns = firstLine.split(separator).map((c) => c.trim().replace(/"/g, ''));

  if (columns.length > 0 && columns[0]) {
    const fields = columns.map((col) => {
      const safe = col.replace(/[^a-zA-Z0-9_]/g, '_');
      return `    ${safe}: row.${safeDot(col)}`;
    });
    const body = `payload map (row) -> {\n${fields.join(',\n')}\n  }`;
    return buildScript('application/json', hints, body);
  }

  // CSV in, CSV out — mirroring the input format, same as the XML branch.
  return buildScript('application/csv', hints, 'payload map (row) -> row');
}

// --- Form URL-Encoded ---

function generateFormUrlEncodedScript(payload: string, hints: string[]): string {
  if (!payload.trim()) {
    return buildScript('application/json', hints, 'payload');
  }

  // Parse key=value&key=value into fields
  const pairs = payload.split('&').map((pair) => {
    const [k, ...rest] = pair.split('=');
    return { key: decodeURIComponent(k || ''), value: decodeURIComponent(rest.join('=') || '') };
  }).filter((p) => p.key);

  if (pairs.length > 0) {
    const fields = pairs.map((p) =>
      `  ${safeKey(p.key)}: payload.${safeDot(p.key)}`
    );
    const body = `{\n${fields.join(',\n')}\n}`;
    return buildScript('application/json', hints, body);
  }

  return buildScript('application/json', hints, 'payload');
}

// --- Multipart Form Data ---

interface LocalMultipartPart {
  name: string;
  value: string;
  filename: string | null;
  contentType: string;
  isFile: boolean;
}

function generateMultipartScript(payload: string, hints: string[], partNames?: string[]): string {
  // Use provided part names, or extract from JSON payload if present
  let names: string[] = partNames || [];

  if (names.length === 0 && payload.trim()) {
    try {
      const parsed: { parts: Record<string, unknown> } = JSON.parse(payload);
      names = Object.keys(parsed.parts || {});
    } catch { /* skip */ }
  }

  if (names.length === 0) {
    return buildScript('application/json', hints, 'payload // multipart — add parts in the payload tab');
  }

  // Mirror the input format, the way the XML branch already does. Writing
  // multipart needs the `{ parts: { name: { headers, content } } }` shape — the
  // engine rejects a plain object with "Multipart Object does not have `parts`
  // field defined", so a naive `{ title: payload.parts.title.content }` would
  // scaffold a script that can't run. This one round-trips, and switching the
  // output format in the dropdown leaves a body that still reads sensibly.
  const fields = names.map(
    (name) =>
      `    ${safeKey(name)}: {\n` +
      `      headers: { "Content-Type": "text/plain" },\n` +
      `      content: payload.parts.${safeDot(name)}.content,\n` +
      `    }`
  );
  const body = `{\n  parts: {\n${fields.join(',\n')}\n  }\n}`;
  return buildScript('multipart/form-data', hints, body);
}

// ========================================================
// Helpers
// ========================================================

function safeDot(key: string): string {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : `"${key}"`;
}

function safeKey(key: string): string {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : `"${key}"`;
}

function singularize(word: string): string {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return 'item';
}


// ========================================================
// Curl parser
// ========================================================

function parseCurl(curl: string): CurlImportResult {
  let method = 'GET';
  let explicitMethod = false;
  const headers: KeyValuePair[] = [];
  const queryParams: KeyValuePair[] = [];
  let rawPayload = '';
  const formParts: LocalMultipartPart[] = [];

  const normalized = curl.replace(/\\\s*\n/g, ' ').replace(/\\\s*$/gm, ' ').trim();
  const withoutCurl = normalized.replace(/^curl\s+/i, '');

  // Tokenize
  const tokens = tokenize(withoutCurl);

  let url = '';
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '-X' || token === '--request') {
      i++;
      if (i < tokens.length) { method = tokens[i].toUpperCase(); explicitMethod = true; }
    } else if (token === '-H' || token === '--header') {
      i++;
      if (i < tokens.length) {
        const colonIdx = tokens[i].indexOf(':');
        if (colonIdx > 0) {
          headers.push({
            key: tokens[i].slice(0, colonIdx).trim(),
            value: tokens[i].slice(colonIdx + 1).trim(),
          });
        }
      }
    } else if (['-d', '--data', '--data-raw', '--data-binary'].includes(token)) {
      i++;
      if (i < tokens.length) {
        rawPayload = tokens[i];
        if (!explicitMethod) method = 'POST';
      }
    } else if (token === '--data-urlencode') {
      i++;
      if (i < tokens.length) {
        rawPayload = rawPayload ? `${rawPayload}&${tokens[i]}` : tokens[i];
        if (!explicitMethod) method = 'POST';
      }
    } else if (token === '-F' || token === '--form') {
      i++;
      if (i < tokens.length) {
        const part = parseFormPart(tokens[i]);
        formParts.push(part);
        if (!explicitMethod) method = 'POST';
      }
    } else if (token.startsWith('-')) {
      const flagsWithValue = [
        '-u', '--user', '-o', '--output', '-A', '--user-agent',
        '-b', '--cookie', '-c', '--cookie-jar', '-e', '--referer',
        '--connect-timeout', '-m', '--max-time', '--retry',
        '-x', '--proxy', '--cert', '--key', '--cacert',
      ];
      if (flagsWithValue.includes(token)) i++;
    } else if (!url) {
      url = token;
    }

    i++;
  }

  // Parse URL query params
  if (url) {
    try {
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;
      const parsed = new URL(fullUrl);
      parsed.searchParams.forEach((value, key) => {
        queryParams.push({ key, value });
      });
    } catch { /* skip */ }
  }

  // Determine MIME type
  let payloadMimeType = detectMimeType(headers, formParts, rawPayload);

  // Build payload string and script based on type
  let payload: string;
  let generatedScript: string;

  if (formParts.length > 0) {
    // Real multipart — payload builder will construct the body at run time
    payloadMimeType = 'multipart/form-data';
    payload = '';
    const mpHints = buildHintComments(queryParams, headers);
    generatedScript = generateMultipartScript('', mpHints, formParts.map(p => p.name));
  } else if (payloadMimeType === 'application/x-www-form-urlencoded') {
    payload = rawPayload;
    generatedScript = generateDWScript(payload, payloadMimeType, queryParams, headers);
  } else if (payloadMimeType === 'application/xml') {
    payload = rawPayload;
    generatedScript = generateDWScript(payload, payloadMimeType, queryParams, headers);
  } else if (payloadMimeType === 'application/csv') {
    payload = rawPayload;
    generatedScript = generateDWScript(payload, payloadMimeType, queryParams, headers);
  } else {
    // JSON or other
    if (rawPayload && payloadMimeType === 'application/json') {
      try { payload = JSON.stringify(JSON.parse(rawPayload), null, 2); } catch { payload = rawPayload; }
    } else {
      payload = rawPayload;
    }
    generatedScript = generateDWScript(payload, payloadMimeType, queryParams, headers);
  }

  const multipartParts: MultipartPart[] | undefined = formParts.length > 0
    ? formParts.map(p => ({
        name: p.name,
        value: p.isFile ? '' : p.value,
        contentType: p.contentType,
        isFile: p.isFile,
        filename: p.filename ?? undefined,
        // filePath left undefined — user needs to pick actual file
      }))
    : undefined;

  return { method, headers, queryParams, payload, payloadMimeType, generatedScript, multipartParts };
}

function parseFormPart(formStr: string): LocalMultipartPart {
  // Format: name=value or name=@filepath or name=@filepath;type=mime
  const eqIdx = formStr.indexOf('=');
  if (eqIdx < 0) {
    return { name: formStr, value: '', filename: null, contentType: 'text/plain', isFile: false };
  }

  const name = formStr.slice(0, eqIdx);
  let value = formStr.slice(eqIdx + 1);
  let contentType = 'text/plain';
  let filename: string | null = null;
  let isFile = false;

  // Check for type override: value;type=mime/type
  const typeMatch = value.match(/;type=([^\s;]+)/i);
  if (typeMatch) {
    contentType = typeMatch[1];
    value = value.replace(/;type=[^\s;]+/i, '');
  }

  // Check for file reference: @filepath
  if (value.startsWith('@')) {
    isFile = true;
    const filePath = value.slice(1);
    filename = filePath.split(/[/\\]/).pop() || filePath;

    // Guess content type from extension
    if (!typeMatch) {
      contentType = guessContentType(filename);
    }

    value = `<${filename} data>`;
  }

  return { name, value, filename, contentType, isFile };
}

function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    json: 'application/json',
    xml: 'application/xml',
    csv: 'text/csv',
    txt: 'text/plain',
    html: 'text/html',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    zip: 'application/zip',
    gz: 'application/gzip',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext] || 'application/octet-stream';
}

function detectMimeType(
  headers: KeyValuePair[],
  formParts: LocalMultipartPart[],
  rawPayload: string,
): MimeType {
  if (formParts.length > 0) return 'multipart/form-data';

  const ct = headers.find((h) => h.key.toLowerCase() === 'content-type');
  if (ct) {
    const v = ct.value.toLowerCase();
    if (v.includes('multipart')) return 'multipart/form-data';
    if (v.includes('form-urlencoded')) return 'application/x-www-form-urlencoded';
    if (v.includes('xml')) return 'application/xml';
    if (v.includes('csv')) return 'application/csv';
    if (v.includes('plain')) return 'text/plain';
    if (v.includes('json')) return 'application/json';
  }

  // Auto-detect from payload content
  if (rawPayload) {
    const trimmed = rawPayload.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'application/json';
    if (trimmed.startsWith('<')) return 'application/xml';
    if (trimmed.includes('=') && !trimmed.includes('{') && !trimmed.includes('<')) {
      return 'application/x-www-form-urlencoded';
    }
  }

  return 'application/json';
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (const ch of input) {
    if (escape) { current += ch; escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if ((ch === ' ' || ch === '\t') && !inSingle && !inDouble) {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

// ========================================================
// Component
// ========================================================

interface CurlImporterProps {
  onImport: (result: CurlImportResult) => void;
  /** Controlled open state. When provided the component is just the modal —
   *  no inline trigger button — so callers can open it directly (App lifts it
   *  out of the sidebar so the cURL rail icon opens the dialog, not an empty
   *  panel). When omitted it falls back to its own inline trigger button. */
  open?: boolean;
  onClose?: () => void;
  /** Import a `dws1.…` share link (or a URL containing one). The dialog only
   *  collects the text; App decodes and applies it. */
  onImportShareLink?: (text: string) => void;
}

export function CurlImporter({ onImport, open, onClose, onImportShareLink }: CurlImporterProps) {
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlled ? open : internalOpen;
  const [curlText, setCurlText] = useState('');
  // One dialog, two sources — a cURL command or a share link. Sharing was
  // previously buried in the workspace breadcrumb menu where nobody found it.
  const [mode, setMode] = useState<'curl' | 'link'>('curl');
  const [linkText, setLinkText] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<CurlImportResult | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const mouseDownOnBackdrop = useRef(false);

  // Escape closes the dialog (state is kept — see handleClose).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (controlled) onClose?.(); else setInternalOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, controlled, onClose]);

  const handlePreview = () => {
    if (!curlText.trim()) { setError('Paste a curl command first'); return; }
    try {
      const result = parseCurl(curlText);
      setPreview(result);
      setError('');
    } catch {
      setError('Failed to parse curl command');
    }
  };

  // Closing keeps the pasted command/preview so an accidental dismiss doesn't
  // destroy work — state only clears after a successful import.
  const handleClose = () => {
    if (controlled) onClose?.(); else setInternalOpen(false);
  };

  const handleImport = () => {
    if (preview) {
      onImport(preview);
      handleClose();
      setError('');
      setCurlText('');
      setPreview(null);
    }
  };

  if (!isOpen) {
    // Controlled mode: nothing to render until the caller opens it.
    if (controlled) return null;
    return (
      <button
        onClick={() => setInternalOpen(true)}
        className="w-full text-left rounded-md px-2.5 py-2 text-[12px] cursor-pointer transition-colors"
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          color: 'var(--content-secondary)',
        }}
        title="Import from cURL — auto-fills payload, context, and generates a DW transform"
      >
        <span className="inline-flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Paste cURL
        </span>
      </button>
    );
  }

  // Derive payload shape for the "Detected" pane (top-level fields + types).
  const shape = preview ? deriveShape(preview.payload, preview.payloadMimeType) : null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] px-4"
      style={{
        background: 'color-mix(in oklch, var(--bg) 60%, transparent)',
        backdropFilter: 'blur(3px)',
      }}
      // mousedown+mouseup must BOTH land on the backdrop: a text-selection
      // drag that starts in the textarea and ends past the dialog edge
      // dispatches click on the backdrop and would otherwise close it.
      onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === backdropRef.current; }}
      onMouseUp={(e) => {
        if (mouseDownOnBackdrop.current && e.target === backdropRef.current) handleClose();
        mouseDownOnBackdrop.current = false;
      }}
    >
      <div
        className="w-full max-w-[780px] rounded-xl flex flex-col overflow-hidden"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: '0 28px 80px color-mix(in oklch, oklch(0% 0 0) 55%, transparent)',
          maxHeight: '88vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 flex items-start gap-3 shrink-0" style={{ borderBottom: '1px solid var(--line-subtle)' }}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-semibold" style={{ color: 'var(--content)' }}>Import</div>
            <div className="text-[12px] mt-[3px]" style={{ color: 'var(--content-muted)' }}>
              {mode === 'curl'
                ? "Paste a curl command — we'll detect method, headers, params, and generate a DW transform from the payload."
                : 'Paste a share link — it restores the script, payload, vars and headers exactly as they were sent.'}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer hover:bg-surface-2 shrink-0"
            style={{ color: 'var(--content-faint)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Source picker — same window, swapped body. */}
        <div className="px-4 pb-3 flex items-center gap-1.5 shrink-0">
          {([['curl', 'From cURL'], ['link', 'From share link']] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              className="h-7 px-3 rounded-md text-[12px] cursor-pointer transition-colors"
              style={mode === m
                ? { background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }
                : { background: 'var(--surface-2)', color: 'var(--content-faint)', border: '1px solid var(--line)' }}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'link' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.4px] mb-1.5" style={{ color: 'var(--content-faint)' }}>
              Share link
            </div>
            <textarea
              value={linkText}
              onChange={(e) => { setLinkText(e.target.value); setError(''); }}
              placeholder="https://ashutosh-vijay.dev/dataweave/s#dws1.…  — or paste the dws1.… code itself"
              spellCheck={false}
              rows={5}
              className="w-full rounded-md px-3 py-2.5 text-[11.5px] font-mono leading-[1.55] resize-none outline-none"
              style={{
                background: 'var(--surface-2)',
                border: `1px solid ${error ? 'var(--err)' : 'var(--line)'}`,
                color: 'var(--content-secondary)',
              }}
              autoFocus
            />
            {error && <div className="text-[11px] mt-1.5" style={{ color: 'var(--err)' }}>{error}</div>}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={async () => {
                  try { setLinkText(await navigator.clipboard.readText()); setError(''); }
                  catch { setError('Couldn’t read the clipboard — paste the link manually.'); }
                }}
                className="h-8 px-3 rounded-md text-[12px] cursor-pointer hover:bg-surface-2"
                style={{ border: '1px solid var(--line)', color: 'var(--content-secondary)' }}
              >
                Paste from clipboard
              </button>
              <div className="flex-1" />
              <button
                onClick={() => {
                  if (!linkText.trim()) { setError('Paste a share link first.'); return; }
                  try {
                    onImportShareLink?.(linkText);
                    setLinkText('');
                    if (controlled) onClose?.(); else setInternalOpen(false);
                  } catch (e) { setError((e as Error).message); }
                }}
                disabled={!linkText.trim()}
                className="h-8 px-4 rounded-md text-[12px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                Import
              </button>
            </div>
            <div className="text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--content-faint)' }}>
              A share link carries the whole setup inside itself — the data rides in the part of
              the URL browsers never send to a server, so nothing was uploaded to create it.
              {' '}
              {/* Whoever opens this dialog to paste a link is the same person who'll
                  want to send one back, and creating one was previously undiscoverable. */}
              <b>To send one of your own:</b> press <b>⌘K</b> (Ctrl+K) and search
              “share”, or use the workspace menu next to the workspace name.
            </div>
          </div>
        )}

        {mode === 'curl' && (<>
        <div className="flex-1 overflow-y-auto">
          {/* Two-column: input | detected */}
          <div className="p-4 grid gap-3.5" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {/* Left: input */}
            <div>
              <div
                className="text-[10.5px] font-semibold uppercase tracking-[0.4px] mb-1.5 flex items-center gap-2"
                style={{ color: 'var(--content-faint)' }}
              >
                <span className="flex-1">cURL command</span>
                <span className="font-mono normal-case tracking-normal font-medium" style={{ color: 'var(--content-faint)' }}>⌘V to paste</span>
              </div>
              <textarea
                value={curlText}
                onChange={(e) => { setCurlText(e.target.value); setError(''); setPreview(null); }}
                placeholder={"curl -X POST 'https://api.example.com/data' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"name\":\"test\"}'"}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                rows={12}
                className="w-full rounded-md px-3 py-2.5 text-[11.5px] font-mono leading-[1.55] resize-none outline-none"
                style={{
                  background: 'var(--surface-2)',
                  border: `1px solid ${error ? 'var(--err)' : 'var(--line)'}`,
                  color: 'var(--content-secondary)',
                  height: 280,
                }}
                autoFocus
              />
              {error && (
                <div className="text-[11px] mt-1.5" style={{ color: 'var(--err)' }}>{error}</div>
              )}
            </div>

            {/* Right: detected */}
            <div>
              <div
                className="text-[10.5px] font-semibold uppercase tracking-[0.4px] mb-1.5"
                style={{ color: 'var(--content-faint)' }}
              >
                Detected
              </div>
              <div
                className="rounded-md p-3 flex flex-col gap-2.5"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  height: 280,
                  overflow: 'auto',
                }}
              >
                {preview ? (
                  <>
                    {/* Method + URL */}
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono font-bold text-[10.5px] px-2 py-[3px] rounded"
                        style={{
                          background: 'var(--accent-dim)',
                          color: 'var(--accent)',
                          border: '1px solid var(--accent-border)',
                        }}
                      >
                        {preview.method}
                      </span>
                      <span className="flex-1 text-[11.5px] font-mono truncate" style={{ color: 'var(--content-secondary)' }}>
                        {extractUrlHost(curlText)}
                      </span>
                    </div>

                    {/* Type */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] w-[60px]" style={{ color: 'var(--content-faint)' }}>Type</span>
                      <span className="text-[11.5px] font-mono" style={{ color: 'var(--violet)' }}>{preview.payloadMimeType}</span>
                    </div>

                    {/* Query params */}
                    {preview.queryParams.length > 0 && (
                      <Section label="Query" count={preview.queryParams.length}>
                        {preview.queryParams.map((p, i) => (
                          <KVLine key={i} k={p.key} v={p.value} />
                        ))}
                      </Section>
                    )}

                    {/* Headers */}
                    {preview.headers.length > 0 && (
                      <Section label="Headers" count={preview.headers.length}>
                        {preview.headers.map((h, i) => (
                          <KVLine key={i} k={h.key} v={h.value} />
                        ))}
                      </Section>
                    )}

                    {/* Payload shape */}
                    {shape && shape.length > 0 && (
                      <Section label="Payload shape" count={`${shape.length} field${shape.length === 1 ? '' : 's'}`} accent>
                        {shape.map((f, i) => (
                          <div key={i} className="flex gap-2 text-[11px] font-mono">
                            <span style={{ color: 'var(--violet)' }}>{f.key}</span>
                            <span style={{ color: 'var(--content-muted)' }}>:</span>
                            <span style={{ color: 'var(--cyan)' }}>{f.type}</span>
                            {f.note && <span style={{ color: 'var(--content-faint)' }}>· {f.note}</span>}
                          </div>
                        ))}
                      </Section>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-center px-3 text-[12px]" style={{ color: 'var(--content-faint)' }}>
                    Paste a cURL command and click <span className="font-semibold mx-1" style={{ color: 'var(--accent)' }}>Parse</span> to see the detected method, headers, and payload shape here.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Preview script */}
          {preview && (
            <div className="px-4 pb-4">
              <div
                className="text-[10.5px] font-semibold uppercase tracking-[0.4px] mb-1.5 flex items-center gap-2"
                style={{ color: 'var(--content-faint)' }}
              >
                <span className="flex-1">Generated DataWeave script</span>
                <button
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(preview.generatedScript); } catch { /* ignore */ }
                  }}
                  className="text-[11px] font-medium normal-case tracking-normal cursor-pointer bg-transparent border-none inline-flex items-center gap-1"
                  style={{ color: 'var(--content-muted)' }}
                >
                  📋 Copy
                </button>
              </div>
              <pre
                className="rounded-md py-2.5 px-3 text-[11.5px] font-mono overflow-x-auto m-0 select-text"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  color: 'var(--content)',
                  maxHeight: 200,
                }}
              >
                {preview.generatedScript}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-3 flex items-center gap-2 shrink-0"
          style={{ borderTop: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}
        >
          <span className="text-[11.5px]" style={{ color: 'var(--content-faint)' }}>
            {preview ? 'Replaces current script and payload' : 'Paste a cURL command to start'}
          </span>
          <span className="flex-1" />
          <button
            onClick={handleClose}
            className="h-7 px-3 rounded-md text-[12px] font-medium cursor-pointer"
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              color: 'var(--content-secondary)',
            }}
          >
            Cancel
          </button>
          {!preview ? (
            <button
              onClick={handlePreview}
              disabled={!curlText.trim()}
              className="h-7 px-3 rounded-md text-[12px] font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              Parse
            </button>
          ) : (
            <button
              onClick={handleImport}
              className="h-7 px-3 rounded-md text-[12px] font-semibold cursor-pointer"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              Import
            </button>
          )}
        </div>
        </>)}
      </div>
    </div>
  );
}

// ---- helpers ----

function Section({ label, count, children, accent }: { label: string; count: number | string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[11px]" style={{ color: 'var(--content-faint)' }}>{label}</span>
        <span
          className="font-mono text-[9.5px] font-semibold px-1.5 py-px rounded"
          style={{
            background: accent ? 'var(--accent-dim)' : 'var(--surface-3)',
            color: accent ? 'var(--accent)' : 'var(--content-muted)',
          }}
        >
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-px pl-1">{children}</div>
    </div>
  );
}

function KVLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 text-[11px] font-mono">
      <span className="truncate" style={{ color: 'var(--violet)', minWidth: 110, maxWidth: 130 }}>{k}</span>
      <span className="flex-1 truncate" style={{ color: 'var(--content-muted)' }}>{v}</span>
    </div>
  );
}

function extractUrlHost(curl: string): string {
  const m = curl.match(/['"](https?:\/\/[^'"]+)['"]/) || curl.match(/(https?:\/\/[^\s'"]+)/);
  if (!m) return '';
  try {
    const u = new URL(m[1]);
    return u.host + u.pathname;
  } catch {
    return m[1];
  }
}

interface ShapeField { key: string; type: string; note?: string }

function deriveShape(payload: string, mime: string): ShapeField[] | null {
  if (!payload || !payload.trim()) return null;
  if (!mime.includes('json')) return null;
  try {
    const obj = JSON.parse(payload);
    if (Array.isArray(obj)) {
      return [{ key: '[]', type: `Array<${typeof obj[0] === 'object' ? 'Object' : typeof obj[0]}>`, note: `${obj.length} item${obj.length === 1 ? '' : 's'}` }];
    }
    if (obj && typeof obj === 'object') {
      return Object.entries(obj).slice(0, 6).map(([key, val]) => {
        let type = typeof val === 'object' ? (Array.isArray(val) ? 'Array' : 'Object') : capitalize(typeof val);
        let note: string | undefined;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          note = `${Object.keys(val).length} field${Object.keys(val).length === 1 ? '' : 's'}`;
        }
        if (Array.isArray(val)) note = `${val.length} item${val.length === 1 ? '' : 's'}`;
        return { key, type, note };
      });
    }
  } catch { /* ignore */ }
  return null;
}

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
