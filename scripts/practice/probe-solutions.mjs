/** Pin the exact syntax of the three pilot answers before they get written into question files. */
import { openEngine } from '../dwEngine.mjs';

const dw = await openEngine({ quiet: true });

const CUST = JSON.stringify([
  { name: 'Ada', status: 'active' },
  { name: 'Bo', status: 'inactive' },
  { name: 'Cy' },
]);
const ORDERS = JSON.stringify([
  { id: 'A', priority: 1 }, { id: 'B', priority: 2 }, { id: 'C', priority: 1 },
]);
const SUBS = JSON.stringify([
  { id: 'S1', start: '2027-02-01', end: '2027-03-01' },
  { id: 'S2', start: '2027-01-31', end: '2027-03-15' },
  { id: 'S3', start: '2027-03-01', end: '2027-03-01' },
]);

const TRIES = [
  ['q1 solution', '%dw 2.0\noutput application/json\n---\npayload filter ($.status == "active") map $.name', CUST],
  ['q1 verbose form', '%dw 2.0\noutput application/json\n---\npayload filter ((c) -> c.status == "active") map ((c) -> c.name)', CUST],
  ['q1 the null-emitting mistake', '%dw 2.0\noutput application/json\n---\npayload map (if ($.status == "active") $.name else null)', CUST],
  ['q1 null == "active"', '%dw 2.0\noutput application/json\n---\nnull == "active"', '{}'],

  ['q2 solution ($$ key)', '%dw 2.0\noutput application/json\n---\npayload groupBy $.priority mapObject { ($$): sizeOf($) }', ORDERS],
  ['q2 lambda form', '%dw 2.0\noutput application/json\n---\npayload groupBy $.priority mapObject ((v, k) -> { (k): sizeOf(v) })', ORDERS],
  ['q2 groupBy alone', '%dw 2.0\noutput application/json\n---\npayload groupBy $.priority', ORDERS],
  ['q2 map on the grouped object', '%dw 2.0\noutput application/json\n---\n(payload groupBy $.priority) map sizeOf($)', ORDERS],

  ['q3 solution', '%dw 2.0\noutput application/json\n---\npayload map { id: $.id, days: (($.end as Date) - ($.start as Date)).days }', SUBS],
  ['q3 the between mistake', '%dw 2.0\nimport * from dw::core::Periods\noutput application/json\n---\npayload map { id: $.id, days: between($.end as Date, $.start as Date).days }', SUBS],
  ['q3 without as Date', '%dw 2.0\noutput application/json\n---\npayload map { id: $.id, days: ($.end - $.start).days }', SUBS],
];

for (const [label, script, payload] of TRIES) {
  const r = await dw.run(script, { payload });
  console.log(`${r.ok ? '  ' : '! '}${label.padEnd(30)} ${r.ok ? r.output.replace(/\s+/g, ' ').trim() : 'ERROR ' + r.error.split('\n')[0].slice(0, 95)}`);
}
dw.close();
