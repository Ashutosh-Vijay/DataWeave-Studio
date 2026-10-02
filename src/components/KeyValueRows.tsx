import { useState } from 'react';
import { KeyValuePair } from '../types';
import { handleBracketKey, applyWithCaret } from '../textareaBrackets';
import { Icons } from './Icons';

interface KeyValueRowsProps {
  label: string;
  /** "header", "query param": used for the add row. */
  noun: string;
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

/** The row checkbox shared by the Request and Vars tables. */
export function RowCheck({ on, onToggle, onFocus }: { on: boolean; onToggle: () => void; onFocus?: () => void }) {
  return (
    <button
      onClick={onToggle}
      onFocus={onFocus}
      aria-checked={on}
      role="checkbox"
      title={on ? 'Leave this row out' : 'Include this row'}
      className="w-8 h-8 self-start shrink-0 flex items-center justify-center cursor-pointer"
    >
      <span
        className="w-3 h-3 rounded-[3px] flex items-center justify-center transition-colors"
        style={{
          background: on ? 'var(--accent)' : 'transparent',
          border: `1px solid ${on ? 'var(--accent)' : 'var(--line-secondary)'}`,
        }}
      >
        {on && (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
    </button>
  );
}

/** Card header used by every Context table: title, live count, enable/disable all. */
export function TableHeader({ label, active, total, allOn, onSetAll }: {
  label: string;
  active: number;
  total: number;
  allOn: boolean;
  onSetAll: (on: boolean) => void;
}) {
  return (
    <div className="h-8 flex items-center gap-2 px-2.5 bg-surface-2 border-b border-line">
      <span className="text-[11.5px] font-medium text-content">{label}</span>
      {total > 0 && <span className="text-[10px] font-mono text-content-faint">{active}/{total}</span>}
      {total > 1 && (
        <button
          onClick={() => onSetAll(!allOn)}
          className="ml-auto text-[10.5px] text-content-faint hover:text-content-secondary cursor-pointer"
        >
          {allOn ? 'Disable all' : 'Enable all'}
        </button>
      )}
    </div>
  );
}

export function AddRow({ noun, onAdd }: { noun: string; onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="w-full h-8 px-2.5 flex items-center gap-1.5 text-[11px] text-content-faint hover:text-accent hover:bg-surface-2 cursor-pointer transition-colors"
    >
      <Icons.Plus size={11} />
      Add {noun}
    </button>
  );
}

export const cellInput =
  'bg-transparent px-2 text-[11.5px] placeholder-content-ghost focus:outline-none focus:bg-surface-input border-l border-line-subtle';

export function KeyValueRows({
  label,
  noun,
  pairs,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
}: KeyValueRowsProps) {
  const [focusedRow, setFocusedRow] = useState<number | null>(null);

  const updateRow = (index: number, field: 'key' | 'value', val: string) => {
    onChange(pairs.map((pair, i) => i === index ? { ...pair, [field]: val } : pair));
  };

  return (
    <div className="rounded-md border border-line bg-surface overflow-hidden">
      <TableHeader
        label={label}
        active={pairs.filter((p) => p.enabled !== false && p.key && p.value !== '').length}
        total={pairs.length}
        allOn={pairs.every((p) => p.enabled !== false)}
        onSetAll={(on) => onChange(pairs.map((p) => ({ ...p, enabled: on })))}
      />
      <div className="divide-y divide-line-subtle">
        {pairs.map((pair, i) => {
          const isExpanded = focusedRow === i;
          const enabled = pair.enabled !== false;
          return (
            <div
              key={i}
              onFocus={() => setFocusedRow(i)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusedRow(null);
              }}
              className="group flex items-stretch min-h-8"
            >
              <RowCheck
                on={enabled}
                onToggle={() => onChange(pairs.map((p, j) => j === i ? { ...p, enabled: !enabled } : p))}
              />
              {/* A one-line textarea rather than an input: it stretches with the row
                  when the value grows, with its text kept on the first line. */}
              <textarea
                value={pair.key}
                onChange={(e) => updateRow(i, 'key', e.target.value.replace(/\r?\n/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                placeholder={keyPlaceholder}
                rows={1}
                style={{ resize: 'none', overflow: 'hidden' }}
                className={`${cellInput} w-[38%] shrink-0 py-[7px] leading-[18px] ${enabled ? 'text-content' : 'text-content-faint line-through'}`}
              />
              {/* Always a textarea, so focusing it never swaps the element. */}
              <textarea
                value={pair.value}
                onChange={(e) => updateRow(i, 'value', e.target.value)}
                // Brackets only, no quote pairing: `Bearer abc` is a normal
                // header value and auto-inserting `""` in it would just annoy.
                onKeyDown={(e) =>
                  handleBracketKey(e, false, (next, caret) =>
                    applyWithCaret(e.currentTarget, (val) => updateRow(i, 'value', val), next, caret),
                  )
                }
                placeholder={valuePlaceholder}
                rows={isExpanded ? 3 : 1}
                style={{ resize: 'none', overflow: isExpanded ? 'auto' : 'hidden' }}
                className={`${cellInput} flex-1 min-w-0 py-[7px] leading-[18px] ${isExpanded ? 'font-mono' : ''} ${enabled ? 'text-content' : 'text-content-faint'}`}
              />
              <button
                onClick={() => onChange(pairs.filter((_, j) => j !== i))}
                className="w-7 h-8 self-start shrink-0 flex items-center justify-center text-content-faint hover:text-err opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                title="Remove"
              >
                <Icons.X size={11} />
              </button>
            </div>
          );
        })}
        <AddRow noun={noun} onAdd={() => onChange([...pairs, { key: '', value: '', enabled: true }])} />
      </div>
    </div>
  );
}
