import { useRef, useState } from 'react';
import { VarEntry } from '../types';
import { handleBracketKey, applyWithCaret } from '../textareaBrackets';
import { Icons } from './Icons';
import { RowCheck, TableHeader, AddRow, cellInput } from './KeyValueRows';

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
      // Expression mode is explicit (fx toggle) — don't let auto-detect override it.
      if (field === 'value' && v.valueType !== 'expression') newEntry.valueType = detectValueType(val);
      return newEntry;
    }));
  };

  // Toggle a row between literal (auto string/json) and fx expression mode.
  const toggleExpr = (index: number) => {
    onChange(vars.map((v, i) =>
      i === index
        ? { ...v, valueType: v.valueType === 'expression' ? detectValueType(v.value) : 'expression' }
        : v
    ));
  };

  const enabledCount = vars.filter((v) => v.enabled !== false && v.key).length;
  const allEnabled = vars.length > 0 && vars.every((v) => v.enabled !== false);
  const setAll = (on: boolean) => onChange(vars.map((v) => ({ ...v, enabled: on })));

  const typeTag = (v: VarEntry, i: number) => (
    <div className="shrink-0 flex items-center gap-1 pr-1 border-l border-line-subtle pl-1.5">
      <button
        onClick={() => toggleExpr(i)}
        onFocus={() => cancelCollapse()}
        title={v.valueType === 'expression' ? 'Expression, evaluated against the message. Click for a literal value.' : 'Treat as a DataWeave expression (payload.x, vars.y)'}
        className={`h-5 px-1 rounded text-[10.5px] font-mono italic cursor-pointer transition-colors ${
          v.valueType === 'expression' ? 'bg-accent-dim text-accent' : 'text-content-faint hover:text-content'
        }`}
      >
        fx
      </button>
      {v.valueType !== 'expression' && (
        <span
          className={`w-8 text-center text-[9.5px] font-mono ${v.valueType === 'json' ? 'text-violet' : 'text-content-faint'}`}
          title={
            v.valueType === 'json'
              ? 'Parsed as JSON: null, true/false, numbers, objects and arrays all work'
              : 'Passed as plain string'
          }
        >
          {v.valueType === 'json' ? 'JSON' : 'STR'}
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-line bg-surface overflow-hidden">
        <TableHeader
          label="Variables"
          active={enabledCount}
          total={vars.length}
          allOn={allEnabled}
          onSetAll={setAll}
        />
        <div className="divide-y divide-line-subtle">
          {vars.map((v, i) => {
            const isExpanded = focusedRow === i;
            const enabled = v.enabled !== false;
            return (
              <div
                key={i}
                onBlur={(e) => scheduleCollapse(e.currentTarget)}
                className={`group ${isExpanded ? 'bg-surface-section' : ''}`}
              >
                <div className="flex items-stretch min-h-8">
                  <RowCheck on={enabled} onToggle={() => toggleVar(i)} onFocus={() => cancelCollapse()} />
                  <input
                    type="text"
                    value={v.key}
                    onChange={(e) => updateVar(i, 'key', e.target.value)}
                    onFocus={() => {
                      expandedFromValueRef.current = false; // key click: don't steal focus to value
                      cancelCollapse();
                      setFocusedRow(i);
                    }}
                    placeholder="name"
                    className={`${cellInput} font-mono ${isExpanded ? 'flex-1' : 'w-[34%] shrink-0'} ${enabled ? 'text-content' : 'text-content-faint line-through'}`}
                  />
                  {!isExpanded && (
                    <textarea
                      value={v.value}
                      onChange={(e) => updateVar(i, 'value', e.target.value)}
                      onFocus={() => {
                        expandedFromValueRef.current = true; // value click: focus the expanded textarea
                        cancelCollapse();
                        setFocusedRow(i);
                      }}
                      placeholder={v.valueType === 'expression' ? 'payload.name' : 'value'}
                      rows={1}
                      style={{ resize: 'none', overflow: 'hidden' }}
                      className={`${cellInput} flex-1 min-w-0 py-[7px] leading-[18px] ${enabled ? 'text-content' : 'text-content-faint'}`}
                    />
                  )}
                  {typeTag(v, i)}
                  <button
                    onFocus={() => cancelCollapse()}
                    onClick={() => removeVar(i)}
                    className="w-7 shrink-0 flex items-center justify-center text-content-faint hover:text-err opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                    title="Remove"
                  >
                    <Icons.X size={11} />
                  </button>
                </div>

                {/* Expanded: the whole value, full width. */}
                {isExpanded && (
                  <div className="px-2 pb-2 space-y-1">
                    <textarea
                      // Only steal focus when expansion came from clicking the value field
                      autoFocus={expandedFromValueRef.current}
                      onFocus={() => cancelCollapse()}
                      value={v.value}
                      onChange={(e) => updateVar(i, 'value', e.target.value)}
                      onKeyDown={(e) =>
                        handleBracketKey(e, v.valueType === 'json', (next, caret) =>
                          applyWithCaret(e.currentTarget, (val) => updateVar(i, 'value', val), next, caret),
                        )
                      }
                      placeholder={
                        v.valueType === 'expression'
                          ? 'DataWeave expression, e.g.  payload.name  •  payload.items filter ($.active)  •  vars.count + 1'
                          : 'e.g.  "hello"  •  42  •  null  •  true  •  {"key": "val"}  •  [1,2,3]'
                      }
                      rows={4}
                      style={{ resize: 'vertical' }}
                      className="w-full bg-surface-input border border-line rounded-md px-2 py-1.5 text-[11.5px] text-content placeholder-content-ghost focus:border-accent focus:outline-none font-mono"
                    />
                    <div className="text-[10px] text-content-faint">
                      {v.valueType === 'expression'
                        ? 'Expression, evaluated against the message'
                        : v.valueType === 'json'
                          ? 'JSON, parsed into a DataWeave value'
                          : 'String, passed as-is'}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <AddRow noun="variable" onAdd={addVar} />
        </div>
      </div>
      <div className="text-[10px] text-content-ghost leading-relaxed px-0.5">
        Read them as <code className="font-mono text-content-faint">vars.name</code>. Turn on{' '}
        <span className="font-mono italic">fx</span> to compute a value from the message, e.g.{' '}
        <code className="font-mono text-content-faint">payload.name</code>.
      </div>
    </div>
  );
}
