import React, { useEffect, useState, memo } from 'react';
import Editor, { BeforeMount, useMonaco } from '@monaco-editor/react';
import { configureEditor } from '../editorInit';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '../bridge';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { useTheme } from '../ThemeContext';
import { useEditorFont } from '../hooks/useEditorFont';
import { Icons } from './Icons';
import { matchErrorHint, categoryLabel } from '../dataweaveErrorHints';
import type { TraceRow } from '../hooks/useDWRunner';

const handleBeforeMount: BeforeMount = (monaco) => defineDataWeaveTheme(monaco);

interface QueryResult {
  result: string;
  params: Record<string, unknown>;
  unbound: string[];
  unused: string[];
}

interface OutputPaneProps {
  output: string;
  error: string | null;
  isRunning: boolean;
  executionTimeMs?: number;
  errorLine?: number | null;
  /** Captured `log(...)` output from the run — shown in a collapsible Logs panel. */
  logs?: string[];
  /** Per-expression values from a traced run — shown in a collapsible Trace panel. */
  trace?: TraceRow[];
  /** Jump the script editor to a line. Enables click-through on trace rows. */
  onRevealLine?: (line: number, column: number) => void;
  outputFormat: 'json' | 'xml' | 'raw';
  onFormatChange: (format: 'json' | 'xml' | 'raw') => void;
  queryResult?: QueryResult | null;
  isQueryMode?: boolean;
  queryLanguage?: string;
  scriptSource?: string;
  onCancel?: () => void;
}

function extractDwErrorCode(message: string): string | null {
  const m = message.match(/DW-\d{3,5}/);
  return m ? m[0] : null;
}

function extractFirstLine(message: string): string {
  const lines = message.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('at ')) return trimmed;
  }
  return message.trim().split('\n')[0] || message;
}

function extractStackTrace(message: string): string[] {
  return message.split('\n').filter((l) => l.trim().startsWith('at '));
}

/** Split a string on backticks and render each `code` chunk as a styled span. */
function renderWithInlineCode(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="font-mono text-[11px] px-1 py-px rounded"
          style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** Everything after the first non-`at` line and before the stack frames —
 *  i.e. the actual error reason (the body the CLI prints between the headline
 *  and the trace). */
function extractDetails(message: string): string {
  const lines = message.split('\n');
  const out: string[] = [];
  let headlineConsumed = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!headlineConsumed) {
      if (trimmed && !trimmed.startsWith('at ')) headlineConsumed = true;
      continue;
    }
    if (trimmed.startsWith('at ')) continue;
    out.push(line);
  }
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join('\n');
}

