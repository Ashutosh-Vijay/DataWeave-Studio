/**
 * Turn the authored questions into the one file the app ships.
 *
 * Authoring keeps one file per question (a swarm writes them in parallel);
 * the app wants a single import. `mustFail` does not travel — it is a property
 * of the gate, not of the question.
 *
 * The hidden cases and the reference solution DO travel, because the app is
 * offline and there is nowhere else to put them. Anyone determined can read the
 * bundle, which is true of every offline puzzle ever shipped and is not worth
 * obfuscating.
 *
 * Run: node scripts/practice/bundle.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'scripts/practice/questions';
const OUT = 'src/practiceQuestions.json';
const TIERS = ['easy', 'medium', 'hard', 'extra', 'max', 'ultra'];

const units = new Map(
  JSON.parse(readFileSync('scripts/practice/curriculum.json', 'utf8')).units.map((u) => [u.id, u]),
);

const questions = [];
const problems = [];

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
  const q = JSON.parse(readFileSync(join(DIR, file), 'utf8'));

  if (!q.id) problems.push(`${file}: no id`);
  if (!TIERS.includes(q.tier)) problems.push(`${q.id}: unknown tier "${q.tier}"`);
  if (!units.has(q.unit)) problems.push(`${q.id}: unit "${q.unit}" is not in the curriculum`);
  if ((q.cases ?? []).length < 2) problems.push(`${q.id}: needs a hidden case, has ${(q.cases ?? []).length}`);
  if (!q.solution) problems.push(`${q.id}: no reference solution`);
  if (questions.some((o) => o.id === q.id)) problems.push(`${q.id}: duplicate id`);

  const { mustFail, ...shipped } = q;
  questions.push(shipped);
}

// Ship them in teaching order: tier first, then the order the curriculum puts
// the units in, so the list reads as a course rather than an alphabetical dump.
const unitOrder = [...units.keys()];
questions.sort(
  (a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || unitOrder.indexOf(a.unit) - unitOrder.indexOf(b.unit),
);

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify(questions, null, 2) + '\n', 'utf8');
const byTier = TIERS.map((t) => `${t} ${questions.filter((q) => q.tier === t).length}`).join(', ');
const covered = new Set(questions.map((q) => q.unit));
console.log(`${questions.length} questions -> ${OUT}`);
console.log(`  ${byTier}`);
console.log(`  ${covered.size}/${units.size} curriculum units covered`);
const missing = unitOrder.filter((u) => !covered.has(u));
if (missing.length) console.log(`  not yet written: ${missing.join(', ')}`);
