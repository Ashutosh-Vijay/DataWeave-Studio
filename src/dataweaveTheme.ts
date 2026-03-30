import type * as Monaco from 'monaco-editor';

/**
 * Custom Monaco themes matching Anypoint Studio / MuleSoft DataWeave colors.
 * Must be defined via `monaco.editor.defineTheme()` before any editor mounts.
 */
export const DATAWEAVE_THEME_NAME = 'dataweave-dark';
export const DATAWEAVE_LIGHT_THEME_NAME = 'dataweave-light';

export function defineDataWeaveTheme(monaco: typeof Monaco) {
  monaco.editor.defineTheme(DATAWEAVE_THEME_NAME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      // Config property placeholders ${...} — purple for regular, yellow for secure
      { token: 'variable.property',              foreground: 'C586C0' },
      { token: 'variable.property.dataweave',    foreground: 'C586C0' },
      { token: 'variable.secure',                foreground: 'DCDCAA' },
      { token: 'variable.secure.dataweave',      foreground: 'DCDCAA' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
    },
  });

  monaco.editor.defineTheme(DATAWEAVE_LIGHT_THEME_NAME, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'variable.property',              foreground: '9332BF' },
      { token: 'variable.property.dataweave',    foreground: '9332BF' },
      { token: 'variable.secure',                foreground: '795E26' },
      { token: 'variable.secure.dataweave',      foreground: '795E26' },
    ],
    colors: {
      'editor.background': '#ffffff',
    },
  });
}
