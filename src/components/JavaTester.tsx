/**
 * Java tester — compile your own Java (the `src/main/java` kind) and run it
 * against a payload.
 *
 * The engine runs DataWeave, not raw Java, so the loop is:
 *   1. Paste / load .java sources  →  compile with the bundled javac (against
 *      the managed JARs as deps)  →  the .class output dir joins the classpath.
 *   2. Call your class from a tiny DataWeave snippet via `import java!a::b::C`
 *      (the engine's Java-interop mechanism; `dw::core::Java` isn't bundled),
 *      with the payload pane as input and the output pane as the result.
 *
 * The "Call" picker reads the public static methods out of your source and
 * writes the snippet for you; you can also hand-edit it.
 *
 * Caveat: the engine's classloader caches classes it has already loaded, so a
 * *changed* class needs an engine restart (button in the header) to take effect.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { invoke } from '../bridge';
import { Icons } from './Icons';
import { WindowControls } from './WindowControls';
import { MiniEditor } from './MiniEditor';
import { toast } from './Toast';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { MIME_OPTIONS } from '../types';

interface RunResult { output: string; error: string | null; execution_time_ms: number; }
interface JarInfo { path: string; filename: string; sizeBytes: number; }
interface CompileResult { ok: boolean; classesDir: string; diagnostics: string; }
interface JavaSrc { id: string; name: string; content: string; }

const SAMPLE_JAVA = `package demo;

public class Calc {
    public static int addTax(int amount) {
        return amount + amount / 10;
    }

    public static String shout(String text) {
        return text.toUpperCase() + "!";
    }
}`;

const SAMPLE_DW = `%dw 2.0
import java!demo::Calc
output application/json
---
{
  taxed: Calc::addTax(payload.amount),
  shout: Calc::shout(payload.name)
}`;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const pkgOf = (src: string): string | null => src.match(/package\s+([\w.]+)\s*;/)?.[1] ?? null;
const classOf = (src: string): string | null =>
  src.match(/public\s+(?:final\s+|abstract\s+)?class\s+(\w+)/)?.[1] ?? null;
const fqcnColons = (src: string): string | null => {
  const cls = classOf(src);
  if (!cls) return null;
  const pkg = pkgOf(src);
  return (pkg ? `${pkg}.${cls}` : cls).replace(/\./g, '::');
};

/** Public static methods in a source — name + parameter names — to drive the
 *  "Call" picker and generate a snippet. */
function staticMethods(src: string): { name: string; params: string[] }[] {
  const out: { name: string; params: string[] }[] = [];
  for (const m of src.matchAll(/public\s+static\s+[\w<>\[\].,\s]+?\s+(\w+)\s*\(([^)]*)\)/g)) {
    const params = m[2].trim()
      ? m[2].split(',').map((p) => p.trim().split(/\s+/).pop() || 'arg')
      : [];
    out.push({ name: m[1], params });
  }
  return out;
}

function genSnippet(src: string, method: { name: string; params: string[] }): string {
  const fq = fqcnColons(src);
  const cls = classOf(src);
  const args = method.params.length === 0
    ? ''
    : method.params.length === 1
      ? 'payload'
      : method.params.map((p) => `payload.${p}`).join(', ');
  return `%dw 2.0\nimport java!${fq}\noutput application/json\n---\n${cls}::${method.name}(${args})`;
}

