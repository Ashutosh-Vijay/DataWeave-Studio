/**
 * The gate every practice question has to pass before it is allowed to ship.
 *
 * Four checks, and the last two are the ones that exist because of dwcode:
 *
 *  1. The reference solution solves every case.
 *  2. Every `mustFail` entry fails — so the hidden cases actually have teeth
 *     and a hardcoded answer cannot pass.
 *  3. **Every snippet in the explanation is executed**, including the ones
 *     presented as the wrong way, and its real output matches what the
 *     explanation claims. An explanation that teaches a broken alternative is
 *     worse than no explanation.
 *  4. No DataWeave function or module named in prose is absent from the
 *     snippets that ran. That is the rule "no name in prose unless it appeared
 *     in a snippet that ran", enforced rather than promised — it is exactly how
 *     `import isOdd from dw::core::Numbers` would have been caught.
 *
 * Run: npm run practice:verify -- [id ...]
 *
 * It goes through vite-node because the grader it uses is the APP's grader
 * (src/practiceGrading.ts) rather than a second copy: a question is checked on
 * the way in by the same code that grades it on the way out.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { openEngine } from '../dwEngine.mjs';
import { gradeSubmission, outputsMatch } from '../../src/practiceGrading.ts';

const DIR = 'scripts/practice/questions';
const norm = (s) => s.replace(/\s+/g, ' ').trim();

// Known function names, so prose can say "an array" without being accused of
// naming a function. Module paths are matched separately by their `dw::` shape.
const FUNCTIONS = new Set(
  Object.values(JSON.parse(readFileSync('src-tauri/resources/mcp/dw_functions.json', 'utf8')))
    .map((f) => f.name)
    .filter((n) => /^[A-Za-z][\w$]*$/.test(n)),
);

/** Names inside backticks in prose — what the explanation is claiming exists. */
function namesInProse(text) {
  const found = new Set();
  for (const [, span] of text.matchAll(/`([^`]+)`/g)) {
    for (const [, mod] of span.matchAll(/(dw::[\w:]+)/g)) found.add(mod);
    for (const [, id] of span.matchAll(/(?<![\w$.:])([A-Za-z_$][\w$]*)\s*\(/g)) {
      if (FUNCTIONS.has(id)) found.add(id);
    }
    // A bare mention like `groupBy` with no parens still counts as a claim.
    for (const [, id] of span.matchAll(/(?<![\w$.:])([A-Za-z_$][\w$]*)(?![\w$(])/g)) {
      if (FUNCTIONS.has(id)) found.add(id);
    }
  }
  return found;
}

const wanted = process.argv.slice(2);
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .filter((f) => !wanted.length || wanted.includes(f.replace('.json', '')));

const dw = await openEngine();
let failures = 0;

for (const file of files) {
  const q = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  const problems = [];
  console.log(`\n── ${q.id}  [${q.tier}]  ${q.title}`);

  /** Grade a script exactly the way the app grades a learner's submission. */
  const gradeScript = (src) =>
    gradeSubmission(q, (c) =>
      dw.run(src, {
        payload: c.input,
        payloadMime: q.inputMime ?? 'application/json',
        outputMime: q.outputMime ?? 'application/json',
      }),
    );

  // 1. the reference solution
  const ref = await gradeScript(q.solution);
  if (ref.solved) {
    console.log(`   solution     passes ${ref.total}/${ref.total} cases (${ref.ms}ms)`);
  } else {
    problems.push(
      `solution fails case ${ref.failure.index}: ` +
        (ref.failure.error
          ? ref.failure.error.split('\n')[0]
          : `wanted ${norm(ref.failure.want)}, got ${norm(ref.failure.got)}`),
    );
  }

  // 2. the wrong answers must be caught, and by a HIDDEN case where possible
  for (const mf of q.mustFail ?? []) {
    const r = await gradeScript(mf.script);
    if (r.solved) problems.push(`mustFail passed anyway — "${mf.why}"`);
    else console.log(`   mustFail     caught at case ${r.failure.index}${r.failure.hidden ? ' (hidden)' : ''} — ${mf.why}`);
  }

  // 3. every snippet runs, and says what the explanation says it says
  const ran = [];
  for (const s of q.explanation?.snippets ?? []) {
    const r = await dw.run(s.script, {
      payload: s.payload ?? '{}',
      payloadMime: s.payloadMime ?? q.inputMime ?? 'application/json',
      outputMime: s.outputMime ?? q.outputMime ?? 'application/json',
    });
    ran.push(s.script);

    if (s.expect?.error) {
      if (r.ok) problems.push(`snippet "${s.label}" was supposed to fail, but returned ${norm(r.output)}`);
      else console.log(`   snippet      errors as claimed — ${s.label}`);
    } else if (!r.ok) {
      problems.push(`snippet "${s.label}" errored: ${r.error.split('\n')[0]}`);
    // A snippet does not inherit the question's compare mode — the question's
    // mode is about grading a submission, and a snippet is just a claim about
    // what the engine prints. Semantic first, whitespace-insensitive text as a
    // fallback, so a correct claim never fails over indentation.
    } else if (
      !outputsMatch(r.output, s.expect.output, s.compare ?? 'json') &&
      norm(r.output) !== norm(s.expect.output)
    ) {
      problems.push(`snippet "${s.label}" claims ${norm(s.expect.output)} but returns ${norm(r.output)}`);
    } else {
      console.log(`   snippet      verified — ${s.label}`);
    }
  }

  // 4. nothing named in prose that no snippet demonstrated
  const executed = [q.solution, ...ran].join('\n');
  const prose = [
    q.prompt,
    ...(q.hints ?? []),
    q.explanation?.approach ?? '',
    ...(q.explanation?.snippets ?? []).map((s) => s.note ?? ''),
  ].join('\n');
  const unproven = [...namesInProse(prose)].filter(
    (n) => !new RegExp(`(?<![\\w$])${n.replace(/[:$]/g, '\\$&')}(?![\\w$])`).test(executed),
  );
  if (unproven.length) problems.push(`named in prose but never executed: ${unproven.join(', ')}`);
  else console.log(`   prose        every name it uses appears in a snippet that ran`);

  if (problems.length) {
    failures += problems.length;
    for (const p of problems) console.log(`   ✗ ${p}`);
  }
}

console.log(`\n${files.length} question(s), ${failures} problem(s).`);
dw.close();
process.exitCode = failures ? 1 : 0;
