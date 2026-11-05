/**
 * "Add from Maven Central" for the Java tester. Search by name, or paste
 * whatever you copied (g:a:v, a <dependency> block, a whole pom.xml, a Gradle
 * line), or arrive with the libraries your imports need. The dialog works out
 * every jar those need, reuses any you downloaded before, and adds them to the
 * current project.
 */
import { useEffect, useRef, useState } from 'react';
import { invoke } from '../bridge';
import { Icons } from './Icons';
import { toast } from './Toast';
import { parseDependencyInput, resolveDependencies, searchCentral, versionsOf, type Coord, type Resolved, type SearchHit } from '../maven';

const fetchText = (url: string) => invoke<string>('maven_fetch_text', { url });

/** `a-1.2.jar` belongs to artifact `a` (the version starts with a digit). */
export const jarOfArtifact = (file: string, a: string) => file.startsWith(`${a}-`) && /^\d/.test(file.slice(a.length + 1)) && file.endsWith('.jar');

export function MavenDialog({ library, project, initialRoots, onClose, onAdded }: {
  /** Every jar already downloaded (filenames). */
  library: string[];
  /** The jars this project uses (filenames). */
  project: string[];
  /** Start with these (from the project's imports) instead of an empty search. */
  initialRoots?: Coord[];
  onClose: () => void;
  /** Filenames to put on the project, all present in the library by now. */
  onAdded: (files: string[]) => void;
}) {
  const [text, setText] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [roots, setRoots] = useState<Coord[]>(initialRoots ?? []);
  const [versions, setVersions] = useState<Record<string, string[]>>({});
  const [withDeps, setWithDeps] = useState(true);
  const [plan, setPlan] = useState<Resolved | null>(null);
  const [resolving, setResolving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!initialRoots?.length) inputRef.current?.focus(); }, [initialRoots]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !progress) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, progress]);

  // Pasted coordinates replace the list; a plain word waits for Search.
  const parsed = parseDependencyInput(text);
  useEffect(() => {
    if (parsed.length) { setRoots(parsed); setHits(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Each library gets a version picker; an empty version becomes the latest.
  const rootsKey = JSON.stringify(roots);
  useEffect(() => {
    for (const r of roots) {
      const k = `${r.g}:${r.a}`;
      if (versions[k]) continue;
      setVersions((v) => ({ ...v, [k]: [] }));
      versionsOf(fetchText, r.g, r.a)
        .then((list) => {
          setVersions((v) => ({ ...v, [k]: list }));
          if (list.length) setRoots((rs) => rs.map((x) => (`${x.g}:${x.a}` === k && !x.v ? { ...x, v: list[0] } : x)));
        })
        .catch(() => { /* resolve still picks the latest */ });
    }
  }, [rootsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Work out the jars whenever the libraries, versions or the deps choice change.
  useEffect(() => {
    setPlan(null); setError('');
    if (!roots.length) return;
    let stale = false;
    setResolving(true);
    const t = setTimeout(() => {
      resolveDependencies(fetchText, roots, withDeps)
        .then((r) => { if (!stale) setPlan(r); })
        .catch((e) => { if (!stale) setError(String(e)); })
        .finally(() => { if (!stale) setResolving(false); });
    }, 350);
    return () => { stale = true; clearTimeout(t); };
  }, [rootsKey, withDeps]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = async () => {
    const q = text.trim();
    if (!q || parsed.length) return;
    setSearching(true); setError('');
    try { setHits(await searchCentral(fetchText, q)); }
    catch (e) { setError(String(e)); setHits(null); }
    finally { setSearching(false); }
  };

  const status = (c: Coord): { kind: 'project' | 'library' | 'new'; replaces?: string } => {
    const file = `${c.a}-${c.v}.jar`;
    if (project.includes(file)) return { kind: 'project' };
    const replaces = project.find((f) => jarOfArtifact(f, c.a));
    return { kind: library.includes(file) ? 'library' : 'new', replaces };
  };
  const toAdd = plan?.jars.filter((j) => status(j).kind !== 'project') ?? [];
  const toDownload = toAdd.filter((j) => status(j).kind === 'new');

  const add = async () => {
    if (!toAdd.length) return;
    const failed: string[] = [];
    if (toDownload.length) {
      setProgress({ done: 0, total: toDownload.length });
      let done = 0;
      // Four at a time: quick, and kind to a corporate proxy.
      const queue = [...toDownload];
      await Promise.all(Array.from({ length: 4 }, async () => {
        for (let j = queue.shift(); j; j = queue.shift()) {
          try { await invoke('download_maven_jar', { group: j.g, artifact: j.a, version: j.v }); }
          catch (e) { failed.push(`${j.a}-${j.v}: ${e}`); }
          setProgress({ done: ++done, total: toDownload.length });
        }
      }));
      setProgress(null);
    }
    const ok = toAdd.map((j) => `${j.a}-${j.v}.jar`).filter((f) => !failed.some((x) => x.startsWith(f.replace(/\.jar$/, ':'))));
    onAdded(ok);
    if (failed.length) {
      setError(`Couldn't download ${failed.length} of ${toDownload.length}:\n${failed.join('\n')}`);
    } else {
      toast(`Added ${ok.length} jar${ok.length === 1 ? '' : 's'} to this project${toDownload.length < ok.length ? ` (${ok.length - toDownload.length} you already had)` : ''}`, 'success');
      onClose();
    }
  };

  const field = 'w-full px-2.5 py-2 text-[12px] font-mono bg-surface-2 border border-line rounded-md outline-none text-content placeholder:text-content-ghost focus:border-accent';
  const select = 'h-7 px-1.5 rounded bg-surface-2 border border-line text-[11.5px] font-mono text-content cursor-pointer outline-none';

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center pt-[8vh] bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget && !progress) onClose(); }}>
      <div role="dialog" aria-label="Add from Maven Central" className="w-[min(640px,calc(100vw-32px))] max-h-[84vh] flex flex-col rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-start gap-3 px-4 pt-3.5 pb-3 border-b border-line-subtle">
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-content">Add from Maven Central</div>
            <div className="text-[11.5px] text-content-muted mt-0.5">
              {initialRoots?.length
                ? 'Your imports use these libraries. Check the versions, then add them.'
                : 'Search by name, or paste a dependency from your pom.xml. The jars it needs come along too.'}
            </div>
          </div>
          <button onClick={onClose} disabled={!!progress} className="p-1 rounded text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer" aria-label="Close"><Icons.X size={14} /></button>
        </div>

        <div className="px-4 py-3 space-y-2.5 overflow-auto">
          <div className="flex gap-2 items-start">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !text.includes('<')) { e.preventDefault(); void search(); } }}
              rows={text.includes('\n') ? 6 : 1}
              spellCheck={false}
              placeholder={initialRoots?.length ? 'Add another: search or paste a dependency' : 'jackson-databind   or   org.apache.commons:commons-lang3:3.14.0   or   <dependency>…'}
              className={`${field} resize-none`}
            />
            {!parsed.length && (
              <button onClick={search} disabled={!text.trim() || searching} className="shrink-0 h-[34px] px-3 rounded-md text-[12px] font-semibold cursor-pointer disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                {searching ? 'Searching…' : 'Search'}
              </button>
            )}
          </div>

          {hits && (
            hits.length === 0
              ? <div className="text-[12px] text-content-faint">Nothing on Maven Central matches that.</div>
              : <div className="rounded-md border border-line-subtle divide-y divide-line-subtle max-h-[260px] overflow-auto">
                  {hits.map((h) => (
                    <button
                      key={`${h.g}:${h.a}`}
                      onClick={() => { setHits(null); setText(''); setRoots((rs) => [...rs.filter((r) => r.a !== h.a || r.g !== h.g), { g: h.g, a: h.a, v: h.latest }]); }}
                      className="w-full text-left px-3 py-2 hover:bg-surface-2 cursor-pointer flex items-baseline gap-2"
                    >
                      <span className="text-[12.5px] font-medium text-content">{h.a}</span>
                      <span className="text-[11px] font-mono text-content-faint truncate">{h.g}</span>
                      <span className="flex-1" />
                      <span className="text-[11px] font-mono text-content-muted shrink-0">{h.latest}</span>
                    </button>
                  ))}
                </div>
          )}

          {roots.length > 0 && (
            <div className="space-y-1.5">
              {roots.map((r, i) => {
                const list = versions[`${r.g}:${r.a}`] ?? [];
                return (
                  <div key={`${r.g}:${r.a}`} className="flex items-center gap-2 text-[12px]">
                    <span className="font-mono text-content truncate">{r.g}:<span className="font-semibold">{r.a}</span></span>
                    <span className="flex-1" />
                    <select value={r.v} onChange={(e) => setRoots((rs) => rs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} className={select}>
                      {!list.includes(r.v) && <option value={r.v}>{r.v || 'latest'}</option>}
                      {list.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <button onClick={() => setRoots((rs) => rs.filter((_, j) => j !== i))} className="p-1 text-content-ghost hover:text-err cursor-pointer" aria-label={`Leave out ${r.a}`} title="Leave this one out"><Icons.X size={11} /></button>
                  </div>
                );
              })}
              <label className="flex items-center gap-2 pt-1 text-[12px] text-content-secondary cursor-pointer select-none">
                <input type="checkbox" checked={withDeps} onChange={(e) => setWithDeps(e.target.checked)} className="accent-[var(--accent)]" />
                Also add the jars {roots.length === 1 ? 'it needs' : 'they need'}
              </label>
            </div>
          )}

          {resolving && <div className="text-[12px] text-content-faint">Working out the jars…</div>}
          {plan && (
            <div className="rounded-md border border-line-subtle divide-y divide-line-subtle max-h-[260px] overflow-auto">
              {plan.jars.map((j) => {
                const s = status(j);
                return (
                  <div key={`${j.g}:${j.a}`} className="px-3 py-1.5 flex items-baseline gap-2 text-[12px]">
                    <span className="font-mono text-content">{j.a}-{j.v}.jar</span>
                    {j.via && <span className="text-[11px] text-content-ghost truncate">for {j.via}</span>}
                    <span className="flex-1" />
                    <span className={`text-[11px] shrink-0 ${s.replaces ? 'text-warn' : 'text-content-faint'}`}>
                      {s.kind === 'project' ? 'already in this project'
                        : s.replaces ? `replaces ${s.replaces}`
                        : s.kind === 'library' ? 'downloaded before, will be reused'
                        : 'new download'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {plan && plan.problems.length > 0 && <div className="text-[11.5px] text-warn whitespace-pre-wrap">{plan.problems.join('\n')}</div>}
          {error && <div className="text-[11.5px] text-err whitespace-pre-wrap">{error}</div>}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-line-subtle">
          <span className="text-[11.5px] text-content-faint">
            {progress ? `Downloading ${progress.done} of ${progress.total}…`
              : plan ? (toAdd.length ? `${toDownload.length} to download` : 'This project has all of these already') : ''}
          </span>
          <span className="flex-1" />
          <button onClick={onClose} disabled={!!progress} className="h-8 px-3 rounded-md text-[12px] text-content-secondary hover:bg-surface-2 cursor-pointer disabled:opacity-50">Cancel</button>
          <button
            onClick={add}
            disabled={!toAdd.length || !!progress || resolving}
            className="h-8 px-3.5 rounded-md text-[12px] font-semibold cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {toAdd.length > 1 ? `Add ${toAdd.length} jars` : 'Add to project'}
          </button>
        </div>
      </div>
    </div>
  );
}
