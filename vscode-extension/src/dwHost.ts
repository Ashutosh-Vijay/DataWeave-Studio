/**
 * Node port of the desktop app's DataWeave backend (src-tauri/src/dw_server.rs
 * + dw_runner.rs). Spawns the bundled `dwstudio-server.jar` once, keeps it warm,
 * and speaks newline-delimited JSON over stdin/stdout. Each `run_dataweave`
 * builds the merged script + temp files the same way the Rust side does, so a
 * script behaves identically in the extension and the desktop app.
 */

import { spawn, execFile, ChildProcessByStdio } from 'child_process';
import { Writable, Readable } from 'stream';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// --- Java + jar resolution --------------------------------------------------

/** Every `java` we're willing to run, best first.
 *
 *  Bundled-first is deliberate and matches the desktop (see dw_server.rs): this
 *  audience (banks / MuleSoft shops) is often locked to Java 8 for Anypoint
 *  Studio, but DataWeave 2.12 needs Java 11+. Shipping our own Java 17 — invoked
 *  by absolute path, never touching JAVA_HOME/PATH — guarantees the right
 *  version without disturbing their setup, and works offline (air-gapped nets).
 *
 *  The rest of the list is NOT just a dev/sideload convenience. Application
 *  allowlisting (ManageEngine, Ivanti, AppLocker, Carbon Black) routinely blocks
 *  an unsigned java.exe that appeared inside a user-writable extensions folder,
 *  while a system JDK installed by IT is already allowlisted. When that happens
 *  the bundled JRE exists on disk and still cannot execute — so existsSync is
 *  the wrong test, and `pickJava` actually runs each one. */
export function javaCandidates(extensionRoot: string): string[] {
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  const out = [path.join(extensionRoot, 'resources', 'jre', 'bin', exe)];
  if (process.env.JAVA_HOME) out.push(path.join(process.env.JAVA_HOME, 'bin', exe));
  out.push('java'); // whatever is on PATH
  return out.filter((p, i) => out.indexOf(p) === i);
}

/** Back-compat shape for callers that just want a path (jarStore's javac pairing). */
export function resolveJava(extensionRoot: string): string {
  const c = javaCandidates(extensionRoot);
  return c.find((p) => path.isAbsolute(p) && fs.existsSync(p)) ?? 'java';
}

export interface JavaProbe {
  bin: string;
  /** Major version, or null when the binary would not run at all. */
  major: number | null;
  /** Why it didn't run — spawn errno, or the tail of what it printed. */
  error?: string;
}

/** Run `java -version` and report what happened.
 *  `java -version` prints to stderr, e.g. `openjdk version "17.0.1"` or the old
 *  `"1.8.0_xxx"` form (→ 8). DataWeave 2.12 needs Java 11+. */
