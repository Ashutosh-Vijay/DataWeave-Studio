/**
 * Target Mule runtime — the DataWeave version scripts are checked against.
 *
 * This is app-wide by default, because "which Mule do I deploy to" is a fact
 * about the person, not about one transform. Making it per-workspace by default
 * would mean answering the same question every time you start a workspace.
 *
 * Someone who genuinely straddles two runtimes can turn on the per-workspace
 * override in Settings; until they do, the workspace value is ignored entirely.
 *
 * Empty string means "latest" — no version gating at all, which is the default
 * and matches how the app behaved before any of this existed.
 */

/** Mule 4.x and DataWeave 2.x ship in lockstep, so one number names both. */
export const TARGETS = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => ({
  level: `2.${n}`,
  label: `Mule 4.${n} · DW 2.${n}`,
}));

const APP_KEY = 'dw.targetRuntime';
const PER_WORKSPACE_KEY = 'dw.targetRuntime.perWorkspace';
const PROMPTED_KEY = 'dw.targetRuntime.prompted';

export function readAppTarget(): string {
  try { return localStorage.getItem(APP_KEY) || ''; } catch { return ''; }
}

export function writeAppTarget(level: string): void {
  try { localStorage.setItem(APP_KEY, level); } catch { /* ignore */ }
}

export function readPerWorkspace(): boolean {
  try { return localStorage.getItem(PER_WORKSPACE_KEY) === '1'; } catch { return false; }
}

export function writePerWorkspace(on: boolean): void {
  try { localStorage.setItem(PER_WORKSPACE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

/**
 * Which target actually applies right now.
 *
 * A workspace that has never been given one inherits the app default rather
 * than silently dropping to "latest" — otherwise turning the override on would
 * quietly stop checking every workspace you already had.
 */
export function effectiveTarget(
  appTarget: string,
  perWorkspace: boolean,
  workspaceTarget: string | undefined,
): string {
  if (!perWorkspace) return appTarget;
  return workspaceTarget ?? appTarget;
}

/** "Mule 4.4 · DW 2.4", or the latest-engine label when nothing is targeted. */
export function labelFor(level: string, engineVersion?: string): string {
  if (!level) return engineVersion ? `Latest (DW ${engineVersion})` : 'Latest';
  return TARGETS.find((t) => t.level === level)?.label ?? `DW ${level}`;
}

/**
 * Existing installs never saw the first-run picker, so they get one prompt.
 * New installs are marked as prompted when they finish first-run setup, so the
 * two paths can't both fire.
 */
export function shouldPromptForTarget(): boolean {
  try { return localStorage.getItem(PROMPTED_KEY) !== 'true'; } catch { return false; }
}

export function markTargetPrompted(): void {
  try { localStorage.setItem(PROMPTED_KEY, 'true'); } catch { /* ignore */ }
}
