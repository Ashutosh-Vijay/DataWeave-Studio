// Adds the functions that ship in the engine jar but are documented nowhere in
// mulesoft/docs-dataweave, straight into src/dataweaveDocs.ts.
//
//   node scripts/extract-dw-bundled-docs.mjs [jarPath]
//
// Run AFTER extract-dw-docs.mjs — it merges into that file rather than writing
// its own, so the Function Browser, completion and hover all pick these up with
// no consumer changes. Docs-repo entries always win: they are richer, and this
// only fills holes.
//
// The hole is real. `dw::test::Asserts` alone is 25 functions, and the Tests
// view injects `import * from dw::test::Asserts` into every test file we
// generate — so the reference had nothing to say about the assertions Studio
// itself writes for you. The engine's own language service does answer hovers
// for them (it reads the same doc comments at runtime), but the browsable
// reference did not list them at all.
//
// The doc comments in the jar use the same AsciiDoc conventions as the docs
// repo (`=== Parameters`, `=== Example`, `==== Source`, `==== Output`), so the
// parsing here is the same shape as extract-dw-docs.mjs, just reading `/** */`
// blocks out of `.dwl` source instead of `.adoc` pages.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const JAR =
  process.argv[2] ||
  ['src-tauri/resources/dw-server/dwstudio-server.jar', 'dw-server/target/dwstudio-server.jar']
    .map((p) => resolve(p))
    .find(existsSync);

const OUT_FILE = resolve('src/dataweaveDocs.ts');

// Only modules a user would actually reach for. Everything else the jar hides
// under dw/test/internal, plus the three internal dw::Core entries
// (isLegacySizeOfNumber and friends), is deliberately left out — documenting
// them would pad the reference with functions nobody can use.
const MODULES = [
  { file: 'dw/test/Asserts.dwl', label: 'asserts', importPath: 'dw::test::Asserts' },
  { file: 'dw/test/Tests.dwl', label: 'tests', importPath: 'dw::test::Tests' },
  // Note the module is FileSystem, not `file`: `import * from dw::io::file`
  // fails to resolve, which reads as "the file module isn't bundled".
  { file: 'dw/io/file/FileSystem.dwl', label: 'filesystem', importPath: 'dw::io::file::FileSystem' },
  { file: 'ndjson/dataformat/NDJson.dwl', label: 'ndjson', importPath: 'ndjson::dataformat::NDJson' },
  { file: 'protobuf/Any.dwl', label: 'protobuf', importPath: 'protobuf::Any' },
];

function readFromJar(entry) {
  return execFileSync('unzip', ['-p', JAR, entry], { maxBuffer: 1 << 28 }).toString('utf8');
}

/** Strip the ` * ` gutter a DataWeave doc comment is written with. */
function stripGutter(block) {
  return block
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\*ic?\s?/, '').replace(/^\s*\*\s?/, ''))
    .join('\n');
}

/** The prose before the first `===` section — what the function does. */
function descriptionOf(doc) {
  const stop = doc.search(/^===\s/m);
  return (stop < 0 ? doc : doc.slice(0, stop)).trim();
}

/** `=== Example` blocks, each with its `==== Source` and `==== Output` fences. */
function examplesOf(doc) {
  const out = [];
  const sections = doc.split(/^===\s+(?:More\s+)?Examples?\s*$/m).slice(1);
  for (const section of sections) {
    const blocks = [...section.matchAll(/^----\s*$([\s\S]*?)^----\s*$/gm)].map((m) => m[1].trim());
    if (!blocks.length) continue;
    // Source then Output is the convention; a lone block is the source.
    out.push({ source: blocks[0], output: blocks[1] ?? '' });
  }
  return out;
}

/** The declaration up to the `=` that starts the body.
 *
 *  Cutting at the first `=` is wrong — default parameter values have one
 *  (`equalToConfig: {unordered?: Boolean} = {}`) — so take the first one at
 *  paren depth zero that is not part of `==`, `=>`, `>=`, `<=` or `!=`. Angle
 *  brackets are deliberately not tracked: `->` inside a type puts a `>` there
 *  with no `<`, so depth counting on them never balances. */
