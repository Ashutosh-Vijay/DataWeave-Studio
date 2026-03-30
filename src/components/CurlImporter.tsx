import { useState } from 'react';
import { KeyValuePair, MimeType } from '../types';

export interface CurlImportResult {
  method: string;
  headers: KeyValuePair[];
  queryParams: KeyValuePair[];
  payload: string;
  payloadMimeType: MimeType;
  generatedScript: string;
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

  return buildScript('application/json', hints, 'payload map (row) -> row');
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

interface MultipartPart {
  name: string;
  value: string;
  filename: string | null;
  contentType: string;
  isFile: boolean;
}

function generateMultipartScript(payload: string, hints: string[]): string {
  // The payload for multipart is stored as JSON describing the parts
  let parts: MultipartPart[];
  try {
    parts = JSON.parse(payload);
  } catch {
    return buildScript('multipart/form-data', hints, 'payload');
  }

  if (!Array.isArray(parts) || parts.length === 0) {
    return buildScript('multipart/form-data', hints, 'payload');
  }

  // Generate MuleSoft-style multipart DW
  const partEntries = parts.map((part) => {
    const partLines: string[] = [];
    partLines.push(`    ${safeKey(part.name)}: {`);
    partLines.push(`      headers: {`);
    partLines.push(`        "Content-Type": "${part.contentType}"`);
    if (part.filename) {
      partLines.push(`        , "Content-Disposition": {`);
      partLines.push(`            "type": "form-data",`);
      partLines.push(`            "name": "${part.name}",`);
      partLines.push(`            "filename": "${part.filename}"`);
      partLines.push(`        }`);
    }
    partLines.push(`      },`);
    if (part.isFile) {
      partLines.push(`      content: payload.parts.${safeDot(part.name)}.content`);
    } else {
      partLines.push(`      content: "${escDW(part.value)}"`);
    }
    partLines.push(`    }`);
    return partLines.join('\n');
  });

  const body = `{\n  parts: {\n${partEntries.join(',\n')}\n  }\n}`;
  return buildScript('multipart/form-data', hints, body);
}

function generateMultipartPayload(parts: MultipartPart[]): string {
  // Store as JSON so the payload editor can display/edit it
  return JSON.stringify(
    {
      parts: Object.fromEntries(
        parts.map((p) => [
          p.name,
          p.isFile
            ? {
                headers: { 'Content-Type': p.contentType, filename: p.filename },
                content: `<${p.filename || 'file'} data>`,
              }
            : { headers: { 'Content-Type': p.contentType }, content: p.value },
        ])
      ),
    },
    null,
    2
  );
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

function escDW(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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
  const formParts: MultipartPart[] = [];

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
    // Multipart form data
    payloadMimeType = 'multipart/form-data';
    payload = generateMultipartPayload(formParts);
    generatedScript = generateDWScript(payload, payloadMimeType, queryParams, headers);
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

  return { method, headers, queryParams, payload, payloadMimeType, generatedScript };
}

function parseFormPart(formStr: string): MultipartPart {
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
  formParts: MultipartPart[],
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
}

export function CurlImporter({ onImport }: CurlImporterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [curlText, setCurlText] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<CurlImportResult | null>(null);

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

  const handleImport = () => {
    if (preview) {
      onImport(preview);
      setCurlText('');
      setError('');
      setPreview(null);
      setIsOpen(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setError('');
    setCurlText('');
    setPreview(null);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full text-left bg-surface-elevated hover:bg-surface-active border border-line rounded px-2 py-1.5 text-xs text-content-secondary transition-colors cursor-pointer"
        title="Import from curl — auto-fills payload, context, and generates a DW transform"
      >
        Paste cURL
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-elevated border border-line rounded-lg shadow-2xl w-[700px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="text-sm font-medium text-content">Import from cURL</h2>
          <button onClick={handleClose} className="text-content-faint hover:text-content-secondary cursor-pointer">✕</button>
        </div>

        {/* Body */}
        <div className="p-4 flex-1 overflow-auto space-y-3">
          <p className="text-xs text-content-muted">
            Paste any curl command — JSON, XML, CSV, form-urlencoded, or multipart.
            It will auto-detect the format and generate a matching DW transform.
          </p>
          <textarea
            value={curlText}
            onChange={(e) => { setCurlText(e.target.value); setError(''); setPreview(null); }}
            placeholder={`Examples:
curl -X POST 'https://api.example.com/data' -H 'Content-Type: application/json' -d '{"name":"test"}'
curl -F "file=@report.pdf" -F "name=John" 'https://upload.example.com/files'
curl -d "user=john&pass=secret" 'https://auth.example.com/login'
curl -H 'Content-Type: application/xml' -d '<user><name>John</name></user>' 'https://api.example.com'`}
            rows={7}
            className="w-full bg-surface-panel border border-line rounded px-3 py-2 text-xs text-content font-mono placeholder-content-ghost focus:border-blue-500 focus:outline-none resize-y"
            autoFocus
          />
          {error && <div className="text-xs text-red-400">{error}</div>}

          {/* Preview */}
          {preview && (
            <div className="space-y-3 border-t border-line pt-3">
              <div className="text-xs font-medium text-content-secondary">Preview</div>

              <div className="flex flex-wrap gap-3 text-[11px]">
                <div>
                  <span className="text-content-faint">Method:</span>{' '}
                  <span className="text-blue-400">{preview.method}</span>
                </div>
                <div>
                  <span className="text-content-faint">Type:</span>{' '}
                  <span className="text-purple-400">{preview.payloadMimeType}</span>
                </div>
                {preview.queryParams.length > 0 && (
                  <div>
                    <span className="text-content-faint">Params:</span>{' '}
                    <span className="text-content-secondary">{preview.queryParams.length}</span>
                  </div>
                )}
                {preview.headers.length > 0 && (
                  <div>
                    <span className="text-content-faint">Headers:</span>{' '}
                    <span className="text-content-secondary">{preview.headers.length}</span>
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] text-content-faint mb-1">Generated Script</div>
                <pre className="bg-surface-panel border border-line rounded p-3 text-xs text-green-300 font-mono whitespace-pre overflow-x-auto max-h-52">
                  {preview.generatedScript}
                </pre>
              </div>

              {preview.payload && (
                <div>
                  <div className="text-[11px] text-content-faint mb-1">Payload</div>
                  <pre className="bg-surface-panel border border-line rounded p-3 text-xs text-content-secondary font-mono whitespace-pre overflow-x-auto max-h-32">
                    {preview.payload}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-line">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs text-content-muted hover:text-content border border-line rounded transition-colors cursor-pointer"
          >
            Cancel
          </button>
          {!preview ? (
            <button
              onClick={handlePreview}
              className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors cursor-pointer"
            >
              Parse
            </button>
          ) : (
            <button
              onClick={handleImport}
              className="px-3 py-1.5 text-xs text-white bg-green-600 hover:bg-green-700 rounded transition-colors cursor-pointer"
            >
              Import
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
