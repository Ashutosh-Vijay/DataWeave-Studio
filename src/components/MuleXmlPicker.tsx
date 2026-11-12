import { useEffect, useRef, useState } from 'react';
import type { InlineScript } from '../muleInline';

/** Lists the inline transforms of one Mule XML file; picking one opens it as a
 *  script that saves back into the same place in that file. */
export function MuleXmlPicker({ path, scripts, onPick, onClose }: {
  path: string;
  scripts: InlineScript[];
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const needle = query.trim().toLowerCase();
  const shown = scripts.filter((s) => `${s.flow} ${s.transform} ${s.target}`.toLowerCase().includes(needle));

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center pt-[12vh] px-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 65%, transparent)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-xl overflow-hidden flex flex-col max-h-[70vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 28px 80px color-mix(in oklch, oklch(0% 0 0) 55%, transparent)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Transforms in this file"
      >
        <div className="p-3 space-y-2" style={{ borderBottom: '1px solid var(--line-subtle)' }}>
          <div className="flex items-baseline gap-2">
            <span className="text-[13.5px] font-semibold" style={{ color: 'var(--content)' }}>
              {path.split(/[\\/]/).pop()}
            </span>
            <span className="text-[11.5px]" style={{ color: 'var(--content-faint)' }}>
              {scripts.length} inline {scripts.length === 1 ? 'transform' : 'transforms'}. Saving writes the script back into this file.
            </span>
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && shown.length > 0) onPick(shown[0].index); }}
            placeholder="Filter by flow, transform or variable"
            spellCheck={false}
            className="w-full h-8 px-2.5 rounded-md text-[12.5px] outline-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--content)' }}
          />
        </div>
        <div className="overflow-y-auto p-1.5">
          {shown.length === 0 && (
            <div className="px-2 py-3 text-[12px]" style={{ color: 'var(--content-faint)' }}>No matches.</div>
          )}
          {shown.map((s, i) => (
            <div key={s.index}>
              {(i === 0 || shown[i - 1].flow !== s.flow) && (
                <div className="px-2 pt-2 pb-0.5 text-[10.5px] font-mono truncate" style={{ color: 'var(--content-faint)' }}>
                  {s.flow || '(outside a flow)'}
                </div>
              )}
              <button
                onClick={() => onPick(s.index)}
                className="w-full flex items-center gap-3 h-8 px-2 rounded-md text-left cursor-pointer hover:bg-surface-2 text-[12.5px]"
                style={{ color: 'var(--content)' }}
              >
                <span className="flex-1 truncate">{s.transform || 'Transform'}</span>
                <span className="font-mono text-[11px] shrink-0" style={{ color: 'var(--content-muted)' }}>{s.target}</span>
                <span className="font-mono text-[10.5px] shrink-0 w-16 text-right" style={{ color: 'var(--content-faint)' }}>
                  {s.text.trim().split('\n').length} {s.text.trim().split('\n').length === 1 ? 'line' : 'lines'}
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
