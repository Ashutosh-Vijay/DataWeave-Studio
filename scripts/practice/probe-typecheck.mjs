/**
 * Is the engine's own diagnosis better than our static error hint?
 *
 * The test case is the one dwcode ships as a published answer: `mod` binding
 * looser than `==`. Our OutputPane matches the RUNTIME message with a regex and
 * prints four generic bullets. The editor already holds something else — the
 * engine's typeCheck messages, which is what the hover shows.
 */
import { openEngine } from '../dwEngine.mjs';

const dw = await openEngine({ quiet: true });

const SCRIPTS = [
  ['dwcode mod precedence', '%dw 2.0\noutput application/json\n---\n{\n  number: payload.number,\n  "type": if (payload.number mod 2 == 0) "Even" else "Odd"\n}', '{"number":7}'],
  ['a genuine null argument', '%dw 2.0\noutput application/json\n---\nupper(payload.missing)', '{}'],
  ['a String where a Number goes', '%dw 2.0\noutput application/json\n---\npayload.n + 1', '{"n":"5"}'],
  ['a runtime-only failure', '%dw 2.0\noutput application/json\n---\npayload.n as Number', '{"n":"abc"}'],
];

for (const [label, script, payload] of SCRIPTS) {
  console.log(`\n=== ${label}`);
  const run = await dw.run(script, { payload });
  console.log(`  RUN  : ${run.ok ? run.output.replace(/\s+/g, ' ') : run.error.split('\n')[0]}`);

  const tc = await dw.tooling('typeCheck', script, { payload });
  const msgs = tc.result?.messages ?? [];
  if (!msgs.length) console.log('  CHECK: (nothing — typeCheck has no opinion)');
  for (const m of msgs) {
    console.log(`  CHECK: [${m.severity}/${m.code}] ${String(m.message).replace(/\s+/g, ' ').slice(0, 200)}`);
  }
}
dw.close();
