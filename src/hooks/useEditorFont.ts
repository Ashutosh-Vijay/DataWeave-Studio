import { useEffect, useState } from 'react';

const EVENT = 'dw:editor-font-changed';
const DEFAULT_SIZE = 13;

/** Bundled with the app (see the @font-face rules in index.css). */
export const BUNDLED_FONTS = ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'IBM Plex Mono', 'Geist Mono'];
const DEFAULT_FONT = 'JetBrains Mono';
const FALLBACK = ', "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** The chosen editor font's name. Any installed font works, not just the bundled ones. */
export function readEditorFontName(): string {
  try {
    // Before May 2026 the picker stored labels like "Consolas (system)".
    return (localStorage.getItem('dw.font') || '').replace(/\s*\(system\)$/, '').trim() || DEFAULT_FONT;
  } catch {
    return DEFAULT_FONT;
  }
}

interface EditorPrefs {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  wordWrap: 'on' | 'off';
  minimap: { enabled: boolean };
  bracketPairColorization: { enabled: boolean };
  // 'off' (default): Enter inserts a newline, Tab accepts the suggestion. With
  // 'on', pressing Enter to break a line instead accepts whatever was pre-selected
  // in the auto-popped suggest widget (e.g. the top-sorted `%dw 2.0` snippet),
  // injecting it mid-code. Off by default because that surprised people; opt back
  // in via Settings > Editor > "Enter accepts suggestion" (`dw.enterAcceptsSuggestion`).
  acceptSuggestionOnEnter: 'on' | 'off';
}

function readPrefs(): EditorPrefs {
  let fontSize = DEFAULT_SIZE;
  let lineHeight = 0; // 0 = Monaco computes from font size
  let wordWrap: 'on' | 'off' = 'on';
  let minimap = false;
  let bracketColor = true;
  let enterAccepts = false;
  try {
    const rawSize = parseInt(localStorage.getItem('dw.fontSize') || '', 10);
    if (Number.isFinite(rawSize) && rawSize > 0) fontSize = rawSize;
    const rawLh = parseFloat(localStorage.getItem('dw.lineHeight') || '');
    // Monaco treats values < 8 as a multiplier of font size, >= 8 as pixels.
    if (Number.isFinite(rawLh) && rawLh > 0) lineHeight = rawLh;
    wordWrap = localStorage.getItem('dw.wordWrap') === '0' ? 'off' : 'on';
    minimap = localStorage.getItem('dw.minimap') === '1';
    bracketColor = localStorage.getItem('dw.bracketColor') !== '0';
    enterAccepts = localStorage.getItem('dw.enterAcceptsSuggestion') === '1';
  } catch { /* defaults */ }
  return {
    fontFamily: `"${readEditorFontName().replace(/"/g, '')}"${FALLBACK}`,
    fontSize,
    lineHeight,
    wordWrap,
    minimap: { enabled: minimap },
    bracketPairColorization: { enabled: bracketColor },
    acceptSuggestionOnEnter: enterAccepts ? 'on' : 'off',
  };
}

const SANS_STACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
export const SYSTEM_FONT = 'System font';

/** The chosen interface font: Inter (the default), the system font, or any installed font. */
export function readInterfaceFontName(): string {
  try { return localStorage.getItem('dw.uiFont')?.trim() || 'Inter'; } catch { return 'Inter'; }
}

/**
 * Point the app-wide font variables at the user's choices: --font-sans for the
 * interface, --font-mono (code names, paths, the status bar) for the editor
 * font, so everything that looks like code matches the editor. Tailwind's
 * font-sans / font-mono classes read these variables too.
 */
export function applyAppFonts() {
  const ui = readInterfaceFontName().replace(/"/g, '');
  const root = document.documentElement.style;
  root.setProperty('--font-sans', ui === SYSTEM_FONT ? SANS_STACK : `"${ui}", "Inter", ${SANS_STACK}`);
  root.setProperty('--font-mono', `"${readEditorFontName().replace(/"/g, '')}"${FALLBACK}`);
}

/** Apply font settings everywhere and tell editor mounts to re-read their preferences. */
export function notifyEditorFontChanged() {
  applyAppFonts();
  window.dispatchEvent(new Event(EVENT));
}

/**
 * The bug that got the font picker removed in May 2026: Monaco measures
 * character widths once, and if the font file is still downloading it measures
 * the fallback font instead. When the real font lands, the text gets narrower or
 * wider but Monaco keeps the old widths, so the cursor drifts off the text
 * (14.8 px over an 84-character line with a 2.5 s font download), and it stays
 * that way. Monaco 0.55 does not fix this by itself.
 *
 * So whenever the browser finishes loading any font, editors measure again.
 * That covers picking a font, starting up with one already chosen, and fonts
 * arriving late from the network, without tracking which case it was.
 */
let listening = false;
function remeasureOnFontLoads() {
  if (listening) return;
  listening = true;
  document.fonts.addEventListener('loadingdone', () => {
    // Imported here, not at the top: Monaco needs `window` the moment it loads,
    // which breaks tests that only want this file's helpers. main.tsx loaded it already.
    import('monaco-editor/esm/vs/editor/editor.api').then((m) => m.editor.remeasureFonts());
  });
}

/**
 * Editor preferences (font, line height, wrap, minimap, bracket colors) as
 * Monaco options, refreshed whenever Settings > Editor changes them.
 * Spread position decides policy: spread LAST where user prefs should win
 * (the script editor), FIRST where the pane pins its own wrap/minimap.
 */
export function useEditorFont(): EditorPrefs {
  const [prefs, setPrefs] = useState(readPrefs);

  useEffect(() => {
    remeasureOnFontLoads();
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
