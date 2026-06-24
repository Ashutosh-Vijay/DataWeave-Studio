import { useEffect, useMemo, useState } from 'react';
import yaml from 'js-yaml';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '../bridge';
import { MimeType } from '../types';
import { Icons } from './Icons';
import { WindowControls } from './WindowControls';
import { toast } from './Toast';

/**
 * Swagger / OpenAPI reader. Paste (or open) an OpenAPI 3.x or Swagger 2.0 spec,
 * browse its operations (paths, webhooks, callbacks) and reusable schemas
 * (types), and for any request/response/type — and each of its named examples —
 * generate a sample JSON payload + a DataWeave skeleton you can drop straight
 * into the workspace. Same "parse → preview → import" flow as the cURL importer.
 *
 * No network: a spec arrives by paste or local file only. `externalValue`
 * examples (a URL) are surfaced but not fetched.
 */

export interface OpenApiImportResult {
  payload: string;
  payloadMimeType: MimeType;
  generatedScript: string;
}

// ========================================================
// Spec model
// ========================================================

interface NamedExample {
  name: string;
  summary?: string;
  description?: string;
  value: any;
  /** Set when the example is an `externalValue` URL we don't fetch. */
  externalValue?: string;
}

interface ApiSchemaRef {
  /** Picker label: 'Request' or a status code. */
  label: string;
  mime: string;
  schema?: any; // may be absent (examples-only body)
  examples: NamedExample[];
  description?: string;
}

interface ApiParam {
  name: string;
  in: string;
  required?: boolean;
  type?: string;
  description?: string;
}

interface ApiOp {
  method: string; // GET, POST, ...
  path: string;
  summary: string;
  description: string;
  operationId?: string;
  deprecated?: boolean;
  tag: string;
  params: ApiParam[];
  schemas: ApiSchemaRef[]; // request first, then responses by code
  /** Effective security scheme names (operation override, else global). */
  security: string[];
}

interface NamedSchema {
  name: string;
  schema: any;
}

interface SecurityScheme {
  type: string;
  scheme?: string;
  in?: string;
  name?: string;
  bearerFormat?: string;
  openIdConnectUrl?: string;
  flows?: any;
}

