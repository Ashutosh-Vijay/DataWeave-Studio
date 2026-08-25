/**
 * Shared post-mount initialization for every Monaco editor in the app.
 *
 * Currently does three things:
 *
 * 1. Disables the browser's red-squiggly spell-check on Monaco's hidden
 *    <textarea>. DataWeave keywords, JSON keys, and YAML properties aren't
 *    real English words, so the OS spell-checker underlines half the
 *    script otherwise.
 *
 * 2. Restores text focus after a drag-select, which the VS Code webview can
 *    lose while keeping widget focus — leaving Backspace working and typed
 *    characters going nowhere.
 *
 * 3. Re-triggers the suggest widget on backspace within a word. Monaco
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
    onMouseUp?: (cb: () => void) => void;
    hasTextFocus?: () => boolean;
    focus?: () => void;
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

  // 2. Put text focus back after a drag-select.
  //
  // Monaco takes typed characters through a hidden <textarea>, but handles keys
  // like Backspace on its own keydown path. In the VS Code webview a drag-
  // select can finish with the editor still holding *widget* focus while the
  // textarea has lost *text* focus — so Backspace deletes the selection but
  // typing a letter goes nowhere. Double-clicking a word doesn't hit it,
  // because that never leaves the textarea.
  //
  // Refocusing on mouse-up inside the editor is safe: a click meant to move
  // focus elsewhere releases outside this editor, so this never fights the user.
  ed.onMouseUp?.(() => {
    if (ed.hasTextFocus?.() === false) ed.focus?.();
  });

  // 3. Re-trigger suggest on backspace within a word.
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
