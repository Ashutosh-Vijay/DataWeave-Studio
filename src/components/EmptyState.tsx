import { Icons } from './Icons';

const LAST_WS_KEY = 'dw.lastWorkspace';

export function readLastWorkspace(): string | null {
  try { return localStorage.getItem(LAST_WS_KEY); } catch { return null; }
}

export function writeLastWorkspace(name: string | null): void {
  try {
    if (name) localStorage.setItem(LAST_WS_KEY, name);
    else localStorage.removeItem(LAST_WS_KEY);
  } catch { /* ignore */ }
}

interface EmptyStateProps {
  onBlankTransform: () => void;
  onImportCurl: () => void;
  onImportPlayground: () => void;
  onOpenSnippets: () => void;
  onOpenWorkspace: () => void;
  onStartTour: () => void;
  onOpenFlowDesigner: () => void;
  lastWorkspace: string | null;
  /** True when no saved file exists but a recoverable in-progress draft does. */
  hasDraftSession?: boolean;
  onResumeLast: () => void;
}

export function EmptyState({
  onBlankTransform, onImportCurl, onImportPlayground, onOpenSnippets, onOpenWorkspace,
  onStartTour, onOpenFlowDesigner, lastWorkspace, hasDraftSession, onResumeLast,
}: EmptyStateProps) {
  const lastName = lastWorkspace ? lastWorkspace.replace(/\.json$/, '').replace(/\.dwstudio$/, '') : null;
  const showResume = !!lastName || !!hasDraftSession;
  return (
    <div className="flex-1 flex items-center justify-center bg-bg overflow-auto">
      <div className="text-center max-w-[640px] px-6 py-10">
        <img
          src="/logo.svg"
          alt="DataWeave Studio"
          width="64"
          height="64"
          className="mx-auto mb-5"
          style={{ filter: 'drop-shadow(0 10px 40px color-mix(in oklch, var(--accent) 30%, transparent))' }}
        />
        <h2 className="text-[22px] font-semibold text-content tracking-tight">Start transforming</h2>
        <p className="text-[13.5px] text-content-muted mt-2.5 mb-6 leading-relaxed">
          DataWeave Studio runs the real MuleSoft DW engine locally. Write a script,
          feed it a payload, and see the result — no cloud, no signup.
        </p>

        {showResume && (
          <button
            onClick={onResumeLast}
            className="inline-flex items-center gap-2 mb-5 px-3.5 h-9 rounded-md cursor-pointer transition-colors border"
            style={{
              background: 'var(--accent-dim)',
              borderColor: 'var(--accent-border)',
              color: 'var(--accent)',
            }}
            title={lastName ? 'Resume the last saved workspace' : 'Restore your unsaved in-progress draft'}
          >
            <Icons.Folder size={13} />
            <span className="text-[12.5px] font-medium">
              {lastName ? 'Resume last session' : 'Restore unsaved draft'}
            </span>
            {lastName && (
              <span className="font-mono text-[11px] opacity-80 truncate max-w-[220px]">· {lastName}</span>
            )}
            <span className="opacity-80">→</span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2.5 mb-2.5">
          <Card icon={<Icons.Plus size={14} />} label="Blank transform" desc="Empty %dw 2.0 script" shortcut="⌘N" onClick={onBlankTransform} />
          <Card icon={<Icons.Folder size={14} />} label="Open workspace" desc="Pick from saved workspaces" shortcut="⌘O" onClick={onOpenWorkspace} />
        </div>
        <div className="grid grid-cols-2 gap-2.5 mb-2.5">
          <Card icon={<Icons.Import size={14} />} label="Import cURL" desc="Paste a request, scaffold the script" shortcut="⌘⇧I" onClick={onImportCurl} />
          <Card icon={<Icons.Library size={14} />} label="From a snippet" desc="Map, filter, group templates" shortcut="⌘L" onClick={onOpenSnippets} />
        </div>
        <div className="grid grid-cols-2 gap-2.5 mb-2.5">
          <Card icon={<Icons.Import size={14} />} label="Import from Playground" desc="Open a .zip exported from DataWeave Playground" shortcut="" onClick={onImportPlayground} />
          <Card icon={<FlowIcon />} label="Message Flow" desc="Chain transforms with mock SF/DB connectors" shortcut="" onClick={onOpenFlowDesigner} />
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

function FlowIcon() {
  return <Icons.Flow size={14} />;
}

function Card({ icon, label, desc, shortcut, onClick }: { icon: React.ReactNode; label: string; desc: string; shortcut: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left p-3.5 bg-surface border border-line rounded-[9px] cursor-pointer hover:border-accent-border hover:bg-surface-2 transition-colors"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-accent">{icon}</span>
        <span className="text-[12.5px] font-medium text-content">{label}</span>
        <span className="flex-1" />
        <span className="text-[10px] text-content-faint font-mono">{shortcut}</span>
      </div>
      <div className="text-[11px] text-content-faint leading-snug">{desc}</div>
    </button>
  );
}
