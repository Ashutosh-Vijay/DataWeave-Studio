/**
 * Every tool in one place, with a line on what each is for. The rail only has
 * icons, and the old Tools menu was a plain list of names that mostly repeated
 * it, so a tool that wasn't on the rail (Mule log to cURL) was easy to miss
 * entirely. Opened from the top bar's Tools button and the rail's All tools.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useModalFocus } from '../hooks/useModalFocus';

export interface Tool {
  /** Stable id: what the rail's pin list stores. */
  id: string;
  label: string;
  desc: string;
  group: string;
  icon: ReactNode;
  run: () => void;
}

export function ToolsLauncher({ tools, extras, pinned, onTogglePin, onReorder, onClose }: {
  tools: Tool[];
  /** Ids of the tools on the rail. */
  pinned: string[];
  onTogglePin: (id: string) => void;
  /** New order of the pinned ids. */
  onReorder: (ids: string[]) => void;
  /** Small links under the grid: shortcuts, feedback, about. */
  extras: { label: string; run: () => void }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocus(panelRef, true);

  const groups = [...new Set(tools.map((t) => t.group))];
  const open = (run: () => void) => { onClose(); run(); };

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center"
      style={{ background: 'color-mix(in oklch, var(--bg) 70%, transparent)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="All tools"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden outline-none"
        style={{ width: 'min(760px, calc(100vw - 40px))', maxHeight: 'calc(100vh - 64px)' }}
      >
        <div className="flex items-center gap-3 px-6 h-14 shrink-0 border-b border-line-subtle">
          <span className="text-[15px] font-semibold text-content">All tools</span>
          <span className="text-[12px] text-content-faint">Pin the ones you use to keep them on the rail</span>
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
          {/* The rail's order, changeable here without dragging. */}
          {pinned.length > 0 && (
            <div className="mt-5">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.7px] text-content-faint mb-2">On your rail, in this order</div>
              <div className="flex flex-wrap gap-2">
                {pinned.map((id, i) => {
                  const t = tools.find((x) => x.id === id);
                  if (!t) return null;
                  const move = (to: number) => {
                    const next = [...pinned];
                    next.splice(i, 1);
                    next.splice(to, 0, id);
                    onReorder(next);
                  };
                  const arrow = 'grid place-items-center w-6 h-6 rounded text-content-faint hover:text-content hover:bg-surface-3 cursor-pointer disabled:opacity-30 disabled:cursor-default';
                  return (
                    <div key={id} className="flex items-center gap-1.5 h-9 pl-2.5 pr-1 rounded-lg border border-line-subtle bg-surface-2">
                      <span className="text-content-muted">{t.icon}</span>
                      <span className="text-[12px] text-content mr-1">{t.label}</span>
                      <button onClick={() => move(i - 1)} disabled={i === 0} className={arrow} aria-label={`Move ${t.label} up`} title="Move up">
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                      </button>
                      <button onClick={() => move(i + 1)} disabled={i === pinned.length - 1} className={arrow} aria-label={`Move ${t.label} down`} title="Move down">
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {groups.map((g) => (
            <div key={g} className="mt-5">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.7px] text-content-faint mb-2">{g}</div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {tools.filter((t) => t.group === g).map((t) => {
                  const isPinned = pinned.includes(t.id);
                  return (
                  <div key={t.id} className="relative group">
                  <button
                    onClick={() => open(t.run)}
                    className="w-full h-full flex items-start gap-3 text-left p-3 pr-10 rounded-lg border border-line-subtle hover:border-line hover:bg-surface-2 cursor-pointer transition-colors"
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
                  <button
                    onClick={() => onTogglePin(t.id)}
                    title={isPinned ? 'Unpin from the rail' : 'Pin to the rail'}
                    aria-label={isPinned ? `Unpin ${t.label} from the rail` : `Pin ${t.label} to the rail`}
                    aria-pressed={isPinned}
                    className={`absolute top-2 right-2 grid place-items-center w-7 h-7 rounded-md cursor-pointer transition-colors ${
                      isPinned ? 'text-accent hover:bg-surface-3' : 'text-content-ghost opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-content hover:bg-surface-3'
                    }`}
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
                    </svg>
                  </button>
                  </div>
                  );
                })}
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