export function probeJava(javaBin: string): Promise<JavaProbe> {
  return new Promise((resolve) => {
    if (path.isAbsolute(javaBin) && !fs.existsSync(javaBin)) {
      return resolve({ bin: javaBin, major: null, error: 'not present' });
    }
    execFile(javaBin, ['-version'], { windowsHide: true, timeout: 20000 }, (err, _stdout, stderr) => {
      const text = String(stderr || '').trim();
      if (err) {
        const code = (err as NodeJS.ErrnoException).code;
        return resolve({
          bin: javaBin,
          major: null,
          error: code ? `${code}${text ? ` — ${text.split('\n')[0]}` : ''}` : text || String(err),
        });
      }
      const m = text.match(/version "(\d+)(?:\.(\d+))?/);
      if (!m) return resolve({ bin: javaBin, major: null, error: text || 'no version in output' });
      let major = parseInt(m[1], 10);
      if (major === 1 && m[2]) major = parseInt(m[2], 10); // 1.8 -> 8
      resolve({ bin: javaBin, major: Number.isFinite(major) ? major : null });
    });
  });
}

/** Legacy single-binary probe, kept for callers that only want the number. */
export async function detectJavaMajor(javaBin: string): Promise<number | null> {
  return (await probeJava(javaBin)).major;
}

/** First candidate that actually runs and is new enough, plus the full trail.
 *  The trail is what makes a blocked-JRE report actionable — it names each
 *  binary tried and exactly why it was rejected. */
export async function pickJava(
  extensionRoot: string,
): Promise<{ bin: string | null; major: number | null; tried: JavaProbe[] }> {
  const tried: JavaProbe[] = [];
  for (const cand of javaCandidates(extensionRoot)) {
    const probe = await probeJava(cand);
    tried.push(probe);
    if (probe.major !== null && probe.major >= 11) return { bin: cand, major: probe.major, tried };
  }
  const usable = tried.find((t) => t.major !== null);
  return { bin: null, major: usable?.major ?? null, tried };
}

/** Turn a failed `pickJava` into something a user can hand to their IT desk. */
export function javaFailureMessage(tried: JavaProbe[]): string {
  const tooOld = tried.find((t) => t.major !== null && t.major < 11);
  if (tooOld) {
    return `Found Java ${tooOld.major} at ${tooOld.bin}, but DataWeave 2.12 needs Java 11 or newer.`;
  }
  const bundled = tried[0];
  const lines = tried.map((t) => `  • ${t.bin} — ${t.error ?? 'unusable'}`);
  const blocked =
    bundled && bundled.error && /EPERM|EACCES|denied|blocked|virus|policy|ENOEXEC/i.test(bundled.error);
  return (
    `DataWeave Studio could not start its Java runtime.\n\n` +
    `Tried:\n${lines.join('\n')}\n\n` +
    (blocked || (bundled && bundled.error !== 'not present')
      ? `The bundled runtime is present but would not execute. Endpoint security ` +
        `(ManageEngine, Ivanti, AppLocker, Carbon Black and similar) commonly blocks an ` +
        `unsigned java.exe running from an extensions folder. Ask IT to allowlist:\n\n` +
        `  ${bundled.bin}\n\n` +
        `Alternatively, install a Java 17 JDK system-wide and set JAVA_HOME — a JDK ` +
        `installed by IT is usually already permitted, and the extension will use it.`
      : `Install a Java 17 JDK and set JAVA_HOME, or reinstall the extension.`)
  );
}

/** Find dwstudio-server.jar - bundled in the extension when packaged, else the
 *  sibling desktop repo's resources during dev. */
export function resolveServerJar(extensionRoot: string): string {
  const candidates = [
    path.join(extensionRoot, 'resources', 'dw-server', 'dwstudio-server.jar'),
    path.join(extensionRoot, '..', 'src-tauri', 'resources', 'dw-server', 'dwstudio-server.jar'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `dwstudio-server.jar not found. Looked in:\n${candidates.join('\n')}`
  );
}

// --- Long-lived server process ----------------------------------------------

interface DwResponse {
  id: number;
  ok: boolean;
  output: string;
  /** op=tooling returns `result` rather than `output` — shape varies by kind. */
  result?: unknown;
  error: string | null;
  executionTimeMs: number;
  /** Captured `log(...)` output when the request set `trace`. */
  logs?: string[];
  /** One row per expression when the request set `valueTrace`. */
  trace?: TraceRow[];
}

/** What one expression in the script evaluated to, from the engine's execution
 *  listener. Mirrors dw_server::TraceRow. */
export interface TraceRow {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  expression: string;
  kind: string;
  type: string;
  value: string;
  count: number;
  error?: string;
}

interface DwRequest {
  id: number;
  script: string;
  payloadPath: string;
  payloadMime: string;
  attributesPath?: string;
  varsPath?: string;
  namedInputs: { name: string; path: string; mime: string }[];
  outputMime: string;
  classpath?: string[];
  compileOnly?: boolean;
  /** Custom `.dwl` modules so `import x from MyModule` resolves (server writes
   *  each to a hashed classpath dir + compiles against a fresh classloader). */
  modules?: { name: string; content: string }[];
  /** "run" (default) or "format" — format runs the engine's IDE formatter and
   *  returns the pretty-printed script in `output`. */
  op?: 'run' | 'format' | 'tooling';
  /** op=tooling, kind=rename: the identifier to rename to. */
  newName?: string;
  /** op=tooling, kind=sampleData: output format and array repeat count. */
  mimeType?: string;
  repeat?: number;
  /** op=tooling: which language-service query — completion | hover | signature |
   *  typeOf | typeCheck | definition | references | rename | documentSymbol |
   *  folding. */
  kind?: string;
  /** op=tooling: character offset of the cursor in `script`. */
  offset?: number;
  /** op=tooling: sample payload, so `payload.` can be typed against its shape. */
  payload?: string;
  /** Trace mode: capture the script's `log(...)` output into the response. */
  trace?: boolean;
  /** Record what every expression evaluated to. Forces a fresh compile server-side. */
  valueTrace?: boolean;
  /** Target runtime to validate against, e.g. "2.4" for Mule 4.4. Omitted means
   *  the engine's own version, i.e. no version gating. */
  languageLevel?: string;
}

export class DwServer {
  private proc: ChildProcessByStdio<Writable, Readable, Readable> | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (r: DwResponse) => void; reject: (e: Error) => void }
  >();
  private stdoutBuf = '';
  /** Last few KB the JVM wrote to stderr. Kept because it is the only place
   *  a blocked-by-policy launch explains itself — see the stdio note in start(). */
  private stderrTail = '';
  private readyPromise: Promise<void> | null = null;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  /** True only once spawned + primed — i.e. the next Run will be warm. The
   *  warm-up gate (loader overlay / get_warmup_status) reads this. */
  private warmed = false;
  /** Set by the startup encoding self-check in prime(). False means this JVM
   *  can't return non-ASCII text, so the UI warns instead of showing corrupt
   *  output. Matters most here: we may run on a system JRE of any version. */
  private encodingOk = true;
  /** Version the engine reported at startup — the UI shows this rather than a
   *  constant, which is how the displayed version drifted from the jar before. */
  private weaveVersion: string | undefined;

  constructor(private javaBin: string, private jarPath: string) {}

  /** The running engine's own version, once it has said. */
  getWeaveVersion(): string | undefined {
    return this.weaveVersion;
  }

  isWarmed(): boolean {
    return this.warmed;
  }

  isEncodingOk(): boolean {
    return this.encodingOk;
  }

  /** Spawn the JVM, wait for `{"event":"ready"}`, then prime the compiler so
   *  the user's first Run is warm (~10ms) instead of paying the ~1.5s cold
   *  compile. Resolves only once primed. */
  start(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      let proc: ChildProcessByStdio<Writable, Readable, Readable>;
      try {
        proc = spawn(
          this.javaBin,
          // The server's println → System.out encodes with the JVM default charset,
          // turning Hindi/Chinese/€ into literal '?' with no error. This matters
          // MOST here: we may run on a system JRE of any version, and the flag that
          // works differs by version — Java 17 follows file.encoding, Java 19+
          // follows stdout.encoding (and ignores file.encoding for a redirected
          // stream, so JEP 400's UTF-8 default does NOT cover us). Verified: each
          // flag alone fixes one version and corrupts the other. See dw_server.rs.
          ['-Xmx512m', '-Xss2m', '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8',
           '-Dsun.stdout.encoding=UTF-8', '-jar', this.jarPath],
          // stderr was 'ignore'. It is now piped because this is the ONLY channel
          // that explains a launch the OS refused: application allowlisting
          // (ManageEngine, Ivanti, AppLocker) kills or sandboxes an unsigned
          // java.exe from a user-writable extensions folder, and what it prints
          // here is the difference between a real diagnosis and "exited (code 1)".
          { stdio: ['pipe', 'pipe', 'pipe'] }
        );
      } catch (e) {
        reject(e as Error);
        return;
      }
      this.proc = proc;

      proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', (chunk: string) => {
        this.stderrTail = (this.stderrTail + chunk).slice(-4000);
      });

      let ready = false;

      // A blocked JVM does not always fail loudly. Endpoint security can leave the
      // process spawned but suspended, so it never prints the handshake and never
      // exits — and before this timer that meant start() never settled, the webview
      // never got a warmup message, and the splash sat at 85% forever. Whatever
      // else is wrong, the user now gets told something.
      const startupTimer = setTimeout(() => {
        if (ready) return;
        const tail = this.stderrTail.trim();
        const printed = tail
          ? 'It printed:\n' + tail.split('\n').slice(-12).join('\n')
          : 'It printed nothing at all.';
        onDead(
          new Error(
            `The DataWeave engine did not start within 90 seconds.\n\n` +
              `Java: ${this.javaBin}\n\n${printed}\n\n` +
              `This usually means endpoint security blocked or suspended the Java ` +
              `process rather than letting it run. Ask IT to allowlist the path above, ` +
              `or install a Java 17 JDK system-wide and set JAVA_HOME.`,
          ),
        );
        try {
          proc.kill();
        } catch {
          /* already gone */
        }
      }, 90000);
      // If the JVM dies — crash, OOM, or an external kill — reset ALL state so
      // the next start()/getServer() transparently respawns + re-primes. Without
      // resetting readyPromise, start() would keep returning a stale resolved
      // promise over a null proc, leaving the engine bricked ("server not
      // running") until a full window reload.
      const onDead = (err: Error) => {
        clearTimeout(startupTimer);
        if (!ready) reject(err);
        this.failAll(err);
        this.proc = null;
        this.warmed = false;
        this.readyPromise = null;
        if (this.keepaliveTimer) {
          clearInterval(this.keepaliveTimer);
          this.keepaliveTimer = null;
        }
      };
      proc.on('error', (e) => onDead(e instanceof Error ? e : new Error(String(e))));
      proc.on('exit', (code) => {
        // Exit before the handshake is the loud form of the same problem the
        // timeout catches quietly — attach whatever the JVM managed to say.
        const tail = this.stderrTail.trim();
        onDead(
          new Error(
            ready || !tail
              ? `DataWeave server exited (code ${code}).`
              : `DataWeave server exited (code ${code}) before it finished starting.\n\n` +
                `Java: ${this.javaBin}\n\nIt printed:\n` +
                tail.split('\n').slice(-12).join('\n'),
          ),
        );
      });

      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (chunk: string) => {
        this.stdoutBuf += chunk;
        let nl: number;
        while ((nl = this.stdoutBuf.indexOf('\n')) >= 0) {
          const line = this.stdoutBuf.slice(0, nl).trim();
          this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
          if (!line) continue;
          if (!ready) {
            // First line is the handshake: {"event":"ready",...}
            if (line.includes('"ready"')) {
              ready = true;
              clearTimeout(startupTimer);
              try {
                this.weaveVersion = JSON.parse(line)?.weaveVersion || undefined;
              } catch { /* handshake without a version — leave it unknown */ }
              // Prime + start keepalive, then mark started. The primer warms
              // the compiler's hot paths (parser, type checker, codegen, JSON
              // reader/writer) and caches the default-workspace script so a
              // fresh user's first manual Run lands warm.
              this.prime().finally(() => {
                this.warmed = true;
                this.startKeepalive();
                resolve();
              });
            }
            continue;
          }
          this.handleLine(line);
        }
      });
    });
    return this.readyPromise;
  }

  /** Warm the DW engine during startup with a few distinct FULL evals. The JIT
   *  spike (~800ms) lives in the eval/JSON-writer path, not the compile path —
   *  so compileOnly priming doesn't help; only real evals warm it. Three evals
   *  absorb the spike here (behind panel-open) so the user's first Run is
   *  ~20ms instead of ~1.7s. The first script matches build_full_script's
   *  default-workspace output, so that exact script is also a cache hit. */
  private async prime(): Promise<void> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-prime-'));
    const payloadPath = path.join(dir, 'payload.json');
    const attributesPath = path.join(dir, 'attributes.json');
    fs.writeFileSync(payloadPath, '{"message":"hi","name":"world","items":[1,2,3]}');
    fs.writeFileSync(attributesPath, '{}');

    const warmups: Omit<DwRequest, 'id'>[] = [
      {
        script:
          '%dw 2.0\ninput payload application/json\ninput attributes application/json\noutput application/json\n---\n{\n  hello: payload.message\n}',
        payloadPath,
        payloadMime: 'application/json',
        attributesPath,
        namedInputs: [],
        outputMime: 'application/json',
      },
      {
        script: '%dw 2.0\noutput application/json\n---\n{ a: payload.name, b: sizeOf(payload.items) }',
        payloadPath,
        payloadMime: 'application/json',
        namedInputs: [],
        outputMime: 'application/json',
      },
      {
        script: '%dw 2.0\noutput application/json\n---\npayload.items map ((i) -> i * 2)',
        payloadPath,
        payloadMime: 'application/json',
        namedInputs: [],
        outputMime: 'application/json',
      },
    ];
    for (const req of warmups) {
      await this.run(req, 15000).catch(() => undefined); // best-effort
    }

    // Encoding self-check: prove this JVM can hand back non-ASCII before the user
    // can be shown silently-corrupted output. The engine writes its response with
    // println → System.out, and which -D*encoding flag actually governs that
    // differs by Java version — so verify rather than assume (see dw_server.rs).
    const probeText = 'नमस्ते';
    const probe = await this.run({
      script: `%dw 2.0\noutput application/json\n---\n{ p: "${probeText}" }`,
      payloadPath,
      payloadMime: 'application/json',
      namedInputs: [],
      outputMime: 'application/json',
    }, 15000).catch(() => null);
    this.encodingOk = !!probe?.output?.includes(probeText);
    if (!this.encodingOk) {
      console.error('[dwstudio] encoding self-check FAILED — non-ASCII output will be corrupted:', probe?.output);
    }

    fs.rmSync(dir, { recursive: true, force: true });
  }

  /** Every 60s send a no-op eval so the JVM stays hot and DW caches stay
   *  resident — otherwise ~30s idle pages out warm code and the next run pays
   *  a soft re-warm. unref() so this timer never holds the host process open. */
  private startKeepalive() {
    if (this.keepaliveTimer) return;
    this.keepaliveTimer = setInterval(() => {
      if (!this.proc) return;
      this.run(
        {
          script: '%dw 2.0\noutput application/json\n---\n1',
          payloadPath: '',
          payloadMime: 'application/json',
          namedInputs: [],
          outputMime: 'application/json',
        },
        15000
      ).catch(() => undefined);
    }, 60000);
    this.keepaliveTimer.unref();
  }

  private handleLine(line: string) {
    let msg: DwResponse;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // ignore non-JSON noise
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    p.resolve(msg);
  }

  private failAll(e: Error) {
    for (const { reject } of this.pending.values()) reject(e);
    this.pending.clear();
  }

  /** Send one request, resolve with its response. Matched by id. */
  run(req: Omit<DwRequest, 'id'>, timeoutMs: number): Promise<DwResponse> {
    if (!this.proc) return Promise.reject(new Error('DataWeave server not running.'));
    const id = this.nextId++;
    const full: DwRequest = { id, ...req };
    return new Promise<DwResponse>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      const done = (fn: () => void) => {
        if (timer) clearTimeout(timer);
        this.pending.delete(id);
        fn();
      };
      this.pending.set(id, {
        resolve: (r) => done(() => resolve(r)),
        reject: (e) => done(() => reject(e)),
      });
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (this.pending.has(id)) {
            this.pending.delete(id);
            // Restart so a leaked response doesn't desync the next run.
            this.restart();
            reject(new Error(`__TIMEOUT__:${timeoutMs}`));
          }
        }, timeoutMs);
      }
      this.proc!.stdin.write(JSON.stringify(full) + '\n');
    });
  }

  stop() {
    this.warmed = false;
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    this.readyPromise = null;
  }

  async restart() {
    this.stop();
    await this.start();
  }
}

