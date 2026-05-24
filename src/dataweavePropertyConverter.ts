/**
 * DataWeave property-lookup conversion utilities.
 *
 * In Mule, properties are read via the `p()` function:
 *   p("key")              → reads from config YAML
 *   p("secure::key")      → reads from secure config YAML
 *   Mule::p("key")        → qualified call, same semantics
 *
 * DataWeave Studio's `Config YAML` / `Secure Config YAML` panels substitute
 * `${key}` and `${secure::key}` placeholders before each run. This module
 * converts `p(...)` calls to that placeholder syntax so users can run
 * production Mule DataWeave scripts unchanged in Studio.
 */

/**
 * Matches a single `p(...)` or `Mule::p(...)` call.
 *
 * Captures:
 *   m[1] = the quote character used (` " ` or ` ' `)
 *   m[2] = the key inside the quotes
 *
 * Notes:
 *   - Allows optional whitespace inside the parens: `p( "key" )`
 *   - Requires the key to be a non-empty string literal (no expressions)
 *   - The lookbehind for non-word ensures we don't match inside identifiers
 *     like `xp("key")` (no such Mule function, but defensive)
 */
const P_CALL_REGEX = /(?<![A-Za-z0-9_])(?:Mule::)?p\(\s*(["'])([^"']+)\1\s*\)/g;

/**
 * Convert a single property-lookup match to its `${...}` form.
 *
 * Rules:
 *   - The captured key is preserved verbatim including any `secure::` prefix.
 *   - No quoting inside `${...}` — Studio's substituteProperties expects
 *     bare keys (with `::` separator for the secure namespace).
 */
export function convertPropertyKey(key: string): string {
  return `\${${key}}`;
}

/**
 * Find every `p(...)` / `Mule::p(...)` call in the source.
 *
 * Returns offset ranges (in characters from the start of the source) for
 * each match plus the converted replacement text. Caller decides whether
 * to apply via Monaco edits, plain string replace, or otherwise.
 */
export interface PropertyMatch {
  /** Inclusive start offset in the source (0-based). */
  start: number;
  /** Exclusive end offset in the source. */
  end: number;
  /** Original matched text — e.g. `p("foo")` or `Mule::p("secure::bar")`. */
  matchText: string;
  /** Replacement — e.g. `${foo}`. */
  replacement: string;
  /** The bare key inside the call. */
  key: string;
}

export function findPropertyCalls(source: string): PropertyMatch[] {
  const out: PropertyMatch[] = [];
  P_CALL_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = P_CALL_REGEX.exec(source)) !== null) {
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      matchText: m[0],
      replacement: convertPropertyKey(m[2]),
      key: m[2],
    });
  }
  return out;
}

/**
 * One-shot bulk conversion — replaces every `p()` call in the source with
 * the corresponding `${}` placeholder. Returns the new text and the count
 * of replacements.
 */
export function convertAllPropertyCalls(source: string): {
  text: string;
  count: number;
  keys: string[];
} {
  const matches = findPropertyCalls(source);
  if (matches.length === 0) return { text: source, count: 0, keys: [] };

  // Walk backwards so earlier indices remain stable while we splice.
  let out = source;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    out = out.slice(0, m.start) + m.replacement + out.slice(m.end);
  }
  return {
    text: out,
    count: matches.length,
    keys: matches.map((m) => m.key),
  };
}
