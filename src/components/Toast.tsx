import { useEffect, useState, useCallback, useRef } from 'react';
import { Icons } from './Icons';

export type ToastVariant = 'success' | 'error' | 'info';
type ToastEntry = { id: number; message: string; variant: ToastVariant };

let pushFn: ((message: string, variant?: ToastVariant) => void) | null = null;

/** Fire a toast from anywhere. Safe to call before <ToastHost /> mounts (no-op). */
export function toast(message: string, variant: ToastVariant = 'info') {
  pushFn?.(message, variant);
}

export function ToastHost() {
  const [items, setItems] = useState<ToastEntry[]>([]);
  const idRef = useRef(0);

  const push = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    pushFn = push;
    return () => { pushFn = null; };
  }, [push]);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border shadow-lg max-w-[420px] animate-[toastIn_180ms_ease-out]"
          style={{
            background: 'var(--surface)',
            borderColor:
              t.variant === 'error' ? 'var(--err-border)'
              : t.variant === 'success' ? 'var(--accent-border)'
              : 'var(--line)',
          }}
        >
          <span style={{
            color: t.variant === 'error' ? 'var(--err)' : t.variant === 'success' ? 'var(--accent)' : 'var(--content-muted)',
          }}>
            {t.variant === 'error' ? <Icons.X size={14} /> : <Icons.Dot size={10} />}
          </span>
          <span className="text-[12.5px] text-content leading-snug flex-1 break-words">{t.message}</span>
        </div>
      ))}
      <style>{`
        @keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
