/**
 * Pure helpers for the Flow Designer's run engine. Extracted so they can be
 * unit-tested directly (the engine itself lives inside a React component and
 * calls the Tauri DataWeave runtime, which isn't unit-testable).
 */

/** Best-effort parse of a DataWeave engine result into a structured value, so
 *  variables hold objects/arrays/numbers (not JSON text) and downstream scripts
 *  can do `vars.x.field`. Falls back to the raw string when it isn't JSON. */
export function parseMaybe(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

/** A value bound to a variable must come back as structured JSON, so coerce an
 *  `output application/java` directive to `application/json` before running. */
export function forceJsonOutput(script: string): string {
  return script.replace(/output(\s+)application\/java\b/g, 'output$1application/json');
}

/** Turn an fx-mode value into a runnable DataWeave script. A bare expression
 *  (`payload.x default ''`) gets the standard header; but a full script the user
 *  pasted — one that already declares its own `%dw`/`---` header (e.g. with
 *  `output application/java`, vars, or functions) — is run as-is so we don't
 *  double-wrap it into a compile error. Tolerates an outer `#[ … ]`. */
export function exprToScript(value: string): string {
  const e = value.trim().replace(/^#\[([\s\S]*)\]$/, '$1').trim();
  // Already a complete script: starts with the `%dw` version header, or has a
  // body separator on its own line.
  if (/^%dw\b/.test(e) || /(^|\n)\s*---\s*(\n|$)/.test(e)) return e;
  return `%dw 2.0\noutput application/json\n---\n${e}`;
}

/** Render a variable value for inline status display. */
export function displayVal(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/** Importing a flow seeds the Input fixture with every queryParam/uriParam/header
 *  the flow reads — as an EMPTY STRING. But `""` is not `null`, so a param the
 *  user never filled would make `attributes.queryParams.x == null` false and
 *  break Choice routing (a flow that branches on "id present?" took the wrong
 *  branch). An empty inbound param means "not sent", so drop it — then a missing
 *  value reads as null, exactly like a real HTTP request. */
export function normalizeEntryAttributes(attributesJson: string): string {
  let a: Record<string, unknown>;
  try { a = JSON.parse(attributesJson || '{}'); } catch { return attributesJson; }
  if (!a || typeof a !== 'object') return attributesJson;
  for (const group of ['queryParams', 'uriParams', 'headers']) {
    const g = a[group];
    if (g && typeof g === 'object' && !Array.isArray(g)) {
      const obj = g as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        if (obj[k] === '' || obj[k] == null) delete obj[k];
      }
    }
  }
  return JSON.stringify(a);
}
