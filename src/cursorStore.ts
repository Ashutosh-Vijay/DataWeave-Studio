/**
 * Module-level pub-sub for editor cursor position. Bypasses App-level state
 * so cursor movement (the most frequent UI event) only re-renders the tiny
 * status-bar component that displays it — not the entire 1500-line App
 * tree. Use `publishCursor` from the editor on every change; use `useCursor`
 * in the consumer component.
 */
import { useSyncExternalStore } from 'react';

type Cursor = { line: number; col: number };

let current: Cursor = { line: 1, col: 1 };
const listeners = new Set<() => void>();

export function publishCursor(line: number, col: number): void {
  if (current.line === line && current.col === col) return;
  current = { line, col };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useCursor(): Cursor {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
