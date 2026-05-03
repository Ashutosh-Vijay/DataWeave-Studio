import { useState } from 'react';
import { Icons } from './Icons';
import { MiniPreview } from './MiniPreview';

const FIRST_RUN_KEY = 'dw.firstRun.seen';

export function shouldShowFirstRun(): boolean {
  try { return localStorage.getItem(FIRST_RUN_KEY) !== 'true'; } catch { return false; }
}

export function markFirstRunSeen(): void {
  try { localStorage.setItem(FIRST_RUN_KEY, 'true'); } catch { /* ignore */ }
}

interface FirstRunPickerProps {
  initialTheme: 'dark' | 'light';
  initialLayout: 'workbench' | 'focus';
  onComplete: (choice: { theme: 'dark' | 'light'; layout: 'workbench' | 'focus' }) => void;
}

export function FirstRunPicker({ initialTheme, initialLayout, onComplete }: FirstRunPickerProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [layout, setLayout] = useState<'workbench' | 'focus'>(initialLayout);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 80%, transparent)', backdropFilter: 'blur(2px)' }}
    >
      <div className="w-full max-w-[1240px] bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden">
        {/* Window chrome with traffic lights */}
        <div className="h-9 shrink-0 flex items-center px-3.5 bg-rail border-b border-line">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
            <span className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
            <span className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
          </div>
          <span className="flex-1" />
          <span className="font-mono text-[10.5px] text-content-faint">DataWeave Studio · Welcome</span>
          <span className="flex-1" />
        </div>

        {/* Hero */}
        <div className="px-8 pt-7 pb-5 flex items-start gap-4">
          <img
            src="/logo.svg"
            alt="DataWeave Studio"
            width="48"
            height="48"
            className="shrink-0"
            style={{ filter: 'drop-shadow(0 8px 24px color-mix(in oklch, var(--accent) 25%, transparent))' }}
          />
          <div className="flex-1">
            <h1 className="text-[20px] font-semibold text-content tracking-tight leading-tight">
              Welcome to DataWeave Studio
            </h1>
            <p className="text-[12.5px] text-content-faint mt-1">
              Pick the layout and theme you like. You can change either anytime from Settings or ⌘K.
            </p>
          </div>
        </div>

        {/* Theme toggle */}
        <div className="px-8 pb-2">
          <div className="text-[10.5px] uppercase tracking-[0.6px] font-semibold text-content-faint mb-2">
            Theme
          </div>
          <div className="inline-flex p-0.5 rounded-md bg-surface-2 border border-line">
            {(['dark', 'light'] as const).map((t) => {
              const active = theme === t;
              return (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`h-7 px-3 inline-flex items-center gap-1.5 rounded-sm text-[12px] font-medium cursor-pointer transition-colors ${
                    active ? 'bg-surface-3 text-content' : 'text-content-faint hover:text-content-secondary'
                  }`}
                >
                  {t === 'dark' ? <Icons.Moon size={12} /> : <Icons.Sun size={12} />}
                  {t === 'dark' ? 'Dusk' : 'Paper'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Layout cards */}
        <div className="px-8 py-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[10.5px] uppercase tracking-[0.6px] font-semibold text-content-faint">
              Layout
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LayoutCard
              variant="workbench"
              theme={theme}
              active={layout === 'workbench'}
              recommended
              onClick={() => setLayout('workbench')}
              title="Workbench"
              desc="Icon rail + tabbed context"
              tags={['Discoverable', 'Everything in reach']}
            />
            <LayoutCard
              variant="focus"
              theme={theme}
              active={layout === 'focus'}
              onClick={() => setLayout('focus')}
              title="Focus"
              desc="Editor + output take the stage. Context opens as a right drawer on demand."
              tags={['Minimal chrome', 'Keyboard-first']}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-line flex items-center gap-2">
          <button
            onClick={() => onComplete({ theme: 'dark', layout: 'workbench' })}
            className="h-9 px-3.5 inline-flex items-center text-[12.5px] text-content-faint hover:text-content-secondary cursor-pointer rounded-md border border-line hover:bg-surface-2 transition-colors"
          >
            Skip, use defaults
          </button>
          <span className="flex-1" />
          <button
            onClick={() => onComplete({ theme, layout })}
            className="inline-flex items-center gap-1.5 h-9 pl-4 pr-3.5 rounded-md text-[13px] font-semibold cursor-pointer transition-colors"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
          >
            Start with {layout === 'workbench' ? 'Workbench' : 'Focus'}
            <span className="opacity-80">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function LayoutCard({
  variant, theme, active, recommended, onClick, title, desc, tags,
}: {
  variant: 'workbench' | 'focus';
  theme: 'dark' | 'light';
  active: boolean;
  recommended?: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  tags: string[];
}) {
  return (
    <button
      onClick={onClick}
      className={`relative text-left rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
        active ? 'border-accent shadow-lg' : 'border-line hover:border-line-secondary'
      }`}
      style={
        active
          ? { boxShadow: '0 0 0 4px color-mix(in oklch, var(--accent) 12%, transparent)' }
          : undefined
      }
    >
      {recommended && (
        <span
          className="absolute top-2.5 right-2.5 z-10 inline-flex items-center px-1.5 py-0.5 rounded-md font-mono text-[9.5px] font-bold tracking-wide"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
        >
          RECOMMENDED
        </span>
      )}

      {/* Mini preview */}
      <div className="h-[320px] p-4" style={{ background: theme === 'dark' ? '#1a1815' : '#f6f1e8' }}>
        <MiniPreview variant={variant} theme={theme} />
      </div>

      {/* Caption */}
      <div className="px-3.5 py-3 bg-surface border-t border-line">
        <div className="flex items-center gap-2">
          <div className="text-[13px] font-semibold text-content">{title}</div>
          <span className="flex-1" />
        </div>
        <div className="text-[11px] text-content-faint mt-0.5">{desc}</div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-1.5 h-4 rounded font-mono text-[9.5px] bg-surface-2 text-content-faint border border-line-subtle"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

