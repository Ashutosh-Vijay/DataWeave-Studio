import type * as Monaco from 'monaco-editor';
import yaml from 'js-yaml';
import { buildCompletionDoc, registerDWHoverProvider } from './dataweaveHover';
import { getDwFunctions } from './dataweaveDocsLazy';

export interface DWCompletionContext {
  payload: string;
  payloadMimeType: string;
  vars: { key: string; value: string; valueType: string }[];
  headers: { key: string; value: string }[];
  queryParams: { key: string; value: string }[];
  namedInputs?: { name: string; content: string; mimeType: string }[];
  configYaml?: string;
  secureConfigYaml?: string;
}

interface DWCompletion {
  label: string;
  kind: 'keyword' | 'function' | 'variable' | 'snippet' | 'type' | 'module' | 'constant';
  detail?: string;
  documentation?: string;
  insertText?: string; // if different from label
  isSnippet?: boolean; // uses snippet syntax ($1, $2, etc.)
}

const COMPLETIONS: DWCompletion[] = [
  // === Header / structure ===
  { label: '%dw 2.0', kind: 'snippet', detail: 'DataWeave version header', insertText: '%dw 2.0', isSnippet: false },
  { label: 'output', kind: 'keyword', detail: 'Output directive', insertText: 'output ${1:application/json}', isSnippet: true },
  { label: 'input', kind: 'keyword', detail: 'Input directive', insertText: 'input ${1:payload} ${2:application/json}', isSnippet: true },
  { label: '---', kind: 'keyword', detail: 'Header/body separator' },

  // === MIME types (after output/input) ===
  { label: 'application/json', kind: 'constant', detail: 'JSON MIME type' },
  { label: 'application/xml', kind: 'constant', detail: 'XML MIME type' },
  { label: 'application/csv', kind: 'constant', detail: 'CSV MIME type' },
  { label: 'application/java', kind: 'constant', detail: 'Java object MIME type' },
  { label: 'text/plain', kind: 'constant', detail: 'Plain text MIME type' },
  { label: 'application/dw', kind: 'constant', detail: 'DataWeave MIME type' },
  { label: 'multipart/form-data', kind: 'constant', detail: 'Multipart MIME type' },
  { label: 'application/x-www-form-urlencoded', kind: 'constant', detail: 'URL-encoded form MIME type' },
  { label: 'application/yaml', kind: 'constant', detail: 'YAML MIME type' },
  { label: 'application/x-ndjson', kind: 'constant', detail: 'Newline-delimited JSON MIME type' },
  { label: 'text/x-java-properties', kind: 'constant', detail: 'Java properties MIME type' },
  { label: 'application/xlsx', kind: 'constant', detail: 'Excel (xlsx) MIME type' },
  { label: 'application/avro', kind: 'constant', detail: 'Avro MIME type' },
  { label: 'application/protobuf', kind: 'constant', detail: 'Protobuf MIME type' },
  { label: 'application/flatfile', kind: 'constant', detail: 'Flat file / COBOL copybook / fixed-width MIME type' },
  { label: 'application/octet-stream', kind: 'constant', detail: 'Binary MIME type' },

  // === Context variables ===
  { label: 'payload', kind: 'variable', detail: 'Input payload', documentation: 'The main input data of the current message' },
  { label: 'attributes', kind: 'variable', detail: 'Message attributes', documentation: 'Contains method, headers, queryParams, etc.' },
  { label: 'attributes.method', kind: 'variable', detail: 'HTTP method', documentation: 'GET, POST, PUT, DELETE, PATCH' },
  { label: 'attributes.headers', kind: 'variable', detail: 'HTTP headers', documentation: 'Map of request headers' },
  { label: 'attributes.queryParams', kind: 'variable', detail: 'Query parameters', documentation: 'Map of URL query parameters' },
  { label: 'attributes.requestUri', kind: 'variable', detail: 'Request URI path' },
  { label: 'attributes.statusCode', kind: 'variable', detail: 'HTTP status code' },
  { label: 'vars', kind: 'variable', detail: 'Flow variables', documentation: 'Access flow variables as vars.name' },

  // === Language keywords ===
  { label: 'if', kind: 'keyword', detail: 'Conditional', insertText: 'if (${1:condition}) ${2:then} else ${3:otherwise}', isSnippet: true },
  { label: 'else', kind: 'keyword' },
  { label: 'var', kind: 'keyword', detail: 'Variable declaration', insertText: 'var ${1:name} = ${2:value}', isSnippet: true },
  { label: 'fun', kind: 'keyword', detail: 'Function declaration', insertText: 'fun ${1:name}(${2:params}) = ${3:body}', isSnippet: true },
  { label: 'type', kind: 'keyword', detail: 'Type declaration', insertText: 'type ${1:Name} = ${2:Type}', isSnippet: true },
  { label: 'ns', kind: 'keyword', detail: 'Namespace declaration', insertText: 'ns ${1:prefix} ${2:uri}', isSnippet: true },
  { label: 'import', kind: 'keyword', detail: 'Import module', insertText: 'import ${1:module} from ${2:dw::core::Strings}', isSnippet: true },
  { label: 'as', kind: 'keyword', detail: 'Type coercion' },
  { label: 'using', kind: 'keyword', detail: 'Local variable binding' },
  { label: 'default', kind: 'keyword', detail: 'Default value operator' },
  { label: 'do', kind: 'keyword', detail: 'Do block', insertText: 'do {\n\t${1}\n}', isSnippet: true },
  { label: 'match', kind: 'keyword', detail: 'Pattern matching', insertText: '${1:value} match {\n\tcase ${2:pattern} -> ${3:result}\n\telse -> ${4:default}\n}', isSnippet: true },
  { label: 'case', kind: 'keyword' },
  { label: 'when', kind: 'keyword', detail: 'Conditional suffix' },
  { label: 'unless', kind: 'keyword', detail: 'Negative conditional suffix' },
  { label: 'otherwise', kind: 'keyword', detail: 'Default in match/when' },
  { label: 'and', kind: 'keyword', detail: 'Logical AND' },
  { label: 'or', kind: 'keyword', detail: 'Logical OR' },
  { label: 'not', kind: 'keyword', detail: 'Logical NOT' },
  { label: 'is', kind: 'keyword', detail: 'Type check operator' },
  { label: 'null', kind: 'constant', detail: 'Null value' },
  { label: 'true', kind: 'constant', detail: 'Boolean true' },
  { label: 'false', kind: 'constant', detail: 'Boolean false' },

  // === Core array/object functions ===
  { label: 'map', kind: 'function', detail: '(arr, (item, idx) -> T) -> Array<T>', documentation: 'Iterates over each item in an array, applying a transformation', insertText: 'map (${1:item}, ${2:index}) -> ${3:item}', isSnippet: true },
  { label: 'mapObject', kind: 'function', detail: '(obj, (val, key, idx) -> Object) -> Object', documentation: 'Iterates over each key-value pair in an object', insertText: 'mapObject (${1:value}, ${2:key}) -> {\n\t(${2:key}): ${3:value}\n}', isSnippet: true },
  { label: 'pluck', kind: 'function', detail: '(obj, (val, key, idx) -> T) -> Array<T>', documentation: 'Iterates over an object and returns an array', insertText: 'pluck (${1:value}, ${2:key}) -> ${3:value}', isSnippet: true },
  { label: 'filter', kind: 'function', detail: '(arr, (item, idx) -> Boolean) -> Array', documentation: 'Returns items that match the condition', insertText: 'filter (${1:item}) -> ${2:condition}', isSnippet: true },
  { label: 'filterObject', kind: 'function', detail: '(obj, (val, key, idx) -> Boolean) -> Object', documentation: 'Returns key-value pairs that match the condition', insertText: 'filterObject (${1:value}, ${2:key}) -> ${3:condition}', isSnippet: true },
  { label: 'reduce', kind: 'function', detail: '(arr, (item, acc) -> T) -> T', documentation: 'Reduces an array to a single value', insertText: 'reduce (${1:item}, ${2:acc} = ${3:initial}) -> ${4:acc + item}', isSnippet: true },
  { label: 'groupBy', kind: 'function', detail: '(arr, (item) -> Key) -> Object', documentation: 'Groups array items by a key', insertText: 'groupBy (${1:item}) -> ${2:item.key}', isSnippet: true },
  { label: 'orderBy', kind: 'function', detail: '(arr, (item) -> Comparable) -> Array', documentation: 'Sorts array items', insertText: 'orderBy (${1:item}) -> ${2:item.key}', isSnippet: true },
  { label: 'distinctBy', kind: 'function', detail: '(arr, (item) -> Key) -> Array', documentation: 'Removes duplicate items', insertText: 'distinctBy (${1:item}) -> ${2:item.key}', isSnippet: true },
  { label: 'flatMap', kind: 'function', detail: '(arr, (item) -> Array) -> Array', documentation: 'Maps then flattens one level', insertText: 'flatMap (${1:item}) -> ${2:item}', isSnippet: true },
  { label: 'flatten', kind: 'function', detail: '(Array<Array>) -> Array', documentation: 'Flattens nested arrays by one level', insertText: 'flatten', isSnippet: false },

  // === String functions (dw::core::Strings) ===
  { label: 'upper', kind: 'function', detail: '(String) -> String', documentation: 'Converts to uppercase' },
  { label: 'lower', kind: 'function', detail: '(String) -> String', documentation: 'Converts to lowercase' },
  { label: 'trim', kind: 'function', detail: '(String) -> String', documentation: 'Removes leading and trailing whitespace' },
  { label: 'capitalize', kind: 'function', detail: '(String) -> String', documentation: 'Capitalizes first letter of each word' },
  { label: 'camelize', kind: 'function', detail: '(String) -> String', documentation: 'Converts to camelCase' },
  { label: 'dasherize', kind: 'function', detail: '(String) -> String', documentation: 'Converts to dash-case' },
  { label: 'underscore', kind: 'function', detail: '(String) -> String', documentation: 'Converts to snake_case' },
  { label: 'contains', kind: 'function', detail: '(String, String) -> Boolean', documentation: 'Checks if a string contains another' },
  { label: 'startsWith', kind: 'function', detail: '(String, String) -> Boolean', documentation: 'Checks if string starts with prefix' },
  { label: 'endsWith', kind: 'function', detail: '(String, String) -> Boolean', documentation: 'Checks if string ends with suffix' },
  { label: 'replace', kind: 'function', detail: '(String, Regex, String) -> String', documentation: 'Replaces matches with replacement' },
  { label: 'splitBy', kind: 'function', detail: '(String, String|Regex) -> Array<String>', documentation: 'Splits a string by separator', insertText: 'splitBy "${1:,}"', isSnippet: true },
  { label: 'joinBy', kind: 'function', detail: '(Array, String) -> String', documentation: 'Joins array elements with separator', insertText: 'joinBy "${1:,}"', isSnippet: true },
  { label: 'substringAfter', kind: 'function', detail: '(String, String) -> String', documentation: 'Returns substring after first occurrence' },
  { label: 'substringBefore', kind: 'function', detail: '(String, String) -> String', documentation: 'Returns substring before first occurrence' },
  { label: 'substringAfterLast', kind: 'function', detail: '(String, String) -> String', documentation: 'Returns substring after last occurrence' },
  { label: 'substringBeforeLast', kind: 'function', detail: '(String, String) -> String', documentation: 'Returns substring before last occurrence' },

  // === Number functions ===
  { label: 'round', kind: 'function', detail: '(Number) -> Number', documentation: 'Rounds to nearest integer' },
  { label: 'ceil', kind: 'function', detail: '(Number) -> Number', documentation: 'Rounds up to nearest integer' },
  { label: 'floor', kind: 'function', detail: '(Number) -> Number', documentation: 'Rounds down to nearest integer' },
  { label: 'abs', kind: 'function', detail: '(Number) -> Number', documentation: 'Absolute value' },
  { label: 'sqrt', kind: 'function', detail: '(Number) -> Number', documentation: 'Square root' },
  { label: 'mod', kind: 'function', detail: '(Number, Number) -> Number', documentation: 'Modulo operation' },
  { label: 'pow', kind: 'function', detail: '(Number, Number) -> Number', documentation: 'Power/exponentiation' },
  { label: 'random', kind: 'function', detail: '() -> Number', documentation: 'Random number between 0 and 1', insertText: 'random()' },

  // === Type checking / coercion ===
  { label: 'isEmpty', kind: 'function', detail: '(Any) -> Boolean', documentation: 'Checks if value is null, empty string, or empty array/object' },
  { label: 'sizeOf', kind: 'function', detail: '(Array|Object|String) -> Number', documentation: 'Returns the size/length' },
  { label: 'typeOf', kind: 'function', detail: '(Any) -> Type', documentation: 'Returns the runtime type' },
  { label: 'log', kind: 'function', detail: '(Any) -> Any', documentation: 'Logs the value and returns it (debugging)' },
  { label: 'read', kind: 'function', detail: '(String, String) -> Any', documentation: 'Parses a string as given MIME type', insertText: 'read(${1:value}, "${2:application/json}")', isSnippet: true },
  { label: 'write', kind: 'function', detail: '(Any, String) -> String', documentation: 'Serializes a value as given MIME type', insertText: 'write(${1:value}, "${2:application/json}")', isSnippet: true },
  { label: 'uuid', kind: 'function', detail: '() -> String', documentation: 'Generates a random UUID', insertText: 'uuid()' },
  { label: 'now', kind: 'function', detail: '() -> DateTime', documentation: 'Current date and time', insertText: 'now()' },

  // === Object utility ===
  { label: 'keysOf', kind: 'function', detail: '(Object) -> Array<Key>', documentation: 'Returns all keys of an object' },
  { label: 'valuesOf', kind: 'function', detail: '(Object) -> Array<Any>', documentation: 'Returns all values of an object' },
  { label: 'entriesOf', kind: 'function', detail: '(Object) -> Array<{key, value, attr}>', documentation: 'Returns entries with key, value, and attributes' },

  // === Type keywords ===
  { label: 'String', kind: 'type', detail: 'String type' },
  { label: 'Number', kind: 'type', detail: 'Number type' },
  { label: 'Boolean', kind: 'type', detail: 'Boolean type' },
  { label: 'Object', kind: 'type', detail: 'Object type' },
  { label: 'Array', kind: 'type', detail: 'Array type' },
  { label: 'Date', kind: 'type', detail: 'Date type (date only)' },
  { label: 'DateTime', kind: 'type', detail: 'DateTime type (date + time + timezone)' },
  { label: 'LocalDateTime', kind: 'type', detail: 'LocalDateTime (no timezone)' },
  { label: 'Time', kind: 'type', detail: 'Time type' },
  { label: 'LocalTime', kind: 'type', detail: 'LocalTime (no timezone)' },
  { label: 'Regex', kind: 'type', detail: 'Regular expression type' },
  { label: 'Binary', kind: 'type', detail: 'Binary data type' },
  { label: 'Any', kind: 'type', detail: 'Any type (wildcard)' },
  { label: 'Nothing', kind: 'type', detail: 'Nothing type (bottom type)' },
  { label: 'Null', kind: 'type', detail: 'Null type' },

  // === Common module imports ===
  { label: 'dw::core::Strings', kind: 'module', detail: 'String utility functions' },
  { label: 'dw::core::Arrays', kind: 'module', detail: 'Array utility functions' },
  { label: 'dw::core::Objects', kind: 'module', detail: 'Object utility functions' },
  { label: 'dw::core::Numbers', kind: 'module', detail: 'Number utility functions' },
  { label: 'dw::core::Binaries', kind: 'module', detail: 'Binary utility functions' },
  { label: 'dw::core::Periods', kind: 'module', detail: 'Period utility functions' },
  { label: 'dw::core::URL', kind: 'module', detail: 'URL encoding/decoding utilities' },
  { label: 'dw::Crypto', kind: 'module', detail: 'Hashing and encryption functions' },
  { label: 'dw::Runtime', kind: 'module', detail: 'Runtime utility functions (fail, wait, etc.)' },

  // === Useful snippets ===
  {
    label: 'dwscript',
    kind: 'snippet',
    detail: 'Full DW script template',
    insertText: '%dw 2.0\noutput ${1:application/json}\n---\n${2:payload}',
    isSnippet: true,
  },
  {
    label: 'maptemplate',
    kind: 'snippet',
    detail: 'Map with transformation',
    insertText: 'payload map (${1:item}, ${2:index}) -> {\n\t${3:key}: ${1:item}.${4:field}\n}',
    isSnippet: true,
  },
  {
    label: 'ifelse',
    kind: 'snippet',
    detail: 'If/else expression',
    insertText: 'if (${1:condition})\n\t${2:thenValue}\nelse\n\t${3:elseValue}',
    isSnippet: true,
  },
];

