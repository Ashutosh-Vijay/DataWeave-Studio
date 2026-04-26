import { useEffect } from 'react';
import { Icons } from './Icons';

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  label: string;
}

const GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: 'Run & execute',
    items: [
      { keys: ['⌘', '↵'], label: 'Run transform' },
      { keys: ['⌘', '⇧', 'R'], label: 'Toggle auto-run' },
      { keys: ['⌘', '.'], label: 'Cancel running' },
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
      { keys: ['⌘', '1'], label: 'Go to script' },
      { keys: ['⌘', '2'], label: 'Go to payload' },
      { keys: ['⌘', '3'], label: 'Go to context' },
      { keys: ['⌘', '4'], label: 'Go to output' },
    ],
  },
  {
    title: 'Appearance',
    items: [
      { keys: ['⌘', '⇧', '1'], label: 'Switch to Workbench' },
      { keys: ['⌘', '⇧', '2'], label: 'Switch to Focus' },
      { keys: ['⌘', '⇧', 'T'], label: 'Toggle theme' },
      { keys: ['⌘', 'B'], label: 'Toggle sidebar' },
      { keys: ['⌘', ','], label: 'Open settings' },
    ],
  },
  {
    title: 'Import & tools',
    items: [
      { keys: ['⌘', '⇧', 'I'], label: 'Import cURL' },
      { keys: ['⌘', '⇧', 'E'], label: 'Encrypt value' },
      { keys: ['⌥', '⇧', 'F'], label: 'Format script' },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded bg-surface-3 border border-line-secondary font-mono text-[10.5px] text-content-secondary">
      {children}
    </span>
  );
}

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 60%, transparent)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-11 shrink-0 flex items-center px-4 border-b border-line">
          <span className="text-[13px] font-semibold text-content flex-1">Keyboard shortcuts</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer"
            aria-label="Close"
          >
            <Icons.X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          {GROUPS.map((g) => (
            <div key={g.title} className="space-y-2">
              <div className="text-[10.5px] font-semibold text-content-faint uppercase tracking-[0.6px]">
                {g.title}
              </div>
              <div className="space-y-1">
                {g.items.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <span className="flex-1 text-[12px] text-content-secondary">{s.label}</span>
                    <span className="flex items-center gap-1">
                      {s.keys.map((k, j) => (
                        <Kbd key={j}>{k}</Kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="h-9 shrink-0 px-4 flex items-center border-t border-line text-[10.5px] text-content-ghost">
          <span>On Windows, ⌘ = Ctrl, ⌥ = Alt, ⇧ = Shift</span>
          <span className="flex-1" />
          <Kbd>Esc</Kbd>
          <span className="ml-1.5">to close</span>
        </div>
      </div>
    </div>
  );
}
