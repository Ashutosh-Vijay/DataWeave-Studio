/**
 * Every tool in one place, with a line on what each is for. The rail only has
 * icons, and the old Tools menu was a plain list of names that mostly repeated
 * it, so a tool that wasn't on the rail (Mule log to cURL) was easy to miss
 * entirely. Opened from the top bar's Tools button and the rail's All tools.
 */
import { useEffect, type ReactNode } from 'react';

export interface Tool {
  label: string;
  desc: string;
  group: string;
  icon: ReactNode;
  run: () => void;
}

export function ToolsLauncher({ tools, extras, onClose }: {
  tools: Tool[];
  /** Small links under the grid: shortcuts, feedback, about. */
  extras: { label: string; run: () => void }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups = [...new Set(tools.map((t) => t.group))];
  const open = (run: () => void) => { onClose(); run(); };

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center"
      style={{ background: 'color-mix(in oklch, var(--bg) 70%, transparent)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden"
        style={{ width: 'min(760px, calc(100vw - 40px))', maxHeight: 'calc(100vh - 64px)' }}
      >
        <div className="flex items-center gap-3 px-6 h-14 shrink-0 border-b border-line-subtle">
          <span className="text-[15px] font-semibold text-content">All tools</span>
          <span className="text-[12px] text-content-faint">Everything the app can do, beyond the editor</span>
          <span className="flex-1" />
          <button
            onClick={onClose}
            className="grid place-items-center w-7 h-7 rounded-md text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer"
            title="Close (Esc)"
            aria-label="Close"
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 pb-5">
          {groups.map((g) => (
            <div key={g} className="mt-5">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.7px] text-content-faint mb-2">{g}</div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {tools.filter((t) => t.group === g).map((t) => (
                  <button
                    key={t.label}
                    onClick={() => open(t.run)}
                    className="flex items-start gap-3 text-left p-3 rounded-lg border border-line-subtle hover:border-line hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <span
                      className="grid place-items-center shrink-0 w-8 h-8 rounded-lg"
                      style={{ color: 'var(--accent)', background: 'var(--accent-dim)' }}
                    >
                      {t.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-content">{t.label}</span>
                      <span className="block text-[11.5px] text-content-muted leading-snug mt-0.5">{t.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 px-6 h-11 shrink-0 border-t border-line-subtle">
          {extras.map((x) => (
            <button
              key={x.label}
              onClick={() => open(x.run)}
              className="text-[12px] text-content-faint hover:text-content cursor-pointer"
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
