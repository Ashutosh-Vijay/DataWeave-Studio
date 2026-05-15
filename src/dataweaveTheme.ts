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

function readVarHex(probe: HTMLElement, ctx: CanvasRenderingContext2D, varName: string): string {
  probe.style.color = `var(${varName})`;
  return colorToHex6(ctx, getComputedStyle(probe).color);
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

  document.body.removeChild(probe);

  // String / number tokens are tuned per-mode and don't have CSS vars.
  const stringFg = isLight ? '1F6537' : '88D4A4';
  const numberFg = isLight ? '8E6224' : 'E2B36F';
  const typeFg = isLight ? '3D3B36' : 'DDD3BE';

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
        { token: 'keyword',                       foreground: violet },
        { token: 'keyword.dataweave',             foreground: violet },
        { token: 'type',                          foreground: typeFg },
        { token: 'type.identifier',               foreground: typeFg },
        { token: 'string',                        foreground: stringFg },
        { token: 'string.escape',                 foreground: stringFg, fontStyle: 'italic' },
        { token: 'string.invalid',                foreground: err },
        { token: 'number',                        foreground: numberFg },
        { token: 'number.float',                  foreground: numberFg },
        { token: 'number.hex',                    foreground: numberFg },
        { token: 'comment',                       foreground: contentFaint, fontStyle: 'italic' },
        { token: 'comment.invalid',               foreground: err },
        { token: 'identifier',                    foreground: content },
        { token: 'operator',                      foreground: violet },
        { token: 'delimiter',                     foreground: contentMuted },
        { token: 'variable.property',             foreground: violet },
        { token: 'variable.property.dataweave',   foreground: violet },
        { token: 'variable.secure',               foreground: numberFg },
        { token: 'variable.secure.dataweave',     foreground: numberFg },
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
        'editorBracketHighlight.foreground1': '#' + violet,
        'editorBracketHighlight.foreground2': '#' + cyan,
        'editorBracketHighlight.foreground3': '#' + numberFg,
        'editorGutter.background':            '#' + surface,
        'editorWidget.background':            '#' + surface2,
        'editorWidget.border':                '#' + line,
        'editorSuggestWidget.background':     '#' + surface2,
        'editorSuggestWidget.border':         '#' + line,
        'editorSuggestWidget.selectedBackground': '#' + surface3,
      },
    });
  }
}