interface ParsedSpec {
  title: string;
  version: string;
  specKind: string; // "OpenAPI 3.0.1" / "Swagger 2.0"
  servers: string[];
  securitySchemes: Record<string, SecurityScheme>;
  ops: ApiOp[];
  schemas: NamedSchema[]; // reusable component schemas / definitions
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

export function parseSpecText(text: string): any {
  const t = text.trim();
  if (!t) throw new Error('Paste or open a spec first');
  // JSON is stricter and faster; fall back to YAML (which also reads JSON).
  try {
    return JSON.parse(t);
  } catch {
    return yaml.load(t);
  }
}

function resolveRef(doc: any, ref: string): any {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = doc;
  for (const p of parts) {
    if (cur == null) return null;
    cur = cur[p];
  }
  return cur;
}

function deref(doc: any, node: any): any {
  return node && node.$ref ? resolveRef(doc, node.$ref) : node;
}

// Every declared content type for a body, JSON-first then XML then the rest — so
// the default pick is the most DataWeave-friendly but nothing (multipart, form,
// octet-stream…) is hidden. The reader exposes one chip per type.
function orderedMimes(content: Record<string, any> | undefined): string[] {
  if (!content) return [];
  const rank = (k: string) => (k.includes('json') ? 0 : k.includes('xml') ? 1 : 2);
  return Object.keys(content).sort((a, b) => rank(a) - rank(b));
}

// Short, human label for a media type — used to disambiguate chips.
function shortMime(m: string): string {
  if (m.includes('json')) return 'JSON';
  if (m.includes('xml')) return 'XML';
  if (m.includes('multipart')) return 'multipart';
  if (m.includes('x-www-form-urlencoded')) return 'form';
  if (m.includes('octet')) return 'binary';
  if (m.includes('text/plain')) return 'text';
  return m.split('/')[1] || m;
}

/** Named examples for an OpenAPI 3.x media-type object (`examples:` map, or single `example:`). */
function collectExamples(media: any, doc: any): NamedExample[] {
  if (!media || typeof media !== 'object') return [];
  const out: NamedExample[] = [];
  if (media.examples && typeof media.examples === 'object') {
    for (const name of Object.keys(media.examples)) {
      const ex = deref(doc, media.examples[name]);
      if (!ex || typeof ex !== 'object') continue;
      out.push({ name, summary: ex.summary, description: ex.description, value: ex.value, externalValue: ex.externalValue });
    }
  } else if (media.example !== undefined) {
    out.push({ name: 'Example', value: media.example });
  }
  return out;
}

/** Names of the security schemes a requirement array references. */
function securityNames(reqs: any): string[] {
  if (!Array.isArray(reqs)) return [];
  const names: string[] = [];
  for (const r of reqs) {
    if (r && typeof r === 'object') names.push(...Object.keys(r));
  }
  return names;
}

export function buildSpec(doc: any): ParsedSpec {
  if (!doc || typeof doc !== 'object') throw new Error('Not a valid spec document');

  const isV3 = typeof doc.openapi === 'string' && doc.openapi.startsWith('3');
  const isV2 = typeof doc.swagger === 'string' && doc.swagger.startsWith('2');
  if (!isV3 && !isV2) {
    throw new Error('Unrecognized spec — expected OpenAPI 3.x (openapi:) or Swagger 2.0 (swagger:)');
  }

  const info = doc.info || {};
  const specKind = isV3 ? `OpenAPI ${doc.openapi}` : `Swagger ${doc.swagger}`;

  // Base URLs (3.x servers[].url, else 2.0 host+basePath).
  const servers: string[] = [];
  if (isV3 && Array.isArray(doc.servers)) {
    for (const s of doc.servers) if (s?.url) servers.push(s.url);
  } else if (isV2 && doc.host) {
    const scheme = (Array.isArray(doc.schemes) && doc.schemes[0]) || 'https';
    servers.push(`${scheme}://${doc.host}${doc.basePath || ''}`);
  }

  const securitySchemes: Record<string, SecurityScheme> =
    (isV3 ? doc.components?.securitySchemes : doc.securityDefinitions) || {};
  const globalSecurity = securityNames(doc.security);

  const buildSchemaRef = (label: string, mime: string, media: any, description?: string): ApiSchemaRef | null => {
    const schema = media?.schema;
    const examples = collectExamples(media, doc);
    if (!schema && examples.length === 0) return null;
    return { label, mime, schema, examples, description };
  };

  // Turn a paths-like object (paths / webhooks / a callback's expression map)
  // into operations. tagFallback labels entries that carry no tags.
  const extractOps = (pathsObj: any, tagFallback?: string): ApiOp[] => {
    const result: ApiOp[] = [];
    if (!pathsObj || typeof pathsObj !== 'object') return result;

    for (const path of Object.keys(pathsObj)) {
      const item = deref(doc, pathsObj[path]) || {};
      const sharedParams: any[] = Array.isArray(item.parameters) ? item.parameters : [];

      for (const method of METHODS) {
        const op = item[method];
        if (!op || typeof op !== 'object') continue;

        const rawParams = [...sharedParams, ...(Array.isArray(op.parameters) ? op.parameters : [])];
        const params: ApiParam[] = [];
        const schemas: ApiSchemaRef[] = [];

        for (const p of rawParams) {
          const pr = deref(doc, p);
          if (!pr || !pr.name) continue;
          if (isV2 && pr.in === 'body') {
            if (pr.schema) {
              const mime = (op.consumes?.[0] as string) || (doc.consumes?.[0] as string) || 'application/json';
              schemas.push({ label: 'Request', mime, schema: pr.schema, examples: [] });
            }
            continue;
          }
          params.push({ name: pr.name, in: pr.in, required: pr.required, type: pr.type || pr.schema?.type, description: pr.description });
        }

        // OpenAPI 3.x request body — one entry per declared content type.
        if (isV3 && op.requestBody) {
          const rb = deref(doc, op.requestBody);
          for (const mime of orderedMimes(rb?.content)) {
            const ref = buildSchemaRef('Request', mime, rb.content[mime], rb.description);
            if (ref) schemas.push(ref);
          }
        }

        // Responses (both versions)
        const responses = op.responses || {};
        for (const code of Object.keys(responses)) {
          const resp = deref(doc, responses[code]);
          if (!resp) continue;
          if (isV3) {
            for (const mime of orderedMimes(resp.content)) {
              const ref = buildSchemaRef(code, mime, resp.content[mime], resp.description);
              if (ref) schemas.push(ref);
            }
          } else if (resp.schema) {
            const mime = (op.produces?.[0] as string) || (doc.produces?.[0] as string) || 'application/json';
            const examples: NamedExample[] = resp.examples?.[mime] !== undefined ? [{ name: 'Example', value: resp.examples[mime] }] : [];
            schemas.push({ label: code, mime, schema: resp.schema, examples, description: resp.description });
          }
        }

        result.push({
          method: method.toUpperCase(),
          path,
          summary: op.summary || '',
          description: op.description || '',
          operationId: op.operationId,
          deprecated: op.deprecated,
          tag: (Array.isArray(op.tags) && op.tags[0]) || tagFallback || 'default',
          params,
          schemas,
          security: op.security !== undefined ? securityNames(op.security) : globalSecurity,
        });

        // Operation callbacks → surface their inner operations too.
        if (isV3 && op.callbacks && typeof op.callbacks === 'object') {
          for (const cbName of Object.keys(op.callbacks)) {
            const cb = deref(doc, op.callbacks[cbName]);
            for (const inner of extractOps(cb, `Callback · ${cbName}`)) result.push(inner);
          }
        }
      }
    }
    return result;
  };

  const ops: ApiOp[] = [
    ...extractOps(doc.paths),
    ...(isV3 ? extractOps(doc.webhooks, 'Webhooks') : []),
  ];

  // Reusable schemas (types).
  const schemaSource = (isV3 ? doc.components?.schemas : doc.definitions) || {};
  const schemas: NamedSchema[] = Object.keys(schemaSource).map((name) => ({ name, schema: schemaSource[name] }));

  if (ops.length === 0 && schemas.length === 0) {
    throw new Error('No operations or schemas found');
  }

  return {
    title: info.title || 'API',
    version: info.version || '',
    specKind,
    servers,
    securitySchemes,
    ops,
    schemas,
  };
}

function describeSecurity(names: string[], schemes: Record<string, SecurityScheme>): string {
  if (names.length === 0) return 'No auth';
  return names
    .map((n) => {
      const s = schemes[n];
      if (!s) return n;
      if (s.type === 'http') {
        if (s.scheme === 'bearer') return `Bearer token${s.bearerFormat ? ` (${s.bearerFormat})` : ''}`;
        if (s.scheme === 'basic') return 'Basic auth';
        if (s.scheme === 'noauth') return 'No auth';
        return s.scheme || 'HTTP auth';
      }
      if (s.type === 'apiKey') return `API key · ${s.in}: ${s.name}`;
      if (s.type === 'oauth2') return 'OAuth 2.0';
      if (s.type === 'openIdConnect') return 'OpenID Connect';
      if (s.type === 'mutualTLS') return 'Mutual TLS';
      return n;
    })
    .join(', ');
}

// ========================================================
// Sample payload from a JSON Schema
// ========================================================

export function sampleFromSchema(schema: any, doc: any, depth: number, seen: Set<string>): any {
  if (!schema || depth > 8) return null;

  if (schema.$ref) {
    if (seen.has(schema.$ref)) return null; // circular guard
    const resolved = resolveRef(doc, schema.$ref);
    return sampleFromSchema(resolved, doc, depth, new Set([...seen, schema.$ref]));
  }

  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0]; // JSON-Schema 2020-12 array form
  if (schema.const !== undefined) return schema.const;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  if (Array.isArray(schema.allOf)) {
    const merged: Record<string, any> = {};
    for (const sub of schema.allOf) {
      const v = sampleFromSchema(sub, doc, depth, seen);
      if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(merged, v);
    }
    return merged;
  }

