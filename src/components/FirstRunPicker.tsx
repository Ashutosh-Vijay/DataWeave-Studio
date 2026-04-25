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
      style={{ background: 'color-mix(in oklch, var(--bg) 80%, transparent)' }}
    >
      <div className="w-full max-w-[560px] bg-surface border border-line rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-3">
          <div className="flex items-center gap-2.5 mb-1">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center font-mono font-extrabold text-[12px]"
              style={{
                background: 'linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 60%, var(--violet)))',
                color: 'var(--accent-ink)',
              }}
            >
              dw
            </div>
            <div className="text-[15px] font-semibold text-content">Welcome to DataWeave Studio</div>
          </div>
          <div className="text-[12.5px] text-content-faint">Pick a starting look. You can change either anytime from the top bar.</div>
        </div>

        <div className="px-6 pb-2 space-y-5">
          {/* Theme */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-content-faint mb-2">Theme</div>
            <div className="grid grid-cols-2 gap-2.5">
              <ThemeCard
                active={theme === 'dark'}
                onClick={() => setTheme('dark')}
                title="Dusk"
                desc="Warm-dark neutral"
                bg="#1a1815"
                fg="#e9e2d6"
              />
              <ThemeCard
                active={theme === 'light'}
                onClick={() => setTheme('light')}
                title="Paper"
                desc="Warm cream light"
                bg="#f6f1e8"
                fg="#262320"
              />
            </div>
          </div>

          {/* Layout */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-content-faint mb-2">Layout</div>
            <div className="grid grid-cols-2 gap-2.5">
              <LayoutCard
                active={layout === 'workbench'}
                onClick={() => setLayout('workbench')}
                title="Workbench"
                desc="Sidebar + script + context + output"
                cols={4}
              />
              <LayoutCard
                active={layout === 'focus'}
                onClick={() => setLayout('focus')}
                title="Focus"
                desc="Just script and output"
                cols={2}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-line-subtle flex items-center gap-2 justify-end">
          <button
            onClick={() => onComplete({ theme, layout })}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md text-[12.5px] font-semibold cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            <Icons.Play size={11} />
            Get started
          </button>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({ active, onClick, title, desc, bg, fg }: { active: boolean; onClick: () => void; title: string; desc: string; bg: string; fg: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg overflow-hidden border-2 transition-colors cursor-pointer ${
        active ? 'border-accent' : 'border-line hover:border-line-secondary'
      }`}
    >
      <div style={{ background: bg, color: fg }} className="h-[68px] p-3 flex flex-col justify-between">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ background: '#22c08e' }} />
          <div className="w-2 h-2 rounded-full" style={{ background: '#9b8cf0' }} />
          <div className="w-2 h-2 rounded-full" style={{ background: '#d3a14f' }} />
        </div>
        <div className="font-mono text-[10px] opacity-70">{'%dw 2.0'}</div>
      </div>
      <div className="px-3 py-2 bg-surface">
        <div className="text-[12.5px] font-medium text-content">{title}</div>
        <div className="text-[10.5px] text-content-faint">{desc}</div>
      </div>
    </button>
  );
}

function LayoutCard({ active, onClick, title, desc, cols }: { active: boolean; onClick: () => void; title: string; desc: string; cols: number }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg overflow-hidden border-2 transition-colors cursor-pointer ${
        active ? 'border-accent' : 'border-line hover:border-line-secondary'
      }`}
    >
      <div className="h-[68px] p-2 bg-surface-2 flex gap-1">
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              background: i === cols - 1 ? 'color-mix(in oklch, var(--accent) 25%, var(--surface-3))' : 'var(--surface-3)',
            }}
          />
        ))}
      </div>
      <div className="px-3 py-2 bg-surface">
        <div className="text-[12.5px] font-medium text-content">{title}</div>
        <div className="text-[10.5px] text-content-faint">{desc}</div>
      </div>
    </button>
  );
}
