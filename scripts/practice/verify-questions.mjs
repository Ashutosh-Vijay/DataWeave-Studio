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
import { gradeSubmission, outputsMatch, soundChoice } from '../../src/practiceGrading.ts';

/** Hand-written first, then the ones derived from them by derive.mjs. */
const DIRS = ['scripts/practice/questions', 'scripts/practice/questions-derived'];
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
    // A bare mention counts as a claim only when the backticks hold that name
    // and nothing else — `groupBy` is a claim about a function, but writing
    // `(value, key, index)` to describe an argument list is not, even though
    // `index`, `type`, `now`, `min` and `max` are all real function names. The
    // looser rule forced authors into awkward paraphrases to appease the gate.
    const bare = span.trim();
    if (FUNCTIONS.has(bare)) found.add(bare);
  }
  return found;
}

const wanted = process.argv.slice(2);
const files = DIRS.flatMap((dir) => {
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return []; // questions-derived is generated, so it may not exist yet
  }
  return names
    .filter((f) => f.endsWith('.json'))
    // `_`-prefixed files are scratch and stay out of a full run — but an id
    // asked for by name is always honoured, or the selftest's own temporary
    // question gets skipped and the gate silently verifies nothing. It did.
    .filter((f) => (wanted.length ? wanted.includes(f.replace('.json', '')) : !f.startsWith('_')))
    .map((f) => join(dir, f));
});

const dw = await openEngine();
let failures = 0;

for (const file of files) {
  const q = JSON.parse(readFileSync(file, 'utf8'));
  const mode = q.mode ?? 'build';
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

  // A multiple-choice question is checked by running EVERY option and proving
  // that exactly one of them satisfies the stem — and that it is the one the
  // key names. This is the whole reason the format is trustworthy here: a
  // distractor that accidentally also works, or a key that disagrees with the
  // engine, is caught mechanically rather than believed.
  if (mode === 'choice') {
    const c = q.choice;
    const satisfies = [];
    for (const opt of c.options) {
      if (c.kind === 'which-output') {
        // Options are outputs; the script is fixed. Run it once, outside the
        // loop conceptually, but the cost is trivial and this keeps it simple.
        const r = await dw.run(q.given.script, {
          payload: q.given.payload ?? '{}',
          payloadMime: q.inputMime ?? 'application/json',
          outputMime: q.outputMime ?? 'application/json',
        });
        satisfies.push(r.ok && outputsMatch(r.output, opt, q.compare ?? 'json'));
      } else {
        const r = await dw.run(opt, {
          payload: c.payload ?? '{}',
          payloadMime: q.inputMime ?? 'application/json',
          outputMime: q.outputMime ?? 'application/json',
        });
        satisfies.push(
          c.kind === 'which-fails' ? !r.ok : r.ok && outputsMatch(r.output, c.target ?? '', q.compare ?? 'json'),
        );
      }
    }
    const verdict = soundChoice(satisfies, c.answer);
    if (!verdict.ok) problems.push(`choice unsound — ${verdict.why}`);
    else console.log(`   choice       ${c.options.length} options run, ${verdict.why}`);

    if (problems.length) {
      failures += problems.length;
      for (const p of problems) console.log(`   ✗ ${p}`);
    }
    continue;
  }

  // A predict question has no cases: it is graded against whatever the engine
  // returns at the moment you answer, so what must be true here is only that
  // the script it asks you to read actually runs.
  if (mode === 'predict') {
    const r = await dw.run(q.given.script, {
      payload: q.given.payload ?? '{}',
      payloadMime: q.inputMime ?? 'application/json',
      outputMime: q.outputMime ?? 'application/json',
    });
    if (!r.ok) problems.push(`the script it asks you to read does not run: ${r.error.split('\n')[0]}`);
    else if (!r.output.trim()) problems.push('the script it asks you to read returns nothing');
    else console.log(`   given        runs, returns ${norm(r.output).slice(0, 55)} (${r.ms}ms)`);

    if (problems.length) {
      failures += problems.length;
      for (const p of problems) console.log(`   ✗ ${p}`);
    }
    continue;
  }

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
  // Scanned field by field, with fenced blocks stripped first. Joining the
  // fields let an odd backtick in one pair with one in the next, and a ```
  // fence threw the pairing off for everything after it — which flagged
  // ordinary words like "every" and "contains" as undemonstrated functions.
  const proseFields = [
    q.prompt,
    q.basics ?? '',
    ...(q.hints ?? []),
    q.explanation?.approach ?? '',
    ...(q.explanation?.snippets ?? []).map((s) => s.note ?? ''),
  ].map((t) => String(t ?? '').replace(/```[\s\S]*?```/g, ' '));
  const named = new Set();
  for (const field of proseFields) for (const n of namesInProse(field)) named.add(n);
  const unproven = [...named].filter(
    (n) => !new RegExp(`(?<![\\w$])${n.replace(/[:$]/g, '\\$&')}(?![\\w$])`).test(executed),
  );
  if (unproven.length) problems.push(`named in prose but never executed: ${unproven.join(', ')}`);
  else console.log(`   prose        every name it uses appears in a snippet that ran`);

  // Not a failure: the first 40 were written before `basics` existed, and
  // retrofitting them is a separate job from writing the next ones. New
  // questions are expected to have one — see the README.
  if (!q.basics) console.log(`   note         no "basics" primer — fine for the original set, expected on new ones`);

  if (problems.length) {
    failures += problems.length;
    for (const p of problems) console.log(`   ✗ ${p}`);
  }
}

console.log(`\n${files.length} question(s), ${failures} problem(s).`);
dw.close();
process.exitCode = failures ? 1 : 0;
