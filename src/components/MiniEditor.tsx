/**
 * Lightweight Monaco editor wrapper for use in panels, config dialogs, etc.
 * Supports DataWeave and JSON languages with full editing features:
 * auto-close brackets, auto-indent, completions, syntax highlighting.
 */

import Editor, { useMonaco, BeforeMount } from '@monaco-editor/react';
import { configureEditor } from '../editorInit';
import { useEffect, useCallback, memo } from 'react';
import { dwTokensProvider } from '../dataweaveGrammar';
import { registerDWCompletionProvider } from '../dataweaveCompletions';
import { registerDWHoverProvider } from '../dataweaveHover';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { useTheme } from '../ThemeContext';
import { useEditorFont } from '../hooks/useEditorFont';
import type * as Monaco from 'monaco-editor';

// Track how many MiniEditor instances want DW providers registered.
// Only dispose when the last one unmounts.
let dwProviderRefCount = 0;
let sharedCompletionDisposable: Monaco.IDisposable | null = null;
let sharedHoverDisposable: Monaco.IDisposable | null = null;

let _overflowNode: HTMLDivElement | null = null;
function getOverflowNode(): HTMLDivElement {
  if (!_overflowNode) {
    _overflowNode = document.createElement('div');
    _overflowNode.className = 'monaco-editor monaco-overflow-widgets-root';
    Object.assign(_overflowNode.style, { position: 'absolute', zIndex: '99999', top: '0', left: '0' });
    document.body.appendChild(_overflowNode);
  }
  return _overflowNode;
}

// Track whether we've already done global Monaco setup (language registration, etc.)
let globalSetupDone = false;

interface MiniEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: 'dataweave' | 'json' | 'sql' | 'plaintext' | 'java';
  height?: number | string;
  readOnly?: boolean;
  placeholder?: string;
}

export const MiniEditor = memo(function MiniEditor({
  value, onChange, language = 'json', height = 200, readOnly = false,
}: MiniEditorProps) {
  const { isDark } = useTheme();
  const editorFont = useEditorFont();
  const monaco = useMonaco();
  // completionRef/hoverRef removed — providers are shared module-level

  const handleBeforeMount: BeforeMount = useCallback((m) => {
    if (globalSetupDone) return;
    globalSetupDone = true;
    const langs = m.languages.getLanguages();
    if (!langs.some((l: any) => l.id === 'dataweave')) {
      m.languages.register({ id: 'dataweave' });
    }
    m.languages.setMonarchTokensProvider('dataweave', dwTokensProvider as any);
    m.languages.setLanguageConfiguration('dataweave', {
      brackets: [['{', '}'], ['[', ']'], ['(', ')']],
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
        increaseIndentPattern: /^.*(\{[^}"']*|\[[^\]"']*|\([^)"']*|->\s*|=\s*)$/,
        decreaseIndentPattern: /^\s*[}\])].*$/,
      },
      onEnterRules: [
        { beforeText: /\{$/, afterText: /^\s*\}/, action: { indentAction: m.languages.IndentAction.IndentOutdent } },
        { beforeText: /\[$/, afterText: /^\s*\]/, action: { indentAction: m.languages.IndentAction.IndentOutdent } },
        { beforeText: /\($/, afterText: /^\s*\)/, action: { indentAction: m.languages.IndentAction.IndentOutdent } },
        { beforeText: /->\s*$/, action: { indentAction: m.languages.IndentAction.Indent } },
        { beforeText: /=\s*$/, action: { indentAction: m.languages.IndentAction.Indent } },
        { beforeText: /\{[^}]*$/, action: { indentAction: m.languages.IndentAction.Indent } },
        { beforeText: /\[[^\]]*$/, action: { indentAction: m.languages.IndentAction.Indent } },
        { beforeText: /\([^)]*$/, action: { indentAction: m.languages.IndentAction.Indent } },
      ],
    });
    defineDataWeaveTheme(m);
  }, []);

  // Register completions + hover for DW language (shared across instances)
  useEffect(() => {
    if (!monaco || language !== 'dataweave') return;
    dwProviderRefCount++;
    if (!sharedCompletionDisposable) sharedCompletionDisposable = registerDWCompletionProvider(monaco);
    if (!sharedHoverDisposable) sharedHoverDisposable = registerDWHoverProvider(monaco);
    return () => {
      dwProviderRefCount--;
      if (dwProviderRefCount <= 0) {
        sharedCompletionDisposable?.dispose();
        sharedCompletionDisposable = null;
        sharedHoverDisposable?.dispose();
        sharedHoverDisposable = null;
        dwProviderRefCount = 0;
      }
    };
  }, [monaco, language]);

  // Sync theme — re-bake on light/dark toggle and on accent change.
  useEffect(() => {
    const apply = () => {
      if (!monaco) return;
      defineDataWeaveTheme(monaco);
      monaco.editor.setTheme(isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME);
    };
    apply();
    window.addEventListener('dw:accent-changed', apply);
    return () => window.removeEventListener('dw:accent-changed', apply);
  }, [isDark, monaco]);

  const theme = isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME;

  return (
    <div className="rounded-md overflow-hidden border border-line" style={{ height }}>
      <Editor
        height="100%"
        language={language}
        theme={theme}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        beforeMount={handleBeforeMount}
        onMount={configureEditor}
        options={{
          ...editorFont,
          minimap: { enabled: false },
          lineNumbers: 'on',
          lineNumbersMinChars: 3,
          lineDecorationsWidth: 4,
          folding: false,
          fixedOverflowWidgets: true,
          overflowWidgetsDomNode: getOverflowNode(),
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          glyphMargin: false,
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          tabCompletion: 'on',
          acceptSuggestionOnEnter: 'on',
          snippetSuggestions: 'top',
          autoClosingBrackets: 'beforeWhitespace',
          autoClosingQuotes: 'beforeWhitespace',
          autoSurround: 'languageDefined',
          autoIndent: 'full',
          formatOnPaste: true,
          formatOnType: true,
          bracketPairColorization: { enabled: true },
          scrollbar: { alwaysConsumeMouseWheel: false, verticalScrollbarSize: 8 },
          readOnly,
          renderLineHighlight: 'line',
          padding: { top: 6, bottom: 6 },
        }}
      />
    </div>
  );
});