export const OutputPane = memo(function OutputPane({
  output,
  error,
  isRunning,
  executionTimeMs,
  errorLine,
  logs,
  trace,
  onRevealLine,
  outputFormat,
  onFormatChange,
  queryResult,
  isQueryMode,
  queryLanguage,
  scriptSource,
  onCancel,
}: OutputPaneProps) {
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);
  const [stackOpen, setStackOpen] = useState(false);
  const { isDark } = useTheme();
  const editorFont = useEditorFont();
  const monaco = useMonaco();
  useEffect(() => {
    const apply = () => { if (monaco) defineDataWeaveTheme(monaco); };
    apply();
    window.addEventListener('dw:accent-changed', apply);
    return () => window.removeEventListener('dw:accent-changed', apply);
  }, [isDark, monaco]);
  const editorTheme = isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME;

  const handleExport = async () => {
    const text = isQueryMode && queryResult ? queryResult.result : (output || error || '');
    if (!text) return;
    const ext = outputFormat === 'xml' ? 'xml' : outputFormat === 'json' ? 'json' : 'txt';
    const path = await save({
      defaultPath: `output.${ext}`,
      filters: [{ name: 'Text files', extensions: [ext, 'txt'] }],
    });
    if (path) {
      await invoke('save_output_file', { path, content: text });
      setExported(true);
      setTimeout(() => setExported(false), 2000);
    }
  };

  const handleCopy = async () => {
    const text = isQueryMode && queryResult ? queryResult.result : (error || output);
    if (text) {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const editorLanguage =
    outputFormat === 'json' ? 'json' : outputFormat === 'xml' ? 'xml' : 'plaintext';

  const hasContent = output || error;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface">
      {/* Header */}
      <div className="h-10 shrink-0 flex items-center gap-2 px-3.5 border-b border-line">
        <span className="text-[12.5px] font-semibold text-content">{isQueryMode ? 'Query Result' : 'Output'}</span>
        {executionTimeMs !== undefined && !isRunning && (
          <span
            className="inline-flex items-center gap-1 font-mono text-[10.5px] px-1.5 py-0.5 rounded text-accent"
            style={{ background: 'var(--accent-dim)' }}
          >
            <Icons.Dot size={7} /> {executionTimeMs}ms
          </span>
        )}
        <span className="flex-1" />

        {/* Segmented format switch — highlighting only. It follows the
            script's `output` directive on each run; switching it here does
            NOT convert the output (change the directive for that). */}
        <div className="flex items-center p-0.5 rounded-md bg-surface-2 border border-line-secondary" title="Syntax highlighting only — to convert the output, change the script's `output` directive">
          {(['json', 'xml', 'raw'] as const).map((f) => {
            const active = outputFormat === f;
            return (
              <button
                key={f}
                onClick={() => onFormatChange(f)}
                className={`px-2 h-5 rounded-sm font-mono text-[11px] cursor-pointer transition-colors ${
                  active ? 'text-content font-semibold bg-surface-3' : 'text-content-faint hover:text-content-secondary'
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>

        {hasContent && (
          <>
            <button
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy'}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-content-muted hover:text-content hover:bg-surface-2 transition-colors cursor-pointer"
            >
              {copied ? <Icons.Dot size={10} /> : <Icons.Copy size={13} />}
            </button>
            <button
              onClick={handleExport}
              title={exported ? 'Saved!' : 'Export'}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-content-muted hover:text-content hover:bg-surface-2 transition-colors cursor-pointer"
            >
              {exported ? <Icons.Dot size={10} /> : <Icons.Download size={13} />}
            </button>
          </>
        )}
      </div>

      {/* Run-loading banner */}
      {isRunning && <RunLoadingBanner onCancel={onCancel} />}

      {/* Content area — min-h-0 lets the inner overflow-auto actually scroll a
          tall error/output instead of growing past the pane and getting clipped. */}
      <div className="flex-1 relative min-h-0">
        {isRunning && !output && !error ? (
          <SkeletonRows />
        ) : error ? (
          <div className="h-full overflow-auto bg-surface p-4">
            <OutputErrorCard
              error={error}
              errorLine={errorLine}
              executionTimeMs={executionTimeMs}
              scriptSource={scriptSource}
              stackOpen={stackOpen}
              onToggleStack={() => setStackOpen(!stackOpen)}
            />
          </div>
        ) : isQueryMode && queryResult ? (
          /* Query mode: show substituted query + parameters */
          <div className="h-full overflow-auto bg-surface">
            {/* Final query */}
            <div className="border-b border-line">
              <div className="px-3.5 py-1.5 text-[10.5px] font-semibold text-content-faint uppercase tracking-[0.6px] bg-surface-2">
                Final {queryLanguage} Query
              </div>
              <pre className="px-4 py-3 text-[12.5px] font-mono whitespace-pre-wrap leading-relaxed select-text" style={{ color: 'var(--cyan)' }}>
                {queryResult.result}
              </pre>
            </div>
            {/* Warnings: unbound placeholders + unused param keys */}
            {(queryResult.unbound.length > 0 || queryResult.unused.length > 0) && (
              <div className="border-b border-line">
                <div className="px-3.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.6px] bg-surface-2" style={{ color: 'var(--warn)' }}>
                  Warnings
                </div>
                <div className="p-3 space-y-1.5">
                  {queryResult.unbound.length > 0 && (
                    <div className="text-[11.5px] flex items-baseline gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--warn)' }}>Unbound</span>
                      <span className="text-content-ghost">no value provided for</span>
                      <span className="font-mono" style={{ color: 'var(--violet)' }}>
                        {queryResult.unbound.map((k) => `:${k}`).join(', ')}
                      </span>
                    </div>
                  )}
                  {queryResult.unused.length > 0 && (
                    <div className="text-[11.5px] flex items-baseline gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--warn)' }}>Unused</span>
                      <span className="text-content-ghost">in params but not in query:</span>
                      <span className="font-mono text-content-faint">
                        {queryResult.unused.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Parameters */}
            <div>
              <div className="px-3.5 py-1.5 text-[10.5px] font-semibold text-content-faint uppercase tracking-[0.6px] bg-surface-2">
                Resolved Parameters
              </div>
              <div className="p-3 space-y-1">
                {Object.entries(queryResult.params).map(([key, value]) => {
                  const isUnused = queryResult.unused.includes(key);
                  const typeLabel = value === null
                    ? 'null'
                    : Array.isArray(value)
                      ? `Array (${value.length})`
                      : typeof value === 'string' ? 'String'
                      : typeof value === 'number' ? 'Number'
                      : typeof value === 'boolean' ? 'Boolean'
                      : typeof value;
                  return (
                    <div key={key} className="flex items-baseline gap-2 text-[12px] font-mono">
                      <span style={{ color: isUnused ? 'var(--content-ghost)' : 'var(--violet)' }}>:{key}</span>
                      <span className="text-content-ghost">=</span>
                      <span style={{ color: isUnused ? 'var(--content-ghost)' : 'var(--accent)' }}>{JSON.stringify(value)}</span>
                      <span className="text-content-ghost text-[10.5px] italic">{typeLabel}</span>
                      {isUnused && (
                        <span className="text-[9.5px] font-semibold uppercase tracking-wide px-1 py-px rounded" style={{ color: 'var(--warn)', background: 'color-mix(in oklch, var(--warn) 14%, transparent)' }}>
                          unused
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Connector behavior note */}
              <div className="px-3 pb-2 pt-1 text-[10px] text-content-ghost border-t border-line-subtle mt-2">
                {queryLanguage === 'SOQL' ? (
                  <span>Salesforce connector: literal replace — use <code className="text-content-faint">':param'</code> for strings, bare <code className="text-content-faint">:param</code> for dates/numbers. Arrays join with commas — wrap in <code className="text-content-faint">(...)</code> yourself for <code className="text-content-faint">IN</code> clauses.</span>
                ) : (
                  <span>DB connector (JDBC): auto-quotes strings, bare numbers/booleans, NULL for nulls — never quote <code className="text-content-faint">:param</code> in SQL. Arrays auto-expand to <code className="text-content-faint">(v1,v2,...)</code> for <code className="text-content-faint">IN</code> clauses.</span>
                )}
              </div>
            </div>
          </div>
        ) : output ? (
          <Editor
            height="100%"
            language={editorLanguage}
            theme={editorTheme}
            beforeMount={handleBeforeMount}
            onMount={configureEditor}
            value={output}
            options={{
              // Spread first: font/line-height prefs apply; the output pane
              // pins its own wrap/minimap below.
              ...editorFont,
              readOnly: true,
              minimap: { enabled: false },
              automaticLayout: true,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              renderLineHighlight: 'none',
              folding: true,
              // Keep the fold chevrons in the gutter visible at all times —
              // Monaco hides them until you hover, which reads as "no folding".
              showFoldingControls: 'always',
            }}
          />
        ) : (
          <OutputIdleState isQueryMode={isQueryMode} />
        )}
      </div>

      {/* Trace panel — what every expression evaluated to, when the run was traced. */}
      {trace && trace.length > 0 && !isRunning && <TracePanel trace={trace} onRevealLine={onRevealLine} />}

      {/* Logs panel — captured `log(...)` output, shown only when the script logged. */}
      {logs && logs.length > 0 && !isRunning && <LogsPanel logs={logs} />}
    </div>
  );
});

/** What every expression in the script evaluated to, in source order.
 *
 *  This is the answer to "what is actually in there" without wrapping anything
 *  in `log()`: the engine reports each node as it executes and the rows land
 *  here. A row that ran more than once (a map body, say) shows the first value
 *  and a count — the alternative is one row per item, which for a 500-row
 *  payload is not a panel anyone can read. */
function TracePanel({ trace, onRevealLine }: { trace: TraceRow[]; onRevealLine?: (line: number, column: number) => void }) {
  // Tracing is on by default, so this panel now appears on every run. Remember
  // whether it was collapsed — otherwise someone who doesn't want it has to
  // close it again after every single run.
  const [open, setOpen] = useState(() => {
    try { return (localStorage.getItem('dw.tracePanelOpen') ?? '1') === '1'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('dw.tracePanelOpen', open ? '1' : '0'); } catch { /* ignore */ }
  }, [open]);
  const failed = trace.filter((r) => r.error).length;
  return (
    <div className="shrink-0 border-t border-line bg-surface" style={{ maxHeight: '38%', display: 'flex', flexDirection: 'column' }}>
      <button
        onClick={() => setOpen(!open)}
        className="shrink-0 flex items-center gap-2 px-3.5 h-7 text-[10.5px] uppercase tracking-[0.6px] font-semibold text-content-faint hover:text-content-secondary cursor-pointer"
      >
        <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" className={`transition-transform ${open ? 'rotate-90' : ''}`}>
          <path d="M3 1l5 4-5 4V1z" />
        </svg>
        Trace
        <span className="inline-flex items-center justify-center min-w-[16px] h-[15px] px-1 rounded-full font-mono text-[9.5px] text-accent" style={{ background: 'var(--accent-dim)' }}>
          {trace.length}
        </span>
        <span className="text-content-ghost normal-case tracking-normal font-normal">
          {failed > 0 ? 'every expression — red is where it broke' : 'every expression, as it ran'}
        </span>
      </button>
      {open && (
        <div className="overflow-auto pb-2">
          <table className="w-full text-[11.5px] font-mono border-collapse">
            <tbody>
              {trace.map((r, i) => (
                <tr
                  key={i}
                  onClick={() => { if (r.line > 0) onRevealLine?.(r.line, r.column); }}
                  className={onRevealLine && r.line > 0 ? 'cursor-pointer hover:bg-surface-2' : ''}
                  style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line-subtle)' }}
                >
                  <td className="align-top pl-3.5 pr-2 py-1 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--content-ghost)', width: '1%' }}>
                    {r.line > 0 ? r.line : ''}
                  </td>
                  <td className="align-top pr-3 py-1 break-all" style={{ color: 'var(--content-secondary)', width: '38%' }}>
                    {r.expression}
                  </td>
                  <td className="align-top pr-2 py-1 break-all" style={{ color: r.error ? 'var(--err)' : 'var(--accent)' }}>
                    {r.error ?? r.value}
                  </td>
                  <td className="align-top pr-3.5 py-1 text-right whitespace-nowrap" style={{ color: 'var(--content-ghost)', width: '1%' }}>
                    {r.count > 1 ? `×${r.count}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Collapsible panel showing captured `log(...)` output from the run. Sits below
 *  the output editor so you can inspect intermediate pipeline values inline. */
function LogsPanel({ logs }: { logs: string[] }) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(logs.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <div className="shrink-0 border-t border-line bg-surface" style={{ maxHeight: '40%', display: 'flex', flexDirection: 'column' }}>
      <button
        onClick={() => setOpen(!open)}
        className="shrink-0 flex items-center gap-2 px-3.5 h-7 text-[10.5px] uppercase tracking-[0.6px] font-semibold text-content-faint hover:text-content-secondary cursor-pointer"
      >
        <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" className={`transition-transform ${open ? 'rotate-90' : ''}`}>
          <path d="M3 1l5 4-5 4V1z" />
        </svg>
        Logs
        <span className="inline-flex items-center justify-center min-w-[16px] h-[15px] px-1 rounded-full font-mono text-[9.5px] text-accent" style={{ background: 'var(--accent-dim)' }}>
          {logs.length}
        </span>
        <span className="text-content-ghost normal-case tracking-normal font-normal">from log()</span>
        <span className="flex-1" />
        <span
          onClick={(e) => { e.stopPropagation(); copy(); }}
          className="inline-flex items-center gap-1 text-content-faint hover:text-content"
          title="Copy logs"
        >
          {copied ? <Icons.Dot size={9} /> : <Icons.Copy size={11} />}
        </span>
      </button>
      {open && (
        <div className="overflow-auto px-3.5 pb-2.5">
          {logs.map((line, i) => (
            <pre
              key={i}
              className="text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed py-0.5 border-b last:border-b-0"
              style={{ color: 'var(--content-secondary)', borderColor: 'var(--line-subtle)' }}
            >
              {line}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}

function RunLoadingBanner({ onCancel }: { onCancel?: () => void }) {
  return (
    <div
      className="shrink-0 flex items-center gap-2.5 px-3.5 py-1.5 border-b"
      style={{
        background: 'color-mix(in oklch, var(--accent) 10%, transparent)',
        borderColor: 'color-mix(in oklch, var(--accent) 25%, transparent)',
      }}
    >
      <div className="w-3 h-3 rounded-full border-2 border-t-transparent border-accent animate-spin" />
      <span className="text-[11.5px] font-medium text-accent">Running transform…</span>
      <span className="flex-1" />
      {onCancel && (
        <button
          onClick={onCancel}
          className="text-[11px] font-medium text-content-secondary hover:text-content cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded border border-line hover:bg-surface-2 transition-colors"
          title="Cancel running script (⌘.)"
        >
          Cancel
          <kbd className="text-[9.5px] font-mono text-content-faint">⌘.</kbd>
        </button>
      )}
    </div>
  );
}

function SkeletonRows() {
  const widths = ['82%', '68%', '90%', '54%', '76%', '60%', '88%', '44%', '72%', '58%'];
  return (
    <div className="h-full overflow-hidden p-4 bg-surface space-y-2">
      {widths.map((w, i) => (
        <div
          key={i}
          className="h-3 rounded animate-pulse"
          style={{
            width: w,
            background: 'color-mix(in oklch, var(--content) 8%, transparent)',
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
    </div>
  );
}

function OutputIdleState({ isQueryMode }: { isQueryMode?: boolean }) {
  return (
    <div className="h-full flex items-center justify-center bg-surface px-6 py-10">
      <div className="flex flex-col items-center text-center">
        <div className="text-[12.5px] text-content-faint">
          {isQueryMode ? 'Resolve a query to see the final SQL here.' : 'Run a transform to see output here.'}
        </div>
        <div className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] text-content-ghost">
          <span>Press</span>
          <kbd className="font-mono px-1.5 h-4 inline-flex items-center rounded bg-surface-2 border border-line text-content-faint">⌘↵</kbd>
          <span>to run</span>
        </div>
      </div>
    </div>
  );
}

interface OutputErrorCardProps {
  error: string;
  errorLine?: number | null;
  executionTimeMs?: number;
  scriptSource?: string;
  stackOpen: boolean;
  onToggleStack: () => void;
}

function OutputErrorCard({ error, errorLine, executionTimeMs, scriptSource, stackOpen, onToggleStack }: OutputErrorCardProps) {
  const [copied, setCopied] = useState(false);
  const code = extractDwErrorCode(error);
  const headline = extractFirstLine(error);
  const details = extractDetails(error);
  const stack = extractStackTrace(error);
  const hint = matchErrorHint(error);

  const sourceContext = (() => {
    if (!scriptSource || !errorLine) return null;
    const lines = scriptSource.split('\n');
    const start = Math.max(0, errorLine - 3);
    const end = Math.min(lines.length, errorLine + 2);
    return { lines: lines.slice(start, end), startLine: start + 1, target: errorLine };
  })();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(error);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3">
      {/* Status pill row */}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md font-mono text-[11px] font-medium"
          style={{
            background: 'color-mix(in oklch, var(--err) 12%, transparent)',
            color: 'var(--err)',
            border: '1px solid color-mix(in oklch, var(--err) 30%, transparent)',
          }}
        >
          <Icons.Dot size={8} /> Failed
          {executionTimeMs !== undefined && <span className="opacity-70">· {executionTimeMs}ms</span>}
        </span>
        {code && (
          <span
            className="inline-flex items-center h-6 px-2 rounded-md font-mono text-[10.5px] font-bold"
            style={{
              background: 'color-mix(in oklch, var(--err) 8%, transparent)',
              color: 'var(--err)',
              border: '1px solid color-mix(in oklch, var(--err) 25%, transparent)',
            }}
          >
            {code}
          </span>
        )}
        <span className="flex-1" />
        <button
          onClick={handleCopy}
          className="h-6 px-2 inline-flex items-center gap-1 rounded text-[11px] text-content-faint border border-line hover:bg-surface-2 cursor-pointer"
        >
          {copied ? <Icons.Dot size={9} /> : <Icons.Copy size={11} />}
          {copied ? 'Copied' : 'Copy error'}
        </button>
      </div>

      {/* Headline card */}
      <div
        className="rounded-lg p-3.5 border"
        style={{
          background: 'color-mix(in oklch, var(--err) 6%, transparent)',
          borderColor: 'color-mix(in oklch, var(--err) 20%, transparent)',
        }}
      >
        <div className="flex items-start gap-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5" style={{ color: 'var(--err)' }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold" style={{ color: 'var(--err)' }}>
              {headline}
            </div>
            {errorLine && (
              <div className="text-[11px] text-content-muted mt-1 font-mono">
                at line {errorLine}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hint card — pattern-matched explanation + fix suggestions.
          Rendered above the raw details so users see the actionable advice first. */}
      {hint && (
        <div
          className="rounded-lg border overflow-hidden"
          style={{
            background: 'color-mix(in oklch, var(--cyan) 5%, var(--surface))',
            borderColor: 'color-mix(in oklch, var(--cyan) 28%, transparent)',
          }}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 border-b" style={{ borderColor: 'color-mix(in oklch, var(--cyan) 18%, transparent)', background: 'color-mix(in oklch, var(--cyan) 8%, transparent)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--cyan)' }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span className="text-[11px] font-semibold uppercase tracking-[0.6px]" style={{ color: 'var(--cyan)' }}>
              Hint · {categoryLabel(hint.category)}
            </span>
          </div>
          <div className="px-3.5 py-3 space-y-2.5">
            <div className="text-[12.5px] text-content leading-relaxed">
              {hint.summary}
            </div>
            <ul className="space-y-1.5 text-[12px] text-content-secondary leading-relaxed">
              {hint.fixes.map((fix, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 text-content-ghost font-mono text-[10.5px] mt-0.5">{i + 1}.</span>
                  <span>{renderWithInlineCode(fix)}</span>
                </li>
              ))}
            </ul>
            {hint.example && (
              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-[0.6px] font-semibold text-content-faint mb-1">
                  {hint.example.caption}
                </div>
                <pre className="rounded p-2 text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed border" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--content)' }}>
                  {hint.example.code}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reason details — the body of the error message between the headline
          and the stack trace. Often the most important part. */}
      {details && (
        <pre
          className="rounded-lg p-3 text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed border overflow-x-auto"
          style={{
            background: 'color-mix(in oklch, var(--err) 4%, var(--surface))',
            borderColor: 'var(--line)',
            color: 'var(--content-secondary)',
          }}
        >
          {details}
        </pre>
      )}

      {/* Source location panel */}
      {sourceContext && (
        <div className="rounded-lg border border-line overflow-hidden">
          <div className="px-3 py-1.5 text-[10.5px] uppercase tracking-[0.6px] font-semibold text-content-faint bg-surface-2 border-b border-line">
            Location
          </div>
          <div className="font-mono text-[11.5px] py-2 bg-surface">
            {sourceContext.lines.map((line, i) => {
              const lineNo = sourceContext.startLine + i;
              const isTarget = lineNo === sourceContext.target;
              return (
                <div
                  key={i}
                  className="flex items-center px-3 py-0.5"
                  style={{
                    background: isTarget ? 'color-mix(in oklch, var(--err) 10%, transparent)' : 'transparent',
                  }}
                >
                  <span
                    className={`shrink-0 w-7 text-right pr-2 select-none ${
                      isTarget ? 'text-err font-semibold' : 'text-content-ghost'
                    }`}
                  >
                    {isTarget ? '→' : lineNo}
                  </span>
                  <span className={isTarget ? 'text-content' : 'text-content-secondary'}>
                    {line || ' '}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stack trace */}
      {stack.length > 0 && (
        <div className="rounded-lg border border-line overflow-hidden">
          <button
            onClick={onToggleStack}
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-[0.6px] font-semibold text-content-faint bg-surface-2 hover:bg-surface-3 cursor-pointer"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" className={`transition-transform ${stackOpen ? 'rotate-90' : ''}`}>
              <path d="M3 1l5 4-5 4V1z" />
            </svg>
            Stack trace
            <span className="ml-1 text-content-ghost">({stack.length})</span>
          </button>
          {stackOpen && (
            <pre className="px-3 py-2 text-[10.5px] font-mono text-content-faint whitespace-pre-wrap break-words leading-relaxed bg-surface">
              {stack.join('\n')}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
