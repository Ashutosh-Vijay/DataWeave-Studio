/**
 * Shared post-mount initialization for every Monaco editor in the app.
 *
 * Currently does two things:
 *
 * 1. Disables the browser's red-squiggly spell-check on Monaco's hidden
 *    <textarea>. DataWeave keywords, JSON keys, and YAML properties aren't
 *    real English words, so the OS spell-checker underlines half the
 *    script otherwise.
 *
 * 2. Re-triggers the suggest widget on backspace within a word. Monaco
 *    only fires completions on character INSERT — deleting a character
 *    closes the popup. That feels broken when you backspace one char to
 *    fix a typo and have to retype to see suggestions. With this listener
 *    the popup re-opens whenever the cursor lands inside an identifier
 *    after a deletion.
 *
 * Call from every editor's `onMount={configureEditor}`.
 */
export function configureEditor(editor: unknown): void {
  const ed = editor as {
    getDomNode?: () => HTMLElement | null;
    getPosition?: () => { lineNumber: number; column: number } | null;
    getModel?: () => {
      getWordAtPosition: (p: { lineNumber: number; column: number }) => unknown;
      updateOptions?: (opts: { insertSpaces?: boolean; tabSize?: number }) => void;
    } | null;
    onDidChangeModelContent?: (cb: (e: { changes: { text: string; rangeLength: number }[]; isUndoing?: boolean; isRedoing?: boolean }) => void) => void;
    onDidDispose?: (cb: () => void) => void;
    trigger?: (source: string, handlerId: string, payload: unknown) => void;
  };

  // Tab size is a MODEL option, not an editor option, so it can't ride the
  // useEditorFont spread — apply from Settings > Editor here, live.
  const applyTabSize = () => {
    let raw = '2 spaces';
    try { raw = localStorage.getItem('dw.tabSize') || raw; } catch { /* default */ }
    ed.getModel?.()?.updateOptions?.(
      raw === 'Tab character'
        ? { insertSpaces: false, tabSize: 4 }
        : { insertSpaces: true, tabSize: parseInt(raw, 10) || 2 },
    );
  };
  applyTabSize();
  window.addEventListener('dw:editor-font-changed', applyTabSize);
  ed.onDidDispose?.(() => window.removeEventListener('dw:editor-font-changed', applyTabSize));

  // 1. Spell-check off.
  const dom = ed.getDomNode?.();
  const ta = dom?.querySelector?.('textarea');
  if (ta) {
    ta.setAttribute('spellcheck', 'false');
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('autocapitalize', 'off');
  }

  // 2. Re-trigger suggest on backspace within a word.
  ed.onDidChangeModelContent?.((e) => {
    // Undo/redo produce deletion-shaped changes too — re-opening the popup
    // on every Ctrl+Z step is just flicker.
    if (e.isUndoing || e.isRedoing) return;
    const wasDeletion = e.changes.length > 0 && e.changes.every(
      (c) => c.text === '' && c.rangeLength > 0,
    );
    if (!wasDeletion) return;
    const pos = ed.getPosition?.();
    if (!pos) return;
    const word = ed.getModel?.()?.getWordAtPosition(pos);
    if (word) {
      ed.trigger?.('keyboard', 'editor.action.triggerSuggest', {});
    }
  });
}
