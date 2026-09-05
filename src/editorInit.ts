/**
 * The one <body>-level node every Monaco editor renders its overflow widgets
 * into (hover cards, the suggest list, the rename box).
 *
 * It lives on <body> so widgets escape any ancestor that clips them. It is a
 * SINGLE shared node on purpose: ScriptEditor and MiniEditor used to make one
 * each, and step 5 below found "the" root with `document.querySelector`, which
 * returns whichever was created first. So a rename started in a MiniEditor —
 * the Tests pane, a Flow node, the module library — rendered into root B while
 * the key forwarding listened on root A, and Enter did nothing at all. One node
 * means the widget and the listener can never be on different ones.
 */
let overflowRoot: HTMLDivElement | null = null;
export function getOverflowWidgetsRoot(): HTMLDivElement {
  if (typeof document === 'undefined') return null as unknown as HTMLDivElement;
  if (!overflowRoot) {
    overflowRoot = document.createElement('div');
    // The `monaco-editor` class matters: Monaco's theme CSS is scoped to it, and
    // without it the popovers render with no background and unreadable text.
    overflowRoot.className = 'monaco-editor monaco-overflow-widgets-root';
    overflowRoot.style.position = 'absolute';
    overflowRoot.style.zIndex = '99999';
    overflowRoot.style.top = '0';
    overflowRoot.style.left = '0';
    document.body.appendChild(overflowRoot);
  }
  return overflowRoot;
}

/**
 * Shared post-mount initialization for every Monaco editor in the app.
 *
 * Currently does four things:
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
 * 3. Replaces the selection itself when a printable key is typed over one, in
 *    the webview only — where the first such keystroke was being swallowed.
 *
 * 4. Re-triggers the suggest widget on backspace within a word. Monaco
 *    only fires completions on character INSERT — deleting a character
 *    closes the popup. That feels broken when you backspace one char to
 *    fix a typo and have to retype to see suggestions. With this listener
 *    the popup re-opens whenever the cursor lands inside an identifier
 *    after a deletion.
 *
 * Call from every editor's `onMount={configureEditor}`.
 */
import { isTauri } from './bridge';

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
    hasWidgetFocus?: () => boolean;
    hasTextFocus?: () => boolean;
    focus?: () => void;
    getSelection?: () => { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null;
    executeEdits?: (source: string, edits: { range: unknown; text: string; forceMoveMarkers?: boolean }[]) => void;
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

  // ...and if that isn't enough, replace the selection ourselves.
  //
  // In the VS Code webview the FIRST printable key after a drag-select is
  // swallowed: select a word, type "payload", and you get "ayload" — you have
  // to type the "p" twice. Backspace is unaffected, so the key reaches Monaco;
  // what's lost is the character insert, which goes through the hidden
  // textarea's input event rather than the keydown path.
  //
  // Refocusing on mouse-up didn't fix it, so rather than keep guessing at the
  // cause this handles the symptom directly: when a selection exists and a bare
  // printable character is typed, do the edit and stop the event. Deterministic,
  // and undo still groups it as one edit.
  //
  // Scoped to the webview — the desktop path isn't broken and doesn't need
  // Monaco's own input handling intercepted.
  if (!isTauri && ta) {
    ta.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
        if (e.key.length !== 1) return; // not a printable character
        const sel = ed.getSelection?.();
        if (!sel || sel.startLineNumber !== sel.endLineNumber || sel.startColumn !== sel.endColumn) {
          if (!sel) return;
          e.preventDefault();
          ed.executeEdits?.('type-over-selection', [{ range: sel, text: e.key, forceMoveMarkers: true }]);
        }
      },
      true, // capture: get there before Monaco's own listener
    );
  }

  // 5. Give overflow widgets their keyboard back.
  //
  // Monaco renders "overflow" widgets into a <body>-level node so they can
  // escape the editor's clipping (see getOverflowWidgetsDomNode in
  // ScriptEditor). Standalone Monaco's keybinding service, however, listens for
  // keydown on the EDITOR's own DOM node — and the rename widget is the one
  // overflow widget that takes focus for itself.
  //
  // The result was a rename box that opened, accepted typing, and then ignored
  // both Enter and Escape completely: every keystroke landed on a node nothing
  // was listening to, so `acceptRenameInput` never ran and F2 looked broken
  // even though the rename provider underneath it was fine. Re-dispatching on
  // the editor node puts the event back where the keybinding service can see
  // it. The clone lands outside the overflow root, so it cannot re-enter here.
  const widgetsRoot = getOverflowWidgetsRoot();
  const editorNode = ed.getDomNode?.();
  if (widgetsRoot && editorNode) {
    const forwardKey = (e: Event) => {
      const ev = e as KeyboardEvent;
      if (ev.key !== 'Enter' && ev.key !== 'Escape') return;
      // Several editors share one overflow root; only the one holding widget
      // focus should act, or a rename in the script pane would also be handled
      // by every flow-node editor on screen.
      if (ed.hasWidgetFocus?.() !== true) return;
      const clone = new KeyboardEvent('keydown', {
        key: ev.key,
        code: ev.code,
        location: ev.location,
        ctrlKey: ev.ctrlKey,
        shiftKey: ev.shiftKey,
        altKey: ev.altKey,
        metaKey: ev.metaKey,
        bubbles: true,
        cancelable: true,
      });
      // Monaco's StandardKeyboardEvent reads the legacy keyCode, which the
      // constructor won't set — assign it before dispatch or the event is
      // KeyCode.Unknown and matches no binding.
      Object.defineProperty(clone, 'keyCode', { get: () => (ev.key === 'Enter' ? 13 : 27) });
      editorNode.dispatchEvent(clone);
      if (clone.defaultPrevented) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    widgetsRoot.addEventListener('keydown', forwardKey, true);
    ed.onDidDispose?.(() => widgetsRoot.removeEventListener('keydown', forwardKey, true));
  }

  // 4. Re-trigger suggest on backspace within a word.
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
