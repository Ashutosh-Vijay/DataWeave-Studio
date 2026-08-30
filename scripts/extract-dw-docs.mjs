// Extracts DataWeave 2.x function reference docs from mulesoft/docs-dataweave
// into src/dataweaveDocs.ts. Pure Node, no deps. Re-run for newer DW versions.
//
// Usage:
//   node scripts/extract-dw-docs.mjs [pagesDir]
//
// pagesDir defaults to .dwdocs-src/modules/ROOT/pages (made by docs:refresh)

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const PAGES_DIR = process.argv[2] || resolve('.dwdocs-src/modules/ROOT/pages');
const OUT_FILE = resolve('src/dataweaveDocs.ts');
const MAX_EXAMPLES = 2;

// Which docs branch this run is reading. Hardcoding it meant the banner kept
// claiming v2.11 after the branch moved on.
let sourceBranch = 'unknown';
try {
  sourceBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: resolve('.dwdocs-src') }).toString().trim();
} catch { /* custom pagesDir with no clone beside it — leave it unknown */ }

function decodeEntities(s) {
  return s
    // Numeric decimal entities (handles &#43; + , &#124; | , and any others)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    // Numeric hex entities, just in case
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    // Named entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Files of interest: dw-<module>-functions-<name>.adoc
const FILE_RE = /^dw-([a-z0-9]+)-functions-([a-z0-9]+)\.adoc$/i;

function listFiles(dir) {
  return readdirSync(dir)
    .filter(f => FILE_RE.test(f))
    .map(f => {
      const m = f.match(FILE_RE);
      return { file: f, module: m[1].toLowerCase(), funcSlug: m[2].toLowerCase() };
    });
}

// Parse a single adoc file → array of overloads
function parseFile(rawText, moduleName) {
  // Strip ifdef/ifndef/include directives lines
  const lines = rawText.split(/\r?\n/);

  // Find function name (= name), case-sensitive preserved
  let funcName = null;
  for (const ln of lines) {
    const m = ln.match(/^=\s+(\S+)\s*$/);
    if (m) { funcName = decodeEntities(m[1].trim()); break; }
  }
  if (!funcName) return { funcName: null, overloads: [] };

  // Walk lines, find each `[[anchor]]` followed (after blank lines) by `== signature`,
  // collect description (text until next === or ==), examples (=== Example blocks).
  const overloads = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    const anchor = ln.match(/^\[\[([^\]]+)\]\]\s*$/);
    if (anchor) {
      // Find following `== ...` line
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && /^==\s+/.test(lines[j])) {
        const sigLine = lines[j].replace(/^==\s+/, '').trim();
        const signature = decodeEntities(sigLine);

        // Description: from j+1 until next heading line starting with `=== ` or `== ` or `[[`
        let k = j + 1;
        const descLines = [];
        while (k < lines.length) {
          const t = lines[k];
          if (/^==\s+/.test(t) || /^===\s+/.test(t) || /^\[\[/.test(t)) break;
          descLines.push(t);
          k++;
        }
        const description = descLines.join('\n').trim();

        // Examples: scan from k forward until next `[[anchor]]` (next overload)
        const examples = [];
        let m = k;
        while (m < lines.length) {
          if (/^\[\[/.test(lines[m])) break;
          if (/^===\s+Example/i.test(lines[m])) {
            // find ==== Source then code block, then ==== Output then code block
            let n = m + 1;
            let source = null, output = null;
            // Source
            while (n < lines.length && !/^\[\[/.test(lines[n]) && !/^===\s+/.test(lines[n])) {
              if (/^====\s+Source/i.test(lines[n])) {
                // skip to the first `----` delimiter
                let p = n + 1;
                while (p < lines.length && lines[p].trim() !== '----') p++;
                p++;
                const buf = [];
                while (p < lines.length && lines[p].trim() !== '----') { buf.push(lines[p]); p++; }
                source = buf.join('\n');
                n = p + 1;
                break;
              }
              n++;
            }
            // Output
            while (n < lines.length && !/^\[\[/.test(lines[n]) && !/^===\s+/.test(lines[n])) {
              if (/^====\s+Output/i.test(lines[n])) {
                let p = n + 1;
                while (p < lines.length && lines[p].trim() !== '----') p++;
                p++;
                const buf = [];
                while (p < lines.length && lines[p].trim() !== '----') { buf.push(lines[p]); p++; }
                output = buf.join('\n');
                n = p + 1;
                break;
              }
              n++;
            }
            if (source != null) {
              examples.push({
                source: decodeEntities(source).trim(),
                output: decodeEntities(output ?? '').trim(),
              });
              if (examples.length >= MAX_EXAMPLES) {
                // skip the rest of examples for this overload
                while (m < lines.length && !/^\[\[/.test(lines[m])) m++;
                break;
              }
            }
            m = n;
            continue;
          }
          m++;
        }

        overloads.push({
          module: moduleName,
          signature,
          description,
          examples,
        });
        i = m;
        continue;
      }
    }
    i++;
  }

  return { funcName, overloads };
}

function main() {
  if (!statSync(PAGES_DIR).isDirectory()) {
    console.error(`Not a directory: ${PAGES_DIR}`);
    process.exit(1);
  }
  const entries = listFiles(PAGES_DIR);
  console.log(`Found ${entries.length} candidate files in ${PAGES_DIR}`);

  /** @type {Record<string, { name: string; overloads: any[] }>} */
  const byKey = {};
  const moduleCounts = {};
  const warnings = [];

  for (const e of entries) {
    moduleCounts[e.module] = moduleCounts[e.module] || 0;
    let raw;
    try {
      raw = readFileSync(join(PAGES_DIR, e.file), 'utf8');
    } catch (err) {
      warnings.push(`read failed: ${e.file}: ${err.message}`);
      continue;
    }
    const { funcName, overloads } = parseFile(raw, e.module);
    if (!funcName || overloads.length === 0) {
      warnings.push(`empty/malformed: ${e.file}`);
      continue;
    }
    const key = funcName.toLowerCase();
    if (!byKey[key]) byKey[key] = { name: funcName, overloads: [] };
    for (const o of overloads) byKey[key].overloads.push(o);
    moduleCounts[e.module]++;
  }

  // Stable sort entries by key
  const sortedKeys = Object.keys(byKey).sort();

  // Build TS output
  const head = `// AUTO-GENERATED from mulesoft/docs-dataweave@${sourceBranch}. Do not edit by hand.
// Re-run scripts/extract-dw-docs.mjs to refresh.

export interface FnExample { source: string; output: string; }
export interface FnOverload {
  module: string;
  signature: string;
  description: string;
  examples: FnExample[];
}
export interface FnDoc {
  name: string;
  overloads: FnOverload[];
}

export const DW_FUNCTIONS: Record<string, FnDoc> = `;

  // Use JSON.stringify for safe escaping, then prettify slightly.
  const obj = {};
  for (const k of sortedKeys) obj[k] = byKey[k];
  const body = JSON.stringify(obj, null, 2);

  const out = head + body + ';\n';
  writeFileSync(OUT_FILE, out, 'utf8');

  // Validate: re-parse the JSON portion
  try {
    JSON.parse(body);
  } catch (err) {
    console.error('JSON validation FAILED:', err.message);
    process.exit(2);
  }

  const sizeBytes = Buffer.byteLength(out, 'utf8');
  const totalOverloads = sortedKeys.reduce((acc, k) => acc + byKey[k].overloads.length, 0);
  const moduleSet = new Set();
  for (const k of sortedKeys) for (const o of byKey[k].overloads) moduleSet.add(o.module);

  console.log('---');
  console.log(`Wrote ${sortedKeys.length} functions (${totalOverloads} overloads) across ${moduleSet.size} modules to ${OUT_FILE} (${(sizeBytes / 1024).toFixed(1)} KB)`);
  console.log('Per-module file counts:');
  for (const m of Object.keys(moduleCounts).sort()) {
    console.log(`  ${m.padEnd(12)} ${moduleCounts[m]}`);
  }
  const zeroModules = Object.keys(moduleCounts).filter(m => moduleCounts[m] === 0);
  if (zeroModules.length) console.log(`Modules with 0 functions: ${zeroModules.join(', ')}`);
  if (warnings.length) {
    console.log(`Warnings (${warnings.length}):`);
    for (const w of warnings) console.log('  ' + w);
  } else {
    console.log('No warnings.');
  }
}

main();
