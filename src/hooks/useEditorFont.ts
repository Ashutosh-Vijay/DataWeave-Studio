import { useEffect, useState } from 'react';

const FONT_SIZE_KEY = 'dw.fontSize';
const EVENT = 'dw:editor-font-changed';
const DEFAULT_SIZE = 13;

const FONT_FAMILY = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function readSize(): number {
  try {
    const raw = localStorage.getItem(FONT_SIZE_KEY) || `${DEFAULT_SIZE} px`;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_SIZE;
  } catch { return DEFAULT_SIZE; }
}

/** Notify all editor mounts to re-read font size from localStorage. */
export function notifyEditorFontChanged() {
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Returns the editor font family + size, refreshed whenever the setting changes.
 * Font family is fixed to JetBrains Mono to avoid Monaco measurement issues.
 */
export function useEditorFont(): { fontFamily: string; fontSize: number } {
  const [size, setSize] = useState(readSize);

  useEffect(() => {
    const update = () => setSize(readSize());
    window.addEventListener(EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  return { fontFamily: FONT_FAMILY, fontSize: size };
}
