// Extracts MuleSoft's OFFICIAL DataWeave cookbook examples from
// mulesoft/docs-dataweave into src/cookbookOfficialRecipes.ts.
//
// The docs keep each example's code in Antora partials rather than inline, which
// is lucky for us — every example is already a clean triple on disk:
//
//   _partials/cookbook-dw/<example-id>/transform.dwl
//   _partials/cookbook-dw/<example-id>/inputs/payload.<ext>   (optional)
//   _partials/cookbook-dw/<example-id>/out.<ext>
//
// Title and blurb come from the `dataweave-cookbook-*.adoc` page the example
// belongs to. As with scripts/buildCookbook.mjs, every recipe is RUN through the
// bundled engine and only kept if it executes cleanly, with the engine's real
// output stored as the expected result — so nothing in the UI is aspirational.
//
// Usage: node scripts/extract-dw-cookbook.mjs   (or npm run docs:refresh)

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync, statSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, execSync } from 'node:child_process';
import readline from 'node:readline';

const ROOT = resolve('.');
const PAGES = join(ROOT, '.dwdocs-src/modules/ROOT/pages');
const PARTIALS = join(PAGES, '_partials/cookbook-dw');
const OUT_FILE = join(ROOT, 'src/cookbookOfficialRecipes.ts');
const JAVA = join(ROOT, 'src-tauri/resources/jre/bin', process.platform === 'win32' ? 'java.exe' : 'java');
const JAR = join(ROOT, 'src-tauri/resources/dw-server/dwstudio-server.jar');

const MIME_BY_EXT = {
  '.json': 'application/json', '.xml': 'application/xml', '.csv': 'application/csv',
  '.txt': 'text/plain', '.yaml': 'application/yaml', '.yml': 'application/yaml',
  '.dwl': 'application/dw', '.properties': 'text/x-java-properties',
};

/** Coarse grouping so the browser's category sections stay meaningful. */
function categoryFor(title, script) {
  const t = `${title} ${script}`.toLowerCase();
  if (/\bdate|time|zone|period|duration\b/.test(t)) return 'Dates & Times';
  if (/\bxml|namespace|attribute\b/.test(t)) return 'XML';
  if (/\bcsv|flat ?file|excel\b/.test(t)) return 'CSV & Flat Files';
  if (/\bstring|substring|replace|capitaliz|upper|lower\b/.test(t)) return 'Strings';
  if (/\barray|list|map |filter|reduce|order|group|flatten|distinct\b/.test(t)) return 'Arrays & Lists';
  if (/\bobject|key|value|pluck|entries\b/.test(t)) return 'Objects';
  if (/\bnumber|math|round|sum|random\b/.test(t)) return 'Numbers & Math';
  if (/\bencode|decode|base64|hash|encrypt|hex\b/.test(t)) return 'Encoding & Hashing';
  if (/\bfunction|lambda|recursion|variable|type\b/.test(t)) return 'Language & Functions';
  return 'General';
}

function decodeEntities(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** Page title + first real paragraph, for each dataweave-cookbook-*.adoc page. */
function readPages() {
  const pages = new Map();
  for (const f of readdirSync(PAGES)) {
    if (!/^dataweave-cookbook-.*\.adoc$/.test(f)) continue;
    const lines = readFileSync(join(PAGES, f), 'utf8').split(/\r?\n/);
    let title = null;
    const para = [];
    for (const ln of lines) {
      if (!title) { const m = ln.match(/^=\s+(.+)$/); if (m) title = decodeEntities(m[1].trim()); continue; }
      if (/^(ifndef|ifdef|endif|include|:[a-z])/.test(ln)) continue;
      if (/^\[\[|^==\s/.test(ln)) break;              // reached the first section
      if (ln.trim() === '') { if (para.length) break; continue; }
      para.push(ln.trim());
    }
    const slug = f.replace(/^dataweave-cookbook-/, '').replace(/\.adoc$/, '');
    pages.set(slug, {
      title: title || slug,
      description: decodeEntities(para.join(' '))
        .replace(/https?:\/\/\S+\[([^\]]*)\]/g, '$1')
        .replace(/<<[^,>]+,\s*([^>]+)>>/g, '$1')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/\s+/g, ' ').trim(),
    });
  }
  return pages;
}

function firstFile(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile());
  // Prefer something called payload.*; otherwise the single input present.
  return files.find((f) => f.startsWith('payload.')) || files[0] || null;
}

const pages = readPages();
const candidates = [];

