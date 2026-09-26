/**
 * One-shot engine CLI, for drafting.
 *
 * Feed it a JSON file holding an array of `{ label, script, payload?,
 * payloadMime?, outputMime? }` and it prints what the engine actually returns
 * for each. One JVM for the whole batch, so ask many things at once.
 *
 *   node scripts/practice/dw.mjs jobs.json
 *
 * This is how a draft gets checked while it is being written. The gate
 * (verify-questions.mjs) is what decides whether it may ship.
 */
import { readFileSync } from 'node:fs';
import { openEngine } from '../dwEngine.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/practice/dw.mjs <jobs.json>');
  process.exit(2);
}

const jobs = JSON.parse(readFileSync(file, 'utf8'));
const dw = await openEngine({ quiet: true });

for (const j of Array.isArray(jobs) ? jobs : [jobs]) {
  const r = await dw.run(j.script, {
    payload: j.payload ?? '{}',
    payloadMime: j.payloadMime ?? 'application/json',
    outputMime: j.outputMime ?? 'application/json',
  });
  console.log(`\n=== ${j.label ?? '(unlabelled)'}`);
  console.log(r.ok ? r.output : 'ERROR: ' + r.error.split('\n').slice(0, 6).join('\n'));
}

dw.close();
