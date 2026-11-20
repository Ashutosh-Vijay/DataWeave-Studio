/**
 * Upgrade check: before moving Mule from one version to another, compile every
 * DataWeave script in a folder of projects on BOTH DataWeave versions and list
 * what breaks.
 *
 * Each version is the real engine, resolved from MuleSoft's repository with the
 * app's Maven resolver and loaded by the engine server into its own classloader
 * (op=engineCheck). Imitating an old version with a language level on 2.13 is
 * not enough: it doesn't reproduce, for example, 2.12's stricter import check.
 *
 * Compile only: a script is checked for syntax, imports, types and functions,
 * not for what it outputs on real data. Everything runs on this machine.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from './Icons';
import { WindowControls } from './WindowControls';
import { invoke } from '../bridge';
import { resolveDependencies, type Coord } from '../maven';
import { findInlineScripts } from '../muleInline';

const CENTRAL = 'https://repo1.maven.org/maven2';
const MULE_REPO = 'https://repository.mulesoft.org/nexus/content/repositories/releases';
const PREFS_KEY = 'dw.upgradeCheck';

/** The resolver asks Maven Central; DataWeave's own artifacts live in
 *  MuleSoft's repository, so try that first for every request. */
const fetchText = (url: string): Promise<string> => {
  // A released POM never changes, so a second check doesn't ask again.
  let p = pomCache.get(url);
  if (!p) {
    p = invoke<string>('maven_fetch_text', { url: url.replace(CENTRAL, MULE_REPO) })
      .catch(() => invoke<string>('maven_fetch_text', { url }));
    p.catch(() => pomCache.delete(url));
    if (!url.endsWith('maven-metadata.xml')) pomCache.set(url, p);
  }
  return p;
};
const pomCache = new Map<string, Promise<string>>();

type Status = 'breaks' | 'fixed' | 'both' | 'ok';
interface Item { key: string; script: string; path: string; project: string; file: string; test: boolean; index?: number; flow?: string; target?: string }
interface Outcome { ok: boolean; error?: string; line?: number }
interface Row extends Item { status: Status; from?: Outcome; to?: Outcome }

const STATUS_LABEL: Record<Status, string> = { breaks: 'Breaks', fixed: 'Fixed by upgrade', both: 'Fails on both', ok: 'OK' };
const STATUS_COLOR: Record<Status, string> = { breaks: 'var(--err)', fixed: 'var(--accent)', both: 'var(--warn)', ok: 'var(--content-faint)' };

/** Mule 4.x ships DataWeave 2.x. */
const muleOf = (dw: string) => `Mule 4.${dw.split('.')[1]}`;

