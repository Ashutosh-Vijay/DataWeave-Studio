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
import { kbd } from '../shortcuts';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '../bridge';
import { Icons } from './Icons';
import { WindowControls } from './WindowControls';
import { MiniEditor } from './MiniEditor';
import { toast } from './Toast';
import { open as tauriOpen, save as tauriSave } from '@tauri-apps/plugin-dialog';
import { MavenDialog, jarOfArtifact } from './MavenDialog';
import { libraryImports, artifactForClass, type Coord } from '../maven';
import { MIME_OPTIONS } from '../types';

interface RunResult { output: string; error: string | null; execution_time_ms: number; }
interface JarInfo { path: string; filename: string; sizeBytes: number; }
interface CompileResult { ok: boolean; classesDir: string; diagnostics: string; }
/** `path` is the file it was loaded from or saved to; `saved` is its content then. */
interface JavaSrc { id: string; name: string; content: string; path?: string; saved?: string; }

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

/**
 * A saved Java project: its classes, the DataWeave that calls them, the
 * payload, and which jars from the shared JAR folder it uses. Two projects can
 * use different versions of one library; the jar files themselves are
 * downloaded once and shared. `jars: null` means "every jar in the folder",
 * which is what the tester used before projects existed.
 */
interface JavaProject {
  id: string; name: string;
  sources: JavaSrc[]; activeId: string;
  script: string; payload: string; payloadMime: string;
  jars: string[] | null;
}
const PROJECTS_KEY = 'dw.javaProjects';
const newProject = (name: string): JavaProject => ({
  id: crypto.randomUUID(), name,
  sources: [{ id: 's0', name: 'Calc', content: SAMPLE_JAVA }], activeId: 's0',
  script: SAMPLE_DW, payload: '{\n  "amount": 100,\n  "name": "hi"\n}', payloadMime: 'application/json',
  jars: [],
});
function loadProjects(): { projects: JavaProject[]; currentId: string } {
  try {
    const s = JSON.parse(localStorage.getItem(PROJECTS_KEY) || 'null');
    if (s && Array.isArray(s.projects) && s.projects.length) return s;
  } catch { /* start fresh */ }
  // First time with projects: what the tester held before becomes the first
  // one, keeping every jar the user already had on its classpath.
  const first = { ...newProject('My Java project'), jars: null };
  try {
    const old = JSON.parse(localStorage.getItem('dw.javaTester') || 'null');
    if (old && Array.isArray(old.sources) && old.sources.length) Object.assign(first, old);
  } catch { /* nothing to carry over */ }
  return { projects: [first], currentId: first.id };
}

// Signature of the classes and jars the engine currently has loaded. The
// engine's classloader caches a class once loaded, so a *changed* class needs
// an engine restart to take effect; this is how we restart only when needed.
// Module-level, not a ref: the tester unmounts when closed, and a ref reset to
// '' on reopening made the next run skip the restart and use the old class.
const loadedRef = { current: '' };

