/**
 * CompareTool — paste-paste-compare side-by-side diff overlay.
 *
 * A Monaco DiffEditor with two editable panes. Useful for:
 *   - "Why does my output differ from prod?" — paste two payloads.
 *   - Comparing two DataWeave scripts during a refactor.
 *   - Spotting drift between two Mule XML exports.
 *
 * Deliberately scoped to plain paste — no source pickers (Last Run,
 * Workspace, etc.). Those would add too much UI for a feature that's
 * useful in occasional one-off comparisons. If you want to compare
 * against existing data, copy from the source pane and paste here.
 */

import { useEffect, useRef, useState } from 'react';
import { DiffEditor, type DiffOnMount, type BeforeMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { dwTokensProvider } from '../dataweaveGrammar';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { configureEditor } from '../editorInit';
import { useTheme } from '../ThemeContext';
import { useEditorFont } from '../hooks/useEditorFont';
import { WindowControls } from './WindowControls';
import { Icons } from './Icons';

type CompareLang = 'plaintext' | 'dataweave' | 'json' | 'xml' | 'yaml';

const LANG_LABELS: Record<CompareLang, string> = {
  plaintext: 'Plain text',
  dataweave: 'DataWeave',
  json: 'JSON',
  xml: 'XML',
  yaml: 'YAML',
};

// Monaco needs the language id registered before we set it on the diff
// model. Plain / JSON / XML / YAML are bundled by Monaco; DataWeave is
// our own grammar. Registration is idempotent — re-running it is fine.
const handleBeforeMount: BeforeMount = (monaco) => {
  defineDataWeaveTheme(monaco);
  const langs = monaco.languages.getLanguages().map((l) => l.id);
  if (!langs.includes('dataweave')) {
    monaco.languages.register({ id: 'dataweave', aliases: ['DataWeave', 'dw'], extensions: ['.dwl'] });
    monaco.languages.setMonarchTokensProvider('dataweave', dwTokensProvider);
  }
};

interface CompareToolProps {
  open: boolean;
  onClose: () => void;
}

export function CompareTool({ open, onClose }: CompareToolProps) {
  const { isDark } = useTheme();
  const editorFont = useEditorFont();

  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [lang, setLang] = useState<CompareLang>('plaintext');
  const [sideBySide, setSideBySide] = useState(true);
  const diffEditorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null);
  const [stats, setStats] = useState<{ added: number; removed: number; same: boolean } | null>(null);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Switch theme + push fresh styles when accent changes.
  const editorTheme = isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME;

  /** Capture the diff editor's models so we can wire model-content events
   *  for the user's pasted text + compute add/remove line counts.
   *
   *  IMPORTANT: we do NOT drive the editor from React state. The
   *  @monaco-editor/react DiffEditor's `original` and `modified` props,
   *  when controlled, race with the user's keystrokes — every typed
   *  character triggers an onChange → setState → re-render → the lib
   *  detects the prop "changed" and calls setValue on the model,
   *  resetting the cursor to position 0. The right pane gets cursor-
   *  preserving applyEdits internally; the left pane gets a brute-force
   *  setValue. So we treat Monaco as the source of truth: it owns the
   *  buffer, we just mirror its content into React state for the stat
   *  badges and the Normalize/Copy/Swap/Clear buttons. */
  const handleMount: DiffOnMount = (editor) => {
    diffEditorRef.current = editor;
    configureEditor(editor.getOriginalEditor());
    configureEditor(editor.getModifiedEditor());

    const original = editor.getOriginalEditor();
    const modified = editor.getModifiedEditor();

    // Mirror typed-in text into React state. This update is purely
    // read-side — nothing writes it back into the editor.
    original.onDidChangeModelContent(() => setLeft(original.getValue()));
    modified.onDidChangeModelContent(() => setRight(modified.getValue()));

    // Recompute add/remove line counts whenever the diff is recomputed.
    editor.onDidUpdateDiff(() => {
      const changes = editor.getLineChanges() || [];
      let added = 0;
      let removed = 0;
      for (const ch of changes) {
        if (ch.modifiedEndLineNumber >= ch.modifiedStartLineNumber) {
          added += ch.modifiedEndLineNumber - ch.modifiedStartLineNumber + 1;
        }
        if (ch.originalEndLineNumber >= ch.originalStartLineNumber) {
          removed += ch.originalEndLineNumber - ch.originalStartLineNumber + 1;
        }
      }
      const sameContent = original.getValue() === modified.getValue();
      setStats({ added, removed, same: sameContent });
    });
  };

  /** Pretty-print one side. For JSON: sort top-level keys + indent. For XML:
   *  re-serialize through DOMParser (sorts attrs by name, indents). For
   *  everything else: trim trailing whitespace. */
  const normalize = (text: string): string => {
    if (!text.trim()) return text;
    if (lang === 'json') {
      try {
        const parsed = JSON.parse(text);
        return JSON.stringify(sortKeys(parsed), null, 2);
      } catch {
        return text; // leave unchanged on parse error
      }
    }
    if (lang === 'xml') {
      try {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        if (doc.querySelector('parsererror')) return text;
        return prettyXml(doc.documentElement, 0);
      } catch {
        return text;
      }
    }
    return text.replace(/[ \t]+$/gm, '');
  };

  const normalizeLeft = () => {
    const next = normalize(left);
    setLeft(next);
    diffEditorRef.current?.getOriginalEditor().setValue(next);
  };
  const normalizeRight = () => {
    const next = normalize(right);
    setRight(next);
    diffEditorRef.current?.getModifiedEditor().setValue(next);
  };

  const swap = () => {
    const a = left, b = right;
    setLeft(b);
    setRight(a);
    diffEditorRef.current?.getOriginalEditor().setValue(b);
    diffEditorRef.current?.getModifiedEditor().setValue(a);
  };

  const clearBoth = () => {
    setLeft('');
    setRight('');
    diffEditorRef.current?.getOriginalEditor().setValue('');
    diffEditorRef.current?.getModifiedEditor().setValue('');
  };

  const copyLeft = async () => { try { await navigator.clipboard.writeText(left); } catch { /* ignore */ } };
  const copyRight = async () => { try { await navigator.clipboard.writeText(right); } catch { /* ignore */ } };

  if (!open) return null;

  const canNormalize = lang === 'json' || lang === 'xml';

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-bg">
      {/* ── Header ───────────────────────────────────────────────── */}
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-3 pl-4 pr-3 bg-surface border-b border-line">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
          title="Close (Esc)"
        >
          <Icons.ChevronRight size={12} className="rotate-180" />
          Back
        </button>
        <div className="w-px h-4 bg-line" />
        <Icons.Compare size={14} className="shrink-0" style={{ color: 'var(--accent)' }} />
        <span className="text-[13px] font-semibold text-content tracking-tight">Compare</span>

        {/* Diff stats badge — shown once the editor has computed a diff. */}
        {stats && (left || right) && (
          stats.same ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in oklch, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
              identical
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-[10px] font-mono">
              <span className="px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in oklch, #10b981 14%, transparent)', color: '#10b981' }}>+{stats.added}</span>
              <span className="px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in oklch, #ef4444 14%, transparent)', color: '#ef4444' }}>−{stats.removed}</span>
            </span>
          )
        )}

        <span className="flex-1" />

        {/* Language picker */}
        <div className="inline-flex items-center gap-1.5">
          <span className="text-[10px] text-content-ghost uppercase tracking-wide font-semibold">Lang</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as CompareLang)}
            className="h-7 px-2 rounded-md bg-surface-2 border border-line text-[11.5px] text-content focus:outline-none focus:border-accent cursor-pointer"
          >
            {(Object.keys(LANG_LABELS) as CompareLang[]).map((k) => (
              <option key={k} value={k}>{LANG_LABELS[k]}</option>
            ))}
          </select>
        </div>

        {/* Side-by-side / inline */}
        <div className="flex items-center p-0.5 rounded-md bg-surface-2 border border-line-secondary">
          {([
            { id: 'side', label: 'Side-by-side', active: sideBySide },
            { id: 'inline', label: 'Inline', active: !sideBySide },
          ] as const).map((m) => (
            <button
              key={m.id}
              onClick={() => setSideBySide(m.id === 'side')}
              className={`px-2 h-6 text-[10.5px] rounded cursor-pointer transition-colors ${
                m.active ? 'bg-surface text-content shadow-sm' : 'text-content-faint hover:text-content'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-line" />
        <button
          onClick={swap}
          disabled={!left && !right}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Swap left ↔ right"
        >
          ⇄ Swap
        </button>
        <button
          onClick={clearBoth}
          disabled={!left && !right}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Clear both panes"
        >
          <Icons.Trash size={11} /> Clear
        </button>
        <WindowControls />
      </header>

      {/* ── Per-pane toolbar — sits above the diff editor and labels each side. */}
      <div className="h-9 shrink-0 flex items-stretch border-b border-line">
        <div className={`flex-1 px-3.5 flex items-center gap-2 ${sideBySide ? 'border-r border-line' : ''}`}>
          <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: '#ef4444' }}>Left · Original</span>
          <span className="text-[10px] text-content-ghost font-mono">{left ? `${left.split('\n').length} lines` : 'paste original here'}</span>
          <span className="flex-1" />
          {canNormalize && (
            <button
              onClick={normalizeLeft}
              disabled={!left}
              className="inline-flex items-center h-6 px-2 rounded text-[10.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={lang === 'json' ? 'Pretty-print with sorted keys' : 'Pretty-print XML'}
            >
              Normalize
            </button>
          )}
          <button
            onClick={copyLeft}
            disabled={!left}
            className="inline-flex items-center gap-1 h-6 px-2 rounded text-[10.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icons.Copy size={10} /> Copy
          </button>
        </div>
        {sideBySide && (
          <div className="flex-1 px-3.5 flex items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: '#10b981' }}>Right · Modified</span>
            <span className="text-[10px] text-content-ghost font-mono">{right ? `${right.split('\n').length} lines` : 'paste modified here'}</span>
            <span className="flex-1" />
            {canNormalize && (
              <button
                onClick={normalizeRight}
                disabled={!right}
                className="inline-flex items-center h-6 px-2 rounded text-[10.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={lang === 'json' ? 'Pretty-print with sorted keys' : 'Pretty-print XML'}
              >
                Normalize
              </button>
            )}
            <button
              onClick={copyRight}
              disabled={!right}
              className="inline-flex items-center gap-1 h-6 px-2 rounded text-[10.5px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icons.Copy size={10} /> Copy
            </button>
          </div>
        )}
      </div>

      {/* ── Diff editor ──────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <DiffEditor
          height="100%"
          language={lang}
          // INTENTIONALLY uncontrolled — see the long comment in handleMount.
          // @monaco-editor/react's DiffEditor calls `model.setValue(original)`
          // on every `original` prop change, which resets the cursor to the
          // top of the buffer on every keystroke. The `modified` pane uses
          // `executeEdits` with forceMoveMarkers:true and doesn't have the
          // bug. We work around it by never updating these props after mount:
          // pass empty string constants so React's dep comparison is stable,
          // and push programmatic updates (Swap / Clear / Normalize) through
          // diffEditorRef directly with setValue.
          original=""
          modified=""
          theme={editorTheme}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          options={{
            renderSideBySide: sideBySide,
            originalEditable: true,   // allow paste into the left pane too
            readOnly: false,           // both panes editable
            ...editorFont,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            diffWordWrap: 'on',
            renderWhitespace: 'selection',
          }}
        />
      </div>

      {/* ── Footer hint ──────────────────────────────────────────── */}
      <div className="h-7 shrink-0 px-3.5 flex items-center justify-between border-t border-line text-[10.5px] text-content-ghost">
        <span>Paste original on the left, modified on the right. Esc to close.</span>
        <span className="font-mono">{LANG_LABELS[lang]} · {sideBySide ? 'side-by-side' : 'inline'}</span>
      </div>
    </div>
  );
}

// ── Helpers for the "Normalize" buttons ────────────────────────────────

/** Recursively sort an object's keys. Arrays preserve their order — only
 *  object key order is normalized. Primitives are returned as-is. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** Pretty-print an XML element with 2-space indentation and sorted attrs.
 *  Doesn't preserve comments / processing instructions — that's fine for
 *  a normalize-for-compare button (the user can toggle Normalize off if
 *  they need to see them). */
function prettyXml(el: Element, depth: number): string {
  const pad = '  '.repeat(depth);
  const attrs = el.attributes
    ? Array.from(el.attributes)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`)
        .join('')
    : '';
  const children = Array.from(el.children);
  // Only render text content if the element has no element children.
  const text = (children.length === 0 ? el.textContent?.trim() || '' : '');
  if (children.length === 0 && !text) {
    return `${pad}<${el.tagName}${attrs}/>`;
  }
  if (children.length === 0) {
    return `${pad}<${el.tagName}${attrs}>${text}</${el.tagName}>`;
  }
  const inner = children.map((c) => prettyXml(c, depth + 1)).join('\n');
  return `${pad}<${el.tagName}${attrs}>\n${inner}\n${pad}</${el.tagName}>`;
}
