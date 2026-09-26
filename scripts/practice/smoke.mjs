/** Does the headless harness actually reach the engine? Run: node scripts/practice/smoke.mjs */
import { openEngine } from '../dwEngine.mjs';

const dw = await openEngine();
console.log('engine version:', dw.version);

const cases = [
  ['hello', '%dw 2.0\noutput application/json\n---\n{ hi: upper("there") }', '{}'],
  ['isOdd is in core (no import)', '%dw 2.0\noutput application/json\n---\nisOdd(payload.n)', '{"n":7}'],
  ['isOdd imported from dw::core::Numbers', '%dw 2.0\nimport isOdd from dw::core::Numbers\noutput application/json\n---\nisOdd(payload.n)', '{"n":7}'],
  ['type as a bare key', '%dw 2.0\noutput application/json\n---\n{ type: "Odd" }', '{}'],
  ['mod without parens', '%dw 2.0\noutput application/json\n---\npayload.n mod 2 == 0', '{"n":4}'],
  ['mod with parens', '%dw 2.0\noutput application/json\n---\n(payload.n mod 2) == 0', '{"n":4}'],
];

for (const [name, script, payload] of cases) {
  const r = await dw.run(script, { payload });
  const said = r.ok ? r.output.replace(/\s+/g, ' ').trim() : 'ERROR: ' + r.error.split('\n')[0];
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${String(r.ms).padStart(5)}ms  ${name}\n       ${said}`);
}

dw.close();
