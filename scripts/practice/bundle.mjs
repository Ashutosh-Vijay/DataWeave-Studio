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

const DIRS = ['scripts/practice/questions', 'scripts/practice/questions-derived'];
const OUT = 'src/practiceQuestions.json';
const TIERS = ['easy', 'medium', 'hard', 'extra', 'max', 'ultra'];

const units = new Map(
  JSON.parse(readFileSync('scripts/practice/curriculum.json', 'utf8')).units.map((u) => [u.id, u]),
);

const questions = [];
const problems = [];

const allFiles = DIRS.flatMap((dir) => {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
});

for (const file of allFiles) {
  const q = JSON.parse(readFileSync(file, 'utf8'));

  if (!q.id) problems.push(`${file}: no id`);
  if (!TIERS.includes(q.tier)) problems.push(`${q.id}: unknown tier "${q.tier}"`);
  if (!units.has(q.unit)) problems.push(`${q.id}: unit "${q.unit}" is not in the curriculum`);
  const mode = q.mode ?? 'build';
  if (mode === 'build' || mode === 'debug') {
    if ((q.cases ?? []).length < 2) problems.push(`${q.id}: needs a hidden case, has ${(q.cases ?? []).length}`);
    if (!q.solution) problems.push(`${q.id}: no reference solution`);
  }
  // `given` is what you are asked to read: always for predict, and for the
  // which-output flavour of choice. The other choice kinds put the code in the
  // options themselves, so they have no `given` at all.
  if (mode === 'predict' && !q.given?.script) {
    problems.push(`${q.id}: a predict question needs a script to read`);
  }
  if (mode === 'choice' && q.choice?.kind === 'which-output' && !q.given?.script) {
    problems.push(`${q.id}: a which-output question needs a script to read`);
  }
  if (mode === 'choice') {
    const c = q.choice;
    if (!c || !Array.isArray(c.options) || c.options.length < 3) {
      problems.push(`${q.id}: a choice question needs at least three options`);
    } else if (typeof c.answer !== 'number' || c.answer < 0 || c.answer >= c.options.length) {
      problems.push(`${q.id}: answer ${c.answer} is not one of the options`);
    } else if (new Set(c.options.map((o) => String(o).trim())).size !== c.options.length) {
      // Two identical options make one of them unpickable and the question
      // unfair; the gate would also refuse it, but say so plainly here.
      problems.push(`${q.id}: two options are textually identical`);
    }
  }
  if (questions.some((o) => o.id === q.id)) problems.push(`${q.id}: duplicate id`);

  const { mustFail, ...shipped } = q;
  questions.push(shipped);
}

// Every question gets a title of its own. Two "Fix it" versions of the same
// task are numbered (naming the bug would give away the last hint), and the
// multiple choice questions, which share three stock titles, name their topics.
const debugFamilies = new Map();
for (const q of questions) {
  if (q.mode === 'debug') debugFamilies.set(q.derivedFrom, [...(debugFamilies.get(q.derivedFrom) ?? []), q]);
}
for (const fam of debugFamilies.values()) {
  if (fam.length > 1) fam.forEach((q, i) => (q.title = `${q.title} (bug ${i + 1} of ${fam.length})`));
}
const STOCK = {
  'What does this return?': 'What does it return',
  'Which script produces this output?': 'Which script matches',
  'Which one fails?': 'Which one fails',
};
for (const q of questions) {
  if (q.mode !== 'choice' || !STOCK[q.title]) continue;
  const topics = q.topics ?? [];
  const words = topics.filter((t) => /[a-z]/i.test(t));
  q.title = `${STOCK[q.title]}: ${(words.length ? words : topics).join(', ')}`;
}

// Ship them in teaching order: tier first, then the order the curriculum puts
// the units in, so the list reads as a course rather than an alphabetical dump.
// Within a tier the originals come first and the questions derived from them
// after, dealt out in rounds (every family's first variant, then every
// family's second), so the same scenario doesn't come up several times in a row.
const unitOrder = [...units.keys()];
const round = new Map();
const families = new Map();
for (const q of questions) {
  if (!q.derivedFrom) continue;
  const key = `${q.derivedFrom}|${q.tier}`;
  const n = families.get(key) ?? 0;
  families.set(key, n + 1);
  round.set(q.id, n);
}
questions.sort(
  (a, b) =>
    TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) ||
    Number(!!a.derivedFrom) - Number(!!b.derivedFrom) ||
    (round.get(a.id) ?? 0) - (round.get(b.id) ?? 0) ||
    unitOrder.indexOf(a.unit) - unitOrder.indexOf(b.unit),
);
// Numbered after sorting, so (2) comes before (3) in the list.
const seen = new Map();
for (const q of questions) {
  const n = (seen.get(q.title) ?? 0) + 1;
  seen.set(q.title, n);
  if (n > 1) q.title = `${q.title} (${n})`;
}

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
