import { useState, ReactNode } from 'react';

type Pane = 'script' | 'payload' | 'context' | 'output';

interface CompactLayoutProps {
  scriptPane: ReactNode;
  payloadPane: ReactNode;
  contextPane: ReactNode;
  outputPane: ReactNode;
  badges?: Partial<Record<Pane, number | string>>;
  initial?: Pane;
}

const PANES: { id: Pane; label: string }[] = [
  { id: 'script', label: 'Script' },
  { id: 'payload', label: 'Payload' },
  { id: 'context', label: 'Context' },
  { id: 'output', label: 'Output' },
];

export function CompactLayout({ scriptPane, payloadPane, contextPane, outputPane, badges, initial = 'script' }: CompactLayoutProps) {
  const [active, setActive] = useState<Pane>(initial);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bg">
      {/* Pane tabs */}
      <div className="h-9 shrink-0 flex items-end px-2 gap-1 bg-surface border-b border-line overflow-x-auto">
        {PANES.map((p) => {
          const isActive = active === p.id;
          const badge = badges?.[p.id];
          return (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className={`relative h-full px-3 inline-flex items-center gap-1.5 text-[12px] font-medium cursor-pointer transition-colors whitespace-nowrap ${
                isActive ? 'text-content' : 'text-content-faint hover:text-content-secondary'
              }`}
            >
              {p.label}
              {badge !== undefined && badge !== 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-[16px] h-[15px] px-1 rounded-full font-mono text-[9.5px] ${
                    isActive ? 'bg-accent-dim text-accent' : 'bg-surface-2 text-content-faint'
                  }`}
                >
                  {badge}
                </span>
              )}
              {isActive && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-sm bg-accent" />}
            </button>
          );
        })}
      </div>

      {/* Active pane */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {active === 'script' && scriptPane}
        {active === 'payload' && payloadPane}
        {active === 'context' && contextPane}
        {active === 'output' && outputPane}
      </div>
    </div>
  );
}
