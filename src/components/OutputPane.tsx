import { useState } from 'react';
import Editor, { BeforeMount } from '@monaco-editor/react';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { useTheme } from '../ThemeContext';

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
  const { isDark } = useTheme();
  const editorTheme = isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME;

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
    <div className="flex flex-col h-full border border-line rounded-md overflow-hidden bg-surface-panel">
      {/* Header */}
      <div className="bg-surface-elevated px-3 py-1.5 text-xs text-content-secondary font-medium border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{isQueryMode ? 'Query Result' : 'Output'}</span>
          {executionTimeMs !== undefined && !isRunning && (
            <span className="text-[10px] text-content-faint bg-line-subtle px-1.5 py-0.5 rounded">
              {executionTimeMs}ms
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Format toggle */}
          <select
            value={outputFormat}
            onChange={(e) => onFormatChange(e.target.value as 'json' | 'xml' | 'raw')}
            className="bg-surface-panel border border-line-secondary rounded px-1.5 py-0.5 text-[10px] text-content-muted focus:outline-none cursor-pointer"
          >
            <option value="json">JSON</option>
            <option value="xml">XML</option>
            <option value="raw">Raw</option>
          </select>
          {/* Copy button */}
          {hasContent && (
            <button
              onClick={handleCopy}
              className="text-content-muted hover:text-content text-[10px] px-1.5 py-0.5 border border-line-secondary rounded transition-colors cursor-pointer"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 relative">
        {/* Running overlay */}
        {isRunning && (
          <div className="absolute inset-0 z-10 bg-black/50 flex items-center justify-center backdrop-blur-[1px]">
            <div className="flex items-center space-x-2 text-white">
              <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-[#00a0df] animate-spin" />
              <span className="text-sm">Executing...</span>
            </div>
          </div>
        )}

        {error ? (
          <div className="h-full overflow-auto bg-surface-panel p-4">
            <div className="bg-red-900/20 border border-red-800/50 rounded p-3 mb-2">
              <div className="text-red-400 text-xs font-medium mb-1">Error</div>
              <pre className="text-red-300 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                {error}
              </pre>
            </div>
          </div>
        ) : isQueryMode && queryResult ? (
          /* Query mode: show substituted query + parameters */
          <div className="h-full overflow-auto bg-surface-panel">
            {/* Final query */}
            <div className="border-b border-line">
              <div className="px-3 py-1.5 text-[10px] text-content-faint uppercase tracking-wide bg-surface-section">
                Final {queryLanguage} Query
              </div>
              <pre className="px-4 py-3 text-sm font-mono text-blue-300 whitespace-pre-wrap leading-relaxed select-text">
                {queryResult.result}
              </pre>
            </div>
            {/* Parameters */}
            <div>
              <div className="px-3 py-1.5 text-[10px] text-content-faint uppercase tracking-wide bg-surface-section">
                Resolved Parameters
              </div>
              <div className="p-3 space-y-1">
                {Object.entries(queryResult.params).map(([key, value]) => (
                  <div key={key} className="flex items-baseline gap-2 text-xs font-mono">
                    <span className="text-purple-400">:{key}</span>
                    <span className="text-content-ghost">=</span>
                    <span className="text-green-400">{JSON.stringify(value)}</span>
                    <span className="text-content-ghost text-[10px] italic">
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
          <div className="h-full flex items-center justify-center text-content-ghost text-sm">
            {isQueryMode ? 'Run to see the final query with parameters' : 'Run a script to see output'}
          </div>
        )}
      </div>
    </div>
  );
}
