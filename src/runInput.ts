/**
 * Builders for the JSON inputs handed to a DataWeave run (the "normal single
 * script" path). Extracted from App.tsx so they can be unit-tested without
 * pulling in the whole app / the Tauri runtime.
 */
import type { ContextState, KeyValuePair, NamedInput, VarEntry } from './types';

/** Named inputs plus the Error tab's object as an input called `error`, which
 *  is how Mule hands it to a script in an error handler. Invalid JSON is passed
 *  as-is so the engine's own parse error explains it. */
export function withErrorInput(namedInputs: NamedInput[], context: ContextState): NamedInput[] {
  const err = context.errorJson?.trim();
  if (!err) return namedInputs;
  return [...namedInputs.filter((n) => n.name !== 'error'), { name: 'error', content: err, mimeType: 'application/json' }];
}

/** Build the `attributes` JSON from the request context. Disabled or
 *  empty-value rows are dropped — an *absent* attribute is not the same as an
 *  empty-string one in DataWeave. */
export function buildAttributesJson(
  method: string,
  queryParams: KeyValuePair[],
  headers: KeyValuePair[],
  uriParams: KeyValuePair[] = [],
): string {
  const attrs: Record<string, unknown> = { method };

  if (uriParams.length > 0) {
    const up: Record<string, string> = {};
    uriParams.forEach((p) => {
      if (p.enabled === false) return;
      if (p.key && p.value !== '') up[p.key] = p.value;
    });
    if (Object.keys(up).length > 0) attrs.uriParams = up;
  }

  if (queryParams.length > 0) {
    const qp: Record<string, string> = {};
    queryParams.forEach((p) => {
      if (p.enabled === false) return;
      if (p.key && p.value !== '') qp[p.key] = p.value;
    });
    if (Object.keys(qp).length > 0) attrs.queryParams = qp;
  }

  if (headers.length > 0) {
    const h: Record<string, string> = {};
    headers.forEach((p) => {
      if (p.enabled === false) return;
      if (p.key && p.value !== '') h[p.key] = p.value;
    });
    if (Object.keys(h).length > 0) attrs.headers = h;
  }

  return JSON.stringify(attrs);
}

/** Build the `vars` JSON for a DataWeave run. JSON-typed vars are parsed into
 *  structured values; an empty value becomes `null` (DataWeave can't select on
 *  ""); disabled / unkeyed rows are dropped. */
export function buildVarsJson(vars: VarEntry[]): string {
  const obj: Record<string, unknown> = {};
  vars.forEach((v) => {
    if (!v.key) return;
    if (v.enabled === false) return;
    if (v.value.trim() === '') {
      // Empty value → DataWeave null (avoids "cannot operate on empty string" errors)
      obj[v.key] = null;
    } else if (v.valueType === 'json') {
      try {
        obj[v.key] = JSON.parse(v.value);
      } catch {
        obj[v.key] = v.value;
      }
    } else {
      obj[v.key] = v.value;
    }
  });
  return JSON.stringify(obj);
}

/**
 * JSON inputs may carry `//` and `/* *\/` notes in the editor; the engine's
 * JSON reader rejects them, so they are blanked out on the way to it. Spaces
 * replace the comment text and newlines stay, so error positions still match
 * what is on screen. Non-JSON formats pass through untouched.
 */
export function stripInputComments(text: string, mime: string): string {
  if (!(mime.includes('json') || mime.includes('java')) || mime.includes('ndjson') || mime.includes('properties')) return text;
  if (!/\/[/*]/.test(text)) return text;
  let out = '';
  let last = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      // A string: skip to its closing quote so "http://x" is left alone.
      i++;
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
      i++;
    } else if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      let end = text[i + 1] === '/' ? text.indexOf('\n', i) : text.indexOf('*/', i + 2);
      end = end < 0 ? text.length : text[i + 1] === '/' ? end : end + 2;
      out += text.slice(last, i) + text.slice(i, end).replace(/[^\r\n]/g, ' ');
      last = i = end;
    } else {
      i++;
    }
  }
  return out + text.slice(last);
}
