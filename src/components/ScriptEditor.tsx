import Editor, { useMonaco, BeforeMount } from '@monaco-editor/react';
import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { dwTokensProvider } from '../dataweaveGrammar';
import { registerDWCompletionProvider, DWCompletionContext } from '../dataweaveCompletions';
import { registerDWHoverProvider } from '../dataweaveHover';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { useTheme } from '../ThemeContext';
import { useEditorFont } from '../hooks/useEditorFont';

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
  onCursorChange?: (line: number, col: number) => void;
}

export interface ScriptEditorHandle {
  format: () => void;
  focus: () => void;
  insertSnippet: (text: string) => void;
  insertAtCursor: (text: string) => void;
}

/** Best-effort DW 1.0 → 2.0 source migration (client-side) */
function migrateDW1to2(src: string): string {
  const lines = src.split('\n');
  const out: string[] = [];
  const warnings: string[] = [];

  for (let raw of lines) {
    let line = raw;

    // %dw 1.0 → %dw 2.0
    line = line.replace(/^(\s*)%dw\s+1\.0\b/, '$1%dw 2.0');

    // %input name mime → input name mime
    line = line.replace(/^(\s*)%input\b/, '$1input');

    // %output mime → output mime
    line = line.replace(/^(\s*)%output\b/, '$1output');

    // %var name = expr → var name = expr
    line = line.replace(/^(\s*)%var\b/, '$1var');

    // %namespace prefix = uri → (removed — DW 2.0 uses import)
    if (/^\s*%namespace\b/.test(line)) {
      out.push('// TODO: convert %namespace to import statement');
      warnings.push('%namespace: convert manually to `import * from <namespace>`');
      out.push(line.replace(/^\s*%namespace\b/, '// %namespace'));
      continue;
    }

    // %function name(params) = body → fun name(params) = body
    line = line.replace(/^(\s*)%function\b/, '$1fun');

    // flowVars → vars
    line = line.replace(/\bflowVars\b/g, 'vars');

    // inboundProperties."http.method" → attributes.method (common case)
    line = line.replace(/\binboundProperties\["http\.method"\]/g, 'attributes.method');
    line = line.replace(/\binboundProperties\.'http\.method'/g, 'attributes.method');
    // inboundProperties."header-name" → attributes.headers."header-name"
    line = line.replace(/\binboundProperties\b/g, 'attributes.headers');

    // outboundProperties → (no direct equivalent)
    if (/\boutboundProperties\b/.test(line)) {
      warnings.push('outboundProperties: no direct DW 2.0 equivalent — remove or pass as named input');
    }

    // sessionVars → (no direct equivalent)
    if (/\bsessionVars\b/.test(line)) {
      warnings.push('sessionVars: no direct DW 2.0 equivalent');
    }

    // when <cond> is → if (<cond> ==) — pattern match approximation
    // "expr when condition otherwise alt" stays valid in DW 2.0 — no change needed

    // as :string → as String  (type coercion syntax)
    line = line.replace(/\bas\s+:string\b/gi, 'as String');
    line = line.replace(/\bas\s+:number\b/gi, 'as Number');
    line = line.replace(/\bas\s+:boolean\b/gi, 'as Boolean');
    line = line.replace(/\bas\s+:date\b/gi, 'as Date');
    line = line.replace(/\bas\s+:datetime\b/gi, 'as DateTime');
    line = line.replace(/\bas\s+:localtime\b/gi, 'as LocalTime');
    line = line.replace(/\bas\s+:localdatetime\b/gi, 'as LocalDateTime');
    line = line.replace(/\bas\s+:time\b/gi, 'as Time');
    line = line.replace(/\bas\s+:object\b/gi, 'as Object');
    line = line.replace(/\bas\s+:array\b/gi, 'as Array');

    // @(...) metadata annotation — warn
    if (/@\(/.test(line)) {
      warnings.push('@(...) metadata annotations: syntax may differ in DW 2.0');
    }

    // p("key") — not available in standalone DW CLI; use Config YAML + ${key} substitution
    if (/\bp\s*\(/.test(line) && !/\bapp\b/.test(line)) {
      warnings.push('p("key"): not available in DW CLI. Use ${key} / ${secure::key} placeholders with the Config YAML panel instead.');
    }

    // lookup("flowName", payload) → warn — no equivalent
    if (/\blookup\s*\(/.test(line)) {
      warnings.push('lookup(): not available in DW 2.0 standalone CLI');
    }

    out.push(line);
  }

  let result = out.join('\n');

  if (warnings.length > 0) {
    const header = warnings.map(w => `// ⚠ ${w}`).join('\n');
    result = header + '\n' + result;
  }

  return result;
}

export const ScriptEditor = forwardRef<ScriptEditorHandle, ScriptEditorProps>(function ScriptEditor(
  { code, onChange, onRun, errorLine, headerLabel, payload, payloadMimeType, contextData, onCursorChange },
  ref,
) {
  const monaco = useMonaco();
  const { isDark } = useTheme();
  const editorFont = useEditorFont();
  const editorRef = useRef<any>(null);
  const [migrateResult, setMigrateResult] = useState<{ output: string; error?: string } | null>(null);

  const handleMigrate = () => {
    if (!code.trim()) {
      setMigrateResult({ output: '', error: 'Script is empty.' });
      return;
    }
    if (!/^\s*%dw\s+1\.0\b/m.test(code)) {
      setMigrateResult({ output: '', error: 'Script does not appear to be DW 1.0 (missing `%dw 1.0`). No migration needed.' });
      return;
    }
    try {
      const result = migrateDW1to2(code);
      setMigrateResult({ output: result });
    } catch (e) {
      setMigrateResult({ output: '', error: String(e) });
    }
  };
  const decorationsRef = useRef<string[]>([]);

  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;

  useImperativeHandle(ref, () => ({
    format: () => {
      const editor = editorRef.current;
      if (!editor) return;
      const model = editor.getModel();
      if (!model) return;
      const lineCount = model.getLineCount();
      editor.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: lineCount, endColumn: model.getLineMaxColumn(lineCount) });
      const action = editor.getAction('editor.action.reindentselectedlines') || editor.getAction('editor.action.reindentlines');
      if (action) action.run();
      editor.setPosition({ lineNumber: 1, column: 1 });
    },
    focus: () => editorRef.current?.focus(),
    insertAtCursor: (text: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const sel = editor.getSelection();
      const range = sel ?? {
        startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1,
      };
      editor.executeEdits('insert-at-cursor', [
        { range, text, forceMoveMarkers: true },
      ]);
      editor.focus();
    },
    insertSnippet: (text: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const model = editor.getModel?.();
      if (!model) return;
      // Replace the entire script. DW snippets are self-contained scripts
      // (header + body); stacking them produces invalid code. pushEditOperations
      // with explicit undo stops preserves history so Ctrl+Z restores the
      // previous script.
      editor.pushUndoStop();
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text }],
        () => null,
      );
      editor.pushUndoStop();
      editor.setPosition({ lineNumber: 1, column: 1 });
      editor.revealLine(1);
      editor.focus();
    },
  }), []);

  const completionDisposableRef = useRef<any>(null);
  const hoverDisposableRef = useRef<any>(null);
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

    // Language config: bracket pairs, auto-close, auto-indent
    monacoInstance.languages.setLanguageConfiguration('dataweave', {
      brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
      ],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"', notIn: ['string'] },
        { open: "'", close: "'", notIn: ['string'] },
      ],
      surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],
      indentationRules: {
        // Increase indent after: unclosed {, [, (, or a line ending with -> or =
        increaseIndentPattern: /^.*(\{[^}"']*|\[[^\]"']*|\([^)"']*|->\s*|=\s*)$/,
        decreaseIndentPattern: /^\s*[}\])].*$/,
      },
      onEnterRules: [
        // Cursor between auto-closed pairs → indent inner line, outdent closing bracket
        { beforeText: /\{$/, afterText: /^\s*\}/, action: { indentAction: monacoInstance.languages.IndentAction.IndentOutdent } },
        { beforeText: /\[$/, afterText: /^\s*\]/, action: { indentAction: monacoInstance.languages.IndentAction.IndentOutdent } },
        { beforeText: /\($/, afterText: /^\s*\)/, action: { indentAction: monacoInstance.languages.IndentAction.IndentOutdent } },

        // DW lambda / transform operator: `payload map (item) ->`
        // `fun myFun(x) ->`
        { beforeText: /->\s*$/, action: { indentAction: monacoInstance.languages.IndentAction.Indent } },

        // DW var/fun body: `var x =`  `fun f(a) =`
        { beforeText: /=\s*$/, action: { indentAction: monacoInstance.languages.IndentAction.Indent } },

        // Opening bracket with content still on the same line (no closing bracket yet)
        { beforeText: /\{[^}]*$/, action: { indentAction: monacoInstance.languages.IndentAction.Indent } },
        { beforeText: /\[[^\]]*$/, action: { indentAction: monacoInstance.languages.IndentAction.Indent } },
        { beforeText: /\([^)]*$/, action: { indentAction: monacoInstance.languages.IndentAction.Indent } },
      ],
    });

    // Define custom theme
    defineDataWeaveTheme(monacoInstance);
  }, []);

  // Register autocomplete + hover docs once monaco is ready
  useEffect(() => {
    if (monaco) {
      if (completionDisposableRef.current) completionDisposableRef.current.dispose();
      if (hoverDisposableRef.current) hoverDisposableRef.current.dispose();
      completionDisposableRef.current = registerDWCompletionProvider(monaco, () => contextRef.current);
      hoverDisposableRef.current = registerDWHoverProvider(monaco);
    }

    return () => {
      if (completionDisposableRef.current) {
        completionDisposableRef.current.dispose();
        completionDisposableRef.current = null;
      }
      if (hoverDisposableRef.current) {
        hoverDisposableRef.current.dispose();
        hoverDisposableRef.current = null;
      }
    };
  }, [monaco]);

  // Switch Monaco theme when app theme changes (redefine first so colors reflect current CSS vars)
  useEffect(() => {
    if (monaco) {
      defineDataWeaveTheme(monaco);
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
    editor.onDidChangeCursorPosition((e: any) => {
      onCursorChangeRef.current?.(e.position.lineNumber, e.position.column);
    });
    const pos = editor.getPosition();
    if (pos) onCursorChangeRef.current?.(pos.lineNumber, pos.column);
  };

  const editorTheme = isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME;

  return (
    <div className="relative flex flex-col h-full overflow-hidden bg-surface">
      <div className="h-[30px] shrink-0 flex items-center gap-2 px-3.5 border-b border-line-secondary">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-content-faint shrink-0">
          <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>
        </svg>
        <span className="text-[11.5px] font-medium text-content-secondary">{headerLabel || 'transform.dwl'}</span>
        <span className="flex-1" />
        <button
          onClick={handleMigrate}
          title="Migrate DW 1.0 script to DW 2.0"
          className="font-mono text-[10.5px] px-1.5 py-0.5 rounded border border-transparent text-content-faint hover:text-warn transition-colors cursor-pointer"
          style={{
            borderColor: 'transparent',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--warn) 30%, transparent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
        >
          1.0→2.0
        </button>
        <span className="font-mono text-[10.5px] text-content-faint">DataWeave 2.0</span>
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
            ...editorFont,
            // Render hover & suggest popups at document root so they don't get
            // clipped by the editor container's overflow.
            fixedOverflowWidgets: true,
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
            scrollbar: { alwaysConsumeMouseWheel: false },
          }}
        />
      </div>
      {/* Migrate result dialog */}
      {migrateResult && (
        <div className="absolute inset-0 z-20 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface-sidebar border border-amber-500/30 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-500/20 flex items-center justify-between">
              <span className="text-sm font-semibold text-warn">DW 1.0 → 2.0 Migration Result</span>
              <button onClick={() => setMigrateResult(null)} className="text-content-faint hover:text-content cursor-pointer">✕</button>
            </div>
            <div className="p-4 space-y-3">
              {migrateResult.error ? (
                <pre className="text-xs text-err bg-err-tint border border-err-border/40 rounded p-3 whitespace-pre-wrap max-h-60 overflow-auto">{migrateResult.error}</pre>
              ) : (
                <pre className="text-xs text-accent font-mono bg-surface-input border border-line-secondary rounded p-3 whitespace-pre-wrap max-h-60 overflow-auto select-text">{migrateResult.output}</pre>
              )}
              {!migrateResult.error && migrateResult.output && (
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setMigrateResult(null)} className="px-3 py-1.5 text-xs border border-line-secondary text-content-faint rounded cursor-pointer hover:text-content transition-colors">
                    Discard
                  </button>
                  <button
                    onClick={() => { onChange(migrateResult.output); setMigrateResult(null); }}
                    className="px-3 py-1.5 text-xs bg-warn hover:opacity-90 text-[var(--accent-ink)] rounded cursor-pointer transition-colors"
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
          background-color: color-mix(in oklch, var(--err) 15%, transparent) !important;
          border-left: 3px solid var(--err) !important;
        }
        .error-glyph {
          background-color: var(--err);
          border-radius: 50%;
          margin-left: 4px;
          width: 8px !important;
          height: 8px !important;
          margin-top: 6px;
        }
      `}</style>
    </div>
  );
});
