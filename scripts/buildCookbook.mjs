// Dev-only pipeline: vendor the mulesoft-cookbook DataWeave pattern recipes into
// src/cookbookRecipes.ts, validating each one through the SAME bundled dw-server
// the app ships, so we only keep recipes that actually execute in our engine.
//
// Run:  node scripts/buildCookbook.mjs
// Source: .cookbook-src/dataweave/patterns (sparse clone of shakarbisetty/mulesoft-cookbook)
//
// Validation = "does it run without error?" (ok:true). We deliberately do NOT
// compare output to the header's documented output — that's display-only.

import { readFileSync, writeFileSync, mkdtempSync, writeFileSync as wf } from 'fs';
import { readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import readline from 'readline';

const ROOT = process.cwd();
const PATTERNS_DIR = join(ROOT, '.cookbook-src', 'dataweave', 'patterns');
const JAVA = join(ROOT, 'src-tauri', 'resources', 'jre', 'bin', 'java.exe');
const JAR = join(ROOT, 'src-tauri', 'resources', 'dw-server', 'dwstudio-server.jar');
const OUT = join(ROOT, 'src', 'cookbookRecipes.ts');

// ---- gather .dwl files (patterns/NN-category/recipe.dwl) -------------------
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.dwl')) out.push(p);
  }
  return out;
}

function prettyCategory(folder) {
  // "01-array-manipulation" -> "Array Manipulation"
  return folder.replace(/^\d+-/, '').split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// ---- parse one recipe's header comment + script ---------------------------
function parseRecipe(path) {
  const raw = readFileSync(path, 'utf8');
  const end = raw.indexOf('*/');
  if (!raw.trimStart().startsWith('/**') || end === -1) return null;
  const header = raw.slice(raw.indexOf('/**') + 3, end);
  const script = raw.slice(end + 2).trim();

  // strip leading " * " from each header line
  const lines = header.split('\n').map((l) => l.replace(/^\s*\*?\s?/, ''));

  let name = '', category = '', difficulty = '';
  const descParts = [];
  let inputMime = '', outputMimeHdr = '';
  const inputLines = [], outputLines = [];
  let mode = 'meta'; // meta | desc | input | output

  for (const line of lines) {
    let m;
    if ((m = line.match(/^Pattern:\s*(.*)/))) { name = m[1].trim(); mode = 'meta'; continue; }
    if ((m = line.match(/^Category:\s*(.*)/))) { category = m[1].trim(); mode = 'meta'; continue; }
    if ((m = line.match(/^Difficulty:\s*(.*)/))) { difficulty = m[1].trim(); mode = 'meta'; continue; }
    if ((m = line.match(/^Description:\s*(.*)/))) { descParts.push(m[1].trim()); mode = 'desc'; continue; }
    if ((m = line.match(/^Input\s*\(([^)]+)\)\s*:?(.*)/))) { inputMime = m[1].trim(); mode = 'input'; continue; }
    if ((m = line.match(/^Output\s*\(([^)]+)\)\s*:?(.*)/))) { outputMimeHdr = m[1].trim(); mode = 'output'; continue; }
    if (mode === 'desc') { if (line.trim()) descParts.push(line.trim()); }
    else if (mode === 'input') inputLines.push(line);
    else if (mode === 'output') outputLines.push(line);
  }

  const parts = path.split(/[\\/]/);
  const folder = parts[parts.length - 2] || '';
  const outDirective = script.match(/output\s+([a-z]+\/[a-z0-9+.-]+)/i);

  return {
    id: basename(path).replace(/\.dwl$/, ''),
    name: name || basename(path).replace(/\.dwl$/, ''),
    category: category || prettyCategory(folder),
    folder,
    difficulty,
    description: descParts.join(' ').trim(),
    inputMime: inputMime || '',
    input: inputLines.join('\n').replace(/^\n+|\n+$/g, ''),
    outputMime: (outDirective ? outDirective[1] : (outputMimeHdr || 'application/json')),
    expectedOutput: outputLines.join('\n').replace(/^\n+|\n+$/g, ''),
    script,
  };
}

// ---- dw-server driver (newline-delimited JSON over stdin/stdout) ----------
function startServer() {
  const child = spawn(JAVA, ['-jar', JAR], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = readline.createInterface({ input: child.stdout });
  const queue = [];
  let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });
  rl.on('line', (line) => {
    if (line.includes('"ready"')) { readyResolve(); return; }
    const waiter = queue.shift();
    if (waiter) waiter(line);
  });
  let id = 1;
  function run(req) {
    return new Promise((resolve) => {
      queue.push((line) => resolve(JSON.parse(line)));
      child.stdin.write(JSON.stringify({ id: id++, ...req }) + '\n');
    });
  }
  return { ready, run, stop: () => child.kill() };
}

// ---- main ------------------------------------------------------------------
const files = walk(PATTERNS_DIR).sort();
const recipes = files.map(parseRecipe).filter(Boolean);
console.log(`Parsed ${recipes.length} recipes from ${files.length} files`);

const server = startServer();
await server.ready;
console.log('dw-server ready, validating...');

const tmp = mkdtempSync(join(tmpdir(), 'cookbook-'));
const passed = [];
const failed = [];

for (const r of recipes) {
  let payloadPath = '';
  if (r.input) {
    payloadPath = join(tmp, `${r.id}.input`);
    wf(payloadPath, r.input);
  }
  const resp = await server.run({
    script: r.script,
    payloadPath,
    payloadMime: r.inputMime || 'application/json',
    namedInputs: [],
    outputMime: r.outputMime || 'application/json',
  });
  if (resp.ok && resp.output && resp.output.trim()) {
    // store the ENGINE's real output as the shown result — guaranteed accurate
    passed.push({ ...r, expectedOutput: resp.output.trim() });
  } else {
    failed.push({ id: r.id, err: (resp.error || 'empty output').split('\n')[0].slice(0, 120) });
  }
}

server.stop();

console.log(`\n✅ ${passed.length} passed   ❌ ${failed.length} failed`);
if (failed.length) {
  console.log('\nFailed recipes (dropped):');
  for (const f of failed) console.log(`  - ${f.id}: ${f.err}`);
}

// ---- emit src/cookbookRecipes.ts ------------------------------------------
const banner = `// AUTO-GENERATED by scripts/buildCookbook.mjs — do not edit by hand.
// Source: shakarbisetty/mulesoft-cookbook (MIT). Each recipe validated through
// the bundled dw-server; only recipes that execute cleanly are included.
// Regenerate: node scripts/buildCookbook.mjs
`;
const body = `export interface Recipe {
  id: string;
  name: string;
  category: string;
  difficulty: string;
  description: string;
  inputMime: string;
  input: string;
  outputMime: string;
  output: string;
  script: string;
}

export const COOKBOOK_RECIPES: Recipe[] = ${JSON.stringify(
  passed.map((r) => ({
    id: r.id, name: r.name, category: r.category, difficulty: r.difficulty,
    description: r.description, inputMime: r.inputMime, input: r.input,
    outputMime: r.outputMime, output: r.expectedOutput, script: r.script,
  })),
  null, 2,
)};
`;
writeFileSync(OUT, banner + '\n' + body);
console.log(`\nWrote ${OUT} (${passed.length} recipes)`);
