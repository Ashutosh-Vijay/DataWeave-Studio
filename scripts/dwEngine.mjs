/**
 * Headless access to the bundled DataWeave engine.
 *
 * The app talks to `dwstudio-server.jar` from Rust (src-tauri/src/dw_server.rs)
 * and from Node (vscode-extension/src/dwHost.ts). This is the third caller: a
 * plain script, so content-generation tooling can run DataWeave without a GUI.
 *
 * It exists because of the rule in project_practice_mode: nothing generated for
 * the practice set is trusted until this engine has executed it — the answers,
 * the hidden cases, and every snippet quoted inside an explanation, including
 * the ones presented as the wrong way to do it.
 *
 * Usage:
 *   import { openEngine } from './dwEngine.mjs';
 *   const dw = await openEngine();
 *   const r = await dw.run(script, { payload: '{"a":1}' });
 *   dw.close();
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Start the JVM and wait for its handshake.
 *
 * Prefers a freshly built jar over the bundled one, the same way
 * scripts/bench-tooling.mjs does — when the engine is being worked on, the
 * bundled copy is a manual `cp` behind (see jar_copy_step).
 */
export async function openEngine({ quiet = false } = {}) {
  const built = 'dw-server/target/dwstudio-server.jar';
  const bundled = 'src-tauri/resources/dw-server/dwstudio-server.jar';
  const jar = existsSync(built) ? built : bundled;
  if (!existsSync(jar)) throw new Error(`no engine jar at ${built} or ${bundled}`);

  // The bundled JRE is the one the app ships, so it is the one the answers get
  // verified against. JAVA_HOME is a fallback for a checkout without resources.
  const bundledJava = 'src-tauri/resources/jre/bin/java.exe';
  const java = existsSync(bundledJava)
    ? bundledJava
    : process.env.JAVA_HOME
      ? join(process.env.JAVA_HOME, 'bin', 'java')
      : 'java';
  if (!quiet) console.log(`engine: ${jar}\njava:   ${java}\n`);

  const proc = spawn(
    java,
    ['-Xmx512m', '-Xss2m', '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8',
     '-Dsun.stdout.encoding=UTF-8', '-jar', jar],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );

  let stderrTail = '';
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (c) => { stderrTail = (stderrTail + c).slice(-4000); });

  const pending = new Map();
  let resolveReady, rejectReady;
  const readyP = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });

  createInterface({ input: proc.stdout }).on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.event === 'ready') { resolveReady(msg); return; }
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  });

  proc.on('exit', (code) => {
    const err = new Error(`engine exited (${code})\n${stderrTail.trim()}`);
    rejectReady(err);
    for (const p of pending.values()) p({ ok: false, error: err.message, output: '' });
    pending.clear();
  });

  const hello = await Promise.race([
    readyP,
    new Promise((_, rej) => setTimeout(() => rej(new Error('engine did not start in 90s')), 90000)),
  ]);

  const dir = mkdtempSync(join(tmpdir(), 'dwrun-'));
  let nextId = 1;
  const send = (req) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    proc.stdin.write(JSON.stringify({ id, ...req }) + '\n');
  });

  return {
    version: hello.weaveVersion ?? hello.version,

    /**
     * Execute a script. Returns `{ ok, output, error, ms }` — `error` is the
     * engine's own message, which is the only verdict that counts.
     *
     * The payload goes through a file because that is what the server's run op
     * takes (`payloadPath`); the inline `payload` field is tooling-only.
     */
    async run(script, opts = {}) {
      const payloadPath = join(dir, 'payload');
      writeFileSync(payloadPath, opts.payload ?? '{}', 'utf8');
      const attributesPath = join(dir, 'attributes.json');
      writeFileSync(attributesPath, opts.attributes ?? '{}', 'utf8');
      const varsPath = join(dir, 'vars.json');
      writeFileSync(varsPath, opts.vars ?? '{}', 'utf8');

      const res = await send({
        script,
        payloadPath,
        payloadMime: opts.payloadMime ?? 'application/json',
        attributesPath,
        varsPath,
        namedInputs: opts.namedInputs ?? [],
        outputMime: opts.outputMime ?? 'application/json',
        modules: opts.modules,
        languageLevel: opts.languageLevel,
        trace: opts.trace,
        valueTrace: opts.valueTrace,
      });
      return {
        ok: !!res.ok && !res.error,
        output: res.output ?? '',
        error: res.error ?? null,
        ms: res.executionTimeMs ?? 0,
        logs: res.logs,
        /** One row per source expression when `valueTrace` was set. */
        trace: res.trace,
      };
    },

    /**
     * Ask the engine's IDE language service (`op=tooling`) — the same call the
     * editor makes for hovers, completion and the live squiggles. Answers come
     * back under `result` rather than `output`.
     */
    async tooling(kind, script, opts = {}) {
      const res = await send({
        op: 'tooling',
        kind,
        script,
        offset: opts.offset ?? 0,
        payload: opts.payload,
        languageLevel: opts.languageLevel,
        payloadPath: '',
        payloadMime: opts.payloadMime ?? 'application/json',
        namedInputs: [],
        outputMime: 'application/json',
      });
      return { ok: !!res.ok && !res.error, result: res.result, error: res.error ?? null };
    },

    close() {
      try { proc.kill(); } catch { /* already gone */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
    },
  };
}
