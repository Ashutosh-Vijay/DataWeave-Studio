/** Round two: the claims round one left unsettled, plus candidates for the hard tiers. */
import { openEngine } from '../dwEngine.mjs';

const dw = await openEngine();
const H = '%dw 2.0\noutput application/json\n---\n';

const CHECKS = [
  // Round one used 2027-01-01 and saw no difference. Week-year only diverges
  // when Jan 1 falls inside the previous ISO week, so pick dates where it does.
  ['yyyy/YYYY 2022-01-01 (Sat)', H +
    '{ y: |2022-01-01| as String {format: "yyyy"}, Y: |2022-01-01| as String {format: "YYYY"} }', '{}'],
  ['yyyy/YYYY 2021-01-01 (Fri)', H +
    '{ y: |2021-01-01| as String {format: "yyyy"}, Y: |2021-01-01| as String {format: "YYYY"} }', '{}'],
  ['yyyy/YYYY 2026-12-31', H +
    '{ y: |2026-12-31| as String {format: "yyyy"}, Y: |2026-12-31| as String {format: "YYYY"} }', '{}'],
  ['DD vs dd (day-of-year)', H +
    '{ d: |2027-03-05| as String {format: "dd"}, D: |2027-03-05| as String {format: "DD"} }', '{}'],
  ['mm vs MM (minutes vs month)', H +
    '{ MM: |2027-03-05| as String {format: "MM"}, mm: |2027-03-05T10:07:00Z| as String {format: "mm"} }', '{}'],

  ['orderBy is ascending + stable', H + '[3,1,2] orderBy $', '{}'],
  ['orderBy descending idiom', H + '([3,1,2] orderBy $) [-1 to 0]', '{}'],
  ['orderBy on mixed types', H + '[3,"1",2] orderBy $', '{}'],
  ['distinctBy keeps the first', H + '[{a:1,t:"x"},{a:1,t:"y"}] distinctBy $.a', '{}'],

  ['pluck gives an array', H + 'payload pluck ((v, k, i) -> { k: k as String, v: v, i: i })', '{"a":1,"b":2}'],
  ['mapObject arg order', H + 'payload mapObject ((v, k, i) -> { (k): [v, i] })', '{"a":"A","b":"B"}'],
  ['filterObject', H + 'payload filterObject ((v, k) -> v > 1)', '{"a":1,"b":2}'],

  ['leftJoin needs an import', H + 'leftJoin([{id:1}], [{id:1,n:"x"}], (l) -> l.id, (r) -> r.id)', '{}'],
  ['leftJoin from dw::core::Arrays', '%dw 2.0\nimport * from dw::core::Arrays\noutput application/json\n---\n' +
    'leftJoin([{id:1},{id:2}], [{id:1,n:"x"}], (l) -> l.id as String, (r) -> r.id as String)', '{}'],
  ['dw::util::Tree mapLeafValues', '%dw 2.0\nimport * from dw::util::Tree\noutput application/json\n---\n' +
    'mapLeafValues(payload, (value, path) -> upper(value as String))', '{"a":{"b":"x"},"c":["y"]}'],
  ['dw::util::Values', '%dw 2.0\nimport * from dw::util::Values\noutput application/json\n---\n' +
    'payload update ["a"] with 9', '{"a":1}'],

  ['recursive fun, no return type', '%dw 2.0\noutput application/json\nfun depth(v) = if (v is Array) 1 + max(v map depth($)) else 0\n---\ndepth(payload)', '[[1,[2]]]'],
  ['do block with scoped vars', H + 'do { var n = 2 --- payload.x * n }', '{"x":21}'],
  ['match on type', H + 'payload.v match { case s is String -> "str" case n is Number -> "num" else -> "other" }', '{"v":"a"}'],
  ['match falls through in order', H + 'payload.v match { case n is Number -> "num" case a if (a > 0) -> "pos" else -> "other" }', '{"v":5}'],

  ['big decimal precision', H + '{ a: 0.1 + 0.2, b: (0.1 + 0.2) == 0.3 }', '{}'],
  ['integer division', H + '{ a: 7 / 2, b: (7 / 2) as Number {format: "#"} }', '{}'],
  ['scientific notation input', H + 'payload.n + 1', '{"n":1e3}'],

  ['key order is preserved', H + '{ z: 1, a: 2, m: 3 }', '{}'],
  ['written key order from payload', H + 'payload', '{"z":1,"a":2}'],
  ['string index / slicing', H + '{ a: "hello"[0], b: "hello"[1 to 3] }', '{}'],
  ['++ on strings vs arrays', H + '{ s: "a" ++ "b", arr: [1] ++ [2], mixed: [1] ++ 2 }', '{}'],
  ['-- removes by value', H + '[1,2,3] -- [2]', '{}'],
  ['object -- removes by key', H + '{a:1,b:2} -- ["a"]', '{}'],
];

for (const [label, script, payload, payloadMime] of CHECKS) {
  const r = await dw.run(script, { payload, payloadMime });
  const said = r.ok
    ? r.output.replace(/\s+/g, ' ').trim()
    : 'ERROR ' + r.error.split('\n')[0].slice(0, 110);
  console.log(`${r.ok ? '  ' : '! '}${label.padEnd(30)} ${said}`);
}
dw.close();
