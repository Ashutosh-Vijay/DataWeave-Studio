/**
 * Every "gotcha" a question is built around gets checked here before it is
 * written down. A practice set whose trap is imaginary teaches a fiction, and
 * that is exactly the failure mode we are trying not to repeat.
 *
 * Run: node scripts/practice/verify-traps.mjs
 */
import { openEngine } from '../dwEngine.mjs';

const dw = await openEngine();
const H = '%dw 2.0\noutput application/json\n---\n';

// [label, script, payload, payloadMime, outputMime]
const CHECKS = [
  ['filter on null', H + 'payload.missing filter ($ > 1)', '{}'],
  ['map on null', H + 'payload.missing map ($)', '{}'],
  ['sizeOf on null', H + 'sizeOf(payload.missing)', '{}'],
  ['default on null', H + '{ a: payload.missing default "fallback" }', '{}'],
  ['default on empty string', H + '{ a: payload.s default "fallback" }', '{"s":""}'],
  ['default on false', H + '{ a: payload.b default "fallback" }', '{"b":false}'],

  ['groupBy key type', H + '[1,2,3] groupBy ($ mod 2)', '{}'],
  ['reduce, no seed, empty array', H + '[] reduce ((i, acc) -> acc + i)', '{}'],
  ['reduce, seed, empty array', H + '[] reduce ((i, acc = 0) -> acc + i)', '{}'],

  ['duplicate keys survive', H + '{ a: 1, a: 2 }', '{}'],
  ['duplicate keys after mapObject', H + 'payload mapObject { kind: $ }', '{"x":1,"y":2}'],
  ['flatten is one level', H + 'flatten([[1,[2,3]],[4]])', '{}'],

  ['dot on repeated XML element', '%dw 2.0\noutput application/json\n---\npayload.order.item',
    '<order><item>a</item><item>b</item></order>', 'application/xml'],
  ['star on repeated XML element', '%dw 2.0\noutput application/json\n---\npayload.order.*item',
    '<order><item>a</item><item>b</item></order>', 'application/xml'],
  ['XML attribute selector', '%dw 2.0\noutput application/json\n---\npayload.order.@id',
    '<order id="7"><item>a</item></order>', 'application/xml'],

  ['yyyy vs YYYY on 2027-01-01', H +
    '{ y: |2027-01-01| as String {format: "yyyy"}, Y: |2027-01-01| as String {format: "YYYY"} }', '{}'],
  ['date minus date', H + '{ r: (|2027-03-01| - |2027-02-01|), t: typeOf(|2027-03-01| - |2027-02-01|) }', '{}'],
  ['date plus period', H + '|2027-01-31| + |P1M|', '{}'],

  ['"007" as Number', H + '"007" as Number', '{}'],
  ['"" as Number', H + '"" as Number', '{}'],
  ['"abc" as Number', H + '"abc" as Number', '{}'],
  ['"yes" as Boolean', H + '"yes" as Boolean', '{}'],

  ['null chain .a.b', H + 'payload.a.b', '{"a":null}'],
  ['null chain .a[0]', H + 'payload.a[0]', '{"a":null}'],
  ['index off the end', H + '[1,2,3][9]', '{}'],
  ['negative index', H + '[1,2,3][-1]', '{}'],

  ['update a missing key', H + 'payload update { case .missing -> 99 }', '{"a":1}'],
  ['update an existing key', H + 'payload update { case .a -> 99 }', '{"a":1}'],

  ['object ++ object with overlap', H + '{a: 1} ++ {a: 2, b: 3}', '{}'],
  ['conditional field, false', H + '{ a: 1, (b: 2) if (false) }', '{}'],
  ['CSV values are strings', '%dw 2.0\noutput application/json\n---\npayload map typeOf($.n)',
    'n,s\n1,x\n', 'application/csv'],
];

let bad = 0;
for (const [label, script, payload, payloadMime, outputMime] of CHECKS) {
  const r = await dw.run(script, { payload, payloadMime, outputMime });
  const said = r.ok
    ? r.output.replace(/\s+/g, ' ').trim()
    : 'ERROR ' + r.error.split('\n')[0].slice(0, 110);
  if (!r.ok) bad++;
  console.log(`${r.ok ? '  ' : '! '}${label.padEnd(32)} ${said}`);
}
console.log(`\n${CHECKS.length} checks, ${bad} errored (an error is often the answer here).`);
dw.close();
