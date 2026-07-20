import { useEffect, useRef } from 'react';
import { Icons } from './Icons';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Plain-text body, or a custom node — e.g. include a code-styled filename inside. */
  description: React.ReactNode;
  /** 'danger' = red destructive button, 'warn' = amber, 'primary' = accent. */
  tone?: 'danger' | 'warn' | 'primary';
  /** Icon for the corner chip. Defaults match the tone. */
  icon?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional middle action (e.g. "Discard") between Cancel and the primary. */
  secondaryLabel?: string;
  onSecondary?: () => void | Promise<void>;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

/**
 * Small confirmation modal — used for destructive actions (delete workspace,
 * reset settings) that previously triggered the browser's native confirm()
 * dialog or had no confirmation at all.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  tone = 'primary',
  icon,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  secondaryLabel,
  onSecondary,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus the destructive button so Enter confirms (matches OS dialogs).
    // For non-destructive tones, this is also fine — Enter is "go ahead".
    requestAnimationFrame(() => confirmRef.current?.focus());
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const toneColor =
    tone === 'danger' ? 'var(--err)' :
    tone === 'warn' ? 'var(--warn)' :
    'var(--accent)';
  const toneInk = tone === 'danger' || tone === 'warn' ? '#ffffff' : 'var(--accent-ink)';
  const fallbackIcon = tone === 'danger' ? <Icons.Trash size={15} /> :
                       tone === 'warn'   ? <WarnIcon /> :
                       <Icons.Dot size={11} />;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center pt-[20vh] px-4"
      style={{
        background: 'color-mix(in oklch, var(--bg) 65%, transparent)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-xl overflow-hidden"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: '0 28px 80px color-mix(in oklch, oklch(0% 0 0) 55%, transparent)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        {/* Body */}
        <div className="p-4 flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0"
            style={{
              background: `color-mix(in oklch, ${toneColor} 12%, transparent)`,
              color: toneColor,
            }}
          >
            {icon ?? fallbackIcon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-semibold" style={{ color: 'var(--content)' }}>
              {title}
            </div>
            <div className="text-[12.5px] mt-1.5 leading-[1.5]" style={{ color: 'var(--content-muted)' }}>
              {description}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-4 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}
        >
          <button
            onClick={onClose}
            className="h-8 px-3.5 rounded-md text-[12.5px] font-medium cursor-pointer"
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              color: 'var(--content-secondary)',
            }}
          >
            {cancelLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              onClick={async () => {
                try { await onSecondary(); } finally { onClose(); }
              }}
              className="h-8 px-3.5 rounded-md text-[12.5px] font-medium cursor-pointer"
              style={{
                background: 'transparent',
                border: '1px solid color-mix(in oklch, var(--err) 35%, transparent)',
                color: 'var(--err)',
              }}
            >
              {secondaryLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            onClick={async () => {
              try { await onConfirm(); } finally { onClose(); }
            }}
            className="h-8 px-3.5 rounded-md text-[12.5px] font-semibold cursor-pointer inline-flex items-center gap-1.5"
            style={{ background: toneColor, color: toneInk }}
          >
            {tone === 'danger' && <Icons.Trash size={11} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Inline filename pill — for use inside the `description` prop. */
export function ConfirmFile({ name }: { name: string }) {
  return (
    <span
      className="font-mono text-[12px] px-[5px] py-px rounded mx-px"
      style={{
        background: 'var(--surface-2)',
        color: 'var(--content)',
        fontWeight: 500,
      }}
    >
      {name}
    </span>
  );
}

function WarnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
