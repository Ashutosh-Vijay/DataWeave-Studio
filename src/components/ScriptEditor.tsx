import Editor, { useMonaco, BeforeMount } from '@monaco-editor/react';
import { useEffect, useRef, useCallback, useState, useMemo, forwardRef, useImperativeHandle, memo } from 'react';
import { configureEditor } from '../editorInit';
import { attachEngineDiagnostics } from '../dataweaveEngineLanguage';
import { Icons } from './Icons';
import { migrateDW1to2, type MigrationChange } from '../dwMigrate';
import { dwTokensProvider } from '../dataweaveGrammar';
import { ensureDWEditorProviders, registerDWModelContext, setActiveDWModel, DWCompletionContext } from '../dataweaveCompletions';
import { registerDWCodeActionProvider } from '../dataweaveCodeActions';
import { convertAllPropertyCalls, findPropertyCalls } from '../dataweavePropertyConverter';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { useTheme } from '../ThemeContext';
import { useEditorFont } from '../hooks/useEditorFont';
import { invoke } from '../bridge';

// Lazy-init a singleton DOM node attached directly to document.body for
// Monaco's overflow widgets (hover popovers, completion menus). Attaching
// here escapes any ancestor that creates a containing block (transform,
// will-change, etc.) which otherwise clips the popovers.
//
// IMPORTANT: must carry the `monaco-editor` class so Monaco's theme CSS
// (background colors, text colors) cascades into the widgets. Without it
// the popovers render with no background and unreadable text. We append
// the active theme class too so dark/light theming applies correctly.
let _overflowDomNode: HTMLDivElement | null = null;
function getOverflowWidgetsDomNode(): HTMLDivElement {
  if (typeof document === 'undefined') return null as unknown as HTMLDivElement;
  if (!_overflowDomNode) {
    _overflowDomNode = document.createElement('div');
    _overflowDomNode.className = 'monaco-editor monaco-overflow-widgets-root';
    _overflowDomNode.style.position = 'absolute';
    _overflowDomNode.style.zIndex = '99999';
    _overflowDomNode.style.top = '0';
    _overflowDomNode.style.left = '0';
    document.body.appendChild(_overflowDomNode);
  }
  return _overflowDomNode;
}

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
  /** Target runtime for completion + diagnostics, e.g. "2.4". Empty = latest. */
  languageLevel?: string;
  /** Lines with a breakpoint, 1-based. Rendered in the glyph margin. */
  breakpoints?: number[];
  /** Clicking the glyph margin toggles the line. Omit to disable breakpoints. */
  onToggleBreakpoint?: (line: number) => void;
  /** Where the debugger is currently parked, if anywhere. */
  pausedLine?: number | null;
  onCursorChange?: (line: number, col: number) => void;
  /** Stable identifier for THIS script. When set, @monaco-editor/react keeps
   *  a separate ITextModel per path and preserves its undo/redo history
   *  across re-mounts. Pass the request id from a multi-request workspace
   *  so switching tabs doesn't blow away the user's edit history. */
  modelPath?: string;
}

export interface ScriptEditorHandle {
  format: () => void;
  focus: () => void;
  insertSnippet: (text: string) => void;
  insertAtCursor: (text: string) => void;
  /** Scroll to a 1-based line/column and put the cursor there. Used by the
   *  trace panel, where every row points at a span in this script. */
  revealLine: (line: number, column?: number) => void;
}

// migrateDW1to2 + MigrationChange live in ../dwMigrate.ts (unit-tested there).

