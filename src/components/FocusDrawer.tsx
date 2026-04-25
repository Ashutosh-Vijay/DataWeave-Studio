import { ReactNode } from 'react';
import { Icons } from './Icons';

interface FocusDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function FocusDrawer({ open, onClose, children }: FocusDrawerProps) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30"
          style={{ background: 'color-mix(in oklch, var(--bg) 35%, transparent)' }}
          onClick={onClose}
        />
      )}
      <aside
        className="fixed top-11 bottom-7 right-0 z-40 bg-surface border-l border-line shadow-2xl flex flex-col transition-transform duration-200 ease-out"
        style={{
          width: 400,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
        aria-hidden={!open}
      >
        <div className="h-10 shrink-0 flex items-center px-3 border-b border-line">
          <span className="text-[12.5px] font-semibold text-content">Context</span>
          <span className="flex-1" />
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-content-muted hover:text-content hover:bg-surface-2 cursor-pointer"
            title="Close (Esc)"
          >
            <Icons.X size={13} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      </aside>
    </>
  );
}
