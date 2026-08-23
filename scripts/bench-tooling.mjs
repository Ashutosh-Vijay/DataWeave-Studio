/**
 * Spike harness for the engine's IDE language service (`op=tooling`).
 *
 * The whole question is latency: completions fire on every keystroke, so a
 * stdio round-trip has to beat the instant local list we already show. Anything
 * much over ~50ms and the design changes — warm document + debounce + static
 * fallback, rather than a call per keystroke.
 *
 * Run: node scripts/bench-tooling.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const JAR = 'src-tauri/resources/dw-server/dwstudio-server.jar';
const BUILT = 'dw-server/target/dwstudio-server.jar';
const jar = existsSync(BUILT) ? BUILT : JAR;
if (!existsSync(jar)) { console.error('no jar at', jar); process.exit(1); }
console.log('jar:', jar, '\n');

const java = process.env.JAVA_HOME ? `${process.env.JAVA_HOME}/bin/java` : 'java';
const proc = spawn(java, [
  '-Xmx512m', '-Xss2m',
  '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8',
  '-jar', jar,
], { stdio: ['pipe', 'pipe', 'inherit'] });

const rl = createInterface({ input: proc.stdout });
const pending = new Map();
let ready;
const readyP = new Promise((r) => { ready = r; });

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.event === 'ready') return ready();
  const p = pending.get(msg.id);
  if (p) { pending.delete(msg.id); p(msg); }
});

let nextId = 1;
function send(req) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    proc.stdin.write(JSON.stringify({ id, ...req }) + '\n');
  });
}

// A script with a realistic payload shape, so completion has something to infer.
const script = `%dw 2.0
output application/json
---
{
  id: payload.orderId,
  total: payload.items reduce ((item, acc = 0) -> acc + item.price),
  who: upper(payload.customer.name)
}`;

// Offsets chosen to hit the interesting cases.
// The sample the user would actually have loaded — this is what gives the
// service a type to complete against.
const payload = JSON.stringify({
  orderId: 'A-1', customer: { name: 'ada', tier: 'gold', since: 2019 },
  items: [{ sku: 'X1', price: 9.99, qty: 2 }], paid: true,
});

const at = (needle, extra = 0) => script.indexOf(needle) + needle.length + extra;

const cases = [
  ['completion', at('payload.'), 'after `payload.`'],
  ['completion', at('item.'), 'after `item.` inside a lambda'],
  ['completion', at('upper('), 'inside a function call'],
  ['hover', at('reduce') - 3, 'on `reduce`'],
  ['signature', at('upper(') , 'inside upper(...)'],
  ['typeOf', at('payload.orderId') - 2, 'type of payload.orderId'],
  ['typeCheck', 0, 'whole-document type check'],
  ['definition', at('payload.orderId') - 2, 'definition of the selector'],
];

await readyP;
console.log('engine ready\n');

// One warm-up per kind — first call pays classloading, which is not the number
// that matters for a keystroke.
for (const [kind] of cases) await send({ op: 'tooling', kind, script, payload, offset: 10 });

const REPS = 12;
console.log('kind        n   min    p50    p95    max   sample');
console.log('─'.repeat(72));

let worstP95 = 0;
for (const [kind, offset, label] of cases) {
  const times = [];
  let last;
  for (let i = 0; i < REPS; i++) {
    const t0 = performance.now();
    last = await send({ op: 'tooling', kind, script, payload, offset });
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const q = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))];
  worstP95 = Math.max(worstP95, q(0.95));

  const r = last.result || {};
  let sample = last.ok ? '' : `ERROR ${last.error}`;
  if (last.ok) {
    if (kind === 'completion') sample = `${(r.items || []).length} items` +
      (r.items?.length ? ` — ${r.items.slice(0, 4).map((i) => i.label).join(', ')}` : '');
    else if (kind === 'hover') sample = r.type ?? 'none';
    else if (kind === 'signature') sample = r.name ? `${r.name} arg#${r.activeParameter}` : 'none';
    else if (kind === 'typeOf') sample = r.type ?? 'none';
    else if (kind === 'typeCheck') sample = `${(r.messages || []).length} messages`;
    else if (kind === 'definition') sample = `${(r.links || []).length} links`;
  }
  console.log(
    `${kind.padEnd(11)} ${REPS}  ${q(0).toFixed(1).padStart(5)}  ${q(0.5).toFixed(1).padStart(5)}` +
    `  ${q(0.95).toFixed(1).padStart(5)}  ${times.at(-1).toFixed(1).padStart(5)}   ${label}\n` +
    ` `.repeat(38) + `→ ${sample}`,
  );
}

console.log('\n' + '─'.repeat(72));
console.log(
  worstP95 < 50
    ? `VERDICT: worst p95 ${worstP95.toFixed(1)}ms — fast enough to call per keystroke (debounced).`
    : `VERDICT: worst p95 ${worstP95.toFixed(1)}ms — too slow for a naive call-per-keystroke.\n` +
      `         Needs a warm document, debounce, and the static list as an instant fallback.`,
);

proc.stdin.end();
proc.kill();
