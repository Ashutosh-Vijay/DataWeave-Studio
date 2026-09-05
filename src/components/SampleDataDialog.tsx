import { useCallback, useEffect, useState } from 'react';
import { Icons } from './Icons';
import { listDeclaredTypes, generateSample } from '../sampleData';

/**
 * Generate a realistic sample payload from a type the script declares.
 *
 * Shows the result before applying it, because replacing the payload throws
 * away whatever the user had there. Pick a type, look at what came out,
 * re-roll if you don't like it, then decide.
 */
export function SampleDataDialog({
  open, script, mimeType, onClose, onUse,
}: {
  open: boolean;
  script: string;
  mimeType: string;
  onClose: () => void;
  onUse: (data: string) => void;
}) {
  const [types, setTypes] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [rows, setRows] = useState(1);
  const [data, setData] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (typeName: string, repeat: number) => {
    setBusy(true);
    setError(null);
    try {
      const res = await generateSample(script, typeName || null, mimeType, repeat);
      setData(res.data);
    } catch (e) {
      setData('');
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [script, mimeType]);

  // On open: find the declared types and generate from the first one, so the
  // dialog opens with something to look at rather than an empty frame.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const found = await listDeclaredTypes(script);
      if (cancelled) return;
      setTypes(found);
      const first = found[0] ?? '';
      setSelected(first);
      void run(first, 1);
    })();
    return () => { cancelled = true; };
  }, [open, script, run]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 65%, transparent)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[620px] rounded-xl overflow-hidden flex flex-col"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: '0 32px 80px color-mix(in oklch, oklch(0% 0 0) 55%, transparent)',
          maxHeight: '80vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}
          >
            <Icons.Zap size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--content)' }}>
              Generate sample data
            </div>
            <div className="text-[12.5px] mt-1 leading-relaxed" style={{ color: 'var(--content-muted)' }}>
              {types.length > 0
                ? 'Built from a type your script declares. Field names guide the values — an email looks like an email.'
                : 'Your script declares no types, so this is generated from the shape your script outputs.'}
            </div>
          </div>
        </div>

        <div className="px-6 pb-3 flex items-center gap-2 flex-wrap">
          {types.length > 0 && (
            <select
              value={selected}
              onChange={(e) => { setSelected(e.target.value); void run(e.target.value, rows); }}
              className="h-8 px-2 rounded-md text-[12.5px] cursor-pointer"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--content)' }}
            >
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <label className="text-[11.5px] flex items-center gap-1.5" style={{ color: 'var(--content-faint)' }}>
            Repeat
            <input
              type="number"
              min={1}
              max={25}
              value={rows}
              onChange={(e) => {
                const n = Math.max(1, Math.min(25, Number(e.target.value) || 1));
                setRows(n);
                void run(selected, n);
              }}
              className="h-8 w-[62px] px-2 rounded-md text-[12.5px] text-right"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--content)' }}
              title="How many entries to generate inside arrays"
            />
          </label>
          <button
            onClick={() => void run(selected, rows)}
            disabled={busy}
            className="h-8 px-3 rounded-md text-[12.5px] cursor-pointer disabled:opacity-50"
            style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--content-secondary)' }}
            title="Generate a different set of values"
          >
            {busy ? 'Generating…' : 'Re-roll'}
          </button>
          <span className="flex-1" />
          <span className="font-mono text-[10.5px]" style={{ color: 'var(--content-ghost)' }}>{mimeType}</span>
        </div>

        <div className="px-6 pb-4 flex-1 min-h-0 overflow-auto">
          {error ? (
            <div
              className="text-[12px] leading-relaxed rounded-lg p-3"
              style={{
                background: 'color-mix(in oklch, var(--err) 8%, transparent)',
                border: '1px solid color-mix(in oklch, var(--err) 26%, transparent)',
                color: 'var(--content-secondary)',
              }}
            >
              {error}
            </div>
          ) : (
            <pre
              className="font-mono text-[11.5px] leading-relaxed rounded-lg p-3 m-0 select-text"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--line-subtle)',
                color: 'var(--content)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {data || (busy ? 'Generating…' : '')}
            </pre>
          )}
        </div>

        <div
          className="px-6 py-3 flex items-center gap-2"
          style={{ borderTop: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}
        >
          <button
            onClick={onClose}
            className="h-8 px-3.5 rounded-md text-[12.5px] cursor-pointer"
            style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--content-secondary)' }}
          >
            Cancel
          </button>
          <span className="flex-1" />
          <button
            onClick={() => { void navigator.clipboard.writeText(data); }}
            disabled={!data}
            className="h-8 px-3.5 rounded-md text-[12.5px] cursor-pointer disabled:opacity-40"
            style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--content-secondary)' }}
          >
            Copy
          </button>
          <button
            onClick={() => { onUse(data); onClose(); }}
            disabled={!data}
            className="h-8 px-3.5 rounded-md text-[12.5px] font-semibold cursor-pointer disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            title="Replace the payload with this sample"
          >
            Use as payload
          </button>
        </div>
      </div>
    </div>
  );
}
