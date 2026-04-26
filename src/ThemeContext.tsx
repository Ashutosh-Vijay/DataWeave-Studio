import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

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
  return 'dark';
}

function systemTheme(): Theme {
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

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.style.colorScheme = 'light';
    } else {
      root.classList.remove('light');
      root.style.colorScheme = 'dark';
    }
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* ignore */ }
    setThemeState(resolveTheme(pref));
  }, [pref]);

  useEffect(() => {
    if (pref !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setThemeState(mql.matches ? 'light' : 'dark');
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
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