// Memoized to skip re-renders when irrelevant App state changes (modals,
// cursor moves now isolated in cursorStore, etc.). Re-renders only when
// `code`/`payload`/`contextData`/etc. actually change (shallow compare).
// Callers MUST stabilize object/function props for the memo to be effective.
export const ScriptEditor = memo(forwardRef<ScriptEditorHandle, ScriptEditorProps>(function ScriptEditor(
  { code, onChange, onRun, errorLine, headerLabel, payload, payloadMimeType, contextData, languageLevel,
    breakpoints, onToggleBreakpoint, pausedLine, onCursorChange, modelPath },
  ref,
) {
  const monaco = useMonaco();
  const { isDark } = useTheme();
  const editorFont = useEditorFont();
  const editorRef = useRef<any>(null);
  const [migrateResult, setMigrateResult] = useState<
    | { kind: 'error'; message: string }
    | { kind: 'ok'; before: string; output: string; changes: MigrationChange[]; warnings: string[] }
    | null
  >(null);

  const handleMigrate = () => {
    if (!code.trim()) {
      setMigrateResult({ kind: 'error', message: 'Script is empty.' });
      return;
    }
    if (!/^\s*%dw\s+1\.0\b/m.test(code)) {
      setMigrateResult({
        kind: 'error',
        message: 'This script doesn’t look like DataWeave 1.0 — missing `%dw 1.0` header. Nothing to migrate.',
      });
      return;
    }
    try {
      const result = migrateDW1to2(code);
      setMigrateResult({
        kind: 'ok',
        before: code,
        output: result.output,
        changes: result.changes,
        warnings: result.warnings,
      });
    } catch (e) {
      setMigrateResult({ kind: 'error', message: String(e) });
    }
  };

  // p() → ${} conversion: count occurrences for toolbar visibility,
  // and provide a click handler that rewrites the whole script in one pass.
  const pCallCount = useMemo(() => findPropertyCalls(code).length, [code]);
  const [pConvertFlash, setPConvertFlash] = useState(0);
  const handleConvertProperties = () => {
    if (pCallCount === 0) return;
    const { text, count } = convertAllPropertyCalls(code);
    onChange(text);
    setPConvertFlash(count);
    setTimeout(() => setPConvertFlash(0), 1800);
  };

  const decorationsRef = useRef<string[]>([]);
  // Kept apart from the error decorations so a run's error highlight and the
  // debugger's breakpoints don't overwrite one another.
  const debugDecorationsRef = useRef<string[]>([]);
  // The click handler is installed once at mount, so it reads the latest
  // callback through a ref rather than capturing the first one.
  const toggleBreakpointRef = useRef(onToggleBreakpoint);
  toggleBreakpointRef.current = onToggleBreakpoint;

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

      // Monaco's re-indent, kept as the fallback for a cold engine or a script
      // that doesn't parse — it only fixes leading whitespace.
      const reindent = () => {
        const lineCount = model.getLineCount();
        editor.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: lineCount, endColumn: model.getLineMaxColumn(lineCount) });
        const action = editor.getAction('editor.action.reindentselectedlines') || editor.getAction('editor.action.reindentlines');
        if (action) action.run();
        editor.setPosition({ lineNumber: 1, column: 1 });
      };

      // The engine ships MuleSoft's own DataWeave formatter — the same one
      // Anypoint Studio uses. It was reachable only from the MCP server, so an
      // AI assistant got real formatting while ⌥⇧F got a generic re-indent.
      const source = model.getValue();
      invoke<string>('dw_format', { script: source })
        .then((formatted) => {
          if (!formatted || formatted === source) return;
          const position = editor.getPosition();
          // executeEdits rather than setValue, so Ctrl+Z undoes the format.
          editor.executeEdits('engine-format', [{ range: model.getFullModelRange(), text: formatted }]);
          if (position) editor.setPosition(position);
        })
        .catch(reindent);
    },
    focus: () => editorRef.current?.focus(),
    revealLine: (line: number, column = 1) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.revealLineInCenterIfOutsideViewport(line);
      editor.setPosition({ lineNumber: line, column });
      editor.focus();
    },
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

  const codeActionDisposableRef = useRef<any>(null);
  const diagnosticsRef = useRef<{ dispose(): void; refresh(): void } | null>(null);
  useEffect(() => () => diagnosticsRef.current?.dispose(), []);
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
      languageLevel: languageLevel || '',
    };
  }, [payload, payloadMimeType, contextData, languageLevel]);

  // The target runtime changes what counts as an error, but no text changed, so
  // nothing would re-check on its own.
  useEffect(() => { diagnosticsRef.current?.refresh(); }, [languageLevel]);

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

  // Register autocomplete + hover (shared, refcounted — MiniEditors use the
  // same registration) and code actions once monaco is ready.
  useEffect(() => {
    if (!monaco) return;
    const release = ensureDWEditorProviders(monaco);
    if (codeActionDisposableRef.current) codeActionDisposableRef.current.dispose();
    codeActionDisposableRef.current = registerDWCodeActionProvider(monaco);
    return () => {
      release();
      if (codeActionDisposableRef.current) {
        codeActionDisposableRef.current.dispose();
        codeActionDisposableRef.current = null;
      }
    };
  }, [monaco]);

  // Route this editor's payload/vars context to its own model, so completions
  // in a MiniEditor (flow node, Java tester) don't see the main payload.
  useEffect(
    () => registerDWModelContext(modelPath ?? '', () => contextRef.current),
    [modelPath]
  );

  // Switch Monaco theme when app theme changes (redefine first so colors reflect current CSS vars)
  useEffect(() => {
    const apply = () => {
      if (monaco) {
        defineDataWeaveTheme(monaco);
        monaco.editor.setTheme(isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME);
      }
    };
    apply();
    // Mirror the active theme class on the body-attached overflow widgets
    // node so hover/suggest popovers pick up the right background colors.
    const overflowNode = _overflowDomNode;
    if (overflowNode) {
      overflowNode.classList.remove(
        `vs-theme-${DATAWEAVE_THEME_NAME}`,
        `vs-theme-${DATAWEAVE_LIGHT_THEME_NAME}`,
        'vs', 'vs-dark',
      );
      overflowNode.classList.add(isDark ? 'vs-dark' : 'vs');
    }
    // Re-bake on accent change so cursor + suggest highlight color update.
    window.addEventListener('dw:accent-changed', apply);
    return () => window.removeEventListener('dw:accent-changed', apply);
  }, [isDark, monaco]);

  // Breakpoints and the paused line.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !monaco) return;
    const decorations = (breakpoints ?? []).map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: { isWholeLine: false, glyphMarginClassName: 'dw-breakpoint', glyphMarginHoverMessage: { value: 'Breakpoint' } },
    }));
    if (pausedLine && pausedLine > 0) {
      decorations.push({
        range: new monaco.Range(pausedLine, 1, pausedLine, 1),
        options: { isWholeLine: true, className: 'dw-paused-line', glyphMarginClassName: 'dw-paused-glyph' } as any,
      } as any);
      editor.revealLineInCenterIfOutsideViewport(pausedLine);
    }
    debugDecorationsRef.current = editor.deltaDecorations(debugDecorationsRef.current, decorations);
  }, [breakpoints, pausedLine, monaco]);

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

    // Toggle a breakpoint by clicking the gutter, the way every other editor
    // does it. Monaco reports the margin as its own target type, so this can't
    // be confused with a click on the code itself.
    editor.onMouseDown((e: any) => {
      const GLYPH_MARGIN = monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN;
      if (e.target?.type === GLYPH_MARGIN && e.target.position) {
        toggleBreakpointRef.current?.(e.target.position.lineNumber);
      }
    });
    // The engine-backed providers aren't handed a model when they need the
    // payload context, so tell them which editor is live.
    setActiveDWModel(editor.getModel());
    editor.onDidFocusEditorText(() => setActiveDWModel(editor.getModel()));
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
      onRunRef.current();
    });
    editor.onDidChangeCursorPosition((e: any) => {
      onCursorChangeRef.current?.(e.position.lineNumber, e.position.column);
    });
    const pos = editor.getPosition();
    if (pos) onCursorChangeRef.current?.(pos.lineNumber, pos.column);

    // Shared editor init: spell-check off + re-trigger suggest on backspace.
    configureEditor(editor);

    // Live type errors from the engine's own checker. Only this editor gets
    // them — see attachEngineDiagnostics for why flow-node editors don't.
    diagnosticsRef.current?.dispose();
    diagnosticsRef.current = attachEngineDiagnostics(monacoInstance, editor, () => {
      const ctx = contextRef.current;
      // Non-JSON payloads can't be turned into a type, and passing one anyway
      // makes the checker report the whole script against an unknown input.
      return /json/i.test(ctx.payloadMimeType || '') ? ctx.payload || '' : '';
    }, () => contextRef.current.languageLevel || '');
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
        {pCallCount > 0 && (
          <button
            onClick={handleConvertProperties}
            title={`Convert ${pCallCount} p() call${pCallCount === 1 ? '' : 's'} to \${} placeholders`}
            className="font-mono text-[10.5px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer"
            style={{
              borderColor: pConvertFlash > 0 ? 'color-mix(in oklch, var(--accent) 40%, transparent)' : 'transparent',
              color: pConvertFlash > 0 ? 'var(--accent)' : 'var(--content-faint)',
            }}
            onMouseEnter={(e) => { if (pConvertFlash === 0) { e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--accent) 30%, transparent)'; e.currentTarget.style.color = 'var(--accent)'; } }}
            onMouseLeave={(e) => { if (pConvertFlash === 0) { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--content-faint)'; } }}
          >
            {pConvertFlash > 0 ? `✓ ${pConvertFlash} converted` : `p()→\${} · ${pCallCount}`}
          </button>
        )}
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
      {/* min-h-0 lets this flex child shrink to the real available height so
          Monaco scrolls to the last line instead of overflowing under the
          lower panel (a flex-1 child defaults to min-height:auto). */}
      <div className="flex-1 min-h-0">
        <Editor
          path={modelPath}
          height="100%"
          language="dataweave"
          theme={editorTheme}
          value={code}
          onChange={onChange}
          beforeMount={handleBeforeMount}
          onMount={handleEditorDidMount}
          options={{
            // Relayout when the container resizes (e.g. VS Code's bottom panel
            // opening shrinks the editor area) so the last lines stay visible
            // instead of being clipped below the fold.
            automaticLayout: true,
            // Font, line height, word wrap, minimap, bracket colors — all from
            // Settings > Editor (the script editor is where those prefs apply).
            ...editorFont,
            // Render hover & suggest popups in a dedicated DOM node attached
            // to <body>, so they aren't clipped by any ancestor's overflow or
            // containing block (transform/will-change/etc.).
            fixedOverflowWidgets: true,
            overflowWidgetsDomNode: getOverflowWidgetsDomNode(),
            // Colour from the engine's parsed AST, not just the text tokenizer.
            // Monaco defaults this to 'configuredByTheme', and a standalone
            // theme has no way to declare it in this version's typings — so it
            // is turned on here explicitly.
            'semanticHighlighting.enabled': true,
            scrollBeyondLastLine: false,
            glyphMargin: true,
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            tabCompletion: 'on',
            // acceptSuggestionOnEnter flows in from ...editorFont above (Settings >
            // Editor > "Enter accepts suggestion"); defaults to 'off' so Enter breaks
            // a line instead of accepting the pre-selected suggest-widget entry.
            snippetSuggestions: 'top',
            autoClosingBrackets: 'beforeWhitespace',
            // beforeWhitespace: only auto-close if the next char is a space,
            // EOL, or punctuation. Stops the "two quotes inserted next to a
            // word" annoyance when retroactively quoting an existing identifier.
            autoClosingQuotes: 'beforeWhitespace',
            // languageDefined: read our `surroundingPairs` (set above) so
            // selecting a word and pressing " wraps it instead of replacing.
            autoSurround: 'languageDefined',
            autoIndent: 'full',
            scrollbar: { alwaysConsumeMouseWheel: false },
          }}
        />
      </div>
      {/* Migrate result dialog */}
      {migrateResult && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center pt-[8vh] px-4"
          style={{
            background: 'color-mix(in oklch, var(--bg) 65%, transparent)',
            backdropFilter: 'blur(3px)',
          }}
          onClick={() => setMigrateResult(null)}
        >
          {migrateResult.kind === 'error' ? (
            <div
              className="w-full max-w-md rounded-xl overflow-hidden"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                boxShadow: '0 20px 60px color-mix(in oklch, oklch(0% 0 0) 50%, transparent)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: 'color-mix(in oklch, var(--warn) 12%, transparent)',
                    color: 'var(--warn)',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold mb-1" style={{ color: 'var(--content)' }}>
                    No migration needed
                  </div>
                  <div className="text-[12.5px] leading-relaxed" style={{ color: 'var(--content-muted)' }}>
                    {migrateResult.message}
                  </div>
                </div>
                <button
                  onClick={() => setMigrateResult(null)}
                  className="w-6 h-6 rounded flex items-center justify-center cursor-pointer hover:bg-surface-2 shrink-0"
                  style={{ color: 'var(--content-faint)' }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div
                className="px-5 py-3 flex justify-end"
                style={{ borderTop: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}
              >
                <button
                  onClick={() => setMigrateResult(null)}
                  className="px-3 h-7 rounded-md text-[12px] font-medium cursor-pointer"
                  style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                >
                  OK
                </button>
              </div>
            </div>
          ) : (
            <div
              className="w-full max-w-[860px] rounded-xl overflow-hidden flex flex-col"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                boxShadow: '0 28px 80px color-mix(in oklch, oklch(0% 0 0) 55%, transparent)',
                maxHeight: '85vh',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="p-4 flex items-start gap-3 shrink-0"
                style={{ borderBottom: '1px solid var(--line-subtle)' }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}
                >
                  <Icons.Zap size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold" style={{ color: 'var(--content)' }}>
                    DataWeave 1.0 → 2.0 migration
                  </div>
                  <div className="text-[12px] mt-[3px]" style={{ color: 'var(--content-muted)' }}>
                    {migrateResult.changes.reduce((n, c) => n + c.count, 0)} change{migrateResult.changes.reduce((n, c) => n + c.count, 0) === 1 ? '' : 's'} applied
                    {migrateResult.warnings.length > 0 && ` · ${migrateResult.warnings.length} warning${migrateResult.warnings.length === 1 ? '' : 's'}`}
                    . Review before replacing the script.
                  </div>
                </div>
                <button
                  onClick={() => setMigrateResult(null)}
                  className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer hover:bg-surface-2 shrink-0"
                  style={{ color: 'var(--content-faint)' }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Before / After side-by-side */}
              <div className="p-4 grid gap-3.5 overflow-y-auto" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <DiffPane label="Before" pillLabel="1.0" pillColor="var(--warn)" code={migrateResult.before} accent={false} />
                <DiffPane label="After" pillLabel="2.0" pillColor="var(--accent)" code={migrateResult.output} accent />
              </div>

              {/* Change summary */}
              {migrateResult.changes.length > 0 && (
                <div className="px-4 pb-4">
                  <div
                    className="text-[10.5px] font-semibold uppercase tracking-[0.5px] mb-2"
                    style={{ color: 'var(--content-faint)' }}
                  >
                    What changed
                  </div>
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    {migrateResult.changes.map((c, i) => {
                      const isWarn = c.kind === 'warn';
                      const color = isWarn ? 'var(--warn)' : 'var(--accent)';
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md"
                          style={{
                            background: isWarn
                              ? `color-mix(in oklch, ${color} 8%, transparent)`
                              : 'var(--surface-2)',
                            border: `1px solid ${isWarn
                              ? `color-mix(in oklch, ${color} 25%, transparent)`
                              : 'var(--line-subtle)'}`,
                          }}
                        >
                          {isWarn ? (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                          ) : (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                          <span className="text-[11.5px] flex-1" style={{ color: 'var(--content-secondary)' }}>{c.label}</span>
                          <span
                            className="text-[10px] font-mono font-semibold px-1.5 rounded"
                            style={{ background: `color-mix(in oklch, ${color} 14%, transparent)`, color }}
                          >
                            {c.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div
                className="px-4 py-3 flex items-center gap-2 shrink-0"
                style={{ borderTop: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}
              >
                <span className="text-[11.5px]" style={{ color: 'var(--content-faint)' }}>
                  Original kept in undo history ({navigator.platform.startsWith('Mac') ? '⌘Z' : 'Ctrl+Z'})
                </span>
                <span className="flex-1" />
                <button
                  onClick={() => setMigrateResult(null)}
                  className="h-7 px-3 rounded-md text-[12px] font-medium cursor-pointer"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--line)',
                    color: 'var(--content-secondary)',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(migrateResult.output); } catch { /* ignore */ }
                  }}
                  className="h-7 px-3 rounded-md text-[12px] font-medium cursor-pointer"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--line)',
                    color: 'var(--content-secondary)',
                  }}
                >
                  Copy 2.0
                </button>
                <button
                  onClick={() => { onChange(migrateResult.output); setMigrateResult(null); }}
                  className="h-7 px-3 rounded-md text-[12px] font-semibold cursor-pointer inline-flex items-center gap-1.5"
                  style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                >
                  <Icons.Zap size={11} /> Replace script
                </button>
              </div>
            </div>
          )}
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
}));

/** Side-by-side code pane for the migration diff. Plain text rendering so we
 *  don't have to spin up two Monaco instances inside a modal. */
function DiffPane({
  label, pillLabel, pillColor, code, accent,
}: {
  label: string;
  pillLabel: string;
  pillColor: string;
  code: string;
  accent: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded"
          style={{
            background: `color-mix(in oklch, ${pillColor} 14%, transparent)`,
            color: pillColor,
          }}
        >
          {pillLabel}
        </span>
        <span
          className="text-[11px] font-medium uppercase tracking-[0.4px]"
          style={{ color: 'var(--content-faint)' }}
        >
          {label}
        </span>
      </div>
      <pre
        className="font-mono text-[11.5px] leading-relaxed overflow-auto rounded-md p-2.5 select-text"
        style={{
          background: 'var(--surface-2)',
          border: `1px solid ${accent ? 'var(--accent-border)' : 'var(--line)'}`,
          color: 'var(--content)',
          height: 320,
          whiteSpace: 'pre',
          margin: 0,
        }}
      >
        {code}
      </pre>
    </div>
  );
}
