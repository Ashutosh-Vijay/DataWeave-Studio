/**
 * Bracket handling for the plain <textarea> value fields — vars, headers and
 * query params.
 *
 * Those aren't Monaco (one editor instance per row would be absurd for a list
 * that can hold dozens), so typing `{` there gave you a lone `{` while the
 * payload and config editors auto-closed it. This is the small subset of that
 * behaviour worth having in a one-line-to-a-few-lines field.
 *
 * Deliberately NOT here:
 *   - Tab-to-indent. Hijacking Tab in a textarea traps keyboard navigation,
 *     which is a worse bug than the one it fixes. Enter still auto-indents.
 *   - Quote pairing outside JSON fields. A header value like `Bearer abc"` is
 *     ordinary, and auto-inserting `""` there is pure annoyance.
 */

const PAIRS: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
const QUOTES = new Set(['"', "'"]);
const CLOSERS = new Set(['}', ']', ')']);

/** Indentation of the line the caret sits on. */
function indentOf(value: string, caret: number): string {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const line = value.slice(lineStart, caret);
  return /^[ \t]*/.exec(line)?.[0] ?? '';
}

/**
 * Keydown handler for a value textarea. `json` enables quote pairing — pass it
 * for fields that hold JSON (a var typed as JSON), not for free-text ones.
 *
 * Returns true when it handled the key, so the caller can stop there.
 */
export function handleBracketKey(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  json: boolean,
  setValue: (next: string, caret: number) => void,
): boolean {
  const el = e.currentTarget;
  const { selectionStart: start, selectionEnd: end, value } = el;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const nextChar = value.charAt(end);
  const prevChar = value.charAt(start - 1);

  // Wrap a selection rather than replacing it — selecting a word and pressing
  // `[` should bracket it, which is what every editor does.
  if (start !== end && (PAIRS[e.key] || (json && QUOTES.has(e.key)))) {
    const close = PAIRS[e.key] ?? e.key;
    e.preventDefault();
    setValue(before + e.key + value.slice(start, end) + close + after, end + 1);
    return true;
  }

  // Open a pair. Skip it when the caret is glued to a word — typing `(` before
  // existing text usually means "call this", not "wrap nothing".
  if (PAIRS[e.key] && !/[\w"']/.test(nextChar)) {
    e.preventDefault();
    setValue(before + e.key + PAIRS[e.key] + after, start + 1);
    return true;
  }

  if (json && QUOTES.has(e.key) && !/[\w"']/.test(nextChar) && prevChar !== '\\') {
    e.preventDefault();
    setValue(before + e.key + e.key + after, start + 1);
    return true;
  }

  // Step over a closer we inserted rather than stacking a second one.
  if ((CLOSERS.has(e.key) || (json && QUOTES.has(e.key))) && nextChar === e.key && start === end) {
    e.preventDefault();
    setValue(value, start + 1);
    return true;
  }

  // Enter between a pair: open a block, closer back on its own line.
  if (e.key === 'Enter' && start === end && PAIRS[prevChar] === nextChar) {
    e.preventDefault();
    const indent = indentOf(value, start);
    const inner = indent + '  ';
    setValue(`${before}\n${inner}\n${indent}${after}`, start + 1 + inner.length);
    return true;
  }

  // Backspace inside an empty pair removes both halves.
  if (
    e.key === 'Backspace' &&
    start === end &&
    (PAIRS[prevChar] === nextChar || (QUOTES.has(prevChar) && prevChar === nextChar))
  ) {
    e.preventDefault();
    setValue(value.slice(0, start - 1) + value.slice(end + 1), start - 1);
    return true;
  }

  return false;
}

/**
 * React controlled inputs reset the caret to the end when the value changes, so
 * every handler above has to restore it after the DOM updates.
 */
export function applyWithCaret(
  el: HTMLTextAreaElement,
  onChange: (next: string) => void,
  next: string,
  caret: number,
): void {
  onChange(next);
  requestAnimationFrame(() => {
    el.selectionStart = el.selectionEnd = caret;
  });
}