  const variant = schema.oneOf || schema.anyOf;
  if (Array.isArray(variant) && variant.length > 0) {
    return sampleFromSchema(variant[0], doc, depth, seen);
  }

  // type may be an array in 3.1 (e.g. ['string','null']) — use the first non-null.
  let type = schema.type;
  if (Array.isArray(type)) type = type.find((t: string) => t !== 'null') ?? type[0];
  if (!type && schema.properties) type = 'object';

  if (type === 'object' || schema.properties) {
    const obj: Record<string, any> = {};
    const props = schema.properties || {};
    for (const key of Object.keys(props)) {
      obj[key] = sampleFromSchema(props[key], doc, depth + 1, seen);
    }
    if (Object.keys(props).length === 0 && schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      obj.key = sampleFromSchema(schema.additionalProperties, doc, depth + 1, seen);
    }
    return obj;
  }

  if (type === 'array') {
    // 3.1 tuple form: prefixItems is an array of per-position schemas.
    if (Array.isArray(schema.prefixItems)) {
      return schema.prefixItems.map((s: any) => sampleFromSchema(s, doc, depth + 1, seen));
    }
    const item = sampleFromSchema(schema.items, doc, depth + 1, seen);
    return item === null ? [] : [item];
  }

  return primitiveSample(type, schema);
}

function primitiveSample(type: string | undefined, schema: any): any {
  switch (type) {
    case 'integer':
      return schema.minimum ?? 0;
    case 'number':
      return schema.minimum ?? 0;
    case 'boolean':
      return true;
    case 'null':
      return null;
    case 'string': {
      switch (schema.format) {
        case 'date-time': return '2026-01-01T00:00:00Z';
        case 'date': return '2026-01-01';
        case 'time': return '00:00:00Z';
        case 'email': return 'user@example.com';
        case 'uuid': return '00000000-0000-0000-0000-000000000000';
        case 'uri':
        case 'url': return 'https://example.com';
        case 'byte': return 'U3dhZ2dlcg==';
        case 'binary': return '';
        default: return 'string';
      }
    }
    default:
      return null;
  }
}

// ========================================================
// DataWeave skeleton from a sample value (identity-ish mapping)
// ========================================================

export function buildDwScript(sample: any, outputMime: string): string {
  // Multipart writes a `{ parts: { name: { content } } }` shape — the DW way.
  if (outputMime.includes('multipart')) return buildMultipartScript(sample);

  const out = outputMime.includes('xml')
    ? 'application/xml'
    : outputMime.includes('x-www-form-urlencoded')
      ? 'application/x-www-form-urlencoded'
      : 'application/json';
  let body: string;
  if (sample && typeof sample === 'object') {
    body = jsonToDW(sample, 'payload', 0);
  } else {
    body = 'payload';
  }
  return ['%dw 2.0', `output ${out}`, '---', body].join('\n');
}

