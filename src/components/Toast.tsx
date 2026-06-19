import { useEffect, useState, useCallback, useRef } from 'react';
import { Icons } from './Icons';

export type ToastVariant = 'success' | 'error' | 'info' | 'warn';
type ToastEntry = {
  id: number;
  message: string;
  title?: string;
  variant: ToastVariant;
  action?: { label: string; onClick: () => void };
  /** Don't auto-dismiss — stays until the user closes it or taps the action.
   *  For things that must be read (e.g. the release announcement). */
  persist?: boolean;
};

let pushFn: ((entry: Omit<ToastEntry, 'id'>) => void) | null = null;

/** Fire a toast from anywhere. Safe to call before <ToastHost /> mounts (no-op). */
export function toast(message: string, variant?: ToastVariant): void;
export function toast(opts: Omit<ToastEntry, 'id'>): void;
export function toast(arg: string | Omit<ToastEntry, 'id'>, variant: ToastVariant = 'info') {
  if (typeof arg === 'string') {
    pushFn?.({ message: arg, variant });
  } else {
    pushFn?.(arg);
  }
}

// Per-variant styling — color, icon chip, accent bar
const VARIANT_CONFIG: Record<ToastVariant, { color: string; icon: React.ReactNode }> = {
  success: {
    color: 'var(--accent)',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  error: {
    color: 'var(--err)',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  warn: {
    color: 'var(--warn)',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  info: {
    color: 'var(--cyan)',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
};

export function ToastHost() {
  const [items, setItems] = useState<ToastEntry[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => () => { timersRef.current.forEach((t) => clearTimeout(t)); }, []);

  const dismiss = useCallback((id: number) => {
    const t = timersRef.current.get(id);
    if (t) { clearTimeout(t); timersRef.current.delete(id); }
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((entry: Omit<ToastEntry, 'id'>) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { ...entry, id }]);
    // Persistent toasts stay until dismissed; others auto-expire (errors and
    // actions get a longer window).
    if (entry.persist) return;
    const ttl = entry.action ? 6000 : entry.variant === 'error' ? 5500 : 3500;
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, ttl);
    timersRef.current.set(id, timer);
  }, []);

  useEffect(() => {
    pushFn = push;
    return () => { pushFn = null; };
  }, [push]);

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 pointer-events-none w-[360px] max-w-[calc(100vw-2.5rem)]">
      {items.map((t) => {
        const cfg = VARIANT_CONFIG[t.variant];
        return (
          <div
            key={t.id}
            className="pointer-events-auto relative flex items-start gap-2.5 px-3.5 py-3 rounded-[10px] overflow-hidden animate-[toastIn_180ms_ease-out]"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              boxShadow: '0 8px 24px color-mix(in oklch, oklch(0% 0 0) 40%, transparent)',
            }}
          >
            {/* Left accent bar */}
            <div
              className="absolute top-0 bottom-0 left-0 w-[3px]"
              style={{ background: cfg.color }}
            />

            {/* Icon chip */}
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              style={{
                background: `color-mix(in oklch, ${cfg.color} 15%, transparent)`,
                color: cfg.color,
              }}
            >
              {cfg.icon}
            </div>

            {/* Body */}
            <div className="flex-1 min-w-0">
              {t.title ? (
                <>
                  <div className="text-[12.5px] font-semibold leading-snug" style={{ color: 'var(--content)' }}>{t.title}</div>
                  <div className="text-[11.5px] mt-[2px] leading-[1.45] break-words" style={{ color: 'var(--content-muted)' }}>{t.message}</div>
                </>
              ) : (
                <div className="text-[12.5px] leading-snug break-words" style={{ color: 'var(--content)' }}>{t.message}</div>
              )}
              {t.action && (
                <div className="mt-2">
                  <button
                    onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                    className="px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-colors"
                    style={{
                      color: cfg.color,
                      background: `color-mix(in oklch, ${cfg.color} 12%, transparent)`,
                      border: `1px solid color-mix(in oklch, ${cfg.color} 30%, transparent)`,
                    }}
                  >
                    {t.action.label}
                  </button>
                </div>
              )}
            </div>

            {/* Dismiss */}
            <button
              onClick={() => dismiss(t.id)}
              className="w-5 h-5 rounded flex items-center justify-center cursor-pointer shrink-0 hover:bg-surface-2"
              style={{ color: 'var(--content-faint)' }}
              aria-label="Dismiss"
            >
              <Icons.X size={11} />
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes toastIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
