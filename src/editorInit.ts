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
    getModel?: () => { getWordAtPosition: (p: { lineNumber: number; column: number }) => unknown } | null;
    onDidChangeModelContent?: (cb: (e: { changes: { text: string; rangeLength: number }[] }) => void) => void;
    trigger?: (source: string, handlerId: string, payload: unknown) => void;
  };

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
