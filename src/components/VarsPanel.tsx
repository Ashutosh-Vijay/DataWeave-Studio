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

  const addVar = () => onChange([...vars, { key: '', value: '', valueType: 'string', enabled: true }]);
  const removeVar = (index: number) => onChange(vars.filter((_, i) => i !== index));
  const toggleVar = (index: number) => {
    onChange(vars.map((v, i) => i === index ? { ...v, enabled: v.enabled === false ? true : false } : v));
  };

  const updateVar = (index: number, field: 'key' | 'value', val: string) => {
    onChange(vars.map((v, i) => {
      if (i !== index) return v;
      const newEntry = { ...v, [field]: val };
      if (field === 'value') newEntry.valueType = detectValueType(val);
      return newEntry;
    }));
  };

  const enabledCount = vars.filter((v) => v.enabled !== false && v.key).length;
  const allEnabled = vars.length > 0 && vars.every((v) => v.enabled !== false);
  const setAll = (on: boolean) => onChange(vars.map((v) => ({ ...v, enabled: on })));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-content-muted uppercase tracking-wide">Variables</span>
          {vars.length > 0 && (
            <button
              onClick={() => setAll(!allEnabled)}
              className="text-[10px] text-content-faint hover:text-content-secondary cursor-pointer"
              title={allEnabled ? 'Deselect all' : 'Select all'}
            >
              {allEnabled ? 'Deselect all' : 'Select all'} · {enabledCount}/{vars.length}
            </button>
          )}
        </div>
        <button onClick={addVar} className="text-xs text-cyan hover:text-cyan transition-colors cursor-pointer">
          + Add
        </button>
      </div>
      <div className="text-[10px] text-content-ghost">
        Access in script as <code className="text-content-faint">vars.name</code>
      </div>
      {vars.length === 0 && <div className="text-xs text-content-ghost italic">No variables set</div>}
      {vars.map((v, i) => {
        const isExpanded = focusedRow === i;
        const enabled = v.enabled !== false;
        return (
          <div
            key={i}
            onBlur={(e) => scheduleCollapse(e.currentTarget)}
            className={`rounded-md ${isExpanded ? 'bg-surface-2 ring-1 ring-accent-border p-1.5 -mx-1' : ''}`}
          >
            {/* Top row */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => toggleVar(i)}
                onFocus={() => cancelCollapse()}
                aria-checked={enabled}
                role="checkbox"
                title={enabled ? 'Disable variable' : 'Enable variable'}
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
                value={v.key}
                onChange={(e) => updateVar(i, 'key', e.target.value)}
                onFocus={() => {
                  expandedFromValueRef.current = false; // key click → don't steal focus to value
                  cancelCollapse();
                  setFocusedRow(i);
                }}
                placeholder="Name"
                className={`bg-surface-elevated border border-line rounded px-2 py-1 text-xs placeholder-content-ghost focus:border-accent focus:outline-none ${isExpanded ? 'flex-1' : 'w-1/3'} ${enabled ? 'text-content' : 'text-content-faint line-through'}`}
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
                    className="flex-1 bg-surface-elevated border border-line rounded px-2 py-1 text-xs text-content placeholder-content-ghost focus:border-accent focus:outline-none"
                  />
                  <span
                    className={`text-[10px] px-1 py-0.5 rounded shrink-0 ${
                      v.valueType === 'json'
                        ? 'bg-violet-tint text-violet'
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
                className="text-content-faint hover:text-err text-xs px-1 transition-colors cursor-pointer shrink-0"
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
                  className="w-full bg-surface-input border border-accent-border rounded px-2 py-1.5 text-xs text-content placeholder-content-ghost focus:border-accent focus:outline-none font-mono"
                />
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      v.valueType === 'json'
                        ? 'bg-violet-tint text-violet'
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
