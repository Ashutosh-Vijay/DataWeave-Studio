import type * as Monaco from 'monaco-editor';

/**
 * Monaco themes for DataWeave that read live values from the Dusk/Paper CSS vars
 * via getComputedStyle, so the editor surface always blends with --surface / --bg.
 * Re-call defineDataWeaveTheme(monaco) whenever the active theme toggles.
 */
export const DATAWEAVE_THEME_NAME = 'dataweave-dusk';
export const DATAWEAVE_LIGHT_THEME_NAME = 'dataweave-paper';

function colorToHex6(ctx: CanvasRenderingContext2D, cssColor: string): string {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000000';
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function readColorHex(probe: HTMLElement, ctx: CanvasRenderingContext2D, cssColor: string): string {
  probe.style.color = '';
  probe.style.color = cssColor;
  return colorToHex6(ctx, getComputedStyle(probe).color);
}

function readVarHex(probe: HTMLElement, ctx: CanvasRenderingContext2D, varName: string): string {
  return readColorHex(probe, ctx, `var(${varName})`);
}

export function defineDataWeaveTheme(monaco: typeof Monaco) {
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.left = '-9999px';
  document.body.appendChild(probe);

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { duskTheme: {}, paperTheme: {} } as any;

  const isLight = document.documentElement.classList.contains('light');

  const surface = readVarHex(probe, ctx, '--surface');
  const surface2 = readVarHex(probe, ctx, '--surface-2');
  const surface3 = readVarHex(probe, ctx, '--surface-3');
  const line = readVarHex(probe, ctx, '--line');
  const lineSecondary = readVarHex(probe, ctx, '--line-secondary');
  const content = readVarHex(probe, ctx, '--content');
  const contentMuted = readVarHex(probe, ctx, '--content-muted');
  const contentFaint = readVarHex(probe, ctx, '--content-faint');
  const contentGhost = readVarHex(probe, ctx, '--content-ghost');
  const accent = readVarHex(probe, ctx, '--accent');
  const violet = readVarHex(probe, ctx, '--violet');
  const cyan = readVarHex(probe, ctx, '--cyan');
  const err = readVarHex(probe, ctx, '--err');

  // App's own per-mode syntax palette — the default, and the fallback when
  // adopting a VS Code theme that doesn't expose a given token color.
  const stringFg = isLight ? '1F6537' : '88D4A4';
  const numberFg = isLight ? '8E6224' : 'E2B36F';
  const typeFg = isLight ? '3D3B36' : 'DDD3BE';

  // Syntax token colors. VS Code does NOT expose raw TextMate token colors to
  // webviews, so when adopting the editor theme we map DataWeave tokens to the
  // closest theme-derived colors it DOES expose (symbol-icon / debug-token /
  // bracket colors). Each falls back to the app's palette — and if a proxy just
  // resolves to the plain editor foreground (a theme that left it at default),
  // we use the app color so syntax never collapses to one flat color.
  const adopt = document.documentElement.classList.contains('dw-vscode-theme');
  const distinct = (c: string, fallback: string) => (c === content ? fallback : c);
  const rd = (expr: string) => readColorHex(probe, ctx, expr);

  let keywordC = violet, operatorC = violet, propertyC = violet;
  let stringC = stringFg, numberC = numberFg, typeC = typeFg, secureC = numberFg;
  let bracket1 = violet, bracket2 = cyan, bracket3 = numberFg;
  if (adopt) {
    keywordC  = distinct(rd('var(--vscode-symbolIcon-keywordForeground, var(--violet))'), violet);
    operatorC = distinct(rd('var(--vscode-symbolIcon-operatorForeground, var(--violet))'), keywordC);
    propertyC = distinct(rd('var(--vscode-symbolIcon-propertyForeground, var(--vscode-symbolIcon-variableForeground, var(--violet)))'), keywordC);
    stringC   = distinct(rd(`var(--vscode-debugTokenExpression-string, var(--vscode-symbolIcon-stringForeground, #${stringFg}))`), stringFg);
    numberC   = distinct(rd(`var(--vscode-debugTokenExpression-number, var(--vscode-symbolIcon-numberForeground, #${numberFg}))`), numberFg);
    typeC     = distinct(rd(`var(--vscode-symbolIcon-classForeground, var(--vscode-symbolIcon-interfaceForeground, #${typeFg}))`), typeFg);
    secureC   = distinct(rd(`var(--vscode-symbolIcon-constantForeground, #${numberFg})`), numberFg);
    bracket1  = rd('var(--vscode-editorBracketHighlight-foreground1, var(--violet))');
    bracket2  = rd('var(--vscode-editorBracketHighlight-foreground2, var(--cyan))');
    bracket3  = rd(`var(--vscode-editorBracketHighlight-foreground3, #${numberFg})`);
  }

  document.body.removeChild(probe);

  const themes: { name: string; base: 'vs' | 'vs-dark' }[] = [
    { name: DATAWEAVE_THEME_NAME, base: 'vs-dark' },
    { name: DATAWEAVE_LIGHT_THEME_NAME, base: 'vs' },
  ];

  for (const t of themes) {
    monaco.editor.defineTheme(t.name, {
      base: t.base,
      inherit: true,
      rules: [
        { token: '',                              foreground: content },
        { token: 'keyword',                       foreground: keywordC },
        { token: 'keyword.dataweave',             foreground: keywordC },
        { token: 'type',                          foreground: typeC },
        { token: 'type.identifier',               foreground: typeC },
        { token: 'string',                        foreground: stringC },
        { token: 'string.escape',                 foreground: stringC, fontStyle: 'italic' },
        { token: 'string.invalid',                foreground: err },
        { token: 'number',                        foreground: numberC },
        { token: 'number.float',                  foreground: numberC },
        { token: 'number.hex',                    foreground: numberC },
        { token: 'comment',                       foreground: contentFaint, fontStyle: 'italic' },
        { token: 'comment.invalid',               foreground: err },
        { token: 'identifier',                    foreground: content },
        { token: 'operator',                      foreground: operatorC },
        { token: 'delimiter',                     foreground: contentMuted },
        { token: 'variable.property',             foreground: propertyC },
        { token: 'variable.property.dataweave',   foreground: propertyC },
        { token: 'variable.secure',               foreground: secureC },
        { token: 'variable.secure.dataweave',     foreground: secureC },
      ],
      colors: {
        'editor.background':                  '#' + surface,
        'editor.foreground':                  '#' + content,
        'editor.lineHighlightBackground':     '#' + surface2,
        'editor.lineHighlightBorder':         '#00000000',
        'editor.selectionBackground':         '#' + accent + '40',
        'editor.inactiveSelectionBackground': '#' + accent + '20',
        'editorCursor.foreground':            '#' + accent,
        'editorLineNumber.foreground':        '#' + contentGhost,
        'editorLineNumber.activeForeground':  '#' + contentMuted,
        'editorIndentGuide.background1':      '#' + surface2,
        'editorIndentGuide.activeBackground1':'#' + lineSecondary,
        'editorWhitespace.foreground':        '#' + line,
        'editorBracketMatch.background':      '#' + accent + '33',
        'editorBracketMatch.border':          '#' + accent,
        'editorBracketHighlight.foreground1': '#' + bracket1,
        'editorBracketHighlight.foreground2': '#' + bracket2,
        'editorBracketHighlight.foreground3': '#' + bracket3,
        'editorGutter.background':            '#' + surface,
        'editorWidget.background':            '#' + surface2,
        'editorWidget.border':                '#' + line,
        'editorSuggestWidget.background':         '#' + surface2,
        'editorSuggestWidget.border':             '#' + line,
        'editorSuggestWidget.foreground':         '#' + content,
        'editorSuggestWidget.selectedBackground': '#' + surface3,
        'editorSuggestWidget.selectedForeground': '#' + content,
        // Color used to highlight the user's typed substring inside each
        // suggestion. The Monaco default in 'vs' theme is a washed-out blue
        // (oklch ~70% 0.2 240) that disappears on our paper surface. Force
        // the accent so it's always legible in both modes.
        'editorSuggestWidget.highlightForeground':         '#' + accent,
        'editorSuggestWidget.focusHighlightForeground':    '#' + accent,
        // Same situation in inline parameter hints and quick-suggest popups.
        'list.highlightForeground':           '#' + accent,
      },
    });
  }
}
