import { kbd } from '../shortcuts';
import { Icons } from './Icons';
import { logoUrl } from '../assets';
import { SeasonalEffects } from './SeasonalEffects';
import { Season } from '../seasons';
import type { Tool } from './ToolsLauncher';

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
  onOpenWorkspace: () => void;
  onStartTour: () => void;
  /** The tools pinned to the rail, in rail order; they fill the start cards. */
  railTools: Tool[];
  onOpenAllTools: () => void;
  /** DataWeave Academy, for people who have never written DataWeave. */
  onOpenAcademy: () => void;
  lastWorkspace: string | null;
  /** True when no saved file exists but a recoverable in-progress draft does. */
  hasDraftSession?: boolean;
  onResumeLast: () => void;
  /** Owned by App, which already tracks the Settings toggle. */
  season: Season | null;
}

export function EmptyState({
  onBlankTransform, onOpenWorkspace, onStartTour, railTools, onOpenAllTools,
  onOpenAcademy, lastWorkspace, hasDraftSession, onResumeLast, season,
}: EmptyStateProps) {
  const lastName = lastWorkspace ? lastWorkspace.replace(/\.json$/, '').replace(/\.dwstudio$/, '') : null;
  const showResume = !!lastName || !!hasDraftSession;
  // The widest empty space in the whole app: a 640px card in the middle of a
  // window that is usually 1500 or more. A festival gets the gutters either
  // side — they are hundreds of pixels of nothing, and nothing is exactly what
  // decoration needs. The card keeps its own clear air.
  const gutter = 'calc(50% - 400px)';
  return (
    <div className="flex-1 flex items-center justify-center bg-bg overflow-auto relative">
      {season && (
        <>
          <div className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: gutter }}>
            <SeasonalEffects variants={season.effects} intensity="full" />
          </div>
          <div className="absolute inset-y-0 right-0 pointer-events-none" style={{ width: gutter }}>
            <SeasonalEffects variants={season.effects} intensity="full" />
          </div>
        </>
      )}
      <div className="relative text-center max-w-[640px] px-6 py-10">
        <img
          src={logoUrl}
          alt="DataWeave Studio"
          width="64"
          height="64"
          className="mx-auto mb-5"
          style={{ filter: 'drop-shadow(0 10px 40px color-mix(in oklch, var(--accent) 30%, transparent))' }}
        />
        <h2 className="text-[22px] font-semibold text-content tracking-tight">Start transforming</h2>
        <p className="text-[13.5px] text-content-muted mt-2.5 mb-6 leading-relaxed">
          Write a script, give it a payload,
          and see the result as you type.
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

        <button
          onClick={onOpenAcademy}
          className="w-full mb-2.5 flex items-center gap-3 px-4 py-3 rounded-lg border text-left cursor-pointer transition-colors"
          style={{ borderColor: 'var(--accent-border)', background: 'var(--accent-dim)' }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
            <path d="M22 9 12 4 2 9l10 5 10-5Z" /><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
          </svg>
          <span className="flex-1">
            <span className="block text-[13px] font-semibold text-content">New to DataWeave? Start here</span>
            <span className="block text-[11.5px] text-content-muted">DataWeave Academy: from "what is a payload?" to real transforms</span>
          </span>
          <Icons.ChevronRight size={14} style={{ color: 'var(--accent)' }} />
        </button>
        <div className="grid grid-cols-2 gap-2.5 mb-2.5">
          <Card icon={<Icons.Plus size={14} />} label="Blank transform" desc="Empty %dw 2.0 script" shortcut={kbd("⌘N")} onClick={onBlankTransform} />
          <Card icon={<Icons.Folder size={14} />} label="Open workspace" desc="Pick from saved workspaces" shortcut={kbd("⌘O")} onClick={onOpenWorkspace} />
        </div>
        {/* Your rail's tools, in its order: pin and reorder in All tools and
            this follows. The Academy already has the banner above. */}
        <div className="grid grid-cols-2 gap-2.5 mb-2.5">
          {railTools.filter((t) => t.id !== 'academy').slice(0, 5).map((t) => (
            <Card key={t.id} icon={<span className="[&>svg]:w-[14px] [&>svg]:h-[14px]">{t.icon}</span>} label={t.label} desc={t.desc} shortcut="" onClick={t.run} />
          ))}
          <Card icon={<Icons.More size={14} />} label="All tools" desc="Every tool, and pin the ones you want here and on the rail" shortcut="" onClick={onOpenAllTools} />
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
