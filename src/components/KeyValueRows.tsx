import { useState } from 'react';
import { KeyValuePair } from '../types';
import { handleBracketKey, applyWithCaret } from '../textareaBrackets';

interface KeyValueRowsProps {
  label: string;
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export function KeyValueRows({
  label,
  pairs,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
}: KeyValueRowsProps) {
  const [focusedRow, setFocusedRow] = useState<number | null>(null);

  const addRow = () => onChange([...pairs, { key: '', value: '', enabled: true }]);
  const removeRow = (index: number) => onChange(pairs.filter((_, i) => i !== index));
  const updateRow = (index: number, field: 'key' | 'value', val: string) => {
    onChange(pairs.map((pair, i) => i === index ? { ...pair, [field]: val } : pair));
  };
  const toggleRow = (index: number) => {
    onChange(pairs.map((pair, i) => i === index ? { ...pair, enabled: pair.enabled === false ? true : false } : pair));
  };
  const enabledCount = pairs.filter((p) => p.enabled !== false && p.key && p.value !== '').length;
  const allEnabled = pairs.length > 0 && pairs.every((p) => p.enabled !== false);
  const setAll = (on: boolean) => onChange(pairs.map((p) => ({ ...p, enabled: on })));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-content-muted uppercase tracking-wide">{label}</span>
          {pairs.length > 0 && (
            <button
              onClick={() => setAll(!allEnabled)}
              className="text-[10px] text-content-faint hover:text-content-secondary cursor-pointer"
              title={allEnabled ? 'Deselect all' : 'Select all'}
            >
              {allEnabled ? 'Deselect all' : 'Select all'} · {enabledCount}/{pairs.length}
            </button>
          )}
        </div>
        <button onClick={addRow} className="text-xs text-cyan hover:text-cyan transition-colors cursor-pointer">
          + Add
        </button>
      </div>
      {pairs.length === 0 && (
        <div className="text-xs text-content-ghost italic">No {label.toLowerCase()} set</div>
      )}
      {pairs.map((pair, i) => {
        const isExpanded = focusedRow === i;
        const enabled = pair.enabled !== false;
        return (
          <div
            key={i}
            onFocus={() => setFocusedRow(i)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setFocusedRow(null);
              }
            }}
            className={`rounded-md ${isExpanded ? 'bg-surface-section ring-1 ring-accent-border p-1.5 -mx-1' : ''}`}
          >
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => toggleRow(i)}
                aria-checked={enabled}
                role="checkbox"
                title={enabled ? 'Disable row' : 'Enable row'}
                className="shrink-0 w-3 h-3 rounded-[3px] flex items-center justify-center cursor-pointer transition-colors"
                style={{
                  background: enabled ? 'var(--accent)' : 'transparent',
                  border: `1px solid ${enabled ? 'var(--accent)' : 'var(--line-secondary)'}`,
                }}
              >
                {enabled && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              <input
                type="text"
                value={pair.key}
                onChange={(e) => updateRow(i, 'key', e.target.value)}
                placeholder={keyPlaceholder}
                className={`bg-surface-elevated border border-line rounded px-2 py-1 text-xs placeholder-content-ghost focus:border-accent focus:outline-none ${isExpanded ? 'w-24 shrink-0' : 'w-[42%]'} ${enabled ? 'text-content' : 'text-content-faint line-through'}`}
              />
              {/* Value — always a textarea so no element-swap on focus */}
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
                className={`flex-1 bg-surface-elevated border rounded px-2 py-1 text-xs placeholder-content-ghost focus:outline-none ${isExpanded ? 'border-accent-border focus:border-accent font-mono' : 'border-line focus:border-accent'} ${enabled ? 'text-content' : 'text-content-faint'}`}
              />
              <button
                onClick={() => removeRow(i)}
                className="text-content-faint hover:text-err text-xs px-1 transition-colors cursor-pointer shrink-0"
                title="Remove"
              >✕</button>
            </div>
            {isExpanded && (
              <div className="mt-1 text-[9px] text-content-ghost leading-none">
                Click elsewhere to collapse
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
