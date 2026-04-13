import { useRef, useState } from 'react';
import { VarEntry } from '../types';

interface VarsPanelProps {
  vars: VarEntry[];
  onChange: (vars: VarEntry[]) => void;
}

/**
 * Returns true for any valid JSON value: null, booleans, numbers, quoted strings,
 * objects, and arrays. A bare unquoted word like "hello" is NOT valid JSON → false.
 */
function isValidJson(str: string): boolean {
  if (!str.trim()) return false;
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function detectValueType(value: string): 'string' | 'json' {
  return isValidJson(value) ? 'json' : 'string';
}

export function VarsPanel({ vars, onChange }: VarsPanelProps) {
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  // Track collapse timeout so autoFocus on expanded textarea can cancel it
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether expansion was triggered by clicking the value field (vs. key field)
  // so we only steal focus to the expanded textarea when the value was clicked
  const expandedFromValueRef = useRef(false);

  const scheduleCollapse = (container: EventTarget & Element) => {
    collapseTimerRef.current = setTimeout(() => {
      if (!container.contains(document.activeElement)) setFocusedRow(null);
    }, 100);
  };
  const cancelCollapse = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  };

  const addVar = () => onChange([...vars, { key: '', value: '', valueType: 'string' }]);
  const removeVar = (index: number) => onChange(vars.filter((_, i) => i !== index));

  const updateVar = (index: number, field: 'key' | 'value', val: string) => {
    onChange(vars.map((v, i) => {
      if (i !== index) return v;
      const newEntry = { ...v, [field]: val };
      if (field === 'value') newEntry.valueType = detectValueType(val);
      return newEntry;
    }));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-content-muted uppercase tracking-wide">Variables</span>
        <button onClick={addVar} className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer">
          + Add
        </button>
      </div>
      <div className="text-[10px] text-content-ghost">
        Access in script as <code className="text-content-faint">vars.name</code>
      </div>
      {vars.length === 0 && <div className="text-xs text-content-ghost italic">No variables set</div>}
      {vars.map((v, i) => {
        const isExpanded = focusedRow === i;
        return (
          <div
            key={i}
            onBlur={(e) => scheduleCollapse(e.currentTarget)}
            className={`rounded-md ${isExpanded ? 'bg-surface-section ring-1 ring-blue-500/25 p-1.5 -mx-1' : ''}`}
          >
            {/* Top row */}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={v.key}
                onChange={(e) => updateVar(i, 'key', e.target.value)}
                onFocus={() => {
                  expandedFromValueRef.current = false; // key click → don't steal focus to value
                  cancelCollapse();
                  setFocusedRow(i);
                }}
                placeholder="Name"
                className={`bg-surface-elevated border border-line rounded px-2 py-1 text-xs text-content placeholder-content-ghost focus:border-blue-500 focus:outline-none ${isExpanded ? 'flex-1' : 'w-1/3'}`}
              />
              {/* Collapsed: inline single-line value + type badge */}
              {!isExpanded && (
                <>
                  <textarea
                    value={v.value}
                    onChange={(e) => updateVar(i, 'value', e.target.value)}
                    onFocus={() => {
                      expandedFromValueRef.current = true; // value click → focus expanded textarea
                      cancelCollapse();
                      setFocusedRow(i);
                    }}
                    placeholder="Value"
                    rows={1}
                    style={{ resize: 'none', overflow: 'hidden' }}
                    className="flex-1 bg-surface-elevated border border-line rounded px-2 py-1 text-xs text-content placeholder-content-ghost focus:border-blue-500 focus:outline-none"
                  />
                  <span
                    className={`text-[10px] px-1 py-0.5 rounded shrink-0 ${
                      v.valueType === 'json'
                        ? 'bg-purple-900/50 text-purple-300'
                        : 'bg-line-subtle text-content-faint'
                    }`}
                    title={
                      v.valueType === 'json'
                        ? 'Parsed as JSON — supports null, true/false, numbers, objects, arrays'
                        : 'Passed as plain string'
                    }
                  >
                    {v.valueType === 'json' ? 'JSON' : 'STR'}
                  </span>
                </>
              )}
              <button
                onFocus={() => cancelCollapse()}
                onClick={() => removeVar(i)}
                className="text-content-faint hover:text-red-400 text-xs px-1 transition-colors cursor-pointer shrink-0"
                title="Remove"
              >✕</button>
            </div>

            {/* Expanded: full-width textarea */}
            {isExpanded && (
              <div className="mt-1.5 space-y-1">
                <textarea
                  // Only steal focus when expansion was triggered by clicking the value field
                  autoFocus={expandedFromValueRef.current}
                  onFocus={() => cancelCollapse()}
                  value={v.value}
                  onChange={(e) => updateVar(i, 'value', e.target.value)}
                  placeholder={'e.g.  "hello"  •  42  •  null  •  true  •  {"key": "val"}  •  [1,2,3]'}
                  rows={4}
                  style={{ resize: 'vertical' }}
                  className="w-full bg-surface-input border border-blue-500/40 rounded px-2 py-1.5 text-xs text-content placeholder-content-ghost focus:border-blue-500 focus:outline-none font-mono"
                />
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      v.valueType === 'json'
                        ? 'bg-purple-900/50 text-purple-300'
                        : 'bg-line-subtle text-content-faint'
                    }`}
                  >
                    {v.valueType === 'json' ? 'JSON — parsed as DataWeave value' : 'String — passed as-is'}
                  </span>
                  <span className="text-[9px] text-content-ghost">Click elsewhere to collapse</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
