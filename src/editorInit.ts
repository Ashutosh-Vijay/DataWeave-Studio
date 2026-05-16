/**
 * Shared post-mount initialization for every Monaco editor in the app.
 *
 * Currently does one thing: disables the browser's red-squiggly spell-check
 * on Monaco's hidden <textarea>. DataWeave keywords, JSON keys, and YAML
 * properties aren't real English words, so the OS spell-checker underlines
 * half the script otherwise.
 *
 * Call from every editor's `onMount={configureEditor}`.
 */
export function configureEditor(editor: unknown): void {
  const ed = editor as { getDomNode?: () => HTMLElement | null };
  const dom = ed.getDomNode?.();
  const ta = dom?.querySelector?.('textarea');
  if (ta) {
    ta.setAttribute('spellcheck', 'false');
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('autocapitalize', 'off');
  }
}
