/**
 * The gate for DataWeave Academy's Chapter 0. Run: npm run academy:verify
 *
 * For every lesson:
 *  1. Every example runs on the bundled engine and produces exactly the output
 *     the lesson shows (or fails, when the lesson says it fails).
 *  2. Every build check: the solution passes every case, the starter fails at
 *     least one (so the check asks for something), and every `mustFail` fails.
 *  3. Choice checks have exactly one right answer, and every option says why.
 *  4. Prose: no em dashes, and any snippet shown as `code` that is a whole
 *     script is one of the examples that ran.
 *
 * Only when all of that passes does it write src/academy/chapter0.json.
 * The grader is the app's own (src/practiceGrading.ts), so what is checked on
 * the way in is what grades the learner on the way out.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { openEngine } from '../dwEngine.mjs';
import { outputsMatch } from '../../src/practiceGrading.ts';
import { lessons, terms } from './chapter0.mjs';

// The app rewrites p('key') to the Config value before a run
// (convertAllPropertyCalls + substitution); this does the same for the gate.
const withProps = (script, config) => !config ? script
  : script.replace(/p\('([^']+)'\)/g, (_, k) => {
    if (!(k in config)) throw new Error(`property ${k} not in config`);
    return JSON.stringify(config[k]);
  });

const dw = await openEngine({ quiet: true });
const run = (script, o = {}) => dw.run(withProps(script, o.config), {
  payload: o.payload ?? '{}',
  payloadMime: o.payloadMime ?? 'application/json',
  attributes: o.attributes,
  vars: o.vars,
  outputMime: o.outputMime ?? 'application/json',
});

let failures = 0;
const fail = (where, msg) => { failures++; console.log(`  ✗ ${where}: ${msg}`); };
const allText = (l) => JSON.stringify([l.body, l.check]);

for (const l of lessons) {
  console.log(`${l.id} ${l.title}`);

  // 4. prose
  if (/—/.test(allText(l))) fail(l.id, 'contains an em dash');
  for (const [, t] of allText(l).matchAll(/(?<![*\w])\*([A-Za-z][\w ]*)\*(?!\*)/g)) {
    if (!(t in terms) && t.split(' ').length > 1) fail(l.id, `"*${t}*" looks like a term but has no definition`);
  }

  // A code block in the reading must be part of a script that runs here.
  for (const b of l.body.filter((x) => x.code)) {
    if (!(l.examples ?? []).some((ex) => ex.script.includes(b.code))) fail(l.id, `code block is not part of any verified example: ${b.code.split('\n')[0]}`);
  }

  // 1. examples
  for (const [i, ex] of (l.examples ?? []).entries()) {
    const where = `${l.id} example ${i + 1} (${ex.label})`;
    const r = await run(ex.script, ex);
    if (ex.fails) {
      if (r.ok) fail(where, `the lesson says this fails, but it returned ${r.output}`);
      else console.log(`  ✓ ${ex.label} fails as shown: ${String(r.error).split('\n')[0].slice(0, 90)}`);
      continue;
    }
    if (!r.ok) { fail(where, `engine error: ${String(r.error).split('\n')[0]}`); continue; }
    if (!outputsMatch(r.output, ex.output, ex.compare ?? 'json')) fail(where, `shows\n${ex.output}\n    but the engine returns\n${r.output}`);
    else console.log(`  ✓ ${ex.label}`);
  }

  // 2/3. check
  const c = l.check;
  if (c.kind === 'choice') {
    const right = c.options.filter((o) => o.correct).length;
    if (right !== 1) fail(l.id, `choice has ${right} right answers`);
    if (c.options.some((o) => !o.why)) fail(l.id, 'an option has no explanation');
    else if (right === 1) console.log('  ✓ choice check');
  } else if (c.kind === 'build') {
    const passes = async (script) => {
      for (const k of c.cases) {
        const r = await run(script, { payload: k.input, attributes: k.attributes, outputMime: c.outputMime });
        if (!r.ok || !outputsMatch(r.output, k.output, c.compare ?? 'json')) return { ok: false, got: r.ok ? r.output : r.error };
      }
      return { ok: true };
    };
    const sol = await passes(c.solution);
    if (!sol.ok) fail(`${l.id} check`, `solution fails a case: ${String(sol.got).split('\n').slice(0, 4).join(' ')}`);
    if ((await passes(c.starter)).ok) fail(`${l.id} check`, 'the starter already passes, so the check asks for nothing');
    for (const [i, wrong] of (c.mustFail ?? []).entries()) {
      if ((await passes(wrong)).ok) fail(`${l.id} check`, `wrong answer ${i + 1} passes`);
    }
    if (sol.ok) console.log(`  ✓ build check: solution passes ${c.cases.length} cases; starter${c.mustFail ? ` and ${c.mustFail.length} wrong answers` : ''} rejected`);
  }
}
dw.close();

if (failures) {
  console.log(`\n${failures} problem(s). Nothing written.`);
  process.exit(1);
}
mkdirSync('src/academy', { recursive: true });
writeFileSync('src/academy/chapter0.json', JSON.stringify({ terms, lessons }, null, 2) + '\n');
console.log(`\nAll ${lessons.length} lessons verified. Wrote src/academy/chapter0.json`);
