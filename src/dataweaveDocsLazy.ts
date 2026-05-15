/**
 * Lazy loader for the 371KB DW_FUNCTIONS reference. Only fetched on first
 * use — completion provider hits it when the user starts typing, hover
 * provider hits it on first hover, FunctionBrowser hits it on open.
 *
 * Keeps it out of the main bundle so first paint doesn't have to parse
 * 371KB of static documentation.
 */
import type { DW_FUNCTIONS, FnDoc, FnOverload } from './dataweaveDocs';

export type { FnDoc, FnOverload };
export type DwFunctionsMap = typeof DW_FUNCTIONS;

let cache: DwFunctionsMap | null = null;
let pending: Promise<DwFunctionsMap> | null = null;

export async function getDwFunctions(): Promise<DwFunctionsMap> {
  if (cache) return cache;
  if (!pending) {
    pending = import('./dataweaveDocs').then((m) => {
      cache = m.DW_FUNCTIONS;
      return cache;
    });
  }
  return pending;
}

/** Sync getter — returns null if not loaded yet. Useful for fast paths
 *  that can skip work when the data isn't ready (e.g. hover before first
 *  completion has fired). */
export function getDwFunctionsSync(): DwFunctionsMap | null {
  return cache;
}