// multipart/form-data skeleton: map each form field to a part, reading the value
// from the (JSON) input payload. Binary parts get an octet-stream content type.
function buildMultipartScript(sample: any): string {
  const fields = sample && typeof sample === 'object' && !Array.isArray(sample) ? Object.keys(sample) : [];
  const head = ['%dw 2.0', 'output multipart/form-data', '---'];
  if (fields.length === 0) {
    return [...head, '{\n  parts: {\n    // add parts here\n  }\n}'].join('\n');
  }
  const parts = fields.map((k) => {
    const sk = safeKey(k);
    // Empty-string sample values come from `format: binary` file fields.
    const isFile = sample[k] === '';
    const lines = [`    ${sk}: {`];
    if (isFile) lines.push(`      headers: { "Content-Type": "application/octet-stream" },`);
    lines.push(`      content: payload.${sk}`);
    lines.push('    }');
    return lines.join('\n');
  });
  return [...head, `{\n  parts: {\n${parts.join(',\n')}\n  }\n}`].join('\n');
}

function jsonToDW(value: unknown, path: string, depth: number): string {
  const indent = '  '.repeat(depth);
  const inner = '  '.repeat(depth + 1);

  if (value === null) return path;

  if (Array.isArray(value)) {
    if (value.length === 0) return path;
    const first = value[0];
    if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
      const itemVar = singularize(path.split('.').pop()?.replace(/"/g, '') || 'item');
      const fields = Object.keys(first).map((key) => {
        const child = (first as Record<string, unknown>)[key];
        if (typeof child === 'object' && child !== null) {
          return `${inner}  ${safeKey(key)}: ${jsonToDW(child, `${itemVar}.${safeKey(key)}`, depth + 2)}`;
        }
        return `${inner}  ${safeKey(key)}: ${itemVar}.${safeKey(key)}`;
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
      const childPath = `${path}.${safeKey(key)}`;
      const child = obj[key];
      if (typeof child === 'object' && child !== null) {
        return `${inner}${safeKey(key)}: ${jsonToDW(child, childPath, depth + 1)}`;
      }
      return `${inner}${safeKey(key)}: ${childPath}`;
    });
    return `{\n${fields.join(',\n')}\n${indent}}`;
  }

  return path;
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
// Component
// ========================================================

interface OpenApiReaderProps {
  open: boolean;
  onClose: () => void;
  onImport: (result: OpenApiImportResult) => void;
}

interface LibrarySpec {
  id: string;
  name: string;
  server?: string;
  content: string;
}

const LIBRARY_KEY = 'dw.openapiLibrary';

function loadLibrary(): LibrarySpec[] {
  try {
    const v = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function OpenApiReader({ open: isOpen, onClose, onImport }: OpenApiReaderProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [spec, setSpec] = useState<ParsedSpec | null>(null);
  const [view, setView] = useState<'ops' | 'types'>('ops');
  const [selectedOp, setSelectedOp] = useState(0);
  const [selectedSchema, setSelectedSchema] = useState(0);
  const [selectedType, setSelectedType] = useState(0);
  // -1 = synthesize from schema; >=0 = use that named example.
  const [selectedExample, setSelectedExample] = useState(-1);
  // Saved-spec library, persisted to localStorage so it survives sessions and
  // works the same in the desktop app and the VS Code webview.
  const [library, setLibrary] = useState<LibrarySpec[]>(() => loadLibrary());
  const [activeLibId, setActiveLibId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  // Esc returns to the workspace. We deliberately DON'T reset state on close, so
  // switching tools/scripts and reopening lands the user exactly where they were
  // (the page is persistent — App keeps this component mounted).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const persistLibrary = (next: LibrarySpec[]) => {
    setLibrary(next);
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
    } catch {
      toast({ variant: 'error', title: 'Could not save to library', message: 'The spec may be too large for local storage.' });
    }
  };

  // Clear just the current view (not the library) — the "Add" / "New spec" path.
  const newSpec = () => {
    setText('');
    setError('');
    setSpec(null);
    setView('ops');
    setSelectedOp(0);
    setSelectedSchema(0);
    setSelectedType(0);
    setSelectedExample(-1);
    setActiveLibId(null);
  };

  // When a schema slot changes, default to its first example if it has any.
  const pickSchema = (i: number, slots: ApiSchemaRef[] | undefined) => {
    setSelectedSchema(i);
    setSelectedExample(slots && slots[i] && slots[i].examples.length > 0 ? 0 : -1);
  };

  const doParse = (raw: string, libId: string | null = null) => {
    try {
      const parsed = buildSpec(parseSpecText(raw));
      setSpec(parsed);
      setView(parsed.ops.length > 0 ? 'ops' : 'types');
      setSelectedOp(0);
      setSelectedType(0);
      pickSchema(0, parsed.ops[0]?.schemas);
      setActiveLibId(libId);
      setError('');
    } catch (e) {
      setSpec(null);
      setError(e instanceof Error ? e.message : 'Failed to parse spec');
    }
  };

  const openFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'OpenAPI / Swagger', extensions: ['json', 'yaml', 'yml'] }],
      });
      if (!selected) return;
      const fp = typeof selected === 'string' ? selected : selected[0];
      const content = await invoke<string>('read_text_file', { path: fp });
      setText(content);
      doParse(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open file');
    }
  };

  const saveToLibrary = () => {
    if (!spec || !text.trim()) return;
    const existing = library.find((l) => l.content === text);
    if (existing) { setActiveLibId(existing.id); return; }
    const name = `${spec.title}${spec.version ? ` · v${spec.version}` : ''}`;
    const item: LibrarySpec = { id: Date.now().toString(36), name, server: spec.servers[0], content: text };
    persistLibrary([item, ...library]);
    setActiveLibId(item.id);
    toast({ variant: 'success', title: 'Saved to library', message: name });
  };

  const loadFromLibrary = (item: LibrarySpec) => {
    setText(item.content);
    doParse(item.content, item.id);
  };

  const deleteFromLibrary = (id: string) => {
    persistLibrary(library.filter((l) => l.id !== id));
    if (activeLibId === id) setActiveLibId(null);
  };

  const startRename = (item: LibrarySpec) => { setEditingId(item.id); setDraftName(item.name); };
  const commitRename = () => {
    if (!editingId) return;
    const name = draftName.trim();
    if (name) persistLibrary(library.map((l) => (l.id === editingId ? { ...l, name } : l)));
    setEditingId(null);
  };

  // Keep the doc around so sample generation can resolve $refs.
  const doc = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return parseSpecText(text);
    } catch {
      return null;
    }
  }, [text]);

  const op = spec?.ops[selectedOp];
  const activeSchema = view === 'ops' ? op?.schemas[selectedSchema] : undefined;
  // How many content types share a slot label — drives whether a chip needs its
  // media type appended (e.g. two "Request" chips: JSON vs multipart).
  const schemaLabelCounts: Record<string, number> = {};
  op?.schemas.forEach((s) => { schemaLabelCounts[s.label] = (schemaLabelCounts[s.label] || 0) + 1; });
  const activeType = view === 'types' ? spec?.schemas[selectedType] : undefined;

  const generated = useMemo(() => {
    let sample: any;
    let mime = 'application/json';
    if (view === 'ops' && activeSchema) {
      mime = activeSchema.mime;
      if (selectedExample >= 0 && activeSchema.examples[selectedExample]) {
        sample = activeSchema.examples[selectedExample].value;
      } else if (activeSchema.schema && doc) {
        sample = sampleFromSchema(activeSchema.schema, doc, 0, new Set());
      } else if (activeSchema.examples[0]) {
        sample = activeSchema.examples[0].value;
      }
    } else if (view === 'types' && activeType && doc) {
      sample = sampleFromSchema(activeType.schema, doc, 0, new Set());
    } else {
      return null;
    }
    return { payload: JSON.stringify(sample ?? {}, null, 2), script: buildDwScript(sample, mime), mime };
  }, [view, activeSchema, activeType, selectedExample, doc]);

  if (!isOpen) return null;

  const mimeFor = (raw?: string): MimeType => (raw?.includes('xml') ? 'application/xml' : 'application/json');

  const doImport = () => {
    if (!generated) return;
    onImport({
      payload: generated.payload,
      payloadMimeType: mimeFor(generated.mime),
      generatedScript: generated.script,
    });
    onClose();
  };

  const activeExampleDesc =
    view === 'ops' && activeSchema && selectedExample >= 0 ? activeSchema.examples[selectedExample]?.description : undefined;

  const alreadySaved = !!spec && library.some((l) => l.content === text);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-bg">
      {/* Header — Back (left) returns to the workspace; the window controls
          (right) are the OS chrome, since this full page covers the title bar. */}
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-3 pl-4 pr-3 bg-surface border-b border-line">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
          title="Back to workspace (Esc)"
        >
          <Icons.ChevronRight size={12} className="rotate-180" />
          Back
        </button>
        <div className="w-px h-4 bg-line" />
        <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}>
          <Icons.ApiSpec size={14} />
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[13px] font-semibold text-content tracking-tight">OpenAPI / Swagger reader</span>
          <span className="text-[10.5px] text-content-faint font-mono truncate">
            {spec
              ? `${spec.title} · ${spec.specKind}${spec.version ? ` v${spec.version}` : ''} · ${spec.ops.length} ops · ${spec.schemas.length} types`
              : 'Read a spec → sample payload + DataWeave skeleton'}
          </span>
        </div>
        <span className="flex-1" />
        {spec && (
          <button
            onClick={saveToLibrary}
            disabled={alreadySaved}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-medium cursor-pointer border border-line text-content-secondary hover:bg-surface-2 disabled:opacity-50 disabled:cursor-default transition-colors"
            title={alreadySaved ? 'Already in your library' : 'Save this spec to your library'}
          >
            <Icons.Save size={12} /> {alreadySaved ? 'In library' : 'Save to library'}
          </button>
        )}
        <WindowControls />
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Library sidebar — saved specs, click to reopen */}
        <aside className="w-[240px] shrink-0 border-r border-line flex flex-col bg-surface-panel">
          <div className="h-9 shrink-0 flex items-center gap-2 px-3 border-b border-line-subtle">
            <Icons.Library size={12} className="text-content-faint" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-content-faint flex-1">Library</span>
            <button
              onClick={newSpec}
              className="inline-flex items-center gap-1 h-6 px-1.5 rounded text-[11px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer"
              title="Add a spec (paste or open a file)"
            >
              <Icons.Plus size={12} /> Add
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {library.length === 0 ? (
              <div className="px-3 py-4 text-[11.5px] leading-relaxed text-content-faint">
                No saved specs yet. Parse a spec and hit <span className="text-content-secondary font-medium">Save to library</span> — it’ll show up here to reopen anytime.
              </div>
            ) : (
              library.map((item) => (
                <div
                  key={item.id}
                  onClick={() => { if (editingId !== item.id) loadFromLibrary(item); }}
                  className="group w-full px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-colors"
                  style={{ background: item.id === activeLibId ? 'var(--surface-2)' : 'transparent' }}
                >
                  <div className="flex-1 min-w-0">
                    {editingId === item.id ? (
                      <input
                        value={draftName}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                          else if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                        }}
                        className="w-full bg-surface border border-accent-border rounded px-1.5 py-0.5 text-[12px] text-content outline-none"
                      />
                    ) : (
                      <>
                        <div className="text-[12px] truncate" style={{ color: item.id === activeLibId ? 'var(--content)' : 'var(--content-secondary)' }}>{item.name}</div>
                        {item.server && <div className="text-[10px] font-mono truncate text-content-ghost">{item.server}</div>}
                      </>
                    )}
                  </div>
                  {editingId !== item.id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); startRename(item); }}
                        className="text-content-ghost hover:text-content cursor-pointer"
                        title="Rename"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteFromLibrary(item.id); }}
                        className="text-content-ghost hover:text-err cursor-pointer"
                        title="Remove from library"
                      >
                        <Icons.Trash size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Reader */}
        {!spec ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <PasteStage
              text={text}
              error={error}
              onChange={(v) => { setText(v); setError(''); }}
              onParse={() => doParse(text)}
              onOpenFile={openFile}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: '260px 1fr' }}>
            {/* operations / types */}
            <div className="flex flex-col min-h-0" style={{ borderRight: '1px solid var(--line-subtle)' }}>
              <div className="flex gap-1 p-2 shrink-0" style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                <ToggleBtn active={view === 'ops'} disabled={spec.ops.length === 0} onClick={() => setView('ops')}>
                  Operations {spec.ops.length > 0 && <Count>{spec.ops.length}</Count>}
                </ToggleBtn>
                <ToggleBtn active={view === 'types'} disabled={spec.schemas.length === 0} onClick={() => setView('types')}>
                  Types {spec.schemas.length > 0 && <Count>{spec.schemas.length}</Count>}
                </ToggleBtn>
              </div>
              <div className="overflow-y-auto flex-1">
                {view === 'ops' ? (
                  <OperationList
                    ops={spec.ops}
                    selected={selectedOp}
                    onSelect={(i) => { setSelectedOp(i); pickSchema(0, spec.ops[i]?.schemas); }}
                  />
                ) : (
                  <SchemaList schemas={spec.schemas} selected={selectedType} onSelect={setSelectedType} />
                )}
              </div>
            </div>

            {/* detail */}
            <div className="overflow-y-auto p-4 flex flex-col gap-3.5">
              {view === 'ops' && op && (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <MethodPill method={op.method} />
                    <span className="text-[12.5px] font-mono truncate" style={{ color: 'var(--content)' }}>{op.path}</span>
                    {op.deprecated && (
                      <span className="text-[9.5px] font-bold uppercase px-1.5 py-px rounded" style={{ background: 'color-mix(in oklch, var(--err) 14%, transparent)', color: 'var(--err)' }}>deprecated</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-wrap text-[11.5px]" style={{ color: 'var(--content-muted)' }}>
                    <span className="inline-flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      {describeSecurity(op.security, spec.securitySchemes)}
                    </span>
                    {op.operationId && <span className="font-mono" style={{ color: 'var(--content-faint)' }}>{op.operationId}</span>}
                  </div>

                  {(op.summary || op.description) && (
                    <div className="text-[12px] whitespace-pre-wrap" style={{ color: 'var(--content-muted)' }}>
                      {op.summary && <div className="font-medium" style={{ color: 'var(--content-secondary)' }}>{op.summary}</div>}
                      {op.description && op.description !== op.summary && <div className="mt-0.5">{op.description}</div>}
                    </div>
                  )}

                  {op.params.length > 0 && (
                    <div>
                      <SectionLabel>Parameters</SectionLabel>
                      <div className="flex flex-col gap-px">
                        {op.params.map((p, i) => (
                          <div key={i} className="flex gap-2 text-[11.5px] font-mono items-baseline" title={p.description}>
                            <span style={{ color: 'var(--violet)' }}>{p.name}</span>
                            <span className="px-1 rounded text-[9.5px] uppercase" style={{ background: 'var(--surface-3)', color: 'var(--content-muted)' }}>{p.in}</span>
                            {p.type && <span style={{ color: 'var(--cyan)' }}>{p.type}</span>}
                            {p.required && <span style={{ color: 'var(--content-faint)' }}>· required</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {op.schemas.length > 0 ? (
                    <>
                      <div>
                        <SectionLabel>Schema</SectionLabel>
                        <div className="flex flex-wrap gap-1.5">
                          {op.schemas.map((s, i) => (
                            <Chip key={i} active={i === selectedSchema} onClick={() => pickSchema(i, op.schemas)} title={`${s.mime}${s.description ? ` — ${s.description}` : ''}`}>
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: schemaColor(s.label) }} />
                              {s.label === 'Request' ? 'Request' : `Response ${s.label}`}
                              {schemaLabelCounts[s.label] > 1 && <span style={{ opacity: 0.7 }}>· {shortMime(s.mime)}</span>}
                              {s.examples.length > 0 && <Count>{s.examples.length === 1 ? 'ex' : `${s.examples.length} ex`}</Count>}
                            </Chip>
                          ))}
                        </div>
                        {activeSchema && (
                          <div className="text-[11px] font-mono mt-1.5" style={{ color: 'var(--content-faint)' }}>
                            Content type: <span style={{ color: 'var(--cyan)' }}>{activeSchema.mime}</span>
                            {activeSchema.mime.includes('multipart') && <span style={{ color: 'var(--content-ghost)' }}> · file upload — sample is the JSON input, the skeleton outputs multipart/form-data</span>}
                          </div>
                        )}
                      </div>

                      {/* Example picker — only when the slot has named examples */}
                      {activeSchema && activeSchema.examples.length > 0 && (
                        <div>
                          <SectionLabel>Example</SectionLabel>
                          <div className="flex flex-wrap gap-1.5">
                            {activeSchema.examples.map((ex, i) => (
                              <Chip key={i} active={i === selectedExample} onClick={() => setSelectedExample(i)} title={ex.summary || ex.description}>
                                {ex.name}
                              </Chip>
                            ))}
                            {activeSchema.schema && (
                              <Chip active={selectedExample === -1} onClick={() => setSelectedExample(-1)} title="Synthesize from the schema instead">
                                From schema
                              </Chip>
                            )}
                          </div>
                          {activeExampleDesc && (
                            <div className="text-[11px] mt-1.5 whitespace-pre-wrap" style={{ color: 'var(--content-faint)' }}>{activeExampleDesc}</div>
                          )}
                        </div>
                      )}

                      <SamplePanels generated={generated} fromExample={selectedExample >= 0} />
                    </>
                  ) : (
                    <div className="text-[12px] mt-2" style={{ color: 'var(--content-faint)' }}>
                      This operation has no request or response body schema.
                    </div>
                  )}
                </>
              )}

              {view === 'types' && activeType && (
                <>
                  <div className="text-[13px] font-semibold font-mono" style={{ color: 'var(--content)' }}>{activeType.name}</div>
                  <SamplePanels generated={generated} fromExample={false} />
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {spec && (
        <div
          className="px-4 py-3 flex items-center gap-2 shrink-0"
          style={{ borderTop: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}
        >
          <span className="text-[11.5px]" style={{ color: 'var(--content-faint)' }}>
            {generated ? 'Sends the sample payload + DataWeave skeleton to the workspace' : 'Pick something with a schema or example'}
          </span>
          <span className="flex-1" />
          <button
            onClick={doImport}
            disabled={!generated}
            className="h-7 px-3 rounded-md text-[12px] font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            Use payload + script
          </button>
        </div>
      )}
    </div>
  );
}

// ---- sub-views ----

function SamplePanels({ generated, fromExample }: { generated: { payload: string; script: string } | null; fromExample: boolean }) {
  if (!generated) return null;
  return (
    <>
      <div>
        <SectionLabel>{fromExample ? 'Sample payload · from spec example' : 'Sample payload'}</SectionLabel>
        <CodeBlock>{generated.payload}</CodeBlock>
      </div>
      <div>
        <SectionLabel>DataWeave skeleton</SectionLabel>
        <CodeBlock>{generated.script}</CodeBlock>
      </div>
    </>
  );
}

function PasteStage({
  text, error, onChange, onParse, onOpenFile,
}: {
  text: string;
  error: string;
  onChange: (v: string) => void;
  onParse: () => void;
  onOpenFile: () => void;
}) {
  return (
    <div className="p-4 flex flex-col gap-3">
      <div
        className="text-[10.5px] font-semibold uppercase tracking-[0.4px] flex items-center gap-2"
        style={{ color: 'var(--content-faint)' }}
      >
        <span className="flex-1">Spec (JSON or YAML)</span>
        <button
          onClick={onOpenFile}
          className="text-[11px] font-medium normal-case tracking-normal cursor-pointer inline-flex items-center gap-1"
          style={{ color: 'var(--accent)' }}
        >
          Open file…
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={'openapi: 3.0.0\ninfo:\n  title: Pet Store\npaths:\n  /pets:\n    get:\n      responses:\n        \'200\': { ... }'}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="w-full rounded-md px-3 py-2.5 text-[11.5px] font-mono leading-[1.55] resize-none outline-none"
        style={{
          background: 'var(--surface-2)',
          border: `1px solid ${error ? 'var(--err)' : 'var(--line)'}`,
          color: 'var(--content-secondary)',
          height: 340,
        }}
        autoFocus
      />
      {error && <div className="text-[11px]" style={{ color: 'var(--err)' }}>{error}</div>}
      <div className="flex items-center gap-2">
        <span className="text-[11.5px]" style={{ color: 'var(--content-faint)' }}>
          OpenAPI 3.x or Swagger 2.0 · nothing leaves your machine
        </span>
        <span className="flex-1" />
        <button
          onClick={onParse}
          disabled={!text.trim()}
          className="h-7 px-3 rounded-md text-[12px] font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          Parse
        </button>
      </div>
    </div>
  );
}

function OperationList({ ops, selected, onSelect }: { ops: ApiOp[]; selected: number; onSelect: (i: number) => void }) {
  // Group by tag, preserving first-seen order.
  const groups: { tag: string; items: { op: ApiOp; idx: number }[] }[] = [];
  ops.forEach((op, idx) => {
    let g = groups.find((x) => x.tag === op.tag);
    if (!g) { g = { tag: op.tag, items: [] }; groups.push(g); }
    g.items.push({ op, idx });
  });

  return (
    <div className="py-1">
      {groups.map((g) => (
        <div key={g.tag}>
          <div
            className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.4px]"
            style={{ color: 'var(--content-faint)' }}
          >
            {g.tag}
          </div>
          {g.items.map(({ op, idx }) => (
            <button
              key={idx}
              onClick={() => onSelect(idx)}
              title={op.summary || op.path}
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-colors"
              style={{ background: idx === selected ? 'var(--surface-2)' : 'transparent' }}
            >
              <MethodPill method={op.method} small />
              <span
                className="text-[11.5px] font-mono truncate"
                style={{ color: idx === selected ? 'var(--content)' : 'var(--content-secondary)', textDecoration: op.deprecated ? 'line-through' : undefined }}
              >
                {op.path}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function SchemaList({ schemas, selected, onSelect }: { schemas: NamedSchema[]; selected: number; onSelect: (i: number) => void }) {
  return (
    <div className="py-1">
      {schemas.map((s, idx) => (
        <button
          key={s.name}
          onClick={() => onSelect(idx)}
          className="w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-colors"
          style={{ background: idx === selected ? 'var(--surface-2)' : 'transparent' }}
        >
          <span className="text-[11.5px] font-mono truncate" style={{ color: idx === selected ? 'var(--content)' : 'var(--content-secondary)' }}>
            {s.name}
          </span>
        </button>
      ))}
    </div>
  );
}

// Conventional Swagger method colours — fixed (not theme-derived) so POST never
// reads like GET, and they stay recognizable on any adopted VS Code theme.
const METHOD_COLORS: Record<string, string> = {
  GET: '#61affe',     // blue
  POST: '#49cc90',    // green
  PUT: '#fca130',     // orange
  PATCH: '#50e3c2',   // teal
  DELETE: '#f93e3e',  // red
  HEAD: '#9012fe',    // purple
  OPTIONS: '#0d5aa7', // deep blue
  TRACE: '#8a8a8a',   // grey
};

// Request vs response-by-status-class — the dot beside each schema chip.
function schemaColor(label: string): string {
  if (label === 'Request') return '#a855f7'; // violet — input
  const code = parseInt(label, 10);
  if (code >= 200 && code < 300) return '#49cc90'; // green — success
  if (code >= 300 && code < 400) return '#61affe'; // blue — redirect
  if (code >= 400 && code < 500) return '#fca130'; // orange — client error
  if (code >= 500) return '#f93e3e';               // red — server error
  return '#8a8a8a';                                // default / unknown
}

function MethodPill({ method, small }: { method: string; small?: boolean }) {
  const color = METHOD_COLORS[method] || 'var(--content-muted)';
  return (
    <span
      className={`font-mono font-bold rounded shrink-0 ${small ? 'text-[8.5px] px-1 py-px w-[42px] text-center' : 'text-[10.5px] px-2 py-[3px]'}`}
      style={{ color, background: `color-mix(in oklch, ${color} 14%, transparent)`, border: `1px solid color-mix(in oklch, ${color} 35%, transparent)` }}
    >
      {method}
    </span>
  );
}

function Chip({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="h-6 px-2.5 rounded-md text-[11px] font-medium cursor-pointer transition-colors inline-flex items-center gap-1.5"
      style={{
        background: active ? 'var(--accent-dim)' : 'var(--surface-2)',
        border: `1px solid ${active ? 'var(--accent-border)' : 'var(--line)'}`,
        color: active ? 'var(--accent)' : 'var(--content-secondary)',
      }}
    >
      {children}
    </button>
  );
}

function ToggleBtn({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 h-7 rounded-md text-[11.5px] font-medium cursor-pointer inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: active ? 'var(--surface-3)' : 'transparent',
        color: active ? 'var(--content)' : 'var(--content-faint)',
      }}
    >
      {children}
    </button>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9.5px] font-semibold px-1.5 py-px rounded" style={{ background: 'var(--surface)', color: 'var(--content-muted)' }}>
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-semibold uppercase tracking-[0.4px] mb-1.5" style={{ color: 'var(--content-faint)' }}>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative group">
      <button
        onClick={async () => { try { await navigator.clipboard.writeText(children); } catch { /* ignore */ } }}
        className="absolute top-1.5 right-1.5 h-5 px-1.5 rounded text-[10px] font-medium cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'var(--surface-3)', color: 'var(--content-muted)', border: '1px solid var(--line)' }}
      >
        Copy
      </button>
      <pre
        className="rounded-md py-2.5 px-3 text-[11.5px] font-mono overflow-x-auto m-0 select-text"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--content)', maxHeight: 240 }}
      >
        {children}
      </pre>
    </div>
  );
}
