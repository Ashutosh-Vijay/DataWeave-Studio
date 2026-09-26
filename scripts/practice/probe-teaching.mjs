/**
 * What else in the Scala server is worth wiring into practice mode?
 *
 * Two candidates, both already shipped and both unused by anything a learner
 * touches:
 *
 *  - `valueTrace` (Trace.scala) records what EVERY expression evaluated to, one
 *    row per source span. For a wrong answer that is the whole diagnosis — you
 *    can see which link in the chain stopped being what the author thought.
 *  - `typeOf` reports the inferred type at an offset, which is a hint that says
 *    "you are returning an Array where the task wants an Object" without
 *    giving away how to fix it.
 */
import { openEngine } from '../dwEngine.mjs';

const dw = await openEngine({ quiet: true });

// A wrong answer to the grouping question — map where mapObject belongs, and
// a filter that silently matches nothing because the field name is wrong.
const WRONG = `%dw 2.0
output application/json
---
payload filter ($.prioroty == 1) groupBy $.priority`;
const PAYLOAD = '[{"id":"A","priority":1},{"id":"B","priority":2},{"id":"C","priority":1}]';

console.log('=== valueTrace of a wrong answer ===');
const r = await dw.run(WRONG, { payload: PAYLOAD, valueTrace: true });
console.log('output:', r.output.replace(/\s+/g, ' '));
for (const row of r.trace ?? []) {
  console.log(
    `  L${row.line}:${row.column}  ${String(row.kind).padEnd(14)} ${String(row.type).padEnd(16)} ` +
    `${String(row.value).replace(/\s+/g, ' ').slice(0, 60)}   ${row.expression?.replace(/\s+/g, ' ').slice(0, 40) ?? ''}`,
  );
}

console.log('\n=== typeOf at the body, right vs wrong ===');
for (const [label, script] of [
  ['returns an Object (wanted)', '%dw 2.0\noutput application/json\n---\npayload groupBy $.priority mapObject { ($$): sizeOf($) }'],
  ['returns an Array (not wanted)', '%dw 2.0\noutput application/json\n---\npayload groupBy $.priority pluck sizeOf($)'],
  ['returns a String', '%dw 2.0\noutput application/json\n---\n"nope"'],
]) {
  const bodyOffset = script.indexOf('---') + 4;
  const t = await dw.tooling('typeOf', script, { offset: bodyOffset, payload: PAYLOAD });
  console.log(`  ${label.padEnd(30)} ${t.result?.type ?? t.error}`);
}

dw.close();
