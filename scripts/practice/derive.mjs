/**
 * New questions from material that is already proven.
 *
 * Writing forty questions took twelve agents and a lot of engine time. But
 * every one of them left behind things that were verified and then used once:
 *
 *  - **`mustFail` scripts** — plausible wrong answers, each already proven to
 *    fail the hidden cases, each with a written reason. That is a `debug`
 *    question with the work already done: put the broken script in the editor
 *    and ask for it to be fixed. The cases and the grading are unchanged.
 *  - **explanation snippets** — each with an exact output this engine produced.
 *    That is a `predict` question: show the script, ask what it returns.
 *
 * Nothing here invents DataWeave. It re-frames code the engine has already
 * ruled on, which is why it can add questions by the hundred without adding
 * any risk of teaching something false.
 *
 * Derived questions are written to `questions-derived/` so they never mix with
 * the hand-authored set, and the whole directory can be regenerated.
 *
 *   node scripts/practice/derive.mjs          # write them
 *   node scripts/practice/derive.mjs --dry    # just report what it would make
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every DataWeave function name, so a derived note can be checked against what
 * its own snippet actually runs.
 */
const FUNCTIONS = new Set(
  Object.values(JSON.parse(readFileSync('src-tauri/resources/mcp/dw_functions.json', 'utf8')))
    .map((f) => f.name)
    .filter((n) => /^[A-Za-z][\w$]*$/.test(n)),
);

/**
 * A snippet's note was written beside its siblings, where other snippets
 * demonstrated the functions it mentions. Pulled out on its own, the note can
 * name things this question never runs — which is exactly what check 4 refuses,
 * and it refused five of these. Drop the note rather than ship a claim the
 * question cannot back up.
 */
