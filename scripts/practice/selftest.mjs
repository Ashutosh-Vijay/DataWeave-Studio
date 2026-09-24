/**
 * Does the gate actually bite?
 *
 * A verifier that has only ever printed "ok" is indistinguishable from one that
 * cannot fail. This takes a known-good question, breaks it in each of the four
 * ways the gate is supposed to catch, and asserts each break is reported.
 *
 * Run: npm run practice:selftest
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const GOOD = JSON.parse(readFileSync('scripts/practice/questions/active-customers.json', 'utf8'));
const TMP = 'scripts/practice/questions/_selftest.json';

const BREAKS = [
  ['a solution that does not solve', (q) => {
    q.solution = '%dw 2.0\noutput application/json\n---\npayload map $.name';
  }, /solution fails case/],

  ['hidden cases with no teeth', (q) => {
    q.cases = [q.cases[0]];                       // only the sample remains
    q.mustFail = [{ why: 'hardcoded', script: '%dw 2.0\noutput application/json\n---\n["Ada"]' }];
  }, /mustFail passed anyway/],

  ['a snippet whose claimed output is wrong', (q) => {
    q.explanation.snippets = [{
      label: 'wrong claim', script: '%dw 2.0\noutput application/json\n---\n1 + 1',
      expect: { output: '3' }, note: 'two plus two',
    }];
  }, /claims 3 but returns 2/],

  ['a function named in prose that no snippet ran', (q) => {
    // The exact hallucination from the session that started this: an import
    // that does not exist, asserted in prose and never executed.
    q.explanation.approach += ' You could also reach for `isOdd()` from `dw::core::Numbers` here.';
  }, /named in prose but never executed/],
];

let failed = 0;
for (const [label, mutate, expected] of BREAKS) {
  const q = JSON.parse(JSON.stringify(GOOD));
  q.id = '_selftest';
  mutate(q);
  writeFileSync(TMP, JSON.stringify(q, null, 2), 'utf8');

  let out = '';
  try {
    out = execFileSync('npx', ['vite-node', 'scripts/practice/verify-questions.mjs', '_selftest'], { encoding: 'utf8', shell: true });
  } catch (e) {
    out = (e.stdout ?? '') + (e.stderr ?? '');   // a non-zero exit is the point
  }

  const caught = expected.test(out);
  if (!caught) failed++;
  console.log(`${caught ? 'caught ' : 'MISSED '} ${label}`);
  if (!caught) console.log(out.split('\n').filter((l) => l.includes('✗') || l.includes('problem')).join('\n'));
}

unlinkSync(TMP);
console.log(`\n${BREAKS.length} deliberate breaks, ${failed} slipped through.`);
process.exitCode = failed ? 1 : 0;
