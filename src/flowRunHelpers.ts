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

/** Render a variable value for inline status display. */
export function displayVal(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v);
}
