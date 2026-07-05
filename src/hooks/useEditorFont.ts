import { useEffect, useState } from 'react';

const EVENT = 'dw:editor-font-changed';
const DEFAULT_SIZE = 13;

const FONT_FAMILY = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

interface EditorPrefs {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  wordWrap: 'on' | 'off';
  minimap: { enabled: boolean };
  bracketPairColorization: { enabled: boolean };
}

function readPrefs(): EditorPrefs {
  let fontSize = DEFAULT_SIZE;
  let lineHeight = 0; // 0 = Monaco computes from font size
  let wordWrap: 'on' | 'off' = 'on';
  let minimap = false;
  let bracketColor = true;
  try {
    const rawSize = parseInt(localStorage.getItem('dw.fontSize') || '', 10);
    if (Number.isFinite(rawSize) && rawSize > 0) fontSize = rawSize;
    const rawLh = parseFloat(localStorage.getItem('dw.lineHeight') || '');
    // Monaco treats values < 8 as a multiplier of font size, >= 8 as pixels.
    if (Number.isFinite(rawLh) && rawLh > 0) lineHeight = rawLh;
    wordWrap = localStorage.getItem('dw.wordWrap') === '0' ? 'off' : 'on';
    minimap = localStorage.getItem('dw.minimap') === '1';
    bracketColor = localStorage.getItem('dw.bracketColor') !== '0';
  } catch { /* defaults */ }
  return {
    fontFamily: FONT_FAMILY,
    fontSize,
    lineHeight,
    wordWrap,
    minimap: { enabled: minimap },
    bracketPairColorization: { enabled: bracketColor },
  };
}

/** Notify all editor mounts to re-read editor preferences from localStorage. */
export function notifyEditorFontChanged() {
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Editor preferences (font, line height, wrap, minimap, bracket colors) as
 * Monaco options, refreshed whenever Settings > Editor changes them.
 * Font family is fixed to JetBrains Mono to avoid Monaco measurement issues.
 * Spread position decides policy: spread LAST where user prefs should win
 * (the script editor), FIRST where the pane pins its own wrap/minimap.
 */
export function useEditorFont(): EditorPrefs {
  const [prefs, setPrefs] = useState(readPrefs);

  useEffect(() => {
    const update = () => setPrefs(readPrefs());
    window.addEventListener(EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  return prefs;
}
