import { useState } from 'react';
import { Icons } from './Icons';
import { UseDebuggerReturn } from '../hooks/useDebugger';

/**
 * The debugger's view: where execution is parked, the call stack with each
 * frame's variables, and a box to evaluate an expression in the selected frame.
 *
 * Inputs (payload, attributes, vars) deliberately show a placeholder rather
 * than their contents. Walking them for display consumes the reader and breaks
 * the run — see NonConsumingDebuggerExecutor on the server. Evaluate reads them
 * safely, so that is the way in, and the empty state says so.
 */
export function DebugPanel({ dbg }: { dbg: UseDebuggerReturn }) {
  const [expression, setExpression] = useState('');
  const [frameIndex, setFrameIndex] = useState(0);

  const { state, busy, evalResult } = dbg;
  const frames = state.frames ?? [];
  const paused = state.status === 'paused';
  const frame = frames[frameIndex] ?? frames[0];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div
        className="h-[30px] shrink-0 flex items-center gap-2 px-3.5 border-b"
        style={{ borderColor: 'var(--line-secondary)' }}
      >
        <Icons.Activity size={11} />
        <span className="text-[11.5px] font-medium" style={{ color: 'var(--content-secondary)' }}>
          Debugger
        </span>
        <span
          className="font-mono text-[10.5px] px-1.5 rounded"
          style={{
            background: paused ? 'var(--accent-dim)' : 'var(--surface-2)',
            color: paused ? 'var(--accent)' : 'var(--content-faint)',
          }}
        >
          {state.status}{paused && state.line ? ` · line ${state.line}` : ''}
        </span>
        <span className="flex-1" />
        <StepButton label="Continue" icon={<Icons.Zap size={11} />} onClick={dbg.resume} disabled={!paused || busy} />
        <StepButton label="Step over" icon={<span style={{ fontSize: 11 }}>↷</span>} onClick={dbg.stepOver} disabled={!paused || busy} />
        <StepButton label="Step into" icon={<span style={{ fontSize: 11 }}>↓</span>} onClick={dbg.stepInto} disabled={!paused || busy} />
        <StepButton label="Step out" icon={<span style={{ fontSize: 11 }}>↑</span>} onClick={dbg.stepOut} disabled={!paused || busy} />
        <StepButton label="Stop" icon={<Icons.X size={11} />} onClick={dbg.stop} disabled={busy} />
      </div>

      <div className="flex-1 overflow-auto" style={{ padding: '10px 12px' }}>
        {state.status === 'finished' && (
          <pre
            className="font-mono text-[11.5px] leading-relaxed m-0 p-2.5 rounded-lg select-text"
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: state.error
                ? 'color-mix(in oklch, var(--err) 8%, transparent)'
                : 'var(--surface-2)',
              border: `1px solid ${state.error ? 'color-mix(in oklch, var(--err) 26%, transparent)' : 'var(--line-subtle)'}`,
              color: 'var(--content)',
            }}
          >
            {state.error || state.output || 'Finished.'}
          </pre>
        )}

        {state.status === 'running' && (
          <div className="text-[11.5px]" style={{ color: 'var(--content-faint)' }}>
            Running… it will stop here when it reaches a breakpoint.
          </div>
        )}

        {paused && (
          <>
            {frames.length > 1 && (
              <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                {frames.map((f, i) => (
                  <button
                    key={f.id}
                    onClick={() => setFrameIndex(i)}
                    className="h-6 px-2 rounded-md text-[11px] cursor-pointer"
                    style={{
                      background: i === frameIndex ? 'var(--accent-dim)' : 'var(--surface-2)',
                      border: `1px solid ${i === frameIndex ? 'var(--accent-border)' : 'var(--line)'}`,
                      color: i === frameIndex ? 'var(--accent)' : 'var(--content-faint)',
                    }}
                    title={`Frame ${f.id}${f.name ? ` — ${f.name}` : ''}, line ${f.line}`}
                  >
                    {f.name || `frame ${f.id}`} <span className="font-mono opacity-70">L{f.line}</span>
                  </button>
                ))}
              </div>
            )}

            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {(frame?.variables ?? []).map((v) => (
                  <tr key={v.name} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                    <td className="py-1 pr-3 align-top font-mono text-[11px]" style={{ color: 'var(--violet)', whiteSpace: 'nowrap' }}>
                      {v.name}
                    </td>
                    <td className="py-1 pr-3 align-top font-mono text-[10.5px]" style={{ color: 'var(--content-ghost)', whiteSpace: 'nowrap' }}>
                      {v.type}
                    </td>
                    <td className="py-1 align-top font-mono text-[11px] select-text" style={{ color: 'var(--content-secondary)', wordBreak: 'break-word' }}>
                      {v.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form
              className="mt-3 flex items-center gap-1.5"
              onSubmit={(e) => { e.preventDefault(); void dbg.evaluate(expression, frame ? frameIndex : -1); }}
            >
              <input
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                placeholder="Evaluate in this frame — e.g. payload.name"
                spellCheck={false}
                className="flex-1 h-7 px-2 rounded-md outline-none font-mono text-[11.5px]"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--content)' }}
              />
              <button
                type="submit"
                disabled={busy || !expression.trim()}
                className="h-7 px-2.5 rounded-md text-[11.5px] cursor-pointer disabled:opacity-40"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--content-secondary)' }}
              >
                Evaluate
              </button>
            </form>
            {evalResult !== null && (
              <pre
                className="mt-1.5 m-0 p-2 rounded-md font-mono text-[11px] select-text"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line-subtle)',
                  color: 'var(--content)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {evalResult}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StepButton({
  label, icon, onClick, disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center w-[22px] h-[21px] rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
      style={{ border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--content-secondary)' }}
    >
      {icon}
    </button>
  );
}
