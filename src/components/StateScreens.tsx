import type { ReactNode } from 'react';
import { Icons } from './Icons';

interface StateProps {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ title, message, icon, action, className = '' }: StateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-10 ${className}`}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3 bg-surface-2 text-content-faint">
        {icon ?? <Icons.Braces size={18} />}
      </div>
      <div className="text-[13px] font-medium text-content-secondary">{title}</div>
      {message && <div className="text-[11.5px] text-content-faint mt-1 max-w-[300px]">{message}</div>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium bg-accent-dim text-accent border border-accent-border hover:bg-accent-dim/80 cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function LoadingState({ title = 'Working…', message, className = '' }: Omit<StateProps, 'action' | 'icon'>) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-10 ${className}`}>
      <div className="w-6 h-6 rounded-full border-2 border-t-transparent border-accent animate-spin mb-3" />
      <div className="text-[13px] font-medium text-content-secondary">{title}</div>
      {message && <div className="text-[11.5px] text-content-faint mt-1 max-w-[300px]">{message}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, className = '' }: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-start gap-2 px-3 py-3 rounded-md border ${className}`}
      style={{
        background: 'color-mix(in oklch, var(--err) 10%, transparent)',
        borderColor: 'color-mix(in oklch, var(--err) 30%, transparent)',
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: 'var(--err)' }} className="inline-flex">
          <Icons.Dot size={10} />
        </span>
        <div className="text-[12.5px] font-medium" style={{ color: 'var(--err)' }}>{title}</div>
      </div>
      <pre className="text-[11.5px] text-content-muted whitespace-pre-wrap break-words font-mono leading-relaxed w-full">
        {message}
      </pre>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-1.5 h-6 px-2.5 rounded text-[11px] font-medium bg-surface-2 border border-line text-content-secondary hover:bg-surface-3 cursor-pointer"
        >
          Retry
        </button>
      )}
    </div>
  );
}