/** What to do about the errors we understand. */
function hintFor(error: string, script: string): string | null {
  const ref = error.match(/Unable to resolve reference of: `([^`]+)`/)?.[1];
  if (ref && new RegExp(`import[^\\n]*\\b${ref}\\b[^\\n]*from`).test(script)) {
    return `Up to DataWeave 2.11 an import was accepted if the module merely saw the name (often through dw::Core). From 2.12 the module must declare it. Import ${ref} from the module that declares it, or drop the import if it comes from dw::Core.`;
  }
  if (/Unable to resolve module with identifier dw::util::jwt/.test(error)) {
    return 'The JWT modules are in DataWeave 2.13, and in patch releases 2.6.31, 2.9.19 and 2.12.4. Pick a later patch of the target line.';
  }
  if (/Unable to resolve module with identifier dw::test::/.test(error)) {
    return 'dw::test modules come with MUnit, not with DataWeave, so this check cannot load them.';
  }
  const fn = error.match(/`([A-Za-z]+)` requires runtime version `([\d.]+)`/);
  if (fn) return `${fn[1]} needs DataWeave ${fn[2]} or later.`;
  return null;
}

export function UpgradeCheck({
  open,
  onClose,
  defaultFolder,
  onOpenFile,
  onOpenInline,
}: {
  open: boolean;
  onClose: () => void;
  defaultFolder: string;
  onOpenFile: (path: string) => void;
  onOpenInline: (path: string, index: number) => void;
}) {
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; } }, []);
  const [folder, setFolder] = useState<string>(saved.folder || defaultFolder || '');
  const [versions, setVersions] = useState<string[]>([]);
  const [versionError, setVersionError] = useState('');
  const [from, setFrom] = useState<string>(saved.from || '');
  const [to, setTo] = useState<string>(saved.to || '');
  // MUnit suites and their recorded .dwl data are not what an upgrade breaks first.
  const [includeTests, setIncludeTests] = useState<boolean>(!!saved.includeTests);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [filter, setFilter] = useState<Status | 'all'>('breaks');
  const stopRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !running) onClose(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, running]);

  // Every released DataWeave version (plain x.y.z, no release candidates or dated builds).
  useEffect(() => {
    if (!open || versions.length) return;
    fetchText(`${CENTRAL}/org/mule/weave/runtime/maven-metadata.xml`)
      .then((xml) => {
        const all = [...xml.matchAll(/<version>(\d+\.\d+\.\d+)<\/version>/g)].map((m) => m[1]);
        const sorted = [...new Set(all)].filter((v) => v.startsWith('2.')).sort((a, b) => {
          const [, am, ap] = a.split('.').map(Number); const [, bm, bp] = b.split('.').map(Number);
          return bm - am || bp - ap;
        });
        setVersions(sorted);
        setFrom((f) => f || sorted.find((v) => v.startsWith('2.4.')) || sorted[sorted.length - 1] || '');
        setTo((t) => t || sorted[0] || '');
      })
      .catch((e) => setVersionError(`Couldn't list DataWeave versions from MuleSoft's repository: ${String(e)}`));
  }, [open, versions.length]);

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ folder, from, to, includeTests })); } catch { /* ignore */ }
  }, [folder, from, to, includeTests]);

  if (!open) return null;

  const lines = [...new Set(versions.map((v) => v.split('.').slice(0, 2).join('.')))];
  const patchesOf = (line: string) => versions.filter((v) => v.startsWith(line + '.'));
  const lineOf = (v: string) => v.split('.').slice(0, 2).join('.');

  const pickFolder = async () => {
    const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
    const picked = await openDialog({ directory: true });
    if (typeof picked === 'string') setFolder(picked);
  };

  // The engine plus the modules Mule ships that change what compiles: Java
  // interop, YAML and the JSON / XML schema loaders. Some are missing for old
  // versions; that is reported, not fatal.
  const engineJars = async (v: string, notes: string[]): Promise<Coord[]> => {
    const core = await resolveDependencies(fetchText, [
      { g: 'org.mule.weave', a: 'runtime', v }, { g: 'org.mule.weave', a: 'core-modules', v },
    ]);
    if (!core.jars.length) throw new Error(`DataWeave ${v} could not be resolved: ${core.problems.join('; ')}`);
    const byKey = new Map(core.jars.map((j) => [`${j.g}:${j.a}`, { g: j.g, a: j.a, v: j.v }]));
    const extras = ['java-module', 'yaml-module', 'jsonschema-module', 'xmlschema-module'];
    const resolved = await Promise.all(extras.map((a) => resolveDependencies(fetchText, [{ g: 'org.mule.weave', a, v }]).catch(() => null)));
    extras.forEach((a, i) => {
      const extra = resolved[i];
      // A version that doesn't exist still comes back as itself, with a
      // "couldn't read its POM" problem.
      if (!extra || !extra.jars.length || extra.problems.some((p) => p.startsWith(`org.mule.weave:${a}:${v}:`))) {
        notes.push(`${a} isn't published for DataWeave ${v}, so scripts that need it fail on that version.`);
        return;
      }
      for (const j of extra.jars) if (!byKey.has(`${j.g}:${j.a}`)) byKey.set(`${j.g}:${j.a}`, { g: j.g, a: j.a, v: j.v });
    });
    return [...byKey.values()];
  };

  const scan = async (): Promise<Item[]> => {
    // list_dwl_files returns paths relative to the folder.
    const base = folder.replace(/\\/g, '/').replace(/\/+$/, '');
    const files = await invoke<string[]>('list_dwl_files', { dir: folder });
    const items: Item[] = [];
    for (const rel of files) {
      const path = `${base}/${rel}`;
      const norm = path;
      const at = norm.indexOf('/src/');
      const projectRoot = at >= 0 ? norm.slice(0, at) : norm.slice(0, norm.lastIndexOf('/'));
      const project = projectRoot.split('/').pop() || projectRoot;
      const file = at >= 0 ? norm.slice(at + 1) : norm.split('/').pop()!;
      const test = file.startsWith('src/test/');
      if (test && !includeTests) continue;
      const text = await invoke<string>('read_text_file', { path });
      if (/\.dwl$/i.test(path)) {
        items.push({ key: path, script: text, path, project, file, test });
      } else {
        for (const s of findInlineScripts(text)) {
          items.push({ key: `${path}#${s.index}`, script: s.text, path, project, file, test, index: s.index, flow: s.flow, target: s.target });
        }
      }
    }
    return items;
  };

  const run = async () => {
    if (!folder || !from || !to || running) return;
    setRunning(true);
    setRows(null);
    setProblems([]);
    stopRef.current = false;
    const notes: string[] = [];
    try {
      setProgress('Finding scripts…');
      const items = await scan();
      if (!items.length) { setProgress(''); setProblems([`No .dwl files or inline transforms found in this folder${includeTests ? '' : ' outside src/test'}.`]); return; }
      const projects = [...new Set(items.map((i) => i.project))];
      const outcomes: Record<string, Map<string, Outcome>> = { from: new Map(), to: new Map() };
      for (const [side, v] of [['from', from], ['to', to]] as const) {
        setProgress(`Getting DataWeave ${v} (${muleOf(v)})… the first time downloads it.`);
        const jars = await engineJars(v, notes);
        for (let p = 0; p < projects.length; p++) {
          if (stopRef.current) throw new Error('Stopped.');
          const group = items.filter((i) => i.project === projects[p]);
          setProgress(`Compiling on DataWeave ${v}: ${projects[p]} (${p + 1} of ${projects.length}, ${group.length} scripts)${p === 0 ? '. The first time, this downloads the engine (about 30 MB).' : ''}`);
          const res = await invoke<{ results: (Outcome & { key: string })[]; problems: string[] }>('dw_engine_check', {
            request: { jars, items: group.map(({ key, script, path }) => ({ key, script, path })) },
          });
          for (const r of res.results) outcomes[side].set(r.key, r);
          notes.push(...res.problems);
        }
      }
      const out: Row[] = items.map((it) => {
        const a = outcomes.from.get(it.key), b = outcomes.to.get(it.key);
        const status: Status = a?.ok && b?.ok ? 'ok' : a?.ok && !b?.ok ? 'breaks' : !a?.ok && b?.ok ? 'fixed' : 'both';
        return { ...it, status, from: a, to: b };
      });
      const order: Status[] = ['breaks', 'both', 'fixed', 'ok'];
      out.sort((x, y) => order.indexOf(x.status) - order.indexOf(y.status) || x.project.localeCompare(y.project) || x.file.localeCompare(y.file));
      setRows(out);
      setFilter(out.some((r) => r.status === 'breaks') ? 'breaks' : 'all');
      setProgress('');
    } catch (e) {
      setProgress('');
      notes.unshift(String(e instanceof Error ? e.message : e));
    } finally {
      setProblems([...new Set(notes)]);
      setRunning(false);
    }
  };

  const counts = (rows ?? []).reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {} as Record<Status, number>);
  const shown = (rows ?? []).filter((r) => filter === 'all' || r.status === filter);
  const where = (r: Row) => (r.index !== undefined ? `${r.file} · ${r.flow} / ${r.target}` : r.file);

  const saveReport = async () => {
    if (!rows) return;
    const md: string[] = [`# Upgrade check: ${muleOf(from)} (DataWeave ${from}) to ${muleOf(to)} (DataWeave ${to})`, '', `Folder: ${folder}`, '',
      `Breaks: ${counts.breaks ?? 0} · Fails on both: ${counts.both ?? 0} · Fixed by upgrade: ${counts.fixed ?? 0} · OK: ${counts.ok ?? 0}`, ''];
    for (const s of ['breaks', 'both', 'fixed'] as Status[]) {
      const list = rows.filter((r) => r.status === s);
      if (!list.length) continue;
      md.push(`## ${STATUS_LABEL[s]} (${list.length})`, '');
      for (const r of list) {
        const err = s === 'fixed' ? r.from : r.to;
        md.push(`- **${r.project}**${r.test ? ' (test)' : ''} \`${where(r)}\`${err?.line ? ` line ${err.line}` : ''}: ${err?.error ?? ''}`);
        const h = err?.error ? hintFor(err.error, r.script) : null;
        if (h) md.push(`  - ${h}`);
      }
      md.push('');
    }
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: `upgrade-check-${from}-to-${to}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (path) await invoke('save_output_file', { path, content: md.join('\n') });
  };

  const select = 'h-8 px-2 text-[12px] bg-surface-2 border border-line rounded outline-none text-content focus:border-accent';

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-bg">
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-2 pl-4 pr-3 border-b border-line bg-surface">
        <button onClick={onClose} disabled={running} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer disabled:opacity-50" title="Back to workspace (Esc)">
          <Icons.ChevronRight size={12} className="rotate-180" /> Back
        </button>
        <div className="w-px h-4 bg-line" />
        <Icons.Activity size={15} />
        <span className="text-[13px] font-semibold text-content">Upgrade check</span>
        <span className="text-[11px] text-content-ghost">Compile every script on both Mule versions and see what breaks</span>
        <span className="flex-1" />
        <WindowControls />
      </header>

      <div className="shrink-0 px-5 py-4 border-b border-line-subtle flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 min-w-[320px] flex-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-content-faint">Projects folder</span>
          <div className="flex gap-2">
            <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="A Mule project, or a folder of projects" spellCheck={false} className={`${select} flex-1 font-mono`} />
            <button onClick={pickFolder} disabled={running} className="h-8 px-3 rounded-md text-[12px] border border-line hover:bg-surface-2 cursor-pointer">Choose…</button>
          </div>
        </label>
        {([['From', from, setFrom], ['To', to, setTo]] as const).map(([label, value, set]) => (
          <label key={label} className="flex flex-col gap-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-content-faint">{label}</span>
            <div className="flex gap-1.5">
              <select value={lineOf(value)} disabled={running || !versions.length} onChange={(e) => set(patchesOf(e.target.value)[0] ?? '')} className={select}>
                {lines.map((l) => <option key={l} value={l}>Mule 4.{l.split('.')[1]}</option>)}
              </select>
              <select value={value} disabled={running || !versions.length} onChange={(e) => set(e.target.value)} className={`${select} font-mono`}>
                {patchesOf(lineOf(value)).map((v) => <option key={v} value={v}>DW {v}</option>)}
              </select>
            </div>
          </label>
        ))}
        <label className="h-8 flex items-center gap-1.5 text-[12px] text-content-secondary cursor-pointer select-none" title="MUnit suites and the .dwl data they record, under src/test">
          <input type="checkbox" checked={includeTests} disabled={running} onChange={(e) => setIncludeTests(e.target.checked)} className="accent-[var(--accent)]" />
          Include tests
        </label>
        {running ? (
          <button onClick={() => { stopRef.current = true; }} className="h-8 px-4 rounded-md text-[12px] font-medium border border-line hover:bg-surface-2 cursor-pointer">Stop</button>
        ) : (
          <button onClick={run} disabled={!folder || !from || !to} className="h-8 px-4 rounded-md text-[12px] font-semibold bg-accent text-accent-ink hover:brightness-110 cursor-pointer disabled:opacity-50 disabled:cursor-default">Check</button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
        {versionError && <div className="text-[12px] text-err mb-3">{versionError}</div>}
        {progress && <div className="text-[12px] text-content-secondary mb-3 flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />{progress}</div>}
        {problems.length > 0 && (
          <div className="mb-4 rounded-md border border-line-subtle bg-surface px-3 py-2">
            {problems.map((p) => <div key={p} className="text-[11.5px] text-content-muted leading-relaxed">{p}</div>)}
          </div>
        )}

        {!rows && !running && (
          <div className="max-w-[640px] text-[12.5px] text-content-muted leading-relaxed space-y-2">
            <p>Pick a Mule project, or a folder holding many, and the Mule version you run today and the one you&rsquo;re moving to. Every <span className="font-mono">.dwl</span> file and every Transform in your flow XML is compiled with both DataWeave versions, each with its own project&rsquo;s modules and schemas.</p>
            <p>A script that compiles on your current version but not the new one is listed first, with the engine&rsquo;s message and line. This checks syntax, imports, types and functions, not the output on real data. Nothing leaves this machine; each engine version is downloaded once from MuleSoft&rsquo;s repository.</p>
          </div>
        )}

        {rows && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {(['breaks', 'both', 'fixed', 'ok'] as Status[]).map((s) => (
                <button key={s} onClick={() => setFilter(filter === s ? 'all' : s)}
                  className={`h-7 px-3 rounded-full text-[11.5px] border cursor-pointer ${filter === s ? 'border-accent bg-accent-dim text-content' : 'border-line text-content-secondary hover:bg-surface-2'}`}>
                  <span style={{ color: STATUS_COLOR[s] }}>●</span> {STATUS_LABEL[s]} <span className="font-mono">{counts[s] ?? 0}</span>
                </button>
              ))}
              <button onClick={() => setFilter('all')} className={`h-7 px-3 rounded-full text-[11.5px] border cursor-pointer ${filter === 'all' ? 'border-accent bg-accent-dim text-content' : 'border-line text-content-secondary hover:bg-surface-2'}`}>All {rows.length}</button>
              <span className="flex-1" />
              <button onClick={saveReport} className="h-7 px-3 rounded-md text-[11.5px] border border-line hover:bg-surface-2 cursor-pointer inline-flex items-center gap-1.5"><Icons.Download size={12} /> Save report</button>
            </div>
            {shown.length === 0 && <div className="text-[12px] text-content-faint">Nothing in this group.</div>}
            <div className="rounded-md border border-line-subtle overflow-hidden">
              {shown.map((r) => {
                const err = r.status === 'fixed' ? r.from : r.to;
                const hint = err?.error && r.status !== 'ok' ? hintFor(err.error, r.script) : null;
                return (
                  <button key={r.key} onClick={() => { r.index !== undefined ? onOpenInline(r.path, r.index) : onOpenFile(r.path); onClose(); }}
                    className="w-full text-left px-3 py-2 border-b border-line-subtle last:border-b-0 hover:bg-surface-2 cursor-pointer block" title="Open this script">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: STATUS_COLOR[r.status], background: `color-mix(in oklch, ${STATUS_COLOR[r.status]} 12%, transparent)` }}>{STATUS_LABEL[r.status]}</span>
                      <span className="text-[11.5px] text-content-faint">{r.project}</span>
                      {r.test && <span className="text-[10px] px-1.5 py-0.5 rounded border border-line text-content-faint">Test</span>}
                      <span className="text-[12px] font-mono text-content truncate">{where(r)}</span>
                      {err?.line ? <span className="text-[11px] text-content-faint">line {err.line}</span> : null}
                    </div>
                    {r.status !== 'ok' && err?.error && <div className="text-[11.5px] text-content-secondary mt-1 font-mono">{r.status === 'fixed' ? `On ${from}: ` : ''}{err.error}</div>}
                    {hint && <div className="text-[11.5px] text-content-muted mt-1">{hint}</div>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