function signatureOf(line) {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === '=' && depth === 0) {
      const prev = line[i - 1];
      const next = line[i + 1];
      if ('=<>!~'.includes(prev) || next === '=' || next === '>') continue;
      return line.slice(0, i).trim();
    }
  }
  return line.trim();
}

/** Every `/** ... *\/` sitting directly above a `fun` declaration. */
function functionsIn(source, label, importPath) {
  const found = [];
  // Two things this pattern is careful about, both of which produced wrong
  // output before they were handled:
  //
  //  * `*/` must not appear inside the captured body. With a plain lazy `[\s\S]*?`
  //    a comment block that ISN'T followed by a `fun` makes the engine backtrack
  //    and stretch the "doc" across every comment in between — so the module
  //    header ended up documenting the first function in the file.
  //  * Annotation lines sit between the comment and the declaration
  //    (`@RuntimePrivilege(requires = "fs::Read")` above every FileSystem
  //    function), so a run of them is allowed. `@Internal` is excluded on
  //    purpose: it marks the overloads the engine does not intend anyone to call.
  const re = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/[ \t]*\r?\n(?:[ \t]*@(?!Internal)\w+[^\n]*\r?\n)*(fun .*)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const doc = stripGutter(m[1]);
    const decl = signatureOf(m[2]);
    const nameMatch = decl.match(/^fun\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (!nameMatch) continue;
    found.push({
      name: nameMatch[1],
      overload: {
        module: label,
        signature: decl.replace(/^fun\s+/, ''),
        // The import line is the piece a user is missing for these modules —
        // none are in scope by default, and the module path is not guessable
        // from the function name.
        description: `\`import * from ${importPath}\`

${descriptionOf(doc)}`,
        examples: examplesOf(doc).slice(0, 2),
      },
    });
  }
  return found;
}

function main() {
  if (!JAR) {
    console.error('No dwstudio-server.jar found. Build dw-server first, or pass a path.');
    process.exit(1);
  }
  const src = readFileSync(OUT_FILE, 'utf8');
  const start = src.indexOf('{', src.indexOf('DW_FUNCTIONS'));
  const existing = JSON.parse(src.slice(start).replace(/;\s*$/, ''));
  const before = Object.keys(existing).length;

  let added = 0;
  const perModule = {};
  // Names this run created, so a second declaration of the same function adds an
  // overload rather than being dropped — `ls` and `in` each ship several. An
  // entry that came from the docs repo is left alone entirely.
  const ours = new Set();
  for (const mod of MODULES) {
    perModule[mod.label] = 0;
    for (const fn of functionsIn(readFromJar(mod.file), mod.label, mod.importPath)) {
      const key = fn.name.toLowerCase();
      if (existing[key] && !ours.has(key)) continue; // the docs repo said it better
      if (ours.has(key)) {
        existing[key].overloads.push(fn.overload);
      } else {
        existing[key] = { name: fn.name, overloads: [fn.overload] };
        ours.add(key);
      }
      perModule[mod.label]++;
      added++;
    }
  }

  const sorted = {};
  for (const k of Object.keys(existing).sort()) sorted[k] = existing[k];
  const body = JSON.stringify(sorted, null, 2);
  JSON.parse(body); // fail loudly rather than write a broken module

  const head = src.slice(0, start).replace(
    /^\/\/ Re-run scripts\/extract-dw-docs\.mjs to refresh\.$/m,
    '// Re-run scripts/extract-dw-docs.mjs to refresh.\n' +
      '// Modules the docs repo does not cover (asserts, tests, filesystem, ndjson,\n' +
      "// protobuf) come from the engine jar's own doc comments, added by\n" +
      '// scripts/extract-dw-bundled-docs.mjs.',
  );
  writeFileSync(OUT_FILE, head + body + ';\n', 'utf8');

  console.log('---');
  console.log(`Added ${added} overloads from the jar (${before} -> ${Object.keys(sorted).length})`);
  for (const [label, n] of Object.entries(perModule)) console.log(`  ${label.padEnd(12)} ${n}`);
}

main();
