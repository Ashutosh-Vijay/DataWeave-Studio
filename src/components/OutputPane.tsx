import { useState } from 'react';
import Editor, { BeforeMount } from '@monaco-editor/react';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { useTheme } from '../ThemeContext';
import { Icons } from './Icons';

const handleBeforeMount: BeforeMount = (monaco) => defineDataWeaveTheme(monaco);

interface QueryResult {
  result: string;
  params: Record<string, unknown>;
}

interface OutputPaneProps {
  output: string;
  error: string | null;
  isRunning: boolean;
  executionTimeMs?: number;
  errorLine?: number | null;
  outputFormat: 'json' | 'xml' | 'raw';
  onFormatChange: (format: 'json' | 'xml' | 'raw') => void;
  queryResult?: QueryResult | null;
  isQueryMode?: boolean;
  queryLanguage?: string;
  scriptSource?: string;
  onStartTour?: () => void;
  onNewScript?: () => void;
  onImportCurl?: () => void;
  onOpenSnippets?: () => void;
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

export function OutputPane({
  output,
  error,
  isRunning,
  executionTimeMs,
  errorLine,
  outputFormat,
  onFormatChange,
  queryResult,
  isQueryMode,
  queryLanguage,
  scriptSource,
  onStartTour,
  onNewScript,
  onImportCurl,
  onOpenSnippets,
}: OutputPaneProps) {
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);
  const [stackOpen, setStackOpen] = useState(false);
  const { isDark } = useTheme();
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

        {/* Segmented format switch */}
        <div className="flex items-center p-0.5 rounded-md bg-surface-2 border border-line-secondary">
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
      {isRunning && <RunLoadingBanner />}

      {/* Content area */}
      <div className="flex-1 relative">
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
            {/* Parameters */}
            <div>
              <div className="px-3.5 py-1.5 text-[10.5px] font-semibold text-content-faint uppercase tracking-[0.6px] bg-surface-2">
                Resolved Parameters
              </div>
              <div className="p-3 space-y-1">
                {Object.entries(queryResult.params).map(([key, value]) => (
                  <div key={key} className="flex items-baseline gap-2 text-[12px] font-mono">
                    <span style={{ color: 'var(--violet)' }}>:{key}</span>
                    <span className="text-content-ghost">=</span>
                    <span style={{ color: 'var(--accent)' }}>{JSON.stringify(value)}</span>
                    <span className="text-content-ghost text-[10.5px] italic">
                      {value === null ? 'null' : typeof value === 'string' ? 'String' : typeof value === 'number' ? 'Number' : typeof value === 'boolean' ? 'Boolean' : typeof value}
                    </span>
                  </div>
                ))}
              </div>
              {/* Connector behavior note */}
              <div className="px-3 pb-2 pt-1 text-[10px] text-content-ghost border-t border-line-subtle mt-2">
                {queryLanguage === 'SOQL' ? (
                  <span>Salesforce connector: literal replace — use <code className="text-content-faint">':param'</code> for strings, bare <code className="text-content-faint">:param</code> for dates/numbers</span>
                ) : (
                  <span>DB connector (JDBC): auto-quotes strings, bare numbers/booleans, NULL for nulls — never quote <code className="text-content-faint">:param</code> in SQL</span>
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
            value={output}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              renderLineHighlight: 'none',
              folding: true,
            }}
          />
        ) : (
          <StartTransformingHero
            isQueryMode={isQueryMode}
            onStartTour={onStartTour}
            onNewScript={onNewScript}
            onImportCurl={onImportCurl}
            onOpenSnippets={onOpenSnippets}
          />
        )}
      </div>
    </div>
  );
}

function RunLoadingBanner() {
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

function StartTransformingHero({
  isQueryMode,
  onStartTour,
  onNewScript,
  onImportCurl,
  onOpenSnippets,
}: {
  isQueryMode?: boolean;
  onStartTour?: () => void;
  onNewScript?: () => void;
  onImportCurl?: () => void;
  onOpenSnippets?: () => void;
}) {
  const cards = isQueryMode
    ? [
        { title: 'Define query', desc: 'Write SOQL or SQL with :param bindings', kbd: '⌘1', onClick: undefined as undefined | (() => void) },
        { title: 'Set parameters', desc: 'Bind values in the Vars panel', kbd: '⌘2', onClick: undefined as undefined | (() => void) },
        { title: 'Run', desc: 'Resolve parameters into final query', kbd: '⌘↵', onClick: undefined as undefined | (() => void) },
      ]
    : [
        { title: 'Blank script', desc: 'Start from %dw 2.0 with empty output', kbd: '⌘N', onClick: onNewScript },
        { title: 'Import payload', desc: 'Drag & drop JSON, XML, or CSV', kbd: '⌘⇧I', onClick: onImportCurl },
        { title: 'Snippet', desc: 'Pick a template — map, filter, group', kbd: '⌘⇧S', onClick: onOpenSnippets },
      ];
  return (
    <div className="h-full overflow-auto flex items-center justify-center bg-surface px-6 py-10">
      <div className="w-full max-w-[560px] flex flex-col items-center text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 font-bold text-[22px] tracking-tight"
          style={{
            background: 'linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 70%, var(--violet)))',
            color: 'var(--bg)',
            boxShadow: '0 8px 24px -8px color-mix(in oklch, var(--accent) 50%, transparent)',
          }}
        >
          dw
        </div>
        <div className="text-[16px] font-semibold text-content">
          {isQueryMode ? 'Build your first query' : 'Start transforming'}
        </div>
        <div className="text-[12px] text-content-faint mt-1.5 max-w-[380px]">
          {isQueryMode
            ? 'Write a parameterized query, bind values, and resolve to the final SQL.'
            : 'Pick a starting point — a blank script, an imported payload, or a snippet template.'}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-5 w-full">
          {cards.map((c) => {
            const interactive = !!c.onClick;
            const Tag: any = interactive ? 'button' : 'div';
            return (
              <Tag
                key={c.title}
                onClick={c.onClick}
                disabled={interactive ? false : undefined}
                className={`rounded-lg border border-line p-3 text-left bg-surface-2 transition-colors ${
                  interactive
                    ? 'hover:bg-surface-3 hover:border-line-secondary cursor-pointer'
                    : 'opacity-80'
                }`}
              >
                <div className="text-[12px] font-semibold text-content">{c.title}</div>
                <div className="text-[10.5px] text-content-faint mt-1 leading-relaxed">{c.desc}</div>
                <span className="inline-flex items-center justify-center mt-2 h-4 px-1.5 rounded bg-surface-3 border border-line-secondary font-mono text-[9.5px] text-content-faint">
                  {c.kbd}
                </span>
              </Tag>
            );
          })}
        </div>
        {onStartTour && (
          <button
            onClick={onStartTour}
            className="mt-5 text-[11px] text-content-muted hover:text-content-secondary cursor-pointer bg-transparent border-0 p-0"
          >
            60-second tour →
          </button>
        )}
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
  const stack = extractStackTrace(error);

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
