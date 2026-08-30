import { useEffect } from 'react';
import { Icons } from './Icons';
import { SHORTCUT_GROUPS } from '../shortcuts';

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}



function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-[6px] rounded font-mono text-[11px]"
      style={{
        background: 'var(--surface-3)',
        border: '1px solid var(--line-subtle)',
        color: 'var(--content-secondary)',
      }}
    >
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
      style={{
        background: 'color-mix(in oklch, var(--bg) 60%, transparent)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        className="rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: '0 28px 80px color-mix(in oklch, oklch(0% 0 0) 55%, transparent)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — title + subtitle */}
        <div
          className="px-6 pt-5 pb-4 flex items-start gap-3"
          style={{ borderBottom: '1px solid var(--line-subtle)' }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: 'var(--surface-2)',
              color: 'var(--accent)',
            }}
          >
            <Icons.Command size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-semibold" style={{ color: 'var(--content)' }}>
              Keyboard shortcuts
            </div>
            <div className="text-[12px] mt-[3px]" style={{ color: 'var(--content-muted)' }}>
              Press <Kbd>⌘</Kbd> <Kbd>/</Kbd> any time to bring this up. On Windows/Linux, <Kbd>⌘</Kbd> = <Kbd>Ctrl</Kbd>.
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer hover:bg-surface-2 shrink-0"
            style={{ color: 'var(--content-faint)' }}
            aria-label="Close"
          >
            <Icons.X size={13} />
          </button>
        </div>

        {/* Body — 2 column grid of groups */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          {SHORTCUT_GROUPS.map((g) => (
            <div key={g.title}>
              <div
                className="text-[10.5px] font-semibold uppercase tracking-[0.5px] mb-2"
                style={{ color: 'var(--content-faint)' }}
              >
                {g.title}
              </div>
              <div>
                {g.items.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 py-[7px]"
                    style={{
                      borderBottom: i === g.items.length - 1 ? 'none' : '1px solid var(--line-subtle)',
                    }}
                  >
                    <span className="flex-1 text-[12.5px]" style={{ color: 'var(--content-secondary)' }}>
                      {s.label}
                    </span>
                    <span className="flex items-center gap-[3px]">
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
        <div
          className="h-10 shrink-0 px-6 flex items-center text-[11px]"
          style={{
            borderTop: '1px solid var(--line-subtle)',
            background: 'var(--surface-2)',
            color: 'var(--content-faint)',
          }}
        >
          <span>{SHORTCUT_GROUPS.reduce((n, g) => n + g.items.length, 0)} shortcuts</span>
          <span className="flex-1" />
          <Kbd>Esc</Kbd>
          <span className="ml-2">to close</span>
        </div>
      </div>
    </div>
  );
}
