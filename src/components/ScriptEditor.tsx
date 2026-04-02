import Editor, { useMonaco, BeforeMount } from '@monaco-editor/react';
import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { dwTokensProvider } from '../dataweaveGrammar';
import { registerDWCompletionProvider, DWCompletionContext } from '../dataweaveCompletions';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { useTheme } from '../ThemeContext';

interface ScriptEditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  onRun: () => void;
  errorLine?: number | null;
  headerLabel?: string;
  payload?: string;
  payloadMimeType?: string;
  contextData?: {
    vars: { key: string; value: string; valueType: string }[];
    headers: { key: string; value: string }[];
    queryParams: { key: string; value: string }[];
    namedInputs?: { name: string; content: string; mimeType: string }[];
    configYaml?: string;
    secureConfigYaml?: string;
  };
}

export function ScriptEditor({ code, onChange, onRun, errorLine, headerLabel, payload, payloadMimeType, contextData }: ScriptEditorProps) {
  const monaco = useMonaco();
  const { isDark } = useTheme();
  const editorRef = useRef<any>(null);
  const [migrateResult, setMigrateResult] = useState<{ output: string; error?: string } | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);

  const handleMigrate = async () => {
    setIsMigrating(true);
    try {
      const result = await invoke<string>('migrate_dataweave', { script: code });
      setMigrateResult({ output: result });
    } catch (e) {
      setMigrateResult({ output: '', error: String(e) });
    } finally {
      setIsMigrating(false);
    }
  };
  const decorationsRef = useRef<string[]>([]);

  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  const completionDisposableRef = useRef<any>(null);
  const contextRef = useRef<DWCompletionContext>({
    payload: '',
    payloadMimeType: 'application/json',
    vars: [],
    headers: [],
    queryParams: [],
    namedInputs: [],
    configYaml: '',
    secureConfigYaml: '',
  });

  // Keep context ref in sync with props
  useEffect(() => {
    contextRef.current = {
      payload: payload || '',
      payloadMimeType: payloadMimeType || 'application/json',
      vars: contextData?.vars || [],
      headers: contextData?.headers || [],
      queryParams: contextData?.queryParams || [],
      namedInputs: contextData?.namedInputs || [],
      configYaml: contextData?.configYaml || '',
      secureConfigYaml: contextData?.secureConfigYaml || '',
    };
  }, [payload, payloadMimeType, contextData]);

  // Define theme + register language BEFORE the editor mounts (no race condition)
  const handleBeforeMount: BeforeMount = useCallback((monacoInstance) => {
    // Register language
    const langs = monacoInstance.languages.getLanguages();
    if (!langs.some((l: any) => l.id === 'dataweave')) {
      monacoInstance.languages.register({ id: 'dataweave' });
    }
    monacoInstance.languages.setMonarchTokensProvider('dataweave', dwTokensProvider as any);

    // Define custom theme
    defineDataWeaveTheme(monacoInstance);
  }, []);

  // Register autocomplete once monaco is ready
  useEffect(() => {
    if (monaco) {
      if (completionDisposableRef.current) {
        completionDisposableRef.current.dispose();
      }
      completionDisposableRef.current = registerDWCompletionProvider(monaco, () => contextRef.current);
    }

    return () => {
      if (completionDisposableRef.current) {
        completionDisposableRef.current.dispose();
        completionDisposableRef.current = null;
      }
    };
  }, [monaco]);

  // Switch Monaco theme when app theme changes
  useEffect(() => {
    if (monaco) {
      monaco.editor.setTheme(isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME);
    }
  }, [isDark, monaco]);

  // Highlight error line when it changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !monaco) return;

    if (errorLine && errorLine > 0) {
      decorationsRef.current = editor.deltaDecorations(
        decorationsRef.current,
        [
          {
            range: new monaco.Range(errorLine, 1, errorLine, 1),
            options: {
              isWholeLine: true,
              className: 'error-line-highlight',
              glyphMarginClassName: 'error-glyph',
            },
          },
        ]
      );
      // Scroll to the error line
      editor.revealLineInCenter(errorLine);
    } else {
      // Clear decorations
      decorationsRef.current = editor.deltaDecorations(
        decorationsRef.current,
        []
      );
    }
  }, [errorLine, monaco]);

  const handleEditorDidMount = (editor: any, monacoInstance: any) => {
    editorRef.current = editor;
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
      onRunRef.current();
    });
  };

  const editorTheme = isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME;

  return (
    <div className="relative flex flex-col h-full border border-line rounded-md overflow-hidden bg-surface-panel">
      <div className="bg-surface-elevated px-3 py-1.5 text-xs text-content-secondary font-medium border-b border-line flex justify-between items-center">
        <span>{headerLabel || 'Script (DataWeave 2.0)'}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleMigrate}
            disabled={isMigrating}
            title="Migrate DW 1.0 script to DW 2.0"
            className="text-content-faint hover:text-amber-400 disabled:opacity-50 px-2 py-1 rounded text-xs transition-colors cursor-pointer border border-transparent hover:border-amber-500/30"
          >
            {isMigrating ? 'Migrating...' : '1.0→2.0'}
          </button>
          <button
            onClick={onRun}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs transition-colors cursor-pointer"
          >
            Run (Ctrl+Enter)
          </button>
        </div>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language="dataweave"
          theme={editorTheme}
          value={code}
          onChange={onChange}
          beforeMount={handleBeforeMount}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            glyphMargin: true,
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            tabCompletion: 'on',
            acceptSuggestionOnEnter: 'on',
            snippetSuggestions: 'top',
            autoClosingBrackets: 'always',
            autoClosingQuotes: 'always',
            autoSurround: 'brackets',
            autoIndent: 'full',
          }}
        />
      </div>
      {/* Migrate result dialog */}
      {migrateResult && (
        <div className="absolute inset-0 z-20 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface-sidebar border border-amber-500/30 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-500/20 flex items-center justify-between">
              <span className="text-sm font-semibold text-amber-400">DW 1.0 → 2.0 Migration Result</span>
              <button onClick={() => setMigrateResult(null)} className="text-content-faint hover:text-content cursor-pointer">✕</button>
            </div>
            <div className="p-4 space-y-3">
              {migrateResult.error ? (
                <pre className="text-xs text-red-300 bg-red-900/20 border border-red-800/40 rounded p-3 whitespace-pre-wrap max-h-60 overflow-auto">{migrateResult.error}</pre>
              ) : (
                <pre className="text-xs text-green-300 font-mono bg-surface-input border border-line-secondary rounded p-3 whitespace-pre-wrap max-h-60 overflow-auto select-text">{migrateResult.output}</pre>
              )}
              {!migrateResult.error && migrateResult.output && (
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setMigrateResult(null)} className="px-3 py-1.5 text-xs border border-line-secondary text-content-faint rounded cursor-pointer hover:text-content transition-colors">
                    Discard
                  </button>
                  <button
                    onClick={() => { onChange(migrateResult.output); setMigrateResult(null); }}
                    className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded cursor-pointer transition-colors"
                  >
                    Replace Script
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inline styles for error decorations */}
      <style>{`
        .error-line-highlight {
          background-color: rgba(255, 0, 0, 0.15) !important;
          border-left: 3px solid #ff4444 !important;
        }
        .error-glyph {
          background-color: #ff4444;
          border-radius: 50%;
          margin-left: 4px;
          width: 8px !important;
          height: 8px !important;
          margin-top: 6px;
        }
      `}</style>
    </div>
  );
}
