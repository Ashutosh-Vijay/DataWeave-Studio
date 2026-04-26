import type * as Monaco from 'monaco-editor';

/**
 * Monaco themes for DataWeave matching the Dusk/Paper design tokens.
 * Token colors are converted from OKLCH to sRGB hex (Monaco doesn't accept CSS vars).
 */
export const DATAWEAVE_THEME_NAME = 'dataweave-dusk';
export const DATAWEAVE_LIGHT_THEME_NAME = 'dataweave-paper';

export function defineDataWeaveTheme(monaco: typeof Monaco) {
  /* Dusk — warm dark.
     kw violet     oklch(72% 0.13 290) ≈ #b89ce6
     str green     oklch(78% 0.13 140) ≈ #88d4a4
     num amber     oklch(76% 0.14 60)  ≈ #e2b36f
     comm grey     oklch(50% 0    0)   ≈ #767676
     fn cyan       oklch(78% 0.11 220) ≈ #84cde9
     type warm     oklch(85% 0.05 80)  ≈ #ddd3be
     ident         oklch(96% 0    0)   ≈ #f3f3f3
     bg            oklch(17% 0.004 80) ≈ #25221f
  */
  monaco.editor.defineTheme(DATAWEAVE_THEME_NAME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '',                              foreground: 'F3F3F3' },

      { token: 'keyword',                       foreground: 'B89CE6' },
      { token: 'keyword.dataweave',             foreground: 'B89CE6' },
      { token: 'type',                          foreground: 'DDD3BE' },
      { token: 'type.identifier',               foreground: 'DDD3BE' },

      { token: 'string',                        foreground: '88D4A4' },
      { token: 'string.escape',                 foreground: '88D4A4', fontStyle: 'italic' },
      { token: 'string.invalid',                foreground: 'E5878D' },

      { token: 'number',                        foreground: 'E2B36F' },
      { token: 'number.float',                  foreground: 'E2B36F' },
      { token: 'number.hex',                    foreground: 'E2B36F' },

      { token: 'comment',                       foreground: '767676', fontStyle: 'italic' },
      { token: 'comment.invalid',               foreground: 'E5878D' },

      { token: 'identifier',                    foreground: 'F3F3F3' },
      { token: 'operator',                      foreground: 'B89CE6' },
      { token: 'delimiter',                     foreground: 'B0AAA0' },

      { token: 'variable.property',             foreground: 'B89CE6' },
      { token: 'variable.property.dataweave',   foreground: 'B89CE6' },
      { token: 'variable.secure',               foreground: 'E2B36F' },
      { token: 'variable.secure.dataweave',     foreground: 'E2B36F' },
    ],
    colors: {
      'editor.background':                  '#25221F',
      'editor.foreground':                  '#F3F3F3',
      'editor.lineHighlightBackground':     '#2C2926',
      'editor.lineHighlightBorder':         '#00000000',
      'editor.selectionBackground':         '#3a8c66aa',
      'editor.inactiveSelectionBackground': '#3a8c6644',
      'editorCursor.foreground':            '#7BCFA0',
      'editorLineNumber.foreground':        '#5C5853',
      'editorLineNumber.activeForeground':  '#A8A29A',
      'editorIndentGuide.background1':      '#2C2926',
      'editorIndentGuide.activeBackground1':'#3A3733',
      'editorWhitespace.foreground':        '#3A3733',
      'editorBracketMatch.background':      '#3a8c6633',
      'editorBracketMatch.border':          '#7BCFA0',
      'editorBracketHighlight.foreground1': '#B89CE6',
      'editorBracketHighlight.foreground2': '#84CDE9',
      'editorBracketHighlight.foreground3': '#E2B36F',
      'editorGutter.background':            '#25221F',
      'editorWidget.background':            '#2C2926',
      'editorWidget.border':                '#3A3733',
      'editorSuggestWidget.background':     '#2C2926',
      'editorSuggestWidget.border':         '#3A3733',
      'editorSuggestWidget.selectedBackground': '#3A3733',
    },
  });

  /* Paper — warm light.
     kw violet     oklch(45% 0.15 290) ≈ #6232a0
     str green     oklch(40% 0.13 140) ≈ #1f6537
     num amber     oklch(50% 0.13 60)  ≈ #8e6224
     comm grey     oklch(60% 0    0)   ≈ #919191
     fn cyan       oklch(45% 0.12 220) ≈ #1a718a
     type warm     oklch(28% 0.005 80) ≈ #3d3b36
     ident         oklch(20% 0    0)   ≈ #2b2b2b
     bg            oklch(100% 0   0)   = #ffffff
  */
  monaco.editor.defineTheme(DATAWEAVE_LIGHT_THEME_NAME, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: '',                              foreground: '2B2B2B' },

      { token: 'keyword',                       foreground: '6232A0' },
      { token: 'keyword.dataweave',             foreground: '6232A0' },
      { token: 'type',                          foreground: '3D3B36' },
      { token: 'type.identifier',               foreground: '3D3B36' },

      { token: 'string',                        foreground: '1F6537' },
      { token: 'string.escape',                 foreground: '1F6537', fontStyle: 'italic' },
      { token: 'string.invalid',                foreground: 'B83A45' },

      { token: 'number',                        foreground: '8E6224' },
      { token: 'number.float',                  foreground: '8E6224' },
      { token: 'number.hex',                    foreground: '8E6224' },

      { token: 'comment',                       foreground: '919191', fontStyle: 'italic' },
      { token: 'comment.invalid',               foreground: 'B83A45' },

      { token: 'identifier',                    foreground: '2B2B2B' },
      { token: 'operator',                      foreground: '6232A0' },
      { token: 'delimiter',                     foreground: '5A554F' },

      { token: 'variable.property',             foreground: '6232A0' },
      { token: 'variable.property.dataweave',   foreground: '6232A0' },
      { token: 'variable.secure',               foreground: '8E6224' },
      { token: 'variable.secure.dataweave',     foreground: '8E6224' },
    ],
    colors: {
      'editor.background':                  '#FFFFFF',
      'editor.foreground':                  '#2B2B2B',
      'editor.lineHighlightBackground':     '#F6F4F0',
      'editor.lineHighlightBorder':         '#00000000',
      'editor.selectionBackground':         '#2D8A6033',
      'editor.inactiveSelectionBackground': '#2D8A6018',
      'editorCursor.foreground':            '#2D8A60',
      'editorLineNumber.foreground':        '#B0AAA0',
      'editorLineNumber.activeForeground':  '#6A645C',
      'editorIndentGuide.background1':      '#EFECE6',
      'editorIndentGuide.activeBackground1':'#D8D4CC',
      'editorBracketMatch.background':      '#2D8A6022',
      'editorBracketMatch.border':          '#2D8A60',
      'editorBracketHighlight.foreground1': '#6232A0',
      'editorBracketHighlight.foreground2': '#1A718A',
      'editorBracketHighlight.foreground3': '#8E6224',
      'editorGutter.background':            '#FFFFFF',
      'editorWidget.background':            '#FAF8F4',
      'editorWidget.border':                '#E5E0D8',
      'editorSuggestWidget.background':     '#FAF8F4',
      'editorSuggestWidget.border':         '#E5E0D8',
      'editorSuggestWidget.selectedBackground': '#E5E0D8',
    },
  });
}
