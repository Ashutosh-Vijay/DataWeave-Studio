/**
 * The keyboard shortcuts, in one place.
 *
 * Two surfaces show this list — the ⌘/ dialog and Settings → Shortcuts — and
 * they had already drifted apart: Settings was missing ⌘/ and ⌘L, and neither
 * mentioned anything the editor binds. One array, two readers, no drift.
 *
 * Keep it honest: every entry here should be a binding that actually exists.
 * The app-level ones live in the global keydown handler in App.tsx; the editor
 * ones come from Monaco once the DataWeave language service registers its
 * providers.
 */
/** Mac shows ⌘⇧I; Windows and Linux read Ctrl+Shift+I. The bindings accept
 *  either modifier, only the labels differ. */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** A label with every ⌘ chord spelled the way this platform writes it. */
export function kbd(text: string): string {
  if (IS_MAC) return text;
  return text.replace(/⌘([⇧⌥]*)(↵|.)/g, (_, mods: string, key: string) =>
    'Ctrl+' + mods.replace(/⇧/g, 'Shift+').replace(/⌥/g, 'Alt+') + (key === '↵' ? 'Enter' : key));
}

const KEY_NAMES: Record<string, string> = IS_MAC ? {} : { '⌘': 'Ctrl', '⇧': 'Shift', '⌥': 'Alt', '↵': 'Enter' };

export interface Shortcut {
  keys: string[];
  label: string;
}

const GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: 'Run & execute',
    items: [
      { keys: ['⌘', '↵'], label: 'Run the script, or the test suite when the Tests pane is open' },
      { keys: ['⌘', '⇧', 'R'], label: 'Toggle auto-run' },
      // Only claimed while a run is in flight — otherwise ⌘. is Quick fix.
      { keys: ['⌘', '.'], label: 'Cancel run (while running)' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { keys: ['⌘', 'N'], label: 'New' },
      { keys: ['⌘', 'S'], label: 'Save' },
      { keys: ['⌘', 'O'], label: 'Open workspace…' },
      { keys: ['⌘', 'D'], label: 'Duplicate (when not typing in an editor)' },
    ],
  },
  {
    title: 'Navigation',
    items: [
      { keys: ['⌘', 'K'], label: 'Command palette' },
      { keys: ['⌘', '/'], label: 'Keyboard shortcuts (when not typing in an editor)' },
      { keys: ['⌘', 'B'], label: 'Toggle sidebar' },
    ],
  },
  {
    // Real navigation from the language service, not text search.
    title: 'In the editor',
    items: [
      { keys: ['F12'], label: 'Go to definition' },
      { keys: ['⇧', 'F12'], label: 'Find references' },
      { keys: ['F2'], label: 'Rename symbol' },
      { keys: ['⌘', '.'], label: 'Quick fix' },
      { keys: ['⌘', '/'], label: 'Comment or uncomment the line' },
      { keys: ['⌥', '⇧', 'F'], label: 'Format script' },
    ],
  },
  {
    title: 'Appearance',
    items: [
      { keys: ['⌘', '⇧', '1'], label: 'Switch to Workbench' },
      { keys: ['⌘', '⇧', '2'], label: 'Switch to Playground' },
      { keys: ['⌘', '⇧', 'T'], label: 'Toggle theme' },
      { keys: ['⌘', ','], label: 'Open settings' },
    ],
  },
  {
    title: 'Import & tools',
    items: [
      { keys: ['⌘', '⇧', 'I'], label: 'Import cURL' },
      { keys: ['⌘', 'L'], label: 'Snippets library' },
      { keys: ['⌘', '⇧', 'E'], label: 'Secure Properties tool' },
    ],
  },
];

export const SHORTCUT_GROUPS = GROUPS.map((g) => ({
  ...g,
  items: g.items.map((i) => ({ ...i, keys: i.keys.map((k) => KEY_NAMES[k] ?? k) })),
}));