// Set of function names already defined in COMPLETIONS (hand-tuned snippets)
const STATIC_FN_NAMES = new Set(
  COMPLETIONS.filter((c) => c.kind === 'function').map((c) => c.label.toLowerCase())
);

/**
 * Parse a DW function signature to extract parameter names.
 * e.g. "upper(text: String): String" → ["text"]
 *      "uuid(): String" → []
 *      "map<T,R>(items: Array<T>, mapper: (T,Number) -> R): Array<R>" → ["items", "mapper"]
 */
function parseSignatureParams(sig: string): string[] {
  let i = 0;
  // Skip function name
  while (i < sig.length && sig[i] !== '(' && sig[i] !== '<') i++;
  // Skip generics <...>
  if (i < sig.length && sig[i] === '<') {
    let depth = 1;
    i++;
    while (i < sig.length && depth > 0) {
      if (sig[i] === '<') depth++;
      if (sig[i] === '>') depth--;
      i++;
    }
  }
  if (i >= sig.length || sig[i] !== '(') return [];
  i++; // skip (
  let depth = 1;
  const start = i;
  while (i < sig.length && depth > 0) {
    if (sig[i] === '(') depth++;
    if (sig[i] === ')') depth--;
    i++;
  }
  const paramStr = sig.substring(start, i - 1).trim();
  if (!paramStr) return [];

  // Split by commas at depth 0
  const params: string[] = [];
  let current = '';
  let d = 0;
  for (const ch of paramStr) {
    if (ch === '(' || ch === '<') d++;
    if (ch === ')' || ch === '>') d--;
    if (ch === ',' && d === 0) {
      params.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) params.push(current.trim());

  return params.map((p) => p.split(':')[0].trim());
}

function getCompletionKind(kind: DWCompletion['kind'], m: typeof Monaco): Monaco.languages.CompletionItemKind {
  switch (kind) {
    case 'keyword': return m.languages.CompletionItemKind.Keyword;
    case 'function': return m.languages.CompletionItemKind.Function;
    case 'variable': return m.languages.CompletionItemKind.Variable;
    case 'snippet': return m.languages.CompletionItemKind.Snippet;
    case 'type': return m.languages.CompletionItemKind.Class;
    case 'module': return m.languages.CompletionItemKind.Module;
    case 'constant': return m.languages.CompletionItemKind.Constant;
    default: return m.languages.CompletionItemKind.Text;
  }
}

// --- Dynamic context helpers ---

function getFieldsAtPath(root: unknown, path: string[]): { key: string; valueType: string }[] {
  try {
    let obj: any = root;
    for (const segment of path) {
      if (Array.isArray(obj)) obj = obj[0];
      if (obj != null && typeof obj === 'object') {
        obj = obj[segment];
      } else {
        return [];
      }
    }
    if (Array.isArray(obj)) obj = obj[0];
    if (obj != null && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.keys(obj).map((k) => {
        const v = obj[k];
        const t =
          v === null ? 'Null' : Array.isArray(v) ? 'Array' : typeof v === 'object' ? 'Object'
          : typeof v === 'string' ? 'String' : typeof v === 'number' ? 'Number'
          : typeof v === 'boolean' ? 'Boolean' : 'Any';
        return { key: k, valueType: t };
      });
    }
    return [];
  } catch {
    return [];
  }
}

function getJsonFieldsAtPath(jsonStr: string, path: string[]): { key: string; valueType: string }[] {
  try {
    return getFieldsAtPath(JSON.parse(jsonStr), path);
  } catch {
    return [];
  }
}

/** DW selector form for a key: `foo` stays bare, `Content-Type` must be
 *  quoted (`payload."Content-Type"`) or the parser reads it as subtraction. */
export function dwSelector(key: string): string {
  return /^[A-Za-z_]\w*$/.test(key) ? key : `"${key}"`;
}

function getCsvColumns(csvStr: string): string[] {
  const firstLine = csvStr.split('\n')[0]?.trim();
  if (!firstLine) return [];
  return firstLine.split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
}

/** XML element names at a selector path. DW's first selector after `payload`
 *  is the ROOT element itself (payload.order for <order>…</order>), so an
 *  empty path suggests the root, then each level suggests direct children. */
function getXmlElementsAtPath(xmlStr: string, path: string[]): string[] {
  if (typeof DOMParser === 'undefined') return [];
  try {
    const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
    if (doc.querySelector('parsererror')) return [];
    let el: Element | null = doc.documentElement;
    if (!el) return [];
    if (path.length === 0) return [el.tagName];
    if (path[0] !== el.tagName) return [];
    for (const seg of path.slice(1)) {
      el = el ? Array.from(el.children).find((c) => c.tagName === seg) ?? null : null;
    }
    if (!el) return [];
    return Array.from(new Set(Array.from(el.children).map((c) => c.tagName)));
  } catch {
    return [];
  }
}

export function extractDotChain(text: string, extraRoots?: string[]): { root: string; path: string[] } | null {
  const roots = ['payload', 'vars', 'attributes', ...(extraRoots || [])];
  // Sort longest-first so longer names match before shorter prefixes
  roots.sort((a, b) => b.length - a.length);
  const escaped = roots.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Lookbehind so `mypayload.` doesn't match the `payload.` suffix
  const re = new RegExp(`(?<![\\w.$])(${escaped.join('|')})((?:\\.\\w+)*)\\.$`);
  const match = text.match(re);
  if (!match) return null;
  return { root: match[1], path: match[2] ? match[2].split('.').filter(Boolean) : [] };
}

/**
 * Parse `var name = <rhs>` and `fun name(...)` declarations out of the script
 * itself, so completions know about user-defined names. RHS capture is
 * line-based: it accumulates continuation lines until the next directive
 * (var/fun/type/import/ns/output/input/%dw) or the `---` separator.
 */
export function parseScriptDeclarations(script: string): { vars: Map<string, string>; funs: string[] } {
  const vars = new Map<string, string>();
  const funs: string[] = [];
  let current: { name: string; parts: string[] } | null = null;
  const flush = () => {
    if (current) {
      const rhs = current.parts.join('\n').replace(/\/\/[^\n]*/g, '').trim();
      if (rhs) vars.set(current.name, rhs);
      current = null;
    }
  };
  for (const line of script.split('\n')) {
    if (/^---\s*$/.test(line.trim())) { flush(); continue; }
    const varMatch = line.match(/^\s*var\s+([A-Za-z_]\w*)\s*=\s*(.*)$/);
    if (varMatch) {
      flush();
      current = { name: varMatch[1], parts: [varMatch[2]] };
      continue;
    }
    const funMatch = line.match(/^\s*fun\s+([A-Za-z_]\w*)\s*\(/);
    if (funMatch) { flush(); funs.push(funMatch[1]); continue; }
    if (/^\s*(var|fun|type|import|ns|output|input|%dw)\b/.test(line)) { flush(); continue; }
    if (current) current.parts.push(line);
  }
  flush();
  return { vars, funs };
}

/**
 * Best-effort parse of a DW object/array literal (`{ a: 1, b: "x" }`) into a
 * JS value so we can suggest its keys. Quotes unquoted keys and converts
 * single-quoted strings, then tries JSON.parse. Returns undefined for
 * anything it can't handle (function calls, expressions, etc.).
 */
export function parseDwObjectLiteral(rhs: string): unknown {
  const t = rhs.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return undefined;
  const jsonish = t
    .replace(/([{,[]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":')
    .replace(/'([^'\\\n]*)'/g, '"$1"');
  try {
    return JSON.parse(jsonish);
  } catch {
    return undefined;
  }
}

/**
 * Resolve a dot-chain whose root is a script-level `var` down to either a
 * context root (payload / vars / attributes / named input) with a combined
 * path, or an inline object literal. Follows var→var chains up to 6 deep.
 *
 * `var template = payload.template` + typing `template.` resolves to
 * { root: 'payload', path: ['template'] } so the payload JSON drives the
 * suggestions — the bug this fixes.
 */
export function resolveChainRoot(
  chain: { root: string; path: string[] },
  scriptVars: Map<string, string>
): { root: string; path: string[]; obj?: unknown } {
  let root = chain.root;
  let path = chain.path;
  for (let depth = 0; depth < 6 && scriptVars.has(root); depth++) {
    const rhs = scriptVars.get(root)!;
    const dotChain = rhs.match(/^([A-Za-z_]\w*)((?:\.\w+)*)$/);
    if (dotChain) {
      const rhsPath = dotChain[2] ? dotChain[2].split('.').filter(Boolean) : [];
      if (dotChain[1] === root) break; // self-reference, avoid spinning
      root = dotChain[1];
      path = [...rhsPath, ...path];
      continue;
    }
    const obj = parseDwObjectLiteral(rhs);
    if (obj !== undefined) return { root, path, obj };
    break; // unresolvable RHS (function call, complex expression)
  }
  return { root, path };
}

/** Flatten nested YAML object into dot-notation keys */
function flattenYamlKeys(obj: unknown, prefix = ''): string[] {
  const keys: string[] = [];
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        keys.push(...flattenYamlKeys(value, fullKey));
      } else {
        keys.push(fullKey);
      }
    }
  }
  return keys;
}

function parseYamlKeys(yamlStr?: string): string[] {
  if (!yamlStr) return [];
  try {
    return flattenYamlKeys(yaml.load(yamlStr));
  } catch {
    return [];
  }
}

// ── Shared provider registration ────────────────────────────────────────
// Monaco completion/hover providers are GLOBAL per language: if ScriptEditor
// and a DW MiniEditor each registered their own, every DW editor would show
// merged (duplicate) suggestions, and MiniEditors would leak the main
// Playground payload context. Instead there is ONE refcounted registration,
// and editors that have a payload/vars context attach it per model path.
const modelContexts = new Map<string, () => DWCompletionContext>();

/** Attach a completion context to models whose URI ends with `modelPath`.
 *  Returns an unregister function. */
export function registerDWModelContext(
  modelPath: string,
  get: () => DWCompletionContext
): () => void {
  modelContexts.set(modelPath, get);
  return () => {
    modelContexts.delete(modelPath);
  };
}

function contextForModel(model: Monaco.editor.ITextModel): DWCompletionContext | undefined {
  let best: (() => DWCompletionContext) | undefined;
  let bestLen = -1;
  for (const [key, get] of modelContexts) {
    if (model.uri.path.endsWith(key) && key.length > bestLen) {
      best = get;
      bestLen = key.length;
    }
  }
  return best?.();
}

let providerRefCount = 0;
let sharedCompletion: Monaco.IDisposable | null = null;
let sharedHover: Monaco.IDisposable | null = null;

/** Register the DW completion + hover providers exactly once, refcounted
 *  across every editor that wants them. Returns a release function. */
export function ensureDWEditorProviders(monaco: typeof Monaco): () => void {
  providerRefCount++;
  if (!sharedCompletion) sharedCompletion = registerDWCompletionProvider(monaco);
  if (!sharedHover) sharedHover = registerDWHoverProvider(monaco);
  return () => {
    providerRefCount--;
    if (providerRefCount <= 0) {
      providerRefCount = 0;
      sharedCompletion?.dispose();
      sharedCompletion = null;
      sharedHover?.dispose();
      sharedHover = null;
    }
  };
}

export function registerDWCompletionProvider(
  monaco: typeof Monaco,
  getContext?: () => DWCompletionContext
): Monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider('dataweave', {
    // '{' (not '$') triggers config-prop completions: a bare `$` is DW's
    // lambda shorthand (payload map $.name) and must not pop ${key} props.
    triggerCharacters: ['.', ':', '/', '{'],

    async provideCompletionItems(model, position, context) {
      const DW_FUNCTIONS = await getDwFunctions();
      const word = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const lineContent = model.getLineContent(position.lineNumber);
      const textBeforeCursor = lineContent.substring(0, position.column - 1);
      const textBeforeWord = lineContent.substring(0, word.startColumn - 1);

      const ctx = getContext ? getContext() : contextForModel(model);

      // --- Config property ${key} / ${secure::key} completions ---
      // Requires the full `${` prefix — a bare `$` is the lambda shorthand.
      const propMatch = textBeforeCursor.match(/\$\{(secure::)?$/);
      if (ctx) {
        // We replace the entire matched prefix so the inserted text is the
        // full ${key} — without this, accepting after typing `${` would leave
        // `${${key}}` (the user's `${` plus the suggestion's `${...}`).
        if (propMatch) {
          const matchLen = propMatch[0].length;
          const isSecure = !!propMatch[1];
          const propRange: Monaco.IRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column - matchLen, // cover the typed prefix
            endColumn: position.column,
          };

          const suggestions: Monaco.languages.CompletionItem[] = [];

          if (!isSecure) {
            // Suggest ${key} from config YAML
            const configKeys = parseYamlKeys(ctx.configYaml);
            configKeys.forEach((key, i) => {
              suggestions.push({
                label: `\${${key}}`,
                kind: monaco.languages.CompletionItemKind.Variable,
                detail: 'Config property',
                insertText: `\${${key}}`,
                range: propRange,
                sortText: `0${String(i).padStart(4, '0')}`,
              });
            });
            // Also suggest ${secure::key} from secure config
            const secureKeys = parseYamlKeys(ctx.secureConfigYaml);
            secureKeys.forEach((key, i) => {
              suggestions.push({
                label: `\${secure::${key}}`,
                kind: monaco.languages.CompletionItemKind.Variable,
                detail: 'Secure config property',
                insertText: `\${secure::${key}}`,
                range: propRange,
                sortText: `1${String(i).padStart(4, '0')}`,
              });
            });
          } else {
            // Already typed ${secure:: — only suggest secure keys.
            // The range covers the whole `${secure::` prefix so we re-emit
            // it in insertText, keeping the result clean and atomic.
            const secureKeys = parseYamlKeys(ctx.secureConfigYaml);
            secureKeys.forEach((key, i) => {
              suggestions.push({
                label: `\${secure::${key}}`,
                kind: monaco.languages.CompletionItemKind.Variable,
                detail: 'Secure config property',
                insertText: `\${secure::${key}}`,
                range: propRange,
                sortText: String(i).padStart(4, '0'),
              });
            });
          }

          if (suggestions.length > 0) {
            return { suggestions };
          }
        }
      }

      // '{' is only a trigger for `${` config props — a plain object brace
      // must not pop the full static list.
      if (
        context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter &&
        context.triggerCharacter === '{' &&
        !propMatch
      ) {
        return { suggestions: [] };
      }

      // --- Context-aware dot-chain suggestions ---
      const decls = parseScriptDeclarations(model.getValue());
      const namedRoots = ctx?.namedInputs?.filter((ni) => ni.name).map((ni) => ni.name) || [];
      const extraRoots = [...namedRoots, ...decls.vars.keys()];
      const rawChain = extractDotChain(textBeforeWord, extraRoots);
      // Script-level vars (var x = payload.template) resolve to their source
      // chain or inline literal, so `x.` suggests the same fields `payload.template.` would
      const chain = rawChain ? resolveChainRoot(rawChain, decls.vars) : null;
      if (chain && chain.obj !== undefined) {
        const dynamic = getFieldsAtPath(chain.obj, chain.path).map((f, i) => ({
          label: f.key,
          kind: f.valueType === 'Object' || f.valueType === 'Array'
            ? monaco.languages.CompletionItemKind.Struct
            : monaco.languages.CompletionItemKind.Field,
          detail: `${rawChain!.root} field (${f.valueType})`,
          insertText: dwSelector(f.key),
          range,
          sortText: String(i).padStart(4, '0'),
        }));
        if (dynamic.length > 0) return { suggestions: dynamic };
      }
      if (chain && ctx) {
        let dynamic: Monaco.languages.CompletionItem[] = [];

        if (chain.root === 'payload') {
          const mime = ctx.payloadMimeType;
          if (mime.includes('json') || mime.includes('java')) {
            dynamic = getJsonFieldsAtPath(ctx.payload, chain.path).map((f, i) => ({
              label: f.key,
              kind: f.valueType === 'Object' || f.valueType === 'Array'
                ? monaco.languages.CompletionItemKind.Struct
                : monaco.languages.CompletionItemKind.Field,
              detail: `payload field (${f.valueType})`,
              insertText: dwSelector(f.key),
              range,
              sortText: String(i).padStart(4, '0'),
            }));
          } else if (mime.includes('csv') && chain.path.length === 0) {
            dynamic = getCsvColumns(ctx.payload).map((c, i) => ({
              label: c,
              kind: monaco.languages.CompletionItemKind.Field,
              detail: 'CSV column',
              insertText: dwSelector(c),
              range,
              sortText: String(i).padStart(4, '0'),
            }));
          } else if (mime.includes('xml')) {
            dynamic = getXmlElementsAtPath(ctx.payload, chain.path).map((e, i) => ({
              label: e,
              kind: monaco.languages.CompletionItemKind.Field,
              detail: 'XML element',
              insertText: dwSelector(e),
              range,
              sortText: String(i).padStart(4, '0'),
            }));
          }
        } else if (chain.root === 'vars') {
          if (chain.path.length === 0) {
            // Suggest var names
            dynamic = ctx.vars.filter((v) => v.key).map((v, i) => ({
              label: v.key,
              kind: monaco.languages.CompletionItemKind.Variable,
              detail: `Flow variable (${v.valueType})`,
              insertText: dwSelector(v.key),
              range,
              sortText: String(i).padStart(4, '0'),
            }));
          } else {
            // Suggest keys inside a JSON var
            const varEntry = ctx.vars.find((v) => v.key === chain.path[0] && v.valueType === 'json');
            if (varEntry) {
              dynamic = getJsonFieldsAtPath(varEntry.value, chain.path.slice(1)).map((f, i) => ({
                label: f.key,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `var field (${f.valueType})`,
                insertText: dwSelector(f.key),
                range,
                sortText: String(i).padStart(4, '0'),
              }));
            }
          }
        } else if (chain.root === 'attributes') {
          if (chain.path.length === 0) {
            const attrSubs = [
              { key: 'method', detail: 'HTTP method' },
              { key: 'headers', detail: 'HTTP headers' },
              { key: 'queryParams', detail: 'Query parameters' },
              { key: 'requestUri', detail: 'Request URI path' },
              { key: 'statusCode', detail: 'HTTP status code' },
            ];
            dynamic = attrSubs.map((s, i) => ({
              label: s.key,
              kind: monaco.languages.CompletionItemKind.Property,
              detail: s.detail,
              insertText: s.key,
              range,
              sortText: String(i).padStart(4, '0'),
            }));
          } else if (chain.path[0] === 'headers') {
            dynamic = ctx.headers.filter((h) => h.key).map((h, i) => ({
              label: h.key,
              kind: monaco.languages.CompletionItemKind.Property,
              detail: `Header: ${h.value}`,
              insertText: dwSelector(h.key),
              range,
              sortText: String(i).padStart(4, '0'),
            }));
          } else if (chain.path[0] === 'queryParams') {
            dynamic = ctx.queryParams.filter((q) => q.key).map((q, i) => ({
              label: q.key,
              kind: monaco.languages.CompletionItemKind.Property,
              detail: `Param: ${q.value}`,
              insertText: dwSelector(q.key),
              range,
              sortText: String(i).padStart(4, '0'),
            }));
          }
        }

        // Check if root is a named input
        if (dynamic.length === 0) {
          const namedInput = ctx.namedInputs?.find((ni) => ni.name === chain.root);
          if (namedInput) {
            const mime = namedInput.mimeType;
            if (mime.includes('json') || mime.includes('java')) {
              dynamic = getJsonFieldsAtPath(namedInput.content, chain.path).map((f, i) => ({
                label: f.key,
                kind: f.valueType === 'Object' || f.valueType === 'Array'
                  ? monaco.languages.CompletionItemKind.Struct
                  : monaco.languages.CompletionItemKind.Field,
                detail: `${chain.root} field (${f.valueType})`,
                insertText: dwSelector(f.key),
                range,
                sortText: String(i).padStart(4, '0'),
              }));
            } else if (mime.includes('csv') && chain.path.length === 0) {
              dynamic = getCsvColumns(namedInput.content).map((c, i) => ({
                label: c,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `${chain.root} CSV column`,
                insertText: dwSelector(c),
                range,
                sortText: String(i).padStart(4, '0'),
              }));
            } else if (mime.includes('xml')) {
              dynamic = getXmlElementsAtPath(namedInput.content, chain.path).map((e, i) => ({
                label: e,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `${chain.root} XML element`,
                insertText: dwSelector(e),
                range,
                sortText: String(i).padStart(4, '0'),
              }));
            }
          }
        }

        if (dynamic.length > 0) {
          return { suggestions: dynamic };
        }
      }

      // --- Default static completions ---
      // Replace ranges normally cover only the current word, but `%`, `-`,
      // and `application/` aren't word characters — accepting `%dw 2.0` after
      // typing `%d` would otherwise produce `%%dw 2.0` (same for `---` after
      // `-`, and `application/json` after typing through the slash).
      const symbolPrefix = textBeforeWord.match(/[%-]+$/)?.[0];
      const mimePrefix = textBeforeWord.match(/[\w-]+\/$/)?.[0];
      const rangeFor = (label: string): Monaco.IRange => {
        for (const pre of [symbolPrefix, mimePrefix]) {
          if (pre && label.startsWith(pre)) {
            return { ...range, startColumn: word.startColumn - pre.length };
          }
        }
        return range;
      };

      // Script-declared vars/functions first ('!' sorts before the '0'-padded
      // sortText of everything below, and Monaco filters by typed prefix).
      const declSuggestions: Monaco.languages.CompletionItem[] = [
        ...[...decls.vars.keys()].map((name, i) => ({
          label: name,
          kind: monaco.languages.CompletionItemKind.Variable,
          detail: 'Script variable',
          insertText: name,
          range,
          sortText: `!${String(i).padStart(3, '0')}`,
        })),
        ...decls.funs.map((name, i) => ({
          label: name,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: 'Script function',
          insertText: name,
          range,
          sortText: `!${String(i + 500).padStart(3, '0')}`,
        })),
      ];

      // For function-kind entries, prefer the rich auto-generated docs
      // (signature + description from the official MuleSoft reference).
      const suggestions: Monaco.languages.CompletionItem[] = COMPLETIONS.map((c, i) => {
        const richDoc = c.kind === 'function' ? buildCompletionDoc(DW_FUNCTIONS[c.label.toLowerCase()]) : undefined;
        const documentation: Monaco.languages.CompletionItem['documentation'] = richDoc
          ? { value: richDoc, isTrusted: false }
          : c.documentation;
        return {
          label: c.label,
          kind: getCompletionKind(c.kind, monaco),
          detail: c.detail,
          documentation,
          insertText: c.insertText || c.label,
          insertTextRules: c.isSnippet
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          range: rangeFor(c.label),
          sortText: String(i).padStart(4, '0'),
        };
      });

      // --- DW_FUNCTIONS completions (309 functions from MuleSoft docs) ---
      // Add any function from the auto-generated docs that isn't already
      // in the hand-tuned static list. Parses the signature to build
      // proper insertText with parentheses and param placeholders.
      let dynIdx = COMPLETIONS.length;
      for (const [key, doc] of Object.entries(DW_FUNCTIONS)) {
        if (STATIC_FN_NAMES.has(key)) continue;
        // Skip operators like ++, --, ~=, etc.
        if (/^[^a-zA-Z]/.test(key)) continue;

        const ov = doc.overloads[0];
        if (!ov) continue;

        const params = parseSignatureParams(ov.signature);
        let insertText: string;
        let isSnippet = false;
        if (params.length === 0) {
          insertText = `${doc.name}()`;
        } else {
          const placeholders = params.map((p, pi) => `\${${pi + 1}:${p}}`).join(', ');
          insertText = `${doc.name}(${placeholders})`;
          isSnippet = true;
        }

        const richDoc = buildCompletionDoc(doc);
        suggestions.push({
          label: doc.name,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: `dw::${ov.module} · ${ov.signature.includes('):') ? ov.signature.split('):')[0] + ')' : ov.signature}`,
          documentation: richDoc ? { value: richDoc, isTrusted: false } : ov.description,
          insertText,
          insertTextRules: isSnippet
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          range,
          sortText: String(dynIdx++).padStart(4, '0'),
        });
      }

      return { suggestions: [...declSuggestions, ...suggestions] };
    },
  });
}