// --- run_dataweave (port of dw_runner.rs) -----------------------------------

interface NamedInput {
  name: string;
  content: string;
  mimeType: string;
  filePath?: string | null;
}

/** Faithful port of build_full_script - injects %dw header / input / output /
 *  separator lines the user omitted, in the right place. */
function buildFullScript(
  userScript: string,
  payloadMime: string,
  hasAttributes: boolean,
  hasVars: boolean,
  namedInputs: NamedInput[]
): string {
  const lines = userScript.split('\n');
  const header: string[] = [];

  const hasDwHeader = lines.some((l) => l.trim().startsWith('%dw'));
  const hasSeparator = lines.some((l) => l.trim() === '---');
  const hasOutput = lines.some((l) => l.trim().startsWith('output '));

  if (!hasDwHeader) header.push('%dw 2.0');

  const hasPayloadInput = lines.some((l) => {
    const t = l.trim();
    return t.startsWith('input payload') || t.startsWith('input  payload');
  });
  if (!hasPayloadInput) header.push(`input payload ${payloadMime}`);

  if (hasAttributes && !lines.some((l) => l.trim().startsWith('input attributes'))) {
    header.push('input attributes application/json');
  }
  if (hasVars && !lines.some((l) => l.trim().startsWith('input vars'))) {
    header.push('input vars application/json');
  }
  for (const ni of namedInputs) {
    const prefix = `input ${ni.name}`;
    if (!lines.some((l) => l.trim().startsWith(prefix))) {
      header.push(`input ${ni.name} ${ni.mimeType}`);
    }
  }

  if (!hasOutput && !hasSeparator) {
    header.push('output application/json');
    header.push('---');
  }

  if (header.length === 0) return userScript;

  if (hasDwHeader) {
    const result: string[] = [];
    let inserted = false;
    for (const line of lines) {
      if (!hasOutput && hasSeparator && !inserted && line.trim() === '---') {
        result.push(...header, 'output application/json');
        inserted = true;
      }
      result.push(line);
      if (!inserted && line.trim().startsWith('%dw')) {
        result.push(...header);
        inserted = true;
      }
    }
    return result.join('\n');
  }
  return [...header, ...lines].join('\n');
}

