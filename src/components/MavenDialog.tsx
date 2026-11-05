/**
 * "Add from Maven Central" for the Java tester. Search by name, or paste
 * whatever you copied (g:a:v, a <dependency> block, a whole pom.xml, a Gradle
 * line); the dialog works out every jar that needs, shows which you already
 * have, and downloads the rest into the managed JAR folder.
 */
import { useEffect, useRef, useState } from 'react';
import { invoke } from '../bridge';
import { Icons } from './Icons';
import { toast } from './Toast';
import { parseDependencyInput, resolveDependencies, searchCentral, versionsOf, type Coord, type Resolved, type SearchHit } from '../maven';

const fetchText = (url: string) => invoke<string>('maven_fetch_text', { url });

export function MavenDialog({ have, onClose, onDownloaded }: {
  /** Filenames already in the managed JAR folder. */
  have: string[];
  onClose: () => void;
  onDownloaded: () => void;
}) {
  const [text, setText] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  // What will be resolved: from pasted text, or from a picked search hit + version.
  const [roots, setRoots] = useState<Coord[]>([]);
  const [picked, setPicked] = useState<{ hit: SearchHit; versions: string[] } | null>(null);
  const [withDeps, setWithDeps] = useState(true);
  const [plan, setPlan] = useState<Resolved | null>(null);
  const [resolving, setResolving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !progress) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, progress]);

  // Pasted coordinates resolve straight away; a plain word waits for Search.
  const parsed = parseDependencyInput(text);
  useEffect(() => {
    if (picked) return;
    setRoots(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Work out the jars whenever the roots or the "with dependencies" choice change.
  const rootsKey = JSON.stringify(roots);
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
    setSearching(true); setError(''); setPicked(null);
    try { setHits(await searchCentral(fetchText, q)); }
    catch (e) { setError(String(e)); setHits(null); }
    finally { setSearching(false); }
  };

  const pick = async (hit: SearchHit) => {
    setPicked({ hit, versions: [hit.latest] });
    setRoots([{ g: hit.g, a: hit.a, v: hit.latest }]);
    try {
      const versions = await versionsOf(fetchText, hit.g, hit.a);
      setPicked((p) => (p && p.hit === hit ? { hit, versions: versions.length ? versions : [hit.latest] } : p));
    } catch { /* the latest version from search is still usable */ }
  };

  const status = (c: Coord) => {
    if (have.includes(`${c.a}-${c.v}.jar`)) return 'have';
    const other = have.find((f) => f.startsWith(`${c.a}-`) && /^\d/.test(f.slice(c.a.length + 1)));
    return other ? `other:${other}` : 'new';
  };
  const toGet = plan?.jars.filter((j) => status(j) !== 'have') ?? [];

  const download = async () => {
    if (!toGet.length) return;
    setProgress({ done: 0, total: toGet.length });
    const failed: string[] = [];
    let done = 0;
    // Four at a time: quick, and kind to a corporate proxy.
    const queue = [...toGet];
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (let j = queue.shift(); j; j = queue.shift()) {
        try { await invoke('download_maven_jar', { group: j.g, artifact: j.a, version: j.v }); }
        catch (e) { failed.push(`${j.a}-${j.v}: ${e}`); }
        setProgress({ done: ++done, total: toGet.length });
      }
    }));
    onDownloaded();
    setProgress(null);
    if (failed.length) {
      setError(`Couldn't download ${failed.length} of ${toGet.length}:\n${failed.join('\n')}`);
    } else {
      toast(`Added ${toGet.length} jar${toGet.length === 1 ? '' : 's'}`, 'success');
      onClose();
    }
  };

  const field = 'w-full px-2.5 py-2 text-[12px] font-mono bg-surface-2 border border-line rounded-md outline-none text-content placeholder:text-content-ghost focus:border-accent';

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center pt-[8vh] bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget && !progress) onClose(); }}>
      <div role="dialog" aria-label="Add from Maven Central" className="w-[min(640px,calc(100vw-32px))] max-h-[84vh] flex flex-col rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-start gap-3 px-4 pt-3.5 pb-3 border-b border-line-subtle">
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-content">Add from Maven Central</div>
            <div className="text-[11.5px] text-content-muted mt-0.5">Search by name, or paste a dependency from your pom.xml. The jars it needs come along too.</div>
          </div>
          <button onClick={onClose} disabled={!!progress} className="p-1 rounded text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer" aria-label="Close"><Icons.X size={14} /></button>
        </div>

        <div className="px-4 py-3 space-y-2.5 overflow-auto">
          <div className="flex gap-2 items-start">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => { setText(e.target.value); setPicked(null); setHits(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !text.includes('<')) { e.preventDefault(); void search(); } }}
              rows={text.includes('\n') ? 6 : 1}
              spellCheck={false}
              placeholder="jackson-databind   or   org.apache.commons:commons-lang3:3.14.0   or   <dependency>…"
              className={`${field} resize-none`}
            />
            {!parsed.length && (
              <button onClick={search} disabled={!text.trim() || searching} className="shrink-0 h-[34px] px-3 rounded-md text-[12px] font-semibold cursor-pointer disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                {searching ? 'Searching…' : 'Search'}
              </button>
            )}
          </div>

          {hits && !picked && (
            hits.length === 0
              ? <div className="text-[12px] text-content-faint">Nothing on Maven Central matches that.</div>
              : <div className="rounded-md border border-line-subtle divide-y divide-line-subtle max-h-[300px] overflow-auto">
                  {hits.map((h) => (
                    <button key={`${h.g}:${h.a}`} onClick={() => pick(h)} className="w-full text-left px-3 py-2 hover:bg-surface-2 cursor-pointer flex items-baseline gap-2">
                      <span className="text-[12.5px] font-medium text-content">{h.a}</span>
                      <span className="text-[11px] font-mono text-content-faint truncate">{h.g}</span>
                      <span className="flex-1" />
                      <span className="text-[11px] font-mono text-content-muted shrink-0">{h.latest}</span>
                    </button>
                  ))}
                </div>
          )}

          {picked && (
            <div className="flex items-center gap-2 text-[12px]">
              <button onClick={() => { setPicked(null); setRoots([]); }} className="text-content-faint hover:text-content cursor-pointer" title="Back to the results">
                <Icons.ChevronRight size={12} className="rotate-180" />
              </button>
              <span className="font-mono text-content">{picked.hit.g}:{picked.hit.a}</span>
              <select
                value={roots[0]?.v}
                onChange={(e) => setRoots([{ g: picked.hit.g, a: picked.hit.a, v: e.target.value }])}
                className="h-7 px-1.5 rounded bg-surface-2 border border-line text-[11.5px] font-mono text-content cursor-pointer outline-none"
              >
                {picked.versions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          )}

          {roots.length > 0 && (
            <>
              <label className="flex items-center gap-2 text-[12px] text-content-secondary cursor-pointer select-none">
                <input type="checkbox" checked={withDeps} onChange={(e) => setWithDeps(e.target.checked)} className="accent-[var(--accent)]" />
                Also add the jars {roots.length === 1 ? 'it needs' : 'they need'}
              </label>
              {resolving && <div className="text-[12px] text-content-faint">Working out the jars…</div>}
              {plan && (
                <div className="rounded-md border border-line-subtle divide-y divide-line-subtle max-h-[280px] overflow-auto">
                  {plan.jars.map((j) => {
                    const s = status(j);
                    return (
                      <div key={`${j.g}:${j.a}`} className="px-3 py-1.5 flex items-baseline gap-2 text-[12px]">
                        <span className="font-mono text-content">{j.a}-{j.v}.jar</span>
                        {j.via && <span className="text-[11px] text-content-ghost truncate">for {j.via}</span>}
                        <span className="flex-1" />
                        {s === 'have' && <span className="text-[11px] text-content-faint shrink-0">already added</span>}
                        {s.startsWith('other:') && <span className="text-[11px] text-warn shrink-0" title="Two versions of one library on the classpath can clash; remove the one you don't want">you also have {s.slice(6)}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              {plan && plan.problems.length > 0 && (
                <div className="text-[11.5px] text-warn whitespace-pre-wrap">{plan.problems.join('\n')}</div>
              )}
            </>
          )}

          {error && <div className="text-[11.5px] text-err whitespace-pre-wrap">{error}</div>}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-line-subtle">
          <span className="text-[11.5px] text-content-faint">
            {progress ? `Downloading ${progress.done} of ${progress.total}…`
              : plan ? (toGet.length ? `${toGet.length} to download` : 'You have all of these already') : ''}
          </span>
          <span className="flex-1" />
          <button onClick={onClose} disabled={!!progress} className="h-8 px-3 rounded-md text-[12px] text-content-secondary hover:bg-surface-2 cursor-pointer disabled:opacity-50">Cancel</button>
          <button
            onClick={download}
            disabled={!toGet.length || !!progress || resolving}
            className="h-8 px-3.5 rounded-md text-[12px] font-semibold cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {toGet.length > 1 ? `Download ${toGet.length} jars` : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
