import { VarEntry } from '../types';

interface VarsPanelProps {
  vars: VarEntry[];
  onChange: (vars: VarEntry[]) => void;
}

function isValidJson(str: string): boolean {
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

function detectValueType(value: string): 'string' | 'json' {
  return isValidJson(value) ? 'json' : 'string';
}

export function VarsPanel({ vars, onChange }: VarsPanelProps) {
  const addVar = () => {
    onChange([...vars, { key: '', value: '', valueType: 'string' }]);
  };

  const removeVar = (index: number) => {
    onChange(vars.filter((_, i) => i !== index));
  };

  const updateVar = (index: number, field: 'key' | 'value', val: string) => {
    const updated = vars.map((v, i) => {
      if (i !== index) return v;
      const newEntry = { ...v, [field]: val };
      if (field === 'value') {
        newEntry.valueType = detectValueType(val);
      }
      return newEntry;
    });
    onChange(updated);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-content-muted uppercase tracking-wide">
          Variables
        </span>
        <button
          onClick={addVar}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
        >
          + Add
        </button>
      </div>
      <div className="text-[10px] text-content-ghost">
        Access in script as <code className="text-content-faint">vars.name</code>
      </div>
      {vars.length === 0 && (
        <div className="text-xs text-content-ghost italic">No variables set</div>
      )}
      {vars.map((v, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={v.key}
              onChange={(e) => updateVar(i, 'key', e.target.value)}
              placeholder="Name"
              className="w-1/3 bg-surface-elevated border border-line rounded px-2 py-1 text-xs text-content placeholder-content-ghost focus:border-blue-500 focus:outline-none"
            />
            <div className="flex-1 flex items-center gap-1">
              {v.valueType === 'json' ? (
                <textarea
                  value={v.value}
                  onChange={(e) => updateVar(i, 'value', e.target.value)}
                  placeholder='{"key": "value"}'
                  rows={2}
                  className="flex-1 bg-surface-elevated border border-line rounded px-2 py-1 text-xs text-content placeholder-content-ghost focus:border-blue-500 focus:outline-none font-mono resize-y"
                />
              ) : (
                <input
                  type="text"
                  value={v.value}
                  onChange={(e) => updateVar(i, 'value', e.target.value)}
                  placeholder="Value"
                  className="flex-1 bg-surface-elevated border border-line rounded px-2 py-1 text-xs text-content placeholder-content-ghost focus:border-blue-500 focus:outline-none"
                />
              )}
              <span
                className={`text-[10px] px-1 py-0.5 rounded ${
                  v.valueType === 'json'
                    ? 'bg-purple-900/50 text-purple-300'
                    : 'bg-line-subtle text-content-faint'
                }`}
                title={v.valueType === 'json' ? 'Parsed as JSON object/array' : 'Passed as string'}
              >
                {v.valueType === 'json' ? 'JSON' : 'STR'}
              </span>
            </div>
            <button
              onClick={() => removeVar(i)}
              className="text-content-faint hover:text-red-400 text-xs px-1 transition-colors cursor-pointer"
              title="Remove"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