for (const dirName of readdirSync(PARTIALS)) {
  const dir = join(PARTIALS, dirName);
  if (!statSync(dir).isDirectory()) continue;
  const scriptPath = join(dir, 'transform.dwl');
  if (!existsSync(scriptPath)) continue;
  const outName = readdirSync(dir).find((f) => /^out\./.test(f));
  if (!outName) continue;

  // `change-value-of-a-field-ex1` → page `change-value-of-a-field`
  const slug = dirName.replace(/-ex\d*[a-z]?$/i, '');
  const page = pages.get(slug) || pages.get(dirName) || null;

  const inputsDir = join(dir, 'inputs');
  const inputName = firstFile(inputsDir);
  const script = readFileSync(scriptPath, 'utf8').trim();
  if (!script) continue;

  // Some examples read flow variables; the docs ship them as one file per var
  // under inputs/vars/<name>.json. Without these the recipe fails to compile
  // ("Unable to resolve reference of: `vars`") and would be dropped.
  const varsDir = join(inputsDir, 'vars');
  const vars = {};
  if (existsSync(varsDir)) {
    for (const vf of readdirSync(varsDir)) {
      const raw = readFileSync(join(varsDir, vf), 'utf8').trim();
      const name = basename(vf, extname(vf));
      try { vars[name] = JSON.parse(raw); } catch { vars[name] = raw; }
    }
  }

  candidates.push({
    id: `docs-${dirName}`,
    name: page ? page.title : dirName.replace(/-/g, ' '),
    category: categoryFor(page ? page.title : dirName, script),
    difficulty: 'Intermediate',
    description: page?.description || '',
    inputMime: inputName ? (MIME_BY_EXT[extname(inputName)] || 'application/json') : 'application/json',
    input: inputName ? readFileSync(join(inputsDir, inputName), 'utf8') : '',
    outputMime: MIME_BY_EXT[extname(outName)] || 'application/json',
    output: readFileSync(join(dir, outName), 'utf8').trim(),
    script,
    vars,
  });
}

console.log(`Found ${candidates.length} official cookbook examples`);

// ---- validate every one through the real engine ----------------------------
function startServer() {
  const child = spawn(JAVA, ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8',
    '-Dsun.stdout.encoding=UTF-8', '-jar', JAR], { stdio: ['pipe', 'pipe', 'ignore'] });
  const rl = readline.createInterface({ input: child.stdout });
  const queue = [];
  let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });
  rl.on('line', (line) => {
    if (line.includes('"ready"')) { readyResolve(); return; }
    const w = queue.shift();
    if (w) w(line);
  });
  let id = 1;
  return {
    ready,
    run: (req) => new Promise((res) => {
      queue.push((line) => { try { res(JSON.parse(line)); } catch { res({ ok: false, error: 'bad json' }); } });
      child.stdin.write(JSON.stringify({ id: id++, ...req }) + '\n');
    }),
    stop: () => child.kill(),
  };
}

const server = startServer();
await server.ready;
console.log('dw-server ready, validating...');

const tmp = mkdtempSync(join(tmpdir(), 'dwcook-'));
const passed = [];
const failed = [];

for (const r of candidates) {
  let payloadPath = '';
  if (r.input) {
    payloadPath = join(tmp, `${r.id}${extname(r.inputMime === 'application/xml' ? 'x.xml' : 'x.json')}`);
    writeFileSync(payloadPath, r.input);
  }
  let varsPath = '';
  if (r.vars && Object.keys(r.vars).length) {
    varsPath = join(tmp, `${r.id}.vars.json`);
    writeFileSync(varsPath, JSON.stringify(r.vars));
  }
  const resp = await server.run({
    script: r.script,
    payloadPath,
    varsPath,
    payloadMime: r.inputMime,
    namedInputs: [],
    outputMime: r.outputMime,
  });
  if (resp.ok && resp.output && resp.output.trim()) {
    // Store the engine's ACTUAL output, not the docs' — guaranteed to match.
    const { vars, ...rest } = r;
    passed.push({ ...rest, output: resp.output.trim(), ...(Object.keys(vars).length ? { vars } : {}) });
  } else {
    failed.push({ id: r.id, err: String(resp.error || 'empty output').split('\n')[0].slice(0, 90) });
  }
}
server.stop();

console.log(`\nvalidated: ${passed.length} ok, ${failed.length} skipped`);
for (const f of failed.slice(0, 12)) console.log(`  skip ${f.id}: ${f.err}`);
if (failed.length > 12) console.log(`  … and ${failed.length - 12} more`);

let ref = 'unknown';
try { ref = execSync('git rev-parse --short HEAD', { cwd: join(ROOT, '.dwdocs-src') }).toString().trim(); } catch {}

passed.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

writeFileSync(OUT_FILE, `// AUTO-GENERATED from mulesoft/docs-dataweave@v2.11 (${ref}). Do not edit by hand.
// Re-run: npm run docs:refresh
//
// MuleSoft's official DataWeave cookbook examples. Every recipe here was executed
// against the bundled engine at generation time and its real output captured, so
// what the UI shows is what the engine actually produces. Upstream is
// BSD-3-Clause; see licenses/docs-dataweave-LICENSE.txt.
import type { Recipe } from './cookbookRecipes';

export const OFFICIAL_RECIPES: Recipe[] = ${JSON.stringify(passed, null, 2)};
`);
console.log(`\nWrote ${OUT_FILE} (${passed.length} recipes)`);