export function JavaTester({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sources, setSources] = useState<JavaSrc[]>([{ id: 's0', name: 'Calc', content: SAMPLE_JAVA }]);
  const [activeId, setActiveId] = useState('s0');
  const [jars, setJars] = useState<JarInfo[]>([]);
  const [coord, setCoord] = useState('');
  const [fetching, setFetching] = useState(false);

  const [classesDir, setClassesDir] = useState<string | null>(null);
  const [compileDiag, setCompileDiag] = useState('');
  const [compileOk, setCompileOk] = useState<boolean | null>(null);
  const [compiling, setCompiling] = useState(false);

  const [script, setScript] = useState(SAMPLE_DW);
  const [payload, setPayload] = useState('{\n  "amount": 100,\n  "name": "hi"\n}');
  const [payloadMime, setPayloadMime] = useState('application/json');

  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [execMs, setExecMs] = useState<number | null>(null);

  const active = sources.find((s) => s.id === activeId) ?? sources[0];
  const methods = useMemo(() => (active ? staticMethods(active.content) : []), [active]);

  const loadJars = useCallback(async () => {
    try { setJars(await invoke<JarInfo[]>('list_managed_jars')); }
    catch { setJars([]); }
  }, []);
  useEffect(() => { if (open) loadJars(); }, [open, loadJars]);

  // Signature of the classes the engine currently has loaded. The engine's
  // classloader caches a class once loaded, so a *changed* class needs an engine
  // restart to take effect — we track this to restart only when it's needed.
  const loadedRef = useRef('');
  const sourceSig = () => JSON.stringify(sources.map((s) => ({ n: classOf(s.content) || s.name, c: s.content })));

  // Compile to a fresh dir. Returns the classes dir, or null on failure.
  const doCompile = async (): Promise<string | null> => {
    if (compiling) return null;
    setCompiling(true);
    try {
      const res = await invoke<CompileResult>('compile_java', {
        sources: sources.map((s) => ({ name: classOf(s.content) || s.name, content: s.content })),
        classpath: jars.map((j) => j.path),
      });
      setCompileOk(res.ok);
      setCompileDiag(res.diagnostics);
      if (res.ok) { setClassesDir(res.classesDir); return res.classesDir; }
      return null;
    } catch (e) {
      setCompileOk(false);
      setCompileDiag(String(e));
      return null;
    } finally {
      setCompiling(false);
    }
  };

  const doRun = async (cpDir: string | null) => {
    setRunning(true); setError(null); setOutput(''); setExecMs(null);
    try {
      const cp = [...jars.map((j) => j.path), ...(cpDir ? [cpDir] : [])];
      const res = await invoke<RunResult>('run_dataweave', {
        script, payload: payload || '{}', payloadMimeType: payloadMime,
        attributesJson: '{}', varsJson: '{}', namedInputsJson: '[]',
        payloadFilePath: null, classpath: cp, timeoutMs: 0, multipartPartsJson: null,
      });
      if (res.error) setError(res.error); else setOutput(res.output);
      setExecMs(res.execution_time_ms);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  // The one button: compile → restart the engine *only if* the code changed
  // since it last loaded these classes → run. No more juggling three buttons.
  const compileAndRun = async () => {
    if (compiling || running) return;
    const dir = await doCompile();
    if (!dir) { toast('Compile failed — see errors', 'error'); return; }
    const sig = sourceSig();
    if (loadedRef.current && loadedRef.current !== sig) {
      try { await invoke('restart_engine'); } catch (e) { toast(String(e), 'error'); }
    }
    await doRun(dir);
    loadedRef.current = sig;
  };

  // Quick compile-only check (⌘B) — doesn't run.
  const compileOnly = async () => {
    const dir = await doCompile();
    toast(dir ? 'Compiled ✓' : 'Compile failed — see errors', dir ? 'success' : 'error');
  };

  const restartEngine = async () => {
    try { await invoke('restart_engine'); loadedRef.current = ''; toast('Engine restarted', 'success'); }
    catch (e) { toast(String(e), 'error'); }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // defaultPrevented: Monaco already handled this Escape (dismissing its
      // suggest/find widget) — it must not also close the whole tool.
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void compileAndRun(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); void compileOnly(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, script, payload, payloadMime, jars, classesDir, sources]);

  // ── Source management ──────────────────────────────────────────────
  const updateActive = (content: string) => setSources((prev) => prev.map((s) => (s.id === activeId ? { ...s, content } : s)));
  const addPasted = () => {
    const id = crypto.randomUUID();
    setSources((prev) => [...prev, { id, name: 'NewClass', content: 'public class NewClass {\n\n}' }]);
    setActiveId(id);
  };
  const addFiles = async () => {
    const picked = await tauriOpen({ multiple: true, directory: false, filters: [{ name: 'Java', extensions: ['java'] }] });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    for (const p of paths) {
      try {
        const content = await invoke<string>('read_text_file', { path: p });
        const base = (p.split(/[\\/]/).pop() || 'Class.java').replace(/\.java$/i, '');
        const id = crypto.randomUUID();
        setSources((prev) => [...prev, { id, name: classOf(content) || base, content }]);
        setActiveId(id);
      } catch (e) { toast(`${p}: ${e}`, 'error'); }
    }
  };
  const removeSource = (id: string) => {
    setSources((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) return prev; // keep at least one
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };

  // ── JAR management ─────────────────────────────────────────────────
  const addJar = async () => {
    const picked = await tauriOpen({ multiple: true, directory: false, filters: [{ name: 'JAR', extensions: ['jar'] }] });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    for (const p of paths) {
      try { await invoke('import_jar_file', { srcPath: p }); }
      catch (e) { toast(`${p}: ${e}`, 'error'); }
    }
    await loadJars();
  };
  const fetchMaven = async () => {
    const parts = coord.split(':').map((s) => s.trim());
    if (parts.length !== 3 || parts.some((p) => !p)) { toast('Use group:artifact:version', 'error'); return; }
    setFetching(true);
    try {
      await invoke<JarInfo>('download_maven_jar', { group: parts[0], artifact: parts[1], version: parts[2] });
      toast(`Downloaded ${parts[1]}-${parts[2]}.jar`, 'success');
      setCoord(''); await loadJars();
    } catch (e) { toast(String(e), 'error'); } finally { setFetching(false); }
  };
  const removeJar = async (path: string) => {
    try { await invoke('remove_managed_jar', { path }); await loadJars(); }
    catch (e) { toast(String(e), 'error'); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-bg">
      {/* Header */}
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-2 pl-4 pr-3 border-b border-line bg-surface">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
          title="Back to workspace (Esc)"
        >
          <Icons.ChevronRight size={12} className="rotate-180" />
          Back
        </button>
        <div className="w-px h-4 bg-line" />
        <Icons.Coffee size={15} />
        <span className="text-[13px] font-semibold text-content">Java tester</span>
        <span className="text-[11px] text-content-ghost">— compile your Java, run it on a payload</span>
        <span className="flex-1" />
        <button
          onClick={compileAndRun}
          disabled={compiling || running}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-semibold cursor-pointer transition-colors disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          title="Compile and run (⌘↵) — restarts the engine automatically when your code changed. ⌘B compiles only."
        >
          {compiling ? 'Compiling…' : running ? 'Running…' : <>▶ Compile &amp; Run <kbd className="text-[9.5px] font-mono opacity-80">⌘↵</kbd></>}
        </button>
        <button
          onClick={restartEngine}
          className="text-[11px] text-content-faint hover:text-content border border-line rounded-md h-7 px-2.5 cursor-pointer hover:bg-surface-2"
          title="Force-restart the engine — rarely needed; Compile & Run does this for you when your code changes"
        >
          Restart engine
        </button>
        <WindowControls />
      </header>

      <div className="flex-1 flex min-h-0">
        {/* JAR sidebar */}
        <div className="w-64 shrink-0 border-r border-line flex flex-col min-h-0 bg-surface">
          <div className="px-3.5 py-2 border-b border-line-subtle">
            <div className="text-[11.5px] font-semibold text-content">JARs (deps)</div>
            <div className="text-[10px] text-content-ghost mt-0.5">Compile + run classpath. Shared with the Flow Designer.</div>
          </div>
          <div className="flex-1 overflow-auto">
            {jars.length === 0 ? (
              <div className="px-3.5 py-3 text-[11px] text-content-faint italic">No JARs. Add your project's Maven deps if your class needs them.</div>
            ) : jars.map((j) => (
              <div key={j.path} className="flex items-center gap-2 px-3.5 py-1.5 border-b border-line-subtle group">
                <Icons.Folder size={11} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10.5px] font-mono text-content-secondary truncate" title={j.path}>{j.filename}</div>
                  <div className="text-[9px] text-content-ghost">{humanSize(j.sizeBytes)}</div>
                </div>
                <button onClick={() => removeJar(j.path)} className="text-content-faint hover:text-err opacity-0 group-hover:opacity-100 cursor-pointer" title="Remove"><Icons.X size={10} /></button>
              </div>
            ))}
          </div>
          <div className="border-t border-line-subtle p-2.5 space-y-2">
            <button onClick={addJar} className="w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-md text-[10.5px] font-medium text-accent border border-accent-border hover:bg-accent-dim cursor-pointer">
              <Icons.Plus size={10} /> Add JAR
            </button>
            <div className="flex gap-1.5">
              <input
                value={coord}
                onChange={(e) => setCoord(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') fetchMaven(); }}
                placeholder="group:artifact:version"
                spellCheck={false}
                className="flex-1 min-w-0 h-7 px-2 text-[10px] font-mono bg-surface-2 border border-line rounded outline-none text-content placeholder:text-content-ghost focus:border-accent"
              />
              <button onClick={fetchMaven} disabled={fetching} className="shrink-0 h-7 px-2 rounded text-[10px] font-medium text-content-faint hover:text-content border border-line hover:bg-surface-2 cursor-pointer disabled:opacity-50">
                {fetching ? '…' : 'Maven'}
              </button>
            </div>
          </div>
        </div>

        {/* Center: source + harness */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-line">
          {/* Source tabs */}
          <div className="shrink-0 flex items-center gap-1 px-2 h-9 border-b border-line-subtle overflow-x-auto">
            {sources.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`group inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] cursor-pointer whitespace-nowrap ${s.id === activeId ? 'bg-surface-2 text-content' : 'text-content-faint hover:text-content hover:bg-surface-2'}`}
              >
                <span className="font-mono">{classOf(s.content) || s.name}.java</span>
                {sources.length > 1 && (
                  <span onClick={(e) => { e.stopPropagation(); removeSource(s.id); }} className="text-content-ghost hover:text-err"><Icons.X size={9} /></span>
                )}
              </button>
            ))}
            <button onClick={addPasted} className="h-7 px-2 rounded-md text-[11px] text-content-faint hover:text-accent hover:bg-surface-2 cursor-pointer" title="New class">+ New</button>
            <button onClick={addFiles} className="h-7 px-2 rounded-md text-[11px] text-content-faint hover:text-accent hover:bg-surface-2 cursor-pointer" title="Load .java file(s)">Load .java</button>
            <span className="flex-1" />
            {compileOk === true && <span className="text-[10px] font-medium text-[#10b981] px-2">✓ compiled</span>}
            {compileOk === false && <span className="text-[10px] font-medium text-err px-2">✗ errors</span>}
          </div>
          {/* Source editor */}
          <div className="flex-1 min-h-0">
            {active && <MiniEditor value={active.content} onChange={updateActive} language="java" height="100%" />}
          </div>
          {/* Compile diagnostics */}
          {compileDiag && (
            <div className="shrink-0 max-h-28 overflow-auto px-3.5 py-2 border-t border-line-subtle" style={{ background: compileOk ? 'transparent' : 'color-mix(in oklch, var(--err) 7%, transparent)' }}>
              <pre className="text-[10.5px] font-mono whitespace-pre-wrap leading-relaxed" style={{ color: compileOk ? 'var(--content-faint)' : 'var(--err)' }}>{compileDiag}</pre>
            </div>
          )}
          {/* Harness: call picker + DW snippet + payload */}
          <div className="shrink-0 border-t border-line">
            <div className="px-3.5 py-1.5 flex items-center gap-2">
              <span className="text-[11px] font-semibold text-content">Call from DataWeave</span>
              {methods.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { const m = methods.find((x) => x.name === e.target.value); if (m && active) setScript(genSnippet(active.content, m)); }}
                  className="h-6 px-1.5 rounded bg-surface-2 border border-line text-[10.5px] text-content-faint cursor-pointer outline-none"
                  title="Insert a call to a public static method"
                >
                  <option value="">Insert call…</option>
                  {methods.map((m) => <option key={m.name} value={m.name}>{m.name}({m.params.join(', ')})</option>)}
                </select>
              )}
              <span className="text-[10px] text-content-ghost">payload is the input</span>
            </div>
            <MiniEditor value={script} onChange={setScript} language="dataweave" height={120} />
            <div className="px-3.5 py-1 flex items-center gap-2 border-t border-line-subtle">
              <span className="text-[11px] font-semibold text-content">Payload</span>
              <select value={payloadMime} onChange={(e) => setPayloadMime(e.target.value)} className="h-6 px-1.5 rounded bg-surface-2 border border-line text-[10.5px] text-content-faint cursor-pointer outline-none">
                {MIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <MiniEditor value={payload} onChange={setPayload} language="json" height={84} />
          </div>
        </div>

        {/* Output */}
        <div className="w-[32%] shrink-0 flex flex-col min-h-0 bg-surface">
          <div className="px-3.5 py-2 border-b border-line-subtle flex items-center gap-2">
            <span className="text-[11.5px] font-semibold text-content">Output</span>
            {execMs != null && !running && <span className="font-mono text-[10px] px-1.5 py-0.5 rounded text-accent" style={{ background: 'var(--accent-dim)' }}>{execMs} ms</span>}
          </div>
          <div className="flex-1 overflow-auto p-3">
            {error ? (
              <pre className="text-[11.5px] font-mono whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--err)' }}>{error}</pre>
            ) : output ? (
              <pre className="text-[11.5px] font-mono whitespace-pre-wrap leading-relaxed text-content">{output}</pre>
            ) : (
              <div className="text-[11px] text-content-faint italic">Compile (⌘B), then Run (⌘↵).</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
