/** The exact script the user asked about, run and type-checked. */
import { openEngine } from '../dwEngine.mjs';

const dw = await openEngine({ quiet: true });

const script = `%dw 2.0
output application/json
---
{
    number: payload.number ++ payload.string
}`;
const payload = `{
  "number": 7
}`;

const r = await dw.run(script, { payload });
console.log('--- RUN ---');
console.log(r.ok ? 'OK\n' + r.output : 'FAILED\n' + r.error);

const tc = await dw.tooling('typeCheck', script, { payload });
console.log('\n--- typeCheck (what the editor squiggles) ---');
const msgs = tc.result?.messages ?? [];
if (!msgs.length) console.log('(nothing)');
for (const m of msgs) console.log(`[${m.severity}/${m.code}] ${m.message}`);

// Neighbours, to see where the boundary is.
for (const [label, s, p] of [
  ['number ++ number', '%dw 2.0\noutput application/json\n---\n{ n: payload.number ++ payload.number }', payload],
  ['string ++ missing', '%dw 2.0\noutput application/json\n---\n{ n: payload.s ++ payload.missing }', '{"s":"a"}'],
  ['missing ++ missing', '%dw 2.0\noutput application/json\n---\n{ n: payload.a ++ payload.b }', '{}'],
  ['number ++ string literal', '%dw 2.0\noutput application/json\n---\n{ n: payload.number ++ "x" }', payload],
  ['coerced', '%dw 2.0\noutput application/json\n---\n{ n: (payload.number as String) ++ (payload.string default "") }', payload],
]) {
  const rr = await dw.run(s, { payload: p });
  console.log(`\n${label.padEnd(24)} ${rr.ok ? rr.output.replace(/\s+/g, ' ') : 'ERROR ' + rr.error.split('\n')[0]}`);
}

dw.close();
