/**
 * Render a SOQL/SQL query template by substituting `:paramName` placeholders
 * with values from a params object. Shared by the single-script Query mode and
 * the Flow Designer's Salesforce/Database nodes so the quoting rules can't drift.
 *
 * Salesforce mode: literal string replace — the user controls quoting in the
 * SOQL template (e.g. ':industry' for strings, :fromDate bare for dates).
 *
 * DB mode: simulates JDBC prepared statements — auto-quotes strings, escapes
 * single quotes, bare numbers/booleans, NULL for nulls, and expands arrays to
 * `(v1,v2,...)` for IN clauses. The user must NEVER add quotes around :param in SQL.
 */

// Format a single scalar value per the active connector's quoting rules.
function formatQueryScalar(value: unknown, isDbMode: boolean): string {
  if (isDbMode) {
    // DB connector: JDBC-style — driver handles quoting
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    // String: auto-wrap in quotes, escape internal single quotes
    return `'${String(value).replace(/'/g, "''")}'`;
  }
  // Salesforce connector: literal replace — user controls quoting in template
  if (value === null || value === undefined) return 'null';
  return String(value);
}

// Format a param value, expanding arrays for IN clauses.
// SOQL: literal join (user controls outer parens). SQL: wraps in (...).
function formatQueryValue(value: unknown, isDbMode: boolean): string {
  if (Array.isArray(value)) {
    const inner = value.map((v) => formatQueryScalar(v, isDbMode)).join(',');
    return isDbMode ? `(${inner})` : inner;
  }
  return formatQueryScalar(value, isDbMode);
}

export function substituteQueryParams(
  query: string,
  paramsJson: string,
  isDbMode: boolean
): { result: string; params: Record<string, unknown>; unbound: string[]; unused: string[] } | null {
  try {
    const params = JSON.parse(paramsJson);
    if (typeof params !== 'object' || params === null || Array.isArray(params)) return null;

    // Single-pass replacement: scan the original template once. Substituted
    // text is NOT re-scanned by String.replace, so an earlier param's value
    // containing ":otherParam" can no longer trigger accidental re-injection.
    const referenced = new Set<string>();
    const unbound = new Set<string>();

    const result = query.replace(/:(\w+)\b/g, (match, key) => {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        referenced.add(key);
        return formatQueryValue(params[key], isDbMode);
      }
      // :placeholder with no matching param — leave it verbatim and flag it.
      unbound.add(key);
      return match;
    });

    const unused = Object.keys(params).filter((k) => !referenced.has(k));

    return { result, params, unbound: [...unbound], unused };
  } catch {
    return null;
  }
}
