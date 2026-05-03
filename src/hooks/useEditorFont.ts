import { useEffect, useState } from 'react';

const FONT_KEY = 'dw.font';
const FONT_SIZE_KEY = 'dw.fontSize';
const EVENT = 'dw:editor-font-changed';
const DEFAULT_FAMILY = 'JetBrains Mono';
const DEFAULT_SIZE = 13;

const FALLBACK = ', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function readFont(): string {
  try {
    const raw = localStorage.getItem(FONT_KEY) || DEFAULT_FAMILY;
    // Dropdown labels system fonts as "SF Mono (system)" — strip the suffix
    // before passing to Monaco / CSS.
    return raw.replace(/\s*\(system\)\s*$/, '');
  } catch { return DEFAULT_FAMILY; }
}

function readSize(): number {
  try {
    const raw = localStorage.getItem(FONT_SIZE_KEY) || `${DEFAULT_SIZE} px`;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_SIZE;
  } catch { return DEFAULT_SIZE; }
}

/** Notify all editor mounts (and the CSS var) to re-read from localStorage. */
export function notifyEditorFontChanged() {
  window.dispatchEvent(new Event(EVENT));
  applyCssVar();
}

function applyCssVar() {
  const family = readFont();
  document.documentElement.style.setProperty('--font-mono', `"${family}"${FALLBACK}`);
}

// Apply once at module load so the CSS var is correct from the first paint.
applyCssVar();

/**
 * Returns the editor font family + size, refreshed whenever the setting changes
 * (in this window or another tab). Pass the result into Monaco's options.
 */
export function useEditorFont(): { fontFamily: string; fontSize: number } {
  const [family, setFamily] = useState(readFont);
  const [size, setSize] = useState(readSize);

  useEffect(() => {
    const update = () => { setFamily(readFont()); setSize(readSize()); };
    window.addEventListener(EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  return { fontFamily: `"${family}"${FALLBACK}`, fontSize: size };
}
