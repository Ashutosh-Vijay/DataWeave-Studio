// Smoke test for the upgrade check, end to end without the UI: resolve two
// engine versions with the app's own Maven resolver, then compile a project's
// scripts on each through the engine server's op=engineCheck.
//
//   npx vite-node scripts/upgrade-check-smoke.mjs <projectDir> [from=2.4.0] [to=2.12.4]
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveDependencies } from '../src/maven';
import { findInlineScripts } from '../src/muleInline';

const [proj, from = '2.4.0', to = '2.12.4'] = process.argv.slice(2);
const CENTRAL = 'https://repo1.maven.org/maven2';
const MULE = 'https://repository.mulesoft.org/nexus/content/repositories/releases';
// The resolver asks Central; try MuleSoft's repository first.
const fetchText = async (url) => {
  for (const u of [url.replace(CENTRAL, MULE), url]) {
    const r = await fetch(u);
    if (r.ok) return r.text();
  }
  throw new Error('Not found');
};
const engineJars = async (v) => (await resolveDependencies(fetchText, [
  { g: 'org.mule.weave', a: 'runtime', v }, { g: 'org.mule.weave', a: 'core-modules', v },
])).jars.map(({ g, a, v }) => ({ g, a, v }));

// Every .dwl and inline transform, like the UI's scan.
const items = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (!n.startsWith('.') && n !== 'target') walk(p); } else if (n.endsWith('.dwl')) items.push({ key: p, script: readFileSync(p, 'utf8'), path: p }); else if (n.endsWith('.xml') && p.replace(/\\/g, '/').includes('/src/main/mule/')) for (const s of findInlineScripts(readFileSync(p, 'utf8'))) items.push({ key: `${p}#${s.index} ${s.flow} / ${s.target}`, script: s.text, path: p }); } };
walk(proj);

const proc = spawn('src-tauri/resources/jre/bin/java.exe', ['-Xmx768m', '-jar', 'dw-server/target/dwstudio-server.jar']);
const rl = createInterface({ input: proc.stdout });
const waiters = []; let ready; const readyP = new Promise((r) => (ready = r));
rl.on('line', (l) => { const m = JSON.parse(l); if (m.event === 'ready') return ready(); waiters.shift()?.(m); });
const send = (o) => new Promise((r) => { waiters.push(r); proc.stdin.write(JSON.stringify({ id: 1, payloadPath: '', payloadMime: 'application/json', namedInputs: [], outputMime: 'application/json', ...o }) + '\n'); });
await readyP;

const check = async (v) => {
  const t = Date.now();
  const jars = await engineJars(v);
  const r = await send({ op: 'engineCheck', jars, cacheDir: join(tmpdir(), 'dws-engine-cache'), items });
  console.log(`DW ${v}: ${jars.length} jars, ${Date.now() - t} ms${r.result?.problems?.length ? ', problems: ' + r.result.problems.join('; ') : ''}${r.error ? ', ERROR ' + r.error : ''}`);
  return new Map((r.result?.results ?? []).map((x) => [x.key, x]));
};
const a = await check(from);
const b = await check(to);
for (const it of items) {
  const x = a.get(it.key), y = b.get(it.key);
  const verdict = x?.ok && y?.ok ? 'OK' : x?.ok && !y?.ok ? 'BREAKS' : !x?.ok && y?.ok ? 'FIXED' : 'FAILS BOTH';
  console.log(verdict.padEnd(10), it.key.split(/[\\/]/).slice(-1)[0], y && !y.ok ? `| ${to}: ${y.error} (line ${y.line ?? '?'})` : '', x && !x.ok ? `| ${from}: ${x.error}` : '');
}
proc.kill();
process.exit(0);
