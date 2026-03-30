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
  const addRow = () => {
    onChange([...pairs, { key: '', value: '' }]);
  };

  const removeRow = (index: number) => {
    onChange(pairs.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: 'key' | 'value', val: string) => {
    const updated = pairs.map((pair, i) =>
      i === index ? { ...pair, [field]: val } : pair
    );
    onChange(updated);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-content-muted uppercase tracking-wide">
          {label}
        </span>
        <button
          onClick={addRow}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
        >
          + Add
        </button>
      </div>
      {pairs.length === 0 && (
        <div className="text-xs text-content-ghost italic">No {label.toLowerCase()} set</div>
      )}
      {pairs.map((pair, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="text"
            value={pair.key}
            onChange={(e) => updateRow(i, 'key', e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 bg-surface-elevated border border-line rounded px-2 py-1 text-xs text-content placeholder-content-ghost focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={pair.value}
            onChange={(e) => updateRow(i, 'value', e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-1 bg-surface-elevated border border-line rounded px-2 py-1 text-xs text-content placeholder-content-ghost focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => removeRow(i)}
            className="text-content-faint hover:text-red-400 text-xs px-1 transition-colors cursor-pointer"
            title="Remove"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
