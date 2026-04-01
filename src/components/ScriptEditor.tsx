import Editor, { useMonaco, BeforeMount } from '@monaco-editor/react';
import { useEffect, useRef, useCallback } from 'react';
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
    <div className="flex flex-col h-full border border-line rounded-md overflow-hidden bg-surface-panel">
      <div className="bg-surface-elevated px-3 py-1.5 text-xs text-content-secondary font-medium border-b border-line flex justify-between items-center">
        <span>{headerLabel || 'Script (DataWeave 2.0)'}</span>
        <button
          onClick={onRun}
          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs transition-colors cursor-pointer"
        >
          Run (Ctrl+Enter)
        </button>
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