// Package → "group:artifact" found on Central ('' = not there), kept across
// sessions so an import is looked up once.
const PKG_INDEX_KEY = 'dw.mavenPackageIndex';
function loadPkgIndex(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(PKG_INDEX_KEY) || '{}') || {}; } catch { return {}; }
}

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
  const [store, setStore] = useState(loadProjects);
  const project = store.projects.find((p) => p.id === store.currentId) ?? store.projects[0];
  // Edits go straight into the current project; the whole list is saved as you work.
  const patch = (fn: (p: JavaProject) => Partial<JavaProject>) =>
    setStore((st) => ({ ...st, projects: st.projects.map((p) => (p.id === st.currentId ? { ...p, ...fn(p) } : p)) }));
  const { sources, activeId, script, payload, payloadMime } = project;
  const setSources = (fn: (prev: JavaSrc[]) => JavaSrc[]) => patch((p) => ({ sources: fn(p.sources) }));
  const setActiveId = (id: string) => patch(() => ({ activeId: id }));
  const setScript = (v: string) => patch(() => ({ script: v }));
  const setPayload = (v: string) => patch(() => ({ payload: v }));
  const setPayloadMime = (v: string) => patch(() => ({ payloadMime: v }));
  // Saved on every change, not debounced: a pending save would be dropped when
  // the tester closes, losing the last edits. A few KB per keystroke is nothing.
  useEffect(() => {
    try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(store)); } catch { toast('Couldn\'t save your Java projects: storage is full', 'error'); }
  }, [store]);

  const [library, setLibrary] = useState<JarInfo[]>([]);
  const [mavenOpen, setMavenOpen] = useState<Coord[] | true | false>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);

  const [classesDir, setClassesDir] = useState<string | null>(null);
  const [compileDiag, setCompileDiag] = useState('');
  const [compileOk, setCompileOk] = useState<boolean | null>(null);
  const [compiling, setCompiling] = useState(false);


  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [execMs, setExecMs] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const active = sources.find((s) => s.id === activeId) ?? sources[0];
  const methods = useMemo(() => (active ? staticMethods(active.content) : []), [active]);

  const loadJars = useCallback(async () => {
    let list: JarInfo[] = [];
    try { list = await invoke<JarInfo[]>('list_managed_jars'); } catch { /* none */ }
    setLibrary(list);
    // A project carried over from before projects keeps the jars the user had
    // then. Settled on the first listing (even an empty one), or it would keep
    // picking up every jar any other project adds later.
    setStore((st) => (st.projects.some((p) => p.jars === null)
      ? { ...st, projects: st.projects.map((p) => (p.jars === null ? { ...p, jars: list.map((j) => j.filename) } : p)) }
      : st));
  }, []);
  useEffect(() => { if (open) loadJars(); }, [open, loadJars]);
  const projectFiles = project.jars ?? library.map((j) => j.filename);
  const jars = library.filter((j) => projectFiles.includes(j.filename));
  const missingJars = projectFiles.filter((f) => !library.some((j) => j.filename === f));
  /** Put jars on this project, swapping out any other version of the same library. */
  const addToProject = (files: string[]) => patch((p) => {
    let next = p.jars ?? library.map((j) => j.filename);
    for (const f of files) {
      const a = f.replace(/-\d[^]*\.jar$/, '');
      next = [...next.filter((x) => x !== f && !jarOfArtifact(x, a)), f];
    }
    return { jars: next };
  });

  // ── Projects ───────────────────────────────────────────────────────
  const switchProject = (id: string) => {
    setStore((st) => ({ ...st, currentId: id }));
    setCompileOk(null); setCompileDiag(''); setClassesDir(null); setOutput(''); setError(null); setExecMs(null);
  };
  const createProject = () => {
    const names = new Set(store.projects.map((p) => p.name));
    let name = 'Java project';
    for (let i = 2; names.has(name); i++) name = `Java project ${i}`;
    const p = newProject(name);
    setStore((st) => ({ projects: [p, ...st.projects], currentId: p.id }));
    setCompileOk(null); setCompileDiag(''); setClassesDir(null); setOutput(''); setError(null); setExecMs(null);
    setEditingId(p.id); setDraftName(name);
  };
  const deleteProject = (id: string) => {
    if (store.projects.length === 1) return;
    const rest = store.projects.filter((p) => p.id !== id);
    if (id === store.currentId) switchProject(rest[0].id);
    setStore((st) => ({ ...st, projects: st.projects.filter((p) => p.id !== id) }));
  };
  const commitRename = () => {
    const name = draftName.trim();
    if (name && editingId) setStore((st) => ({ ...st, projects: st.projects.map((p) => (p.id === editingId ? { ...p, name } : p)) }));
    setEditingId(null);
  };

  // ── Jars your imports need ─────────────────────────────────────────
  // Look each imported package up on Central once (cached), then point out the
  // libraries this project doesn't have yet.
  const [pkgIndex, setPkgIndex] = useState(loadPkgIndex);
  const imports = useMemo(() => libraryImports(sources.map((s) => s.content)), [sources]);
  const importsKey = [...imports.byPackage.keys()].join(',');
  useEffect(() => {
    if (!open) return;
    const todo = [...imports.byPackage].filter(([pkg]) => !(pkg in pkgIndex));
    if (!todo.length) return;
    let stale = false;
    const t = setTimeout(async () => {
      const fetchText = (url: string) => invoke<string>('maven_fetch_text', { url });
      const found = await Promise.all(todo.map(async ([pkg, cls]) => {
        try { const r = await artifactForClass(fetchText, cls); return [pkg, r ? `${r.g}:${r.a}` : ''] as const; }
        catch { return null; } // offline or blocked: try again next time, say nothing
      }));
      if (stale) return;
      setPkgIndex((idx) => {
        const next = { ...idx };
        for (const f of found) if (f) next[f[0]] = f[1];
        try { localStorage.setItem(PKG_INDEX_KEY, JSON.stringify(next)); } catch { /* cache only */ }
        return next;
      });
    }, 1200);
    return () => { stale = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, importsKey]);
  const neededLibs = [...new Set([...imports.byPackage.keys()].map((pkg) => pkgIndex[pkg]).filter(Boolean))]
    .map((ga) => { const [g, a] = ga.split(':'); return { g, a, v: '' }; })
    .filter((c) => !projectFiles.some((f) => jarOfArtifact(f, c.a)));
  const unknownPkgs = [...imports.byPackage.keys()].filter((pkg) => pkgIndex[pkg] === '');

  const sourceSig = () => JSON.stringify({ jars: jars.map((j) => j.filename), src: sources.map((s) => ({ n: classOf(s.content) || s.name, c: s.content })) });

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
    if (!dir) { toast('Compile failed. See the errors below', 'error'); return; }
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
    toast(dir ? 'Compiled ✓' : 'Compile failed. See the errors below', dir ? 'success' : 'error');
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

  // Export: write the open class to its .java file, asking where the first time.
  const saveActive = async () => {
    const src = sources.find((s) => s.id === activeId);
    if (!src) return;
    let path = src.path;
    if (!path) {
      const picked = await tauriSave({ defaultPath: `${classOf(src.content) || src.name}.java`, filters: [{ name: 'Java', extensions: ['java'] }] });
      if (!picked) return;
      path = picked;
    }
    try {
      await invoke('save_output_file', { path, content: src.content });
      setSources((prev) => prev.map((s) => (s.id === src.id ? { ...s, path, saved: src.content } : s)));
      toast(`Saved ${path.split(/[\\/]/).pop()}`, 'success');
    } catch (e) { toast(String(e), 'error'); }
  };
  // Ctrl+S saves the project (it also saves itself as you type). Capture phase,
  // so the app's own Ctrl+S (save workspace) doesn't fire behind the tester.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); e.stopPropagation();
        try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(store)); toast(`Saved ${project.name}`, 'success'); }
        catch { toast('Couldn\'t save: storage is full', 'error'); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, store]);

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
        setSources((prev) => [...prev, { id, name: classOf(content) || base, content, path: p, saved: content }]);
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
    const added: string[] = [];
    for (const p of paths) {
      try { added.push((await invoke<JarInfo>('import_jar_file', { srcPath: p })).filename); }
      catch (e) { toast(`${p}: ${e}`, 'error'); }
    }
    await loadJars();
    if (added.length) addToProject(added);
  };
  // Deleting the file is only offered for jars no project uses.
  const usedBy = (file: string) => store.projects.filter((p) => (p.jars ?? []).includes(file)).map((p) => p.name);
  const deleteJarFile = async (path: string) => {
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
        <span className="text-[12px] text-content-faint">/</span>
        <span className="text-[12.5px] text-content-secondary truncate max-w-[260px]">{project.name}</span>
        <span className="flex-1" />
        <button
          onClick={compileAndRun}
          disabled={compiling || running}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-semibold cursor-pointer transition-colors disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          title={kbd("Compile and run (⌘↵). Restarts the engine when your code has changed. ⌘B only compiles.")}
        >
          {compiling ? 'Compiling…' : running ? 'Running…' : <>▶ Compile &amp; Run <kbd className="text-[9.5px] font-mono opacity-80">{kbd('⌘↵')}</kbd></>}
        </button>
        <button
          onClick={restartEngine}
          className="text-[11px] text-content-faint hover:text-content border border-line rounded-md h-7 px-2.5 cursor-pointer hover:bg-surface-2"
          title="Restart the engine. Rarely needed, since Compile & Run does this when your code changes"
        >
          Restart engine
        </button>
        <WindowControls />
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar: saved projects, then this project's jars */}
        <div className="w-64 shrink-0 border-r border-line flex flex-col min-h-0 bg-surface">
          <div className="h-9 shrink-0 flex items-center gap-2 px-3 border-b border-line-subtle">
            <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-content-faint flex-1">Projects</span>
            <button onClick={createProject} className="inline-flex items-center gap-1 h-6 px-1.5 rounded text-[11px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer" title="Start a new Java project">
              <Icons.Plus size={12} /> New
            </button>
          </div>
          <div className="max-h-[34%] overflow-y-auto py-1 border-b border-line-subtle">
            {store.projects.map((p) => (
              <div
                key={p.id}
                onClick={() => { if (editingId !== p.id && p.id !== store.currentId) switchProject(p.id); }}
                className="group px-3 py-1.5 flex items-center gap-2 cursor-pointer"
                style={{ background: p.id === store.currentId ? 'var(--surface-2)' : 'transparent' }}
              >
                <div className="flex-1 min-w-0">
                  {editingId === p.id ? (
                    <input
                      value={draftName}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditingId(null); }
                      }}
                      className="w-full bg-surface border border-accent-border rounded px-1.5 py-0.5 text-[12px] text-content outline-none"
                    />
                  ) : (
                    <>
                      <div className="text-[12px] truncate" style={{ color: p.id === store.currentId ? 'var(--content)' : 'var(--content-secondary)' }}>{p.name}</div>
                      <div className="text-[10px] text-content-ghost truncate">
                        {p.sources.length} class{p.sources.length === 1 ? '' : 'es'} · {(p.jars ?? library).length} jar{(p.jars ?? library).length === 1 ? '' : 's'}
                      </div>
                    </>
                  )}
                </div>
                {editingId !== p.id && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setEditingId(p.id); setDraftName(p.name); }} className="text-content-ghost hover:text-content cursor-pointer" title="Rename">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    </button>
                    {store.projects.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }} className="text-content-ghost hover:text-err cursor-pointer" title="Delete this project (its jars stay downloaded)">
                        <Icons.Trash size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="px-3.5 py-2 border-b border-line-subtle">
            <div className="text-[11.5px] font-semibold text-content">JARs in this project</div>
            <div className="text-[10px] text-content-ghost mt-0.5">On the compile and run classpath.</div>
          </div>
          <div className="flex-1 overflow-auto">
            {jars.length === 0 && missingJars.length === 0 ? (
              <div className="px-3.5 py-3 text-[11px] text-content-faint italic">No JARs yet. Add the libraries your classes import.</div>
            ) : (
              <>
                {jars.map((j) => (
                  <div key={j.path} className="flex items-center gap-2 px-3.5 py-1.5 border-b border-line-subtle group">
                    <Icons.Folder size={11} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10.5px] font-mono text-content-secondary truncate" title={j.path}>{j.filename}</div>
                      <div className="text-[9px] text-content-ghost">{humanSize(j.sizeBytes)}</div>
                    </div>
                    <button onClick={() => patch(() => ({ jars: projectFiles.filter((f) => f !== j.filename) }))} className="text-content-faint hover:text-err opacity-0 group-hover:opacity-100 cursor-pointer" title="Remove from this project. The file stays downloaded for other projects."><Icons.X size={10} /></button>
                  </div>
                ))}
                {missingJars.map((f) => (
                  <div key={f} className="flex items-center gap-2 px-3.5 py-1.5 border-b border-line-subtle group">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10.5px] font-mono text-warn truncate">{f}</div>
                      <div className="text-[9px] text-content-ghost">File was deleted. Add it again.</div>
                    </div>
                    <button onClick={() => patch(() => ({ jars: projectFiles.filter((x) => x !== f) }))} className="text-content-faint hover:text-err cursor-pointer" title="Remove from this project"><Icons.X size={10} /></button>
                  </div>
                ))}
              </>
            )}
            {library.length > jars.length && (
              <div className="border-t border-line-subtle">
                <button onClick={() => setShowLibrary((v) => !v)} className="w-full flex items-center gap-1.5 px-3.5 py-2 text-[10.5px] text-content-faint hover:text-content cursor-pointer">
                  <Icons.ChevronRight size={10} className={showLibrary ? 'rotate-90' : ''} />
                  Other downloaded JARs ({library.length - jars.length})
                </button>
                {showLibrary && library.filter((j) => !projectFiles.includes(j.filename)).map((j) => {
                  const users = usedBy(j.filename);
                  return (
                    <div key={j.path} className="flex items-center gap-2 px-3.5 py-1 group">
                      <div className="flex-1 min-w-0 text-[10.5px] font-mono text-content-faint truncate" title={users.length ? `Used by ${users.join(', ')}` : 'Not used by any project'}>{j.filename}</div>
                      <button onClick={() => addToProject([j.filename])} className="text-[10px] text-accent hover:underline cursor-pointer" title="Use in this project">Add</button>
                      {users.length === 0 && (
                        <button onClick={() => deleteJarFile(j.path)} className="text-content-ghost hover:text-err opacity-0 group-hover:opacity-100 cursor-pointer" title="Delete the file. No project uses it."><Icons.Trash size={10} /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="border-t border-line-subtle p-2.5 space-y-2">
            <button onClick={() => setMavenOpen(true)} className="w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-md text-[10.5px] font-medium text-accent border border-accent-border hover:bg-accent-dim cursor-pointer" title="Search Maven Central or paste a dependency; the jars it needs come along">
              <Icons.Download size={10} /> From Maven Central
            </button>
            <button onClick={addJar} className="w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-md text-[10.5px] font-medium text-content-secondary border border-line hover:bg-surface-2 cursor-pointer">
              <Icons.Plus size={10} /> Add JAR from disk
            </button>
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
                {s.path && s.content !== s.saved && <span className="w-1.5 h-1.5 rounded-full bg-warn" title="Changed since you saved it" />}
                {sources.length > 1 && (
                  <span onClick={(e) => { e.stopPropagation(); removeSource(s.id); }} className="text-content-ghost hover:text-err"><Icons.X size={9} /></span>
                )}
              </button>
            ))}
            <button onClick={addPasted} className="h-7 px-2 rounded-md text-[11px] text-content-faint hover:text-accent hover:bg-surface-2 cursor-pointer" title="New class">+ New</button>
            <button onClick={addFiles} className="h-7 px-2 rounded-md text-[11px] text-content-faint hover:text-accent hover:bg-surface-2 cursor-pointer" title="Load .java file(s)">Load .java</button>
            <button onClick={saveActive} className="h-7 px-2 rounded-md text-[11px] text-content-faint hover:text-accent hover:bg-surface-2 cursor-pointer" title="Save this class to a .java file on disk. The project itself saves as you work.">Export .java</button>
            <span className="flex-1" />
            {compileOk === true && <span className="text-[10px] font-medium text-[#10b981] px-2">✓ compiled</span>}
            {compileOk === false && <span className="text-[10px] font-medium text-err px-2">✗ errors</span>}
          </div>
          {/* The libraries the imports use that this project doesn't have */}
          {neededLibs.length > 0 && (
            <div className="shrink-0 flex items-center gap-2 px-3.5 py-1.5 border-b border-line-subtle text-[11.5px]" style={{ background: 'var(--accent-dim)' }}>
              <span className="text-content-secondary flex-1 min-w-0 truncate">
                Your imports use {neededLibs.length === 1 ? 'a library' : `${neededLibs.length} libraries`} this project doesn't have: <span className="font-mono text-content">{neededLibs.map((c) => c.a).join(', ')}</span>
                {unknownPkgs.length > 0 && <span className="text-content-faint"> (not on Maven Central: {unknownPkgs.join(', ')})</span>}
              </span>
              <button onClick={() => setMavenOpen(neededLibs)} className="shrink-0 h-6 px-2.5 rounded-md text-[11px] font-semibold cursor-pointer" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                Add {neededLibs.length === 1 ? 'it' : 'them'}
              </button>
            </div>
          )}
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
            <span className="flex-1" />
            {(output || error) && (
              <button
                onClick={() => { void navigator.clipboard.writeText(error || output).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
                className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer"
                title={error ? 'Copy the error' : 'Copy the output'}
              >
                {copied ? <><Icons.Dot size={9} /> Copied</> : <><Icons.Copy size={11} /> Copy</>}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto p-3">
            {error ? (
              <pre className="text-[11.5px] font-mono whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--err)' }}>{error}</pre>
            ) : output ? (
              <pre className="text-[11.5px] font-mono whitespace-pre-wrap leading-relaxed text-content">{output}</pre>
            ) : (
              <div className="text-[11px] text-content-faint italic">Compile ({kbd('⌘B')}), then Run ({kbd('⌘↵')}).</div>
            )}
          </div>
        </div>
      </div>
      {mavenOpen && (
        <MavenDialog
          library={library.map((j) => j.filename)}
          project={projectFiles}
          initialRoots={Array.isArray(mavenOpen) ? mavenOpen : undefined}
          onClose={() => setMavenOpen(false)}
          onAdded={(files) => { void loadJars(); addToProject(files); }}
        />
      )}
    </div>
  );
}
