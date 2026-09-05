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
export interface Shortcut {
  keys: string[];
  label: string;
}

export const SHORTCUT_GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: 'Run & execute',
    items: [
      { keys: ['⌘', '↵'], label: 'Run — the script, or the test suite when the Tests pane is open' },
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
      { keys: ['⌘', 'D'], label: 'Duplicate' },
    ],
  },
  {
    title: 'Navigation',
    items: [
      { keys: ['⌘', 'K'], label: 'Command palette' },
      { keys: ['⌘', '/'], label: 'Keyboard shortcuts' },
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