function parseErrorLocation(stderr: string): [number | null, number | null] {
  const m = stderr.match(/line:?\s*(\d+),?\s*column:?\s*(\d+)/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  return [null, null];
}

/** Undo the header offset so error line numbers point at the user's script. */
function shiftStderrLines(stderr: string, offset: number): string {
  if (offset <= 0) return stderr;
  let out = stderr.replace(/line:?\s*(\d+)/g, (full, num) => {
    const mapped = Math.max(1, parseInt(num, 10) - offset);
    const prefix = full.slice(0, full.length - num.length);
    return `${prefix}${mapped}`;
  });
  out = out.replace(/^(\s*)(\d+)\|/gm, (_full, indent, num) => {
    const mapped = Math.max(1, parseInt(num, 10) - offset);
    return `${indent}${mapped}|`;
  });
  return out;
}

export interface RunResult {
  output: string;
  error: string | null;
  execution_time_ms: number;
  error_line: number | null;
  error_column: number | null;
  /** Captured `log(...)` output when trace mode is on (null otherwise). */
  logs?: string[] | null;
  /** Per-expression values when `valueTrace` was requested (null otherwise). */
  trace?: TraceRow[] | null;
}

export interface RunArgs {
  script: string;
  payload: string;
  payloadMimeType: string;
  attributesJson: string;
  varsJson: string;
  namedInputsJson: string;
  payloadFilePath?: string | null;
  classpath?: string[];
  timeoutMs?: number;
  multipartPartsJson?: string | null;
  /** JSON array of `{name, content}` custom modules (matches the desktop's
   *  `modules_json`); parsed and forwarded to the engine. */
  modulesJson?: string | null;
  /** Trace mode: capture the script's `log(...)` output. */
  trace?: boolean;
  /** Record what every expression evaluated to, without any `log()` calls. */
  valueTrace?: boolean;
  /** Target Mule runtime, e.g. "2.4". Empty/omitted = no version gating. */
  languageLevel?: string;
}

interface MultipartPartData {
  name: string;
  value: string;
  contentType: string;
  isFile: boolean;
  filePath?: string;
  filename?: string;
  /** Base64-encoded raw bytes (binary-safe). Takes priority over value/filePath —
   *  used by the MCP tool to pass binary files through a text channel intact. */
  contentBase64?: string;
}

/** Port of build_multipart_body — assembles a real multipart/form-data body
 *  with CRLF boundaries, reading file parts as raw bytes. The DW reader derives
 *  the boundary from the body, so the bare "multipart/form-data" mime is fine. */
function buildMultipartBody(parts: MultipartPartData[]): { body: Buffer; boundary: string } {
  const boundary = `dwstudio${Date.now()}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    const filename =
      part.filename ?? (part.filePath ? part.filePath.split(/[\\/]/).pop() : undefined);
    chunks.push(
      Buffer.from(
        filename
          ? `Content-Disposition: form-data; name="${part.name}"; filename="${filename}"\r\n`
          : `Content-Disposition: form-data; name="${part.name}"\r\n`
      )
    );
    chunks.push(Buffer.from(`Content-Type: ${part.contentType}\r\n\r\n`));
    if (part.contentBase64) {
      // Binary-safe path: decode agent-supplied bytes straight into the body.
      try {
        chunks.push(Buffer.from(part.contentBase64.trim(), 'base64'));
      } catch {
        /* invalid base64 -> empty part */
      }
    } else if (part.isFile) {
      if (part.filePath) {
        try {
          chunks.push(fs.readFileSync(part.filePath));
        } catch {
          /* missing file -> empty part, mirrors the Rust best-effort read */
        }
      }
    } else {
      chunks.push(Buffer.from(part.value));
    }
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), boundary };
}

/** Mirrors dw_runner::run_dataweave. Builds temp files + merged script, runs
 *  through the warm server, remaps error lines. */
export async function runDataweave(server: DwServer, args: RunArgs): Promise<RunResult> {
  const start = Date.now();
  let payloadMime = args.payloadMimeType;

  const hasAttributes =
    args.attributesJson.trim() !== '{}' && args.attributesJson.trim() !== '';
  const hasVars = args.varsJson.trim() !== '{}' && args.varsJson.trim() !== '';

  let namedInputs: NamedInput[] =
    !args.namedInputsJson.trim() || args.namedInputsJson.trim() === '[]'
      ? []
      : JSON.parse(args.namedInputsJson);

  // application/java can't round-trip through a file path - coerce to JSON
  // exactly as the Rust side does so cache keys + behavior match.
  if (payloadMime === 'application/java') payloadMime = 'application/json';
  for (const ni of namedInputs) {
    if (ni.mimeType === 'application/java') ni.mimeType = 'application/json';
  }

  let effectivePayload = args.payload;
  if (!effectivePayload.trim()) {
    if (payloadMime.includes('json') || payloadMime.includes('java')) effectivePayload = '{}';
    else if (payloadMime.includes('xml')) effectivePayload = '<root/>';
    else effectivePayload = '';
  }

  // Unique run dir under the OS temp.
  const runDir = path.join(
    os.tmpdir(),
    'dw-studio-vscode',
    `run-${process.pid}`,
    `${process.hrtime.bigint()}`
  );
  fs.mkdirSync(runDir, { recursive: true });

  try {
    // Multipart: build a real form-data body (mirrors dw_runner.rs). Must happen
    // before the payload file is chosen. The bare "multipart/form-data" mime
    // stays as-is — the DW reader derives the boundary from the body bytes.
    let multipartFile: string | null = null;
    if (args.multipartPartsJson) {
      const parts: MultipartPartData[] = JSON.parse(args.multipartPartsJson);
      if (parts.length > 0) {
        const { body } = buildMultipartBody(parts);
        multipartFile = path.join(runDir, 'payload_multipart.dat');
        fs.writeFileSync(multipartFile, body);
      }
    }

    const payloadFile = multipartFile
      ? multipartFile
      : args.payloadFilePath
        ? args.payloadFilePath
        : writeTemp(runDir, 'payload.dat', effectivePayload);

    // A value-trace run executes the script verbatim: buildFullScript inserts
    // `input` declarations that shift every line below them, and every trace row
    // carries a line number the editor has to be able to highlight. The engine
    // gets its input types from the request, so the declarations aren't needed.
    const fullScript = args.valueTrace
      ? args.script
      : buildFullScript(args.script, payloadMime, hasAttributes, hasVars, namedInputs);
    const lineOffset = Math.max(
      0,
      fullScript.split('\n').length - args.script.split('\n').length
    );

    const attrsPath = hasAttributes
      ? writeTemp(runDir, 'attributes.json', args.attributesJson)
      : undefined;
    const varsPath = hasVars ? writeTemp(runDir, 'vars.json', args.varsJson) : undefined;

    const serverNamedInputs = namedInputs.map((ni, idx) => ({
      name: ni.name,
      path: ni.filePath ? ni.filePath : writeTemp(runDir, `input_${idx}.dat`, ni.content),
      mime: ni.mimeType,
    }));

    const cpEntries = (args.classpath ?? []).filter((s) => s.length > 0);
    const timeout = args.timeoutMs ?? 30000;

    const modules: { name: string; content: string }[] =
      args.modulesJson && args.modulesJson.trim() && args.modulesJson.trim() !== '[]'
        ? JSON.parse(args.modulesJson)
        : [];

    let resp: DwResponse;
    try {
      resp = await server.run(
        {
          script: fullScript,
          payloadPath: payloadFile,
          payloadMime,
          attributesPath: attrsPath,
          varsPath: varsPath,
          namedInputs: serverNamedInputs,
          outputMime: 'application/json',
          classpath: cpEntries.length ? cpEntries : undefined,
          compileOnly: false,
          modules: modules.length ? modules : undefined,
          trace: args.trace || undefined,
          valueTrace: args.valueTrace || undefined,
          languageLevel: args.languageLevel || undefined,
        },
        timeout
      );
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith('__TIMEOUT__:')) {
        const ms = msg.split(':')[1];
        return {
          output: '',
          error: `Script timed out after ${ms}ms. Increase the timeout in Settings if your script needs more time.`,
          execution_time_ms: timeout,
          error_line: null,
          error_column: null,
        };
      }
      throw e;
    }

    const execMs = Date.now() - start;
    if (resp.ok) {
      return {
        output: resp.output,
        error: null,
        execution_time_ms: execMs,
        error_line: null,
        error_column: null,
        logs: resp.logs ?? null,
        trace: resp.trace ?? null,
      };
    }
    const shifted = shiftStderrLines(resp.error ?? '(no error message)', lineOffset);
    const [line, col] = parseErrorLocation(shifted);
    return {
      output: resp.output,
      error: shifted,
      execution_time_ms: execMs,
      error_line: line,
      error_column: col,
      logs: resp.logs ?? null,
      trace: resp.trace ?? null,
    };
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
}

function writeTemp(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

/** Pretty-print a script via the engine's IDE formatter (op=format). Returns the
 *  formatted source, or throws with the engine's error. Mirrors dw_server::format. */
export async function formatDataweave(server: DwServer, script: string): Promise<string> {
  const resp = await server.run(
    {
      op: 'format',
      script,
      payloadPath: '',
      payloadMime: 'application/json',
      namedInputs: [],
      outputMime: 'application/json',
    },
    15000
  );
  if (!resp.ok) throw new Error(resp.error ?? 'Format failed');
  return resp.output;
}

/** Query the engine's IDE language service (op=tooling) — completion, hover and
 *  signature help. Mirrors dw_server::tooling on the desktop so the shared React
 *  UI can call `dw_tooling` in either runtime. */
export async function toolingQuery(
  server: DwServer,
  kind: string,
  script: string,
  offset: number,
  payload: string,
  newName?: string,
  languageLevel?: string,
  mimeType?: string,
  repeat?: number,
): Promise<unknown> {
  const resp = await server.run(
    {
      op: 'tooling',
      kind,
      offset,
      payload,
      newName,
      languageLevel,
      mimeType,
      repeat,
      script,
      payloadPath: '',
      payloadMime: 'application/json',
      namedInputs: [],
      outputMime: 'application/json',
    },
    15000,
  );
  if (!resp.ok) throw new Error(resp.error ?? 'tooling failed');
  return resp.result ?? null;
}

export interface WarmArgs {
  script: string;
  payloadMimeType: string;
  hasAttributes: boolean;
  hasVars: boolean;
  namedInputsJson: string;
}

/** Port of warm_dataweave_script. Pre-compiles (compileOnly) the SAME merged
 *  script a real Run would send, so the run lands as a cache hit (~10ms). The
 *  merge must match runDataweave exactly or the compile-cache key won't match. */
export async function warmDataweave(server: DwServer, args: WarmArgs): Promise<void> {
  if (!args.script.trim()) return;
  let payloadMime = args.payloadMimeType;
  let namedInputs: NamedInput[] =
    !args.namedInputsJson.trim() || args.namedInputsJson.trim() === '[]'
      ? []
      : JSON.parse(args.namedInputsJson);
  if (payloadMime === 'application/java') payloadMime = 'application/json';
  for (const ni of namedInputs) {
    if (ni.mimeType === 'application/java') ni.mimeType = 'application/json';
  }
  const merged = buildFullScript(args.script, payloadMime, args.hasAttributes, args.hasVars, namedInputs);
  await server
    .run(
      {
        script: merged,
        payloadPath: '',
        payloadMime: 'application/json',
        namedInputs: [],
        outputMime: 'application/json',
        compileOnly: true,
      },
      15000
    )
    .catch(() => undefined); // best-effort
}

