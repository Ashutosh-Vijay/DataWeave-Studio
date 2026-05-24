/**
 * DataWeave error hint engine — pattern-matches common DW errors and returns
 * a friendly "what happened + how to fix" explanation. Fully offline, no AI.
 *
 * Patterns and resolutions sourced from MuleSoft's official troubleshooting
 * docs (docs.mulesoft.com/dataweave/latest/dataweave-troubleshoot) and the
 * Anypoint Code Builder DataWeave issues guide.
 *
 * Rules are checked top-to-bottom — order from most-specific to most-generic.
 */

export type HintCategory =
  | 'reference'
  | 'type'
  | 'function'
  | 'input'
  | 'output'
  | 'module'
  | 'selector'
  | 'syntax'
  | 'runtime';

export interface ErrorHint {
  /** One-line plain-English explanation of what went wrong. */
  summary: string;
  /** Ordered, concrete steps to try. Most likely fix first. */
  fixes: string[];
  /** Optional caption + code example demonstrating the fix. */
  example?: { caption: string; code: string };
  /** Category — drives the icon color/label in the UI. */
  category: HintCategory;
}

interface HintRule {
  pattern: RegExp;
  build: (m: RegExpMatchArray) => ErrorHint;
}

// ---------------------------------------------------------------------------
// Rule catalog. Order = priority. Most specific first.
// ---------------------------------------------------------------------------
const RULES: HintRule[] = [
  // --- Reference / variable errors -----------------------------------------
  {
    // "Unable to resolve reference of: foo." — most common DW error.
    pattern: /unable to resolve reference of[:\s]+([A-Za-z_][\w]*)/i,
    build: (m) => ({
      category: 'reference',
      summary: `DataWeave can't find anything called \`${m[1]}\` in this scope.`,
      fixes: [
        `Check the spelling of \`${m[1]}\` — variable, function, and module names are case-sensitive.`,
        `If it's a function from a module (String, Arrays, Objects, etc.), import it: \`import ${m[1]} from dw::core::Strings\` or use the qualified call \`Strings::${m[1]}(...)\`.`,
        `If it's a variable, make sure it's declared with \`var ${m[1]} = ...\` in the header before the \`---\`.`,
        `If it's a payload field, the payload may be empty or have a different MIME type than expected — check the Payload tab.`,
      ],
      example: {
        caption: 'Importing a module function',
        code: 'import * from dw::core::Strings\n---\npluralize("box")',
      },
    }),
  },
  {
    pattern: /there is no variable named ['"]?([A-Za-z_][\w]*)['"]?/i,
    build: (m) => ({
      category: 'reference',
      summary: `\`${m[1]}\` isn't declared anywhere visible from this expression.`,
      fixes: [
        `Declare it in the header: \`var ${m[1]} = <expression>\` before the \`---\`.`,
        `If you meant to read it from input, make sure a named input called \`${m[1]}\` exists in the Payload tab (the \`+\` button).`,
        `If it's a built-in like \`payload\`, \`vars\`, or \`attributes\`, check the case — they're all lowercase.`,
      ],
    }),
  },

  // --- Function call / arity / arg-type errors -----------------------------
  {
    // "You called the function 'Value Selector' with these arguments: ..."
    // — happens when payload is String (no MIME) and you do payload.field.
    pattern: /you called the function ['"]?Value Selector['"]?[\s\S]*?(?:String|Null|Binary)/i,
    build: () => ({
      category: 'selector',
      summary: `You're trying to access a field on something that isn't an object — usually because the payload's MIME type is wrong.`,
      fixes: [
        `Check the Payload tab — the dropdown next to the editor should match the actual format (JSON, XML, CSV, etc.). If it says "text/plain" or "application/java" but the data is JSON, switch it.`,
        `If the payload could be empty or null, guard the access: \`payload.field default ""\` or \`(payload default {}).field\`.`,
        `If you're reading a nested field, make sure each level in the path exists — the error often points at the first missing or null hop.`,
      ],
      example: {
        caption: 'Null-safe field access',
        code: 'payload.message default ""',
      },
    }),
  },
  {
    // Generic "You called the function 'X' with these arguments: ..."
    pattern: /you called the function ['"]([^'"]+)['"][\s\S]*?but it expects/i,
    build: (m) => ({
      category: 'function',
      summary: `The arguments you passed to \`${m[1]}\` don't match any of its accepted signatures.`,
      fixes: [
        `Read the "but it expects" line below — it lists every valid combination of argument types.`,
        `Common cause: one argument is \`Null\`. Add a \`default\` to fall back: \`someValue default ""\`.`,
        `Another common cause: the value is a String when the function wants a Number / Date / Array. Coerce explicitly: \`"42" as Number\`, \`"2026-01-01" as Date\`.`,
        `Open Function Reference (sidebar) to see the full signature and examples for \`${m[1]}\`.`,
      ],
    }),
  },
  {
    pattern: /(?:expects?|expected)\s+(\d+)\s+arguments?\s+but\s+got\s+(\d+)/i,
    build: (m) => ({
      category: 'function',
      summary: `Wrong number of arguments — the function takes ${m[1]} but you passed ${m[2]}.`,
      fixes: [
        `Open Function Reference (sidebar, Cmd+L → Function Reference, or the {ƒ} icon) and copy the correct signature.`,
        `Common typo: \`round()\` (no args) instead of \`round(1.65)\`. The signature error message includes the expected arity.`,
      ],
    }),
  },
  {
    pattern: /ambiguous (?:call to|reference to) function/i,
    build: () => ({
      category: 'function',
      summary: `Multiple functions match this call — DataWeave can't pick one.`,
      fixes: [
        `Qualify the call with the module name: \`Strings::pluralize("box")\` instead of \`pluralize("box")\`.`,
        `Or import only the specific function you want: \`import pluralize from dw::core::Strings\` (instead of \`import * from\`).`,
      ],
    }),
  },

  // --- Type coercion errors ------------------------------------------------
  {
    pattern: /cannot coerce ([A-Za-z]+) to ([A-Za-z]+)/i,
    build: (m) => ({
      category: 'type',
      summary: `DataWeave can't automatically convert ${m[1]} → ${m[2]}.`,
      fixes: [
        `Use an explicit cast: \`value as ${m[2]}\` (works when the value is castable, e.g. \`"42" as Number\`, \`"2026-01-01" as Date {format: "yyyy-MM-dd"}\`).`,
        `For dates and times, you usually need a \`{format: "..."}\` option after \`as Date\` / \`as DateTime\`.`,
        `If the source is sometimes null, add a fallback first: \`(value default 0) as ${m[2]}\`.`,
      ],
      example: {
        caption: 'String to Number with fallback',
        code: '(payload.count default "0") as Number',
      },
    }),
  },
  {
    pattern: /Type mismatch for ['"]?([A-Za-z]+)['"]? operator/i,
    build: (m) => ({
      category: 'type',
      summary: `The \`${m[1]}\` operator was called with values it doesn't accept.`,
      fixes: [
        `For \`map\`, \`filter\`, \`reduce\`, \`groupBy\` — the left side must be an Array. If it could be an Object, wrap with \`valuesOf(...)\` or use the right operator (\`mapObject\` for Objects).`,
        `For arithmetic operators (\`+\`, \`-\`, \`*\`, \`/\`) — both sides must be numbers. Coerce strings first: \`("3" as Number) + 4\`.`,
        `For \`++\` (concat) — both sides must be the same shape (both Arrays, both Objects, or both Strings).`,
      ],
    }),
  },

  // --- Input / parsing errors ----------------------------------------------
  {
    pattern: /unable to parse empty input.*while reading ['"]?(\w+)['"]?\s*as\s*(\w+)/i,
    build: (m) => ({
      category: 'input',
      summary: `${m[1]} is empty but DataWeave is trying to parse it as ${m[2]}.`,
      fixes: [
        `In real Mule flows, this happens with GET requests that have no body. Guard with: \`if (isEmpty(${m[1]})) {} else ${m[1]}\`.`,
        `In Studio: open the Payload tab and paste sample data so the script has something to read.`,
        `If the empty case is intentional, change the MIME type to \`application/octet-stream\` (binary) — won't try to parse it.`,
      ],
    }),
  },
  {
    pattern: /Unexpected character ['"](.)['"][\s\S]*?(?:while reading|payload@)/i,
    build: (m) => ({
      category: 'input',
      summary: `The input data is malformed — found \`${m[1]}\` where DataWeave expected something else.`,
      fixes: [
        `Check the Payload tab — the data probably isn't valid JSON/XML/CSV for the selected MIME type.`,
        `Common gotcha: an HTML error page (\`<html>...\`) was returned by an API instead of JSON. Inspect the raw payload.`,
        `If the payload mixes formats, change the MIME type to match the actual data, or read it as \`text/plain\` and parse manually.`,
      ],
    }),
  },
  {
    pattern: /Cannot open a new cursor on a closed stream/i,
    build: () => ({
      category: 'input',
      summary: `The payload is a stream that was already consumed before DataWeave got to it.`,
      fixes: [
        `In Mule: a previous component (often a Logger or File:Write) read the stream without setting \`streaming: false\`. Use repeatable streaming or read the stream into a variable first.`,
        `In Studio: this rarely happens — if it does, try setting payload MIME type to one that buffers fully (JSON / XML rather than \`application/octet-stream\`).`,
      ],
    }),
  },

  // --- Output errors -------------------------------------------------------
  {
    pattern: /Trying to output non-whitespace characters outside main element tree[\s\S]*?writing Xml/i,
    build: () => ({
      category: 'output',
      summary: `Your output is a single string/value but DataWeave thinks you want XML.`,
      fixes: [
        `If you want the raw text, change the output directive: \`output text/plain\` or \`output application/json\` (instead of inheriting XML from the input).`,
        `If you want XML, wrap your result in a root element: \`{ root: payload.field }\`.`,
      ],
      example: {
        caption: 'Force text output when extracting from XML',
        code: '%dw 2.0\noutput text/plain\n---\npayload.order.product.model',
      },
    }),
  },
  {
    pattern: /(?:Text plain writer is unable to write|writer is unable to write) (Array|Object)/i,
    build: (m) => ({
      category: 'output',
      summary: `DataWeave inferred a plain-text output but your result is a${m[1] === 'Array' ? 'n' : ''} ${m[1]}.`,
      fixes: [
        `Add an explicit output directive at the top of the script: \`output application/json\` (for structured data) or \`output application/csv\` (for tabular).`,
        `If you want flat text, join the structure: \`payload joinBy "\\n"\` or \`payload joinBy ","\`.`,
      ],
    }),
  },
  {
    pattern: /output type ['"]?([\w/+-]+)['"]? is not registered/i,
    build: (m) => ({
      category: 'output',
      summary: `The output MIME type \`${m[1]}\` isn't registered in this DataWeave runtime.`,
      fixes: [
        `Check the spelling and standard form — e.g. \`application/json\`, \`application/xml\`, \`application/csv\`, \`text/plain\`.`,
        `For Excel, Avro, or Protocol Buffers — these require dedicated modules. Studio ships them, but the MIME must be exact (\`application/xlsx\`, \`application/avro\`, \`application/x-protobuf\`).`,
      ],
    }),
  },

  // --- Module / import errors ---------------------------------------------
  {
    pattern: /(?:module|import) ['"]?([\w:]+)['"]? (?:was not found|cannot be resolved|not found)/i,
    build: (m) => ({
      category: 'module',
      summary: `Couldn't find a DataWeave module called \`${m[1]}\`.`,
      fixes: [
        `Standard modules need the \`dw::core::\` prefix: \`import * from dw::core::Strings\`, \`import * from dw::core::Arrays\`, \`import * from dw::core::Objects\`.`,
        `Check the module name spelling — they're plural (\`Strings\`, \`Arrays\`, \`Objects\`, \`Numbers\`, \`Periods\`).`,
        `If it's a custom JAR module, add the JAR to the Classpath panel in Settings, then restart the runtime (Settings → Runtime → Restart CLI).`,
      ],
    }),
  },

  // --- Runtime errors ------------------------------------------------------
  {
    pattern: /Stack Overflow.*Max stack is (\d+)/i,
    build: (m) => ({
      category: 'runtime',
      summary: `A recursive function exceeded the ${m[1]}-frame stack limit — likely infinite recursion.`,
      fixes: [
        `Check recursive functions for a missing or unreachable base case (\`if (isEmpty(xs)) [] else ...\`).`,
        `For deeply nested data, prefer iterative operators (\`reduce\`, \`map\`) over recursion.`,
        `If you genuinely need deeper recursion, set the runtime property \`com.mulesoft.dw.stacksize\` (advanced — only in production Mule, not Studio).`,
      ],
    }),
  },
  {
    pattern: /NullPointerException/i,
    build: () => ({
      category: 'runtime',
      summary: `Something tried to read a property or call a method on \`null\`.`,
      fixes: [
        `Find the value that could be null in your script and add a \`default\`: \`payload.user.name default "unknown"\`.`,
        `Use \`isEmpty()\` / \`isNotEmpty()\` guards: \`if (isEmpty(payload.items)) [] else payload.items map ...\`.`,
        `For chained selectors, the \`?\` selector skips nulls: \`payload.user.?address.city\`.`,
      ],
      example: {
        caption: 'Defensive default',
        code: 'payload.user.name default "guest"',
      },
    }),
  },
  {
    pattern: /No space left on device/i,
    build: () => ({
      category: 'runtime',
      summary: `Payload is too large for available memory/disk — DataWeave spills to temp files.`,
      fixes: [
        `In Studio: try a smaller sample of the payload, or split the transform into stages with named inputs.`,
        `For genuinely huge files, use streaming: read the payload as \`application/x-ndjson\` (newline-delimited JSON) instead of one big array.`,
      ],
    }),
  },

  // --- Syntax errors -------------------------------------------------------
  {
    pattern: /(?:mismatched input|extraneous input|no viable alternative)/i,
    build: () => ({
      category: 'syntax',
      summary: `Syntax error — DataWeave couldn't parse the script.`,
      fixes: [
        `Look at the line/column in the error — that's where parsing stopped (the actual mistake is usually a few characters earlier).`,
        `Common causes: missing comma between object fields, unbalanced \`{\` \`}\` \`[\` \`]\` \`(\` \`)\`, a stray \`,\` before \`}\`, or using \`:\` instead of \`=\` in \`var\` declarations.`,
        `Format the script (Alt+Shift+F) — broken syntax usually makes the formatter visibly stop at the error point.`,
      ],
    }),
  },
  {
    pattern: /Expects (?:expression|identifier|';'|','|'\)')/i,
    build: () => ({
      category: 'syntax',
      summary: `The parser expected more — the expression is incomplete at the point of error.`,
      fixes: [
        `Look at the indicated line and column — something is missing right there.`,
        `If you're mid-edit, this often clears once you finish typing the expression.`,
      ],
    }),
  },

  // --- Sample input error (Code Builder–style, useful when scripts run with no payload) ---
  {
    pattern: /Unable to find sample input/i,
    build: () => ({
      category: 'input',
      summary: `The script references \`payload\` / \`vars\` / \`attributes\` but Studio doesn't have a value for it.`,
      fixes: [
        `Open the Payload tab and paste sample input matching the MIME type.`,
        `For \`vars\` or \`attributes\` access, fill in the Context panel (Request / Vars / Config tabs).`,
      ],
    }),
  },
];

/**
 * Match an error message against the catalog and return the first hint that
 * applies, or null if no rule matched.
 */
export function matchErrorHint(error: string): ErrorHint | null {
  if (!error) return null;
  for (const rule of RULES) {
    const m = error.match(rule.pattern);
    if (m) return rule.build(m);
  }
  return null;
}

/**
 * Human label for a category — used as a chip in the UI.
 */
export function categoryLabel(c: HintCategory): string {
  switch (c) {
    case 'reference': return 'Reference';
    case 'type': return 'Type mismatch';
    case 'function': return 'Function call';
    case 'input': return 'Input';
    case 'output': return 'Output';
    case 'module': return 'Module';
    case 'selector': return 'Selector';
    case 'syntax': return 'Syntax';
    case 'runtime': return 'Runtime';
  }
}
