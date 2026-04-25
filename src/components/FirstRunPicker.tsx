import { useState } from 'react';
import { Icons } from './Icons';

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
      <div className="w-full max-w-[680px] bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden">
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
          <div
            className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center font-mono font-extrabold text-[18px]"
            style={{
              background: 'linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 55%, var(--violet)))',
              color: 'var(--accent-ink)',
              boxShadow: '0 8px 24px color-mix(in oklch, var(--accent) 25%, transparent)',
            }}
          >
            dw
          </div>
          <div className="flex-1">
            <h1 className="text-[20px] font-semibold text-content tracking-tight leading-tight">
              Welcome to DataWeave Studio
            </h1>
            <p className="text-[12.5px] text-content-faint mt-1">
              Pick a starting look. You can change either anytime from the top bar.
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
              desc="Editor + payload + output"
              tags={['Minimal chrome', 'Keyboard-first']}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-line flex items-center gap-2">
          <button
            onClick={() => onComplete({ theme, layout })}
            className="text-[11.5px] text-content-faint hover:text-content-secondary cursor-pointer"
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
      <div className="h-[148px] p-2.5" style={{ background: theme === 'dark' ? '#1a1815' : '#f6f1e8' }}>
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

function MiniPreview({ variant, theme }: { variant: 'workbench' | 'focus'; theme: 'dark' | 'light' }) {
  const surface = theme === 'dark' ? '#23201c' : '#fbf7ed';
  const surface2 = theme === 'dark' ? '#2a2622' : '#efe8d8';
  const line = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const ink = theme === 'dark' ? '#cdc5b4' : '#2d2a25';
  const faint = theme === 'dark' ? '#8b8478' : '#857d6e';

  // Common: top bar
  const TopBar = (
    <div
      style={{
        height: 14, background: surface, borderBottom: `1px solid ${line}`,
        display: 'flex', alignItems: 'center', gap: 4, padding: '0 5px', borderRadius: 3,
      }}
    >
      <div
        style={{
          width: 8, height: 8, borderRadius: 2,
          background: 'linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 55%, var(--violet)))',
        }}
      />
      <div style={{ flex: 1, height: 4, background: surface2, borderRadius: 2 }} />
      <div style={{ width: 14, height: 6, background: 'var(--accent)', borderRadius: 2 }} />
    </div>
  );

  if (variant === 'workbench') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {TopBar}
        <div style={{ flex: 1, display: 'flex', gap: 3, minHeight: 0 }}>
          {/* Icon rail */}
          <div style={{ width: 8, background: surface, borderRadius: 2, padding: '4px 1px', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
            <div style={{ width: 4, height: 4, background: 'var(--accent)', borderRadius: 1 }} />
            <div style={{ width: 4, height: 4, background: faint, borderRadius: 1, opacity: 0.5 }} />
            <div style={{ width: 4, height: 4, background: faint, borderRadius: 1, opacity: 0.5 }} />
          </div>
          {/* Sidebar */}
          <div style={{ width: 32, background: surface, borderRadius: 2, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 3, background: surface2, borderRadius: 1, width: '60%' }} />
            <div style={{ height: 4, background: 'var(--accent-dim)', borderRadius: 1, marginTop: 2 }} />
            <div style={{ height: 4, background: surface2, borderRadius: 1 }} />
            <div style={{ height: 4, background: surface2, borderRadius: 1 }} />
          </div>
          {/* Editor */}
          <div style={{ flex: 1.6, background: surface, borderRadius: 2, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <div style={{ width: 10, height: 4, background: 'var(--accent-dim)', borderRadius: 1 }} />
              <div style={{ flex: 1, height: 3, background: surface2, borderRadius: 1 }} />
            </div>
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '90%', marginTop: 2 }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '75%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '85%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '60%' }} />
            <div style={{ flex: 1 }} />
            <div style={{ height: 12, background: surface2, borderRadius: 1, marginTop: 2 }} />
          </div>
          {/* Context */}
          <div style={{ width: 38, background: surface, borderRadius: 2, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', gap: 2 }}>
              <div style={{ flex: 1, height: 3, background: ink, borderRadius: 1, opacity: 0.7 }} />
              <div style={{ flex: 1, height: 3, background: surface2, borderRadius: 1 }} />
              <div style={{ flex: 1, height: 3, background: surface2, borderRadius: 1 }} />
            </div>
            <div style={{ height: 2, background: surface2, borderRadius: 1 }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '80%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '60%' }} />
          </div>
          {/* Output */}
          <div style={{ flex: 1.25, background: surface, borderRadius: 2, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 3, background: 'var(--accent-dim)', borderRadius: 1, width: '40%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '90%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '70%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '85%' }} />
          </div>
        </div>
        {/* Status bar */}
        <div style={{ height: 6, background: surface, borderRadius: 2, display: 'flex', alignItems: 'center', padding: '0 4px', gap: 2 }}>
          <div style={{ width: 3, height: 3, background: 'var(--accent)', borderRadius: 99 }} />
          <div style={{ flex: 1, height: 2, background: surface2, borderRadius: 1 }} />
        </div>
      </div>
    );
  }

  // Focus
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {TopBar}
      <div style={{ flex: 1, display: 'flex', gap: 3, minHeight: 0 }}>
        {/* Editor + Payload column */}
        <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ flex: 1.5, background: surface, borderRadius: 2, padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 3, background: surface2, borderRadius: 1, width: '30%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '90%', marginTop: 2 }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '75%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '85%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '65%' }} />
          </div>
          <div style={{ flex: 1, background: surface, borderRadius: 2, padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 3, background: surface2, borderRadius: 1, width: '25%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '80%', marginTop: 2 }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '60%' }} />
          </div>
        </div>
        {/* Output */}
        <div style={{ flex: 1, background: surface, borderRadius: 2, padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <div style={{ flex: 1, height: 3, background: ink, borderRadius: 1, opacity: 0.7 }} />
            <div style={{ width: 8, height: 3, background: 'var(--accent-dim)', borderRadius: 1 }} />
          </div>
          <div style={{ height: 2, background: surface2, borderRadius: 1, width: '90%', marginTop: 2 }} />
          <div style={{ height: 2, background: surface2, borderRadius: 1, width: '70%' }} />
          <div style={{ height: 2, background: surface2, borderRadius: 1, width: '85%' }} />
          <div style={{ height: 2, background: surface2, borderRadius: 1, width: '55%' }} />
        </div>
      </div>
      {/* Status bar */}
      <div style={{ height: 6, background: surface, borderRadius: 2, display: 'flex', alignItems: 'center', padding: '0 4px', gap: 2 }}>
        <div style={{ width: 3, height: 3, background: 'var(--accent)', borderRadius: 99 }} />
        <div style={{ flex: 1, height: 2, background: surface2, borderRadius: 1 }} />
      </div>
    </div>
  );
}
