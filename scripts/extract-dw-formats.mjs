// Extracts the per-format reader/writer configuration properties from
// mulesoft/docs-dataweave into src/dataweaveFormats.ts.
//
// Why this exists: the sibling extract-dw-docs.mjs only matches
// `dw-<module>-functions-<name>.adoc`, so the 20 `dataweave-formats-*.adoc`
// pages were never mined. Those pages are where reader/writer options live —
// `output application/json skipNullOn="everywhere"` and friends — which is why
// the editor offered no completions for them at all.
//
// Pure Node, no deps, same house style as extract-dw-docs.mjs.
//
// Usage:
//   node scripts/extract-dw-formats.mjs [pagesDir]
//
// pagesDir defaults to .dwdocs-src/modules/ROOT/pages (shallow clone of the
// branch matching our bundled engine — see package.json "docs:refresh").

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const PAGES_DIR = process.argv[2] || resolve('.dwdocs-src/modules/ROOT/pages');
const OUT_FILE = resolve('src/dataweaveFormats.ts');

// Format id (from the filename) → the MIME string this app actually offers.
// The docs' own "Supported MIME Types" tables are patterns (`*/json`) or empty,
// so they can't drive this; MimeType in src/types/index.ts can.
const FORMAT_MIME = {
  json: 'application/json',
  xml: 'application/xml',
  csv: 'application/csv',
  yaml: 'application/yaml',
  ndjson: 'application/x-ndjson',
  text: 'text/plain',
  urlencoded: 'application/x-www-form-urlencoded',
  multipart: 'multipart/form-data',
  java: 'application/java',
  dw: 'application/dw',
  binary: 'application/octet-stream',
  properties: 'text/x-java-properties',
  excel: 'application/xlsx',
  avro: 'application/avro',
  protobuf: 'application/protobuf',
  flatfile: 'application/flatfile',
};

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ');
}

/** AsciiDoc inline markup → plain text, for tooltips. */
function clean(s) {
  return decodeEntities(s)
    .replace(/https?:\/\/\S+\[([^\]]*)\]/g, '$1')   // link macro → its label
    .replace(/<<[^,>]+,\s*([^>]+)>>/g, '$1')        // xref → its label
    .replace(/<<[^>]+>>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pull enum values out of a "Valid values are `a`, `b`, or `c`." sentence. */
function parseValues(desc, type) {
  const m = desc.match(/Valid values are ([^.]+)\./i);
  if (!m) return undefined;
  const vals = Array.from(m[1].matchAll(/`([^`]+)`/g), (x) => x[1].trim()).filter(Boolean);
  if (vals.length < 2) return undefined;
  // Booleans are already handled by the type; listing true/false adds nothing.
  if (type === 'Boolean' && vals.every((v) => v === 'true' || v === 'false')) return undefined;
  return vals;
}

/**
 * Parse one `|===` table into rows. A row starts with a backticked name in the
 * first cell; any following lines that don't start a new row are continuation
 * of that row's description (the docs put bullet lists and "Valid values are…"
 * there).
 */
function parseTable(lines, start) {
  const rows = [];
  let cur = null;
  let i = start;
  for (; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.trim() === '|===') break;                      // end of table
    const row = ln.match(/^\|\s*`([^`]+)`\s*\|\s*`?([^|`]*)`?\s*\|\s*`?([^|]*?)`?\s*\|(.*)$/);
    if (row) {
      if (cur) rows.push(cur);
      cur = { name: row[1].trim(), type: row[2].trim(), default: row[3].trim(), descLines: [row[4]] };
    } else if (cur && !/^\|Parameter\b/.test(ln)) {
      cur.descLines.push(ln);
    }
  }
  if (cur) rows.push(cur);
  return {
    end: i,
    rows: rows.map((r) => {
      const rawDesc = r.descLines.join('\n');
      const description = clean(rawDesc);
      const values = parseValues(rawDesc, r.type);
      return {
        name: r.name,
        type: r.type || 'String',
        default: clean(r.default),
        description,
        ...(values ? { values } : {}),
      };
    }),
  };
}

function parseFormatPage(text) {
  const lines = text.split(/\r?\n/);
  const out = { reader: [], writer: [] };
  let section = null;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^===\s+(Reader|Writer)\s+Properties\s*$/i);
    if (h) { section = h[1].toLowerCase(); continue; }
    if (/^==\s+/.test(lines[i])) { if (!/^===/.test(lines[i])) section = null; continue; }
    if (section && lines[i].trim() === '|===') {
      const { rows, end } = parseTable(lines, i + 1);
      out[section].push(...rows);
      i = end;
      section = null; // one table per heading
    }
  }
  return out;
}

if (!existsSync(PAGES_DIR)) {
  console.error(`Pages dir not found: ${PAGES_DIR}\nRun: npm run docs:refresh`);
  process.exit(1);
}

let sourceBranch = 'unknown';
try {
  sourceBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: resolve('.dwdocs-src') }).toString().trim();
} catch { /* no clone — leave it unknown */ }
let sourceRef = 'unknown';
try {
  sourceRef = execSync('git rev-parse --short HEAD', { cwd: resolve('.dwdocs-src') }).toString().trim();
} catch { /* not a clone — leave unknown */ }

const formats = {};
let totalProps = 0;
for (const [id, mime] of Object.entries(FORMAT_MIME)) {
  const file = join(PAGES_DIR, `dataweave-formats-${id}.adoc`);
  if (!existsSync(file)) { console.warn(`  (no page for ${id})`); continue; }
  const { reader, writer } = parseFormatPage(readFileSync(file, 'utf8'));
  if (reader.length === 0 && writer.length === 0) continue;
  formats[mime] = { id, mime, reader, writer };
  totalProps += reader.length + writer.length;
  console.log(`  ${mime.padEnd(36)} reader ${String(reader.length).padStart(2)}  writer ${String(writer.length).padStart(2)}`);
}

const banner = `// AUTO-GENERATED from mulesoft/docs-dataweave@${sourceBranch} (${sourceRef}). Do not edit by hand.
// Re-run: npm run docs:refresh
//
// Reader/writer configuration properties per data format — what may follow a
// MIME type on an \`output\`/\`input\` directive. Upstream is BSD-3-Clause; see
// licenses/ for attribution.
`;

const body = `${banner}
export interface FormatProperty {
  name: string;
  /** 'Boolean' | 'Number' | 'String' | a DW type name. */
  type: string;
  /** Documented default, as written in the docs (may be empty). */
  default: string;
  description: string;
  /** Enum values, when the docs spell out "Valid values are ...". */
  values?: string[];
}

export interface FormatDoc {
  /** Docs page id, e.g. 'json'. */
  id: string;
  mime: string;
  reader: FormatProperty[];
  writer: FormatProperty[];
}

/** Keyed by the MIME string the app uses (see MimeType in types/index.ts). */
export const DW_FORMATS: Record<string, FormatDoc> = ${JSON.stringify(formats, null, 2)};
`;

writeFileSync(OUT_FILE, body);
console.log(`\nWrote ${OUT_FILE}`);
console.log(`${Object.keys(formats).length} formats, ${totalProps} properties, from docs-dataweave@${sourceRef}`);
