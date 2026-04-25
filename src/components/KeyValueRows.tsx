import { useState } from 'react';
import { KeyValuePair } from '../types';

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

  const addRow = () => onChange([...pairs, { key: '', value: '' }]);
  const removeRow = (index: number) => onChange(pairs.filter((_, i) => i !== index));
  const updateRow = (index: number, field: 'key' | 'value', val: string) => {
    onChange(pairs.map((pair, i) => i === index ? { ...pair, [field]: val } : pair));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-content-muted uppercase tracking-wide">{label}</span>
        <button onClick={addRow} className="text-xs text-cyan hover:text-cyan transition-colors cursor-pointer">
          + Add
        </button>
      </div>
      {pairs.length === 0 && (
        <div className="text-xs text-content-ghost italic">No {label.toLowerCase()} set</div>
      )}
      {pairs.map((pair, i) => {
        const isExpanded = focusedRow === i;
        return (
          <div
            key={i}
            onFocus={() => setFocusedRow(i)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setFocusedRow(null);
              }
            }}
            className={`rounded-md ${isExpanded ? 'bg-surface-section ring-1 ring-blue-500/25 p-1.5 -mx-1' : ''}`}
          >
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={pair.key}
                onChange={(e) => updateRow(i, 'key', e.target.value)}
                placeholder={keyPlaceholder}
                className={`bg-surface-elevated border border-line rounded px-2 py-1 text-xs text-content placeholder-content-ghost focus:border-accent focus:outline-none ${isExpanded ? 'w-24 shrink-0' : 'w-[42%]'}`}
              />
              {/* Value — always a textarea so no element-swap on focus */}
              <textarea
                value={pair.value}
                onChange={(e) => updateRow(i, 'value', e.target.value)}
                placeholder={valuePlaceholder}
                rows={isExpanded ? 3 : 1}
                style={{ resize: 'none', overflow: isExpanded ? 'auto' : 'hidden' }}
                className={`flex-1 bg-surface-elevated border rounded px-2 py-1 text-xs text-content placeholder-content-ghost focus:outline-none ${isExpanded ? 'border-blue-500/40 focus:border-accent font-mono' : 'border-line focus:border-accent'}`}
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