function noteSurvivesAlone(note, script) {
  if (!note) return false;
  for (const [, span] of String(note).matchAll(/`([^`]+)`/g)) {
    const bare = span.trim();
    const named = FUNCTIONS.has(bare)
      ? [bare]
      : [...span.matchAll(/(?<![\w$.:])([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]).filter((n) => FUNCTIONS.has(n));
    for (const n of named) {
      if (!new RegExp(`(?<![\w$])${n}(?![\w$])`).test(script)) return false;
    }
  }
  return true;
}

const SRC = 'scripts/practice/questions';
const OUT = 'scripts/practice/questions-derived';
const dry = process.argv.includes('--dry');

/** A wrong answer nobody learns from: it is not a mistake, it is a refusal. */
const BORING = /hardcode|hard-code|hard codes|returns the sample|copies the sample/i;

/**
 * A snippet worth asking about.
 *
 * The bar is "could a competent person get this wrong". A snippet that just
 * shows the answer working teaches nothing as a quiz, and one whose output is
 * enormous is a typing exercise rather than a question.
 */
function worthPredicting(s) {
  if (!s.expect || s.expect.error) return false;          // error-prediction needs its own UI
  const out = String(s.expect.output ?? '').trim();
  if (!out || out.length > 120) return false;             // too long to type honestly
  if (/^(true|false)$/.test(out)) return false;           // a coin flip is not a question
  if (/the answer/i.test(s.label)) return false;          // that is just the solution again

  // The body is what you are actually being asked to read. A snippet that
  // echoes its input — `---\npayload` — is a question with no question in it,
  // and sampling the first run turned up several.
  const body = String(s.script).split('---').slice(1).join('---').trim();
  if (!body || /^payload$/.test(body)) return false;
  // Something has to happen: a call, an operator, a selector or a literal
  // structure being built. A bare name or number is not a puzzle.
  if (!/[(){}[\]]|\s(map|filter|reduce|groupBy|orderBy|pluck|mapObject|update|default|as|match|do|then|\+\+|--)\s|\./.test(body)) {
    return false;
  }
  // An identity transform reads as a trick question and teaches nothing.
  if (s.payload && out.replace(/\s+/g, '') === String(s.payload).replace(/\s+/g, '')) return false;
  return true;
}

// `mcq-*` is excluded deliberately. Deriving from those explanations works and
// would add roughly 150 more questions — but it happened by accident the first
// time the MCQs landed, doubling the set to 567 with nothing judging whether
// the results were worth solving. That should be a decision, not a side effect.
const files = readdirSync(SRC).filter(
  (f) => f.endsWith('.json') && !f.startsWith('_') && !f.startsWith('mcq-'),
);
const debugQs = [];
const predictQs = [];

for (const file of files) {
  const q = JSON.parse(readFileSync(join(SRC, file), 'utf8'));

  // ---- debug: a broken script, the same cases -----------------------------
  for (const [i, mf] of (q.mustFail ?? []).entries()) {
    if (BORING.test(mf.why)) continue;
    debugQs.push({
      id: `${q.id}-debug-${i}`,
      unit: q.unit,
      mode: 'debug',
      tier: q.tier,
      title: `Fix it: ${q.title.toLowerCase()}`,
      topics: q.topics,
      prompt:
        `The script in the editor is **almost** right. It passes on the sample and fails on a case you cannot see.\n\n` +
        `The original task was:\n\n${q.prompt}\n\n` +
        `Find what is wrong and fix it. You can press Run to see what it currently does.`,
      inputMime: q.inputMime,
      outputMime: q.outputMime,
      compare: q.compare,
      // The whole point: you start from the broken code, not a blank page.
      starter: mf.script,
      cases: q.cases,
      hints: [
        'Run it on the sample first. If the sample looks right, the bug only shows on data the sample does not contain.',
        'Ask what kind of input would break this — an empty list, a missing field, a value ordered differently.',
        mf.why,
      ],
      solution: q.solution,
      mustFail: [{ why: 'the unfixed script', script: mf.script }],
      explanation: q.explanation,
      derivedFrom: q.id,
    });
  }

  // ---- predict: read it, say what it returns -------------------------------
  for (const [i, s] of (q.explanation?.snippets ?? []).entries()) {
    if (!worthPredicting(s)) continue;
    predictQs.push({
      id: `${q.id}-predict-${i}`,
      unit: q.unit,
      mode: 'predict',
      // Reading is easier than writing, so a predict question sits one tier
      // below the one it came from — except at the bottom, where there is no
      // lower rung.
      tier: { medium: 'easy', hard: 'medium', extra: 'hard', max: 'extra', ultra: 'max' }[q.tier] ?? q.tier,
      title: s.label,
      topics: q.topics,
      prompt: 'What does this return? Read it — do not run it.',
      inputMime: s.payloadMime ?? q.inputMime,
      outputMime: s.outputMime ?? q.outputMime,
      given: { script: s.script, payload: s.payload },
      // The expected answer is whatever the engine says at grading time, so
      // there is nothing stored here that could drift.
      cases: [],
      solution: s.script,
      // The note appears twice — as the approach and on the snippet itself —
      // and the gate reads both, so blanking only one changed nothing.
      explanation: (() => {
        const keep = noteSurvivesAlone(s.note, s.script);
        return { approach: keep ? s.note : '', snippets: [keep ? s : { ...s, note: '' }] };
      })(),
      derivedFrom: q.id,
    });
  }
}

console.log(`from ${files.length} hand-written questions:`);
console.log(`  ${debugQs.length} debug    (from ${debugQs.length} interesting wrong answers)`);
console.log(`  ${predictQs.length} predict  (from snippets with a verified exact output)`);
console.log(`  ${debugQs.length + predictQs.length} derived, ${files.length + debugQs.length + predictQs.length} total`);

if (dry) process.exit(0);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const q of [...debugQs, ...predictQs]) {
  writeFileSync(join(OUT, `${q.id}.json`), JSON.stringify(q, null, 2) + '\n', 'utf8');
}
console.log(`\nwritten to ${OUT}/ — regenerate any time, it is disposable.`);
