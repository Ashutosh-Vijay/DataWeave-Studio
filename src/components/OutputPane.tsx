import { useState } from 'react';
import Editor, { BeforeMount } from '@monaco-editor/react';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { useTheme } from '../ThemeContext';
import { Icons } from './Icons';
import { EmptyState, ErrorState } from './StateScreens';

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
}

export function OutputPane({
  output,
  error,
  isRunning,
  executionTimeMs,
  outputFormat,
  onFormatChange,
  queryResult,
  isQueryMode,
  queryLanguage,
}: OutputPaneProps) {
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);
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

      {/* Content area */}
      <div className="flex-1 relative">
        {/* Running overlay */}
        {isRunning && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[1px]"
            style={{ background: 'color-mix(in oklch, var(--bg) 55%, transparent)' }}
          >
            <div className="flex items-center space-x-2 text-content">
              <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-accent animate-spin" />
              <span className="text-[12.5px]">Executing…</span>
            </div>
          </div>
        )}

        {error ? (
          <div className="h-full overflow-auto bg-surface p-4">
            <ErrorState title="Error" message={error} />
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
          <div className="h-full flex items-center justify-center">
            <EmptyState
              title={isQueryMode ? 'No query result yet' : 'No output yet'}
              message={isQueryMode ? 'Run to see the final query with parameters resolved.' : 'Run your script to see the transformed output here.'}
              icon={<Icons.Play size={16} />}
            />
          </div>
        )}
      </div>
    </div>
  );
}
