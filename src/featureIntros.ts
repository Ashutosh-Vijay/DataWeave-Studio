/**
 * One-time feature coachmarks. The first time a user actually triggers a feature
 * — clicks cURL import, opens the cookbook, toggles Auto-run, etc. — we pop a
 * small card explaining what it does, then never again (the "seen" flag lives in
 * localStorage forever, until it's cleared). Studio has a lot of features nobody
 * discovers because nothing explains them; this fixes that without nagging.
 *
 * Mirrors cursorStore's module-level pub-sub so callers don't need props or
 * context — a button handler just calls `introFeature('curl')` and the single
 * <FeatureIntroHost/> mounted at the app root renders the card.
 */

export interface FeatureIntro {
  title: string;
  body: string;
  tip?: string;
}

// key → copy. Keys double as the localStorage suffix (`dw.intro.<key>`).
export const FEATURE_INTROS: Record<string, FeatureIntro> = {
  autorun: {
    title: 'Auto-run',
    body: 'Studio now re-executes your script automatically ~1.5s after you stop typing, so the output updates live as you edit — no need to hit Run. Click this button again to turn it off.',
    tip: '⌘⇧R toggles it from anywhere.',
  },
  curl: {
    title: 'Import from cURL',
    body: 'Paste a cURL command — copy one straight from your browser’s Network tab or Postman — and Studio scaffolds the transform for you: the body becomes the payload, with headers and query params wired up as inputs.',
    tip: '⌘⇧I opens this anytime.',
  },
  cookbook: {
    title: 'DataWeave cookbook',
    body: 'A searchable library of ready-to-run recipes — grouping, joins, date math, XML/CSV tricks and more. Click any recipe to load it straight into the editor and tweak it.',
  },
  flow: {
    title: 'Message Flow designer',
    body: 'Chain several transforms into a visual pipeline where one step’s output feeds the next — with mock Salesforce and Database connectors so you can model a real integration end-to-end.',
  },
  modules: {
    title: 'Module library',
    body: 'Save reusable .dwl modules once, then `import` them from any script. Perfect for shared mappers and helper functions you reuse across transforms — they’re sent to the engine on every run.',
  },
  secure: {
    title: 'Secure properties',
    body: 'Encrypt and decrypt ${secure::key} values using the same algorithms as Mule’s secure-properties module — entirely on your machine, nothing leaves it.',
    tip: '⌘⇧E opens this anytime.',
  },
  reference: {
    title: 'Function reference',
    body: 'Browse all 309 DataWeave functions with signatures and worked examples. It’s the same reference that powers the editor’s autocomplete and hover docs.',
  },
  java: {
    title: 'Java tester',
    body: 'Compile the Java classes your Mule app calls and exercise them against a payload — and manage the JAR dependencies right here. Use `import java!` in your script to reach them.',
  },
  mcp: {
    title: 'MCP Server',
    body: 'Serve Studio’s engine to AI agents — Claude, Cursor, Copilot. The agent writes a script, runs it here against the real runtime to get the actual error, fixes it, and hands you tested code. Safe mode is on by default, so agents can transform data but can’t touch Java or the filesystem.',
  },
  compare: {
    title: 'Compare',
    body: 'A side-by-side diff for two payloads or outputs — paste one on each side to see exactly what changed. Your text sticks around when you switch away and come back.',
  },
  openapi: {
    title: 'OpenAPI / Swagger reader',
    body: 'Open or paste an OpenAPI 3.x or Swagger 2.0 spec and browse its operations and types. Pick any request, response, or example and Studio drops a sample payload and a matching DataWeave skeleton into your workspace. Save specs to the sidebar library to reopen them later — all offline.',
  },
};

const SEEN_PREFIX = 'dw.intro.';

export function hasSeenFeature(key: string): boolean {
  try { return localStorage.getItem(SEEN_PREFIX + key) === '1'; } catch { return false; }
}
export function markFeatureSeen(key: string): void {
  try { localStorage.setItem(SEEN_PREFIX + key, '1'); } catch { /* ignore */ }
}
/** Forget every "seen" flag — Settings uses this to replay the hints. */
export function resetFeatureIntros(): void {
  try { Object.keys(FEATURE_INTROS).forEach((k) => localStorage.removeItem(SEEN_PREFIX + k)); } catch { /* ignore */ }
}

type Listener = (key: string | null) => void;
const listeners = new Set<Listener>();
let current: string | null = null;

/** Show the explainer for `key` once. No-op if it's been seen or is unknown. */
export function introFeature(key: string): void {
  if (!FEATURE_INTROS[key] || hasSeenFeature(key)) return;
  current = key;
  listeners.forEach((l) => l(current));
}
/** Dismiss the current card and mark it seen so it never shows again. */
export function dismissFeatureIntro(): void {
  if (current) markFeatureSeen(current);
  current = null;
  listeners.forEach((l) => l(null));
}
export function subscribeFeatureIntro(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
