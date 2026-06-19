import { createContext, useContext, useEffect, useLayoutEffect, useState, ReactNode } from 'react';
import { isTauri } from './bridge';

type Theme = 'dark' | 'light';
type ThemePref = 'dark' | 'light' | 'system';

interface ThemeContextValue {
  theme: Theme;
  pref: ThemePref;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  setPref: (p: ThemePref) => void;
  isDark: boolean;
  /** VS Code only: adopt the active editor color theme (surfaces, text, accent)
   *  instead of the app's own Dusk/Paper palette. Always false on desktop. */
  matchVsCode: boolean;
  setMatchVsCode: (v: boolean) => void;
  /** True in the VS Code webview — used by Settings to show the adopt-theme toggle. */
  inVsCode: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  pref: 'dark',
  toggle: () => {},
  setTheme: () => {},
  setPref: () => {},
  isDark: true,
  matchVsCode: false,
  setMatchVsCode: () => {},
  inVsCode: false,
});

const STORAGE_KEY = 'dwstudio_theme';
const MATCH_VSCODE_KEY = 'dw.matchVsCode';
const inVsCode = !isTauri;

function readStoredPref(): ThemePref {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch { /* ignore */ }
  // In the VS Code webview, follow the editor theme by default so the app
  // feels native instead of always booting dark. On desktop, default dark.
  return isTauri ? 'dark' : 'system';
}

/** Adopt the VS Code theme by default in the webview (opt-out in Settings); never on desktop. */
function readMatchVsCode(): boolean {
  if (!inVsCode) return false;
  try { return localStorage.getItem(MATCH_VSCODE_KEY) !== '0'; } catch { return true; }
}

/** VS Code stamps the active theme kind onto the webview <body>. Returns the
 *  matching app theme, or null when not in VS Code (or the class isn't set). */
function vscodeThemeKind(): Theme | null {
  if (isTauri || typeof document === 'undefined') return null;
  const cl = document.body.classList;
  if (cl.contains('vscode-light') || cl.contains('vscode-high-contrast-light')) return 'light';
  if (cl.contains('vscode-dark') || cl.contains('vscode-high-contrast')) return 'dark';
  return null;
}

function systemTheme(): Theme {
  // In VS Code, "system" means "match the editor theme".
  const vs = vscodeThemeKind();
  if (vs) return vs;
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function resolveTheme(pref: ThemePref): Theme {
  return pref === 'system' ? systemTheme() : pref;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readStoredPref);
  const [matchVsCode, setMatchVsCodeState] = useState<boolean>(readMatchVsCode);
  // When adopting the VS Code theme, light/dark follows the editor regardless of
  // the app's own pref (so Monaco's base + surfaces stay consistent).
  const [theme, setThemeState] = useState<Theme>(() =>
    readMatchVsCode() ? (vscodeThemeKind() ?? 'dark') : resolveTheme(readStoredPref()),
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.style.colorScheme = 'light';
    } else {
      root.classList.remove('light');
      root.style.colorScheme = 'dark';
    }
  }, [theme]);

  // Toggle the token-override class that re-points --bg/--surface/--content/etc.
  // at the live --vscode-* variables, and tell Monaco to re-bake from them.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dw-vscode-theme', matchVsCode);
    try { localStorage.setItem(MATCH_VSCODE_KEY, matchVsCode ? '1' : '0'); } catch { /* ignore */ }
    if (matchVsCode) setThemeState(vscodeThemeKind() ?? 'dark');
    window.dispatchEvent(new CustomEvent('dw:accent-changed'));
  }, [matchVsCode]);

  useLayoutEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* ignore */ }
    if (!matchVsCode) setThemeState(resolveTheme(pref));
  }, [pref, matchVsCode]);

  useEffect(() => {
    if (matchVsCode || pref !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setThemeState(systemTheme());
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [pref, matchVsCode]);

  // VS Code signals a theme switch by swapping the body's vscode-* class, not
  // via prefers-color-scheme — watch it so the app re-themes live (light/dark
  // and, when adopting the VS Code theme, the actual surface colors).
  useEffect(() => {
    if (!inVsCode || typeof document === 'undefined') return;
    if (!matchVsCode && pref !== 'system') return;
    const obs = new MutationObserver(() => {
      setThemeState(systemTheme());
      if (matchVsCode) window.dispatchEvent(new CustomEvent('dw:accent-changed'));
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [pref, matchVsCode]);

  const toggle = () => setPrefState((p) => {
    const current = resolveTheme(p);
    return current === 'dark' ? 'light' : 'dark';
  });
  const setTheme = (t: Theme) => setPrefState(t);
  const setPref = (p: ThemePref) => setPrefState(p);
  const setMatchVsCode = (v: boolean) => setMatchVsCodeState(v);

  return (
    <ThemeContext.Provider value={{ theme, pref, toggle, setTheme, setPref, isDark: theme === 'dark', matchVsCode, setMatchVsCode, inVsCode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
