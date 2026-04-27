import { Icons } from './Icons';

const STARTED_KEY = 'dw.hasStarted';

export function shouldShowEmptyState(): boolean {
  try { return localStorage.getItem(STARTED_KEY) !== 'true'; } catch { return false; }
}

export function markStarted(): void {
  try { localStorage.setItem(STARTED_KEY, 'true'); } catch { /* ignore */ }
}

interface EmptyStateProps {
  onBlankTransform: () => void;
  onImportCurl: () => void;
  onOpenSnippets: () => void;
  onStartTour: () => void;
}

export function EmptyState({ onBlankTransform, onImportCurl, onOpenSnippets, onStartTour }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center bg-bg overflow-auto">
      <div className="text-center max-w-[480px] px-6 py-10">
        <div
          className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center font-mono font-extrabold text-[22px]"
          style={{
            background: 'linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 50%, var(--violet)))',
            color: 'var(--accent-ink)',
            boxShadow: '0 10px 40px color-mix(in oklch, var(--accent) 30%, transparent)',
          }}
        >
          dw
        </div>
        <h2 className="text-[22px] font-semibold text-content tracking-tight">Start transforming</h2>
        <p className="text-[13.5px] text-content-muted mt-2.5 mb-6 leading-relaxed">
          DataWeave Studio runs the real MuleSoft DW engine locally. Write a script,
          feed it a payload, and see the result — no cloud, no signup.
        </p>
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <Card icon={<Icons.Plus size={14} />} label="Blank transform" shortcut="⌘N" onClick={onBlankTransform} />
          <Card icon={<Icons.Import size={14} />} label="Import cURL" shortcut="⌘⇧I" onClick={onImportCurl} />
          <Card icon={<Icons.Library size={14} />} label="From a snippet" shortcut="⌘L" onClick={onOpenSnippets} />
        </div>
        <button
          onClick={onStartTour}
          className="text-[11.5px] text-content-faint hover:text-content-secondary cursor-pointer transition-colors"
        >
          Or take the 60-second tour →
        </button>
      </div>
    </div>
  );
}

function Card({ icon, label, shortcut, onClick }: { icon: React.ReactNode; label: string; shortcut: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left p-3.5 bg-surface border border-line rounded-[9px] cursor-pointer hover:border-accent-border hover:bg-surface-2 transition-colors"
    >
      <div className="text-accent mb-2.5">{icon}</div>
      <div className="text-[12.5px] font-medium text-content">{label}</div>
      <div className="text-[10.5px] text-content-faint font-mono mt-0.5">{shortcut}</div>
    </button>
  );
}
