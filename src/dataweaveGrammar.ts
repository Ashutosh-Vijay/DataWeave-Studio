import * as monaco from 'monaco-editor';

// Basic DataWeave 2.0 Monarch Tokenizer
export const dwTokensProvider: monaco.languages.IMonarchLanguage = {
  keywords: [
    'if', 'else', 'var', 'fun', 'type', 'output', 'input', 'ns', 
    'as', 'using', 'default', 'match', 'case', 'do', 'import', 'module',
    'map', 'mapObject', 'pluck', 'filter', 'filterObject', 'groupBy', 
    'orderBy', 'reduce', 'when', 'unless', 'otherwise', 'and', 'or', 'not'
  ],

  typeKeywords: [
    'String', 'Number', 'Boolean', 'Object', 'Array', 'Date', 'DateTime', 
    'LocalDateTime', 'Time', 'LocalTime', 'TimeZone', 'Period', 'Regex',
    'Binary', 'Any', 'Nothing', 'Null'
  ],

  operators: [
    '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '&&', '||',
    '++', '--', '+', '-', '*', '/', '%', '<<', '>>', '>>>', '+=', '-=', '*=', '/=',
    '<<=', '>>=', '>>>=', '&', '|', '^', '&=', '|=', '^=', '...', '---'
  ],

  symbols: /[=><!~?:&|+\-*\/\^%]+/,

  escapes: /\\(?:[nrt\\"]|u[0-9A-Fa-f]{4})/,

  tokenizer: {
    root: [
      // Config property placeholders: ${secure::key} and ${key}
      [/\$\{secure::[\w.\-]+\}/, 'variable.secure'],
      [/\$\{[\w.\-]+\}/, 'variable.property'],

      // headers and script separator
      [/---/, 'keyword'],
      [/%dw/, 'keyword'],

      // Identifiers and keywords
      [/[a-zA-Z_$][\w_$]*/, {
        cases: {
          '@keywords': 'keyword',
          '@typeKeywords': 'type',
          '@default': 'identifier'
        }
      }],

      // Whitespace
      { include: '@whitespace' },

      // Delimiters
      [/[{}()\[\]]/, '@brackets'],
      [/[<>](?!@symbols)/, '@brackets'],

      // Numbers
      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/\d+/, 'number'],

      // Strings
      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string'],
      [/'([^'\\]|\\.)*$/, 'string.invalid'],
      [/'/, 'string', '@string2'],

      // Characters
      [/'[^\\']'/, 'string'],
      [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
      [/'/, 'string.invalid']
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment'],
    ],

    comment: [
      [/[^\/*]+/, 'comment'],
      [/\/\*/, 'comment.invalid'],  // nested block comments not allowed
      ["\\*/", 'comment', '@pop'],
      [/[\/*]/, 'comment']
    ],

    string: [
      [/\$\{secure::[\w.\-]+\}/, 'variable.secure'],
      [/\$\{[\w.\-]+\}/, 'variable.property'],
      [/[^\\"\$]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/\$/, 'string'],
      [/"/, 'string', '@pop']
    ],

    string2: [
      [/\$\{secure::[\w.\-]+\}/, 'variable.secure'],
      [/\$\{[\w.\-]+\}/, 'variable.property'],
      [/[^\\'\$]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/\$/, 'string'],
      [/'/, 'string', '@pop']
    ],
  },
};
