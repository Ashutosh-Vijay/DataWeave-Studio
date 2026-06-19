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
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  pref: 'dark',
  toggle: () => {},
  setTheme: () => {},
  setPref: () => {},
  isDark: true,
});

const STORAGE_KEY = 'dwstudio_theme';

function readStoredPref(): ThemePref {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch { /* ignore */ }
  // In the VS Code webview, follow the editor theme by default so the app
  // feels native instead of always booting dark. On desktop, default dark.
  return isTauri ? 'dark' : 'system';
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
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme(readStoredPref()));

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

  useLayoutEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* ignore */ }
    setThemeState(resolveTheme(pref));
  }, [pref]);

  useEffect(() => {
    if (pref !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setThemeState(systemTheme());
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [pref]);

  // VS Code signals a theme switch by swapping the body's vscode-* class, not
  // via prefers-color-scheme — watch it so the app re-themes live.
  useEffect(() => {
    if (isTauri || pref !== 'system' || typeof document === 'undefined') return;
    const obs = new MutationObserver(() => setThemeState(systemTheme()));
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [pref]);

  const toggle = () => setPrefState((p) => {
    const current = resolveTheme(p);
    return current === 'dark' ? 'light' : 'dark';
  });
  const setTheme = (t: Theme) => setPrefState(t);
  const setPref = (p: ThemePref) => setPrefState(p);

  return (
    <ThemeContext.Provider value={{ theme, pref, toggle, setTheme, setPref, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
