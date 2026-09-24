/** How do you actually get a whole number of days out of two dates? Ask the engine. */
import { openEngine } from '../dwEngine.mjs';

const dw = await openEngine({ quiet: true });
const P = '%dw 2.0\nimport * from dw::core::Periods\noutput application/json\n---\n';
const H = '%dw 2.0\noutput application/json\n---\n';

const TRIES = [
  ['raw subtraction', H + '|2027-03-01| - |2027-02-01|'],
  ['subtraction as Number', H + '(|2027-03-01| - |2027-02-01|) as Number'],
  ['period .days selector', H + '(|2027-03-01| - |2027-02-01|).days'],
  ['period .hours selector', H + '(|2027-03-01| - |2027-02-01|).hours'],
  ['between(end, start)', P + 'between(|2027-03-01|, |2027-02-01|)'],
  ['between(...).days', P + 'between(|2027-03-01|, |2027-02-01|).days'],
  ['between over a year', P + 'between(|2028-03-01|, |2027-02-01|)'],
  ['between over a year .days', P + 'between(|2028-03-01|, |2027-02-01|).days'],
  ['typeOf between', P + 'typeOf(between(|2027-03-01|, |2027-02-01|))'],
  ['days() literal', P + 'days(3)'],
  ['as Number of a DateTime', H + '|2027-03-01T00:00:00Z| as Number'],
  ['epoch trick', H + '{ a: |2027-03-01T00:00:00Z| as Number {unit: "seconds"} }'],
  ['epoch difference / 86400', H +
    '((|2027-03-01T00:00:00Z| as Number {unit: "seconds"}) - (|2027-02-01T00:00:00Z| as Number {unit: "seconds"})) / 86400'],
  ['Date as Number seconds', H + '|2027-03-01| as Number {unit: "seconds"}'],
];

for (const [label, script] of TRIES) {
  const r = await dw.run(script);
  console.log(`${r.ok ? '  ' : '! '}${label.padEnd(28)} ${r.ok ? r.output.replace(/\s+/g, ' ').trim() : 'ERROR ' + r.error.split('\n')[0].slice(0, 95)}`);
}
dw.close();
