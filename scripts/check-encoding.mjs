/**
 * Regression check for the "Hindi payload comes back as ???" bug.
 *
 * The DW server writes its response with println → System.out, which encodes
 * using the JVM's DEFAULT charset. On Windows that's the OS ANSI codepage, so
 * anything it can't represent (Devanagari, CJK, €) becomes a literal '?' —
 * silent corruption: ok:true, no error, wrong data.
 *
 * The needed flag DIFFERS BY JRE VERSION, which is why this checks both:
 *   Java 17  → System.out follows `file.encoding`
 *   Java 19+ → System.out follows `stdout.encoding`; for a redirected stream it
 *              falls back to the native encoding and ignores file.encoding, so
 *              upgrading the JRE does NOT fix this on its own.
 * Verified: file.encoding alone passes on 17 and corrupts on 21; stdout.encoding
 * alone is the reverse. Hence all three (sun.stdout.encoding = JDK 18 name).
 *
 * Runs against the bundled JRE *and* whatever `java` is on PATH, because the
 * VS Code extension falls back to a system JRE of unknown version.
 *
 *   node scripts/check-encoding.mjs     (exit 0 = pass, 1 = regressed)
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const exe = process.platform === 'win32' ? 'java.exe' : 'java';
const BUNDLED = path.join(ROOT, 'src-tauri', 'resources', 'jre', 'bin', exe);
const JAR = path.join(ROOT, 'src-tauri', 'resources', 'dw-server', 'dwstudio-server.jar');
if (!existsSync(JAR)) {
  console.error(`Server jar missing: ${JAR}`);
  process.exit(1);
}

// Keep in sync with the spawn args in src-tauri/src/dw_server.rs + dwHost.ts.
const ENCODING_FLAGS = ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8'];
const JAVA_ARGS = ['-Xmx512m', '-Xss2m', ...ENCODING_FLAGS, '-jar', JAR];
// Desktop always uses the bundled JRE; the VS Code host may fall back to system java.
const TARGETS = [
  ...(existsSync(BUNDLED) ? [['bundled JRE', BUNDLED]] : []),
  ['system java (VS Code fallback)', 'java'],
];

const CASES = [
  { label: 'Hindi (Devanagari)', text: 'नमस्ते दुनिया' },
  { label: 'Chinese',            text: '你好世界' },
  { label: 'Arabic (RTL)',       text: 'مرحبا بالعالم' },
  { label: 'Symbols / accents',  text: '€ — café “quoted”' },
  { label: 'Emoji (astral)',     text: 'ok 🚀' },
];

const dir = mkdtempSync(path.join(tmpdir(), 'dw-enc-'));
const payloadPath = path.join(dir, 'payload.json');
writeFileSync(payloadPath, JSON.stringify(Object.fromEntries(CASES.map((c, i) => [`f${i}`, c.text]))), 'utf8');

function probe(javaBin) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(javaBin, JAVA_ARGS, { stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      return resolve({ skipped: 'could not spawn' });
    }
    let buf = '';
    let sent = false;
    const finish = (v) => { clearTimeout(timer); try { proc.kill(); } catch { /* already gone */ } resolve(v); };
    const timer = setTimeout(() => finish({ error: 'timed out waiting for the engine' }), 90000);
    proc.on('error', () => finish({ skipped: 'not installed' }));
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      buf += chunk;
      if (!sent && buf.includes('"ready"')) {
        sent = true;
        buf = '';
        proc.stdin.write(JSON.stringify({
          id: 1,
          script: '%dw 2.0\noutput application/json\n---\npayload',
          payloadPath,
          payloadMime: 'application/json',
          outputMime: 'application/json',
        }) + '\n');
        return;
      }
      if (!sent || !buf.includes('\n')) return;
      try {
        const resp = JSON.parse(buf.slice(0, buf.indexOf('\n')));
        finish(resp.ok ? { output: JSON.parse(resp.output) } : { error: resp.error });
      } catch (e) {
        finish({ error: `unparseable response: ${String(e.message).slice(0, 80)}` });
      }
    });
  });
}

let failures = 0;
for (const [label, bin] of TARGETS) {
  const r = await probe(bin);
  console.log(`\n${label}`);
  if (r.skipped) { console.log(`  skipped — ${r.skipped}`); continue; }
  if (r.error) { console.log(`  ERROR — ${r.error}`); failures++; continue; }
  for (const [i, c] of CASES.entries()) {
    const got = r.output[`f${i}`];
    const ok = got === c.text;
    if (!ok) failures++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.label.padEnd(20)} ${ok ? got : `expected ${c.text} — got ${got}`}`);
  }
}

if (failures) {
  console.error(`\n${failures} failure(s) — the engine is not writing UTF-8.`);
  console.error('Check the -D*encoding flags on the java spawns (dw_server.rs, dwHost.ts).');
  process.exit(1);
}
console.log('\nAll non-ASCII round-trips clean on every JRE checked.');
