import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Icons } from './Icons';
import { MIME_OPTIONS, MimeType } from '../types';
import { useTheme } from '../ThemeContext';

type Section = 'appearance' | 'general' | 'runtime' | 'editor' | 'shortcuts' | 'about';

interface SettingsScreenProps {
  open: boolean;
  onClose: () => void;
  appVersion: string;
  layout: 'workbench' | 'focus';
  onLayoutChange: (l: 'workbench' | 'focus') => void;
  payloadMimeType: MimeType;
  onPayloadMimeTypeChange: (m: MimeType) => void;
  classpath: string[];
  onClasspathChange: (cp: string[]) => void;
  timeoutMs: number;
  onTimeoutMsChange: (ms: number) => void;
  onShowTour: () => void;
  onShowAbout: () => void;
}

const SECTIONS: { id: Section; label: string; icon: keyof typeof Icons }[] = [
  { id: 'appearance', label: 'Appearance', icon: 'Sun' },
  { id: 'general', label: 'General', icon: 'Settings' },
  { id: 'runtime', label: 'Runtime', icon: 'Activity' },
  { id: 'editor', label: 'Editor', icon: 'Braces' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'Command' },
  { id: 'about', label: 'About', icon: 'Help' },
];

export function SettingsScreen(props: SettingsScreenProps) {
  const { open: isOpen, onClose, appVersion, layout, onLayoutChange,
    payloadMimeType, onPayloadMimeTypeChange,
    classpath, onClasspathChange,
    timeoutMs, onTimeoutMsChange,
    onShowTour, onShowAbout } = props;
  const { isDark, toggle } = useTheme();
  const [section, setSection] = useState<Section>('appearance');

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 70%, transparent)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-xl shadow-2xl w-full max-w-[920px] h-[640px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="h-11 shrink-0 flex items-center px-4 border-b border-line">
          <Icons.Settings size={14} />
          <span className="ml-2 text-[13px] font-semibold text-content flex-1">Settings</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer"
            aria-label="Close"
          >
            <Icons.X size={14} />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Nav sidebar */}
          <div className="w-[180px] shrink-0 bg-rail border-r border-line py-3 px-2">
            {SECTIONS.map((s) => {
              const active = section === s.id;
              const Icon = Icons[s.icon];
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`relative w-full h-8 px-2.5 rounded-md flex items-center gap-2 text-[12.5px] cursor-pointer transition-colors ${
                    active ? 'bg-surface-2 text-content font-medium' : 'text-content-faint hover:text-content-secondary'
                  }`}
                >
                  {active && <span className="absolute -left-2 top-1.5 bottom-1.5 w-0.5 bg-accent rounded-sm" />}
                  <Icon size={13} />
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-7 bg-bg">
            {section === 'appearance' && (
              <AppearancePanel
                isDark={isDark}
                onToggleTheme={toggle}
                layout={layout}
                onLayoutChange={onLayoutChange}
              />
            )}
            {section === 'general' && (
              <SectionWrap title="General" desc="Workspace and app behavior">
                <Group label="Welcome">
                  <Row label="Show guided tour" desc="Walk through the editor, payload, context, and output panels.">
                    <button
                      onClick={onShowTour}
                      className="h-7 px-3 rounded-md border border-line text-[12px] text-content-secondary hover:bg-surface-2 cursor-pointer"
                    >
                      Show tour
                    </button>
                  </Row>
                </Group>
              </SectionWrap>
            )}
            {section === 'runtime' && (
              <RuntimePanel
                payloadMimeType={payloadMimeType}
                onPayloadMimeTypeChange={onPayloadMimeTypeChange}
                classpath={classpath}
                onClasspathChange={onClasspathChange}
                timeoutMs={timeoutMs}
                onTimeoutMsChange={onTimeoutMsChange}
              />
            )}
            {section === 'editor' && (
              <SectionWrap title="Editor" desc="Script editor preferences">
                <Group label="Behavior">
                  <Row label="Auto-close brackets and quotes" desc="Inserts closing bracket/quote as you type.">
                    <ReadOnlyValue>Enabled</ReadOnlyValue>
                  </Row>
                  <Row label="Snippet suggestions" desc="DataWeave 2.0 keyword and operator completions.">
                    <ReadOnlyValue>Enabled</ReadOnlyValue>
                  </Row>
                  <Row label="Word wrap" desc="Wrap long lines instead of horizontal scroll.">
                    <ReadOnlyValue>Enabled</ReadOnlyValue>
                  </Row>
                </Group>
              </SectionWrap>
            )}
            {section === 'shortcuts' && (
              <SectionWrap title="Keyboard shortcuts" desc="Use ⌘/ at any time to bring this up as a floating reference.">
                <ShortcutsList />
              </SectionWrap>
            )}
            {section === 'about' && (
              <AboutPanel appVersion={appVersion} onOpenAbout={onShowAbout} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionWrap({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[640px] space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold text-content tracking-tight">{title}</h2>
        {desc && <p className="text-[12px] text-content-faint mt-1">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[10.5px] uppercase tracking-[0.6px] font-semibold text-content-faint">{label}</div>
      <div className="bg-surface border border-line rounded-lg overflow-hidden">{children}</div>
    </div>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-line last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] text-content">{label}</div>
        {desc && <div className="text-[11px] text-content-faint mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ReadOnlyValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] text-content-faint px-2 py-1 rounded bg-surface-2 border border-line-subtle">
      {children}
    </span>
  );
}

function AppearancePanel({
  isDark, onToggleTheme, layout, onLayoutChange,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
  layout: 'workbench' | 'focus';
  onLayoutChange: (l: 'workbench' | 'focus') => void;
}) {
  return (
    <SectionWrap title="Appearance" desc="Theme, layout, and density">
      <Group label="Theme">
        <Row label="Color mode" desc="Dusk (warm dark) or Paper (warm light).">
          <div className="inline-flex p-0.5 rounded-md bg-surface-2 border border-line">
            {(['dark', 'light'] as const).map((t) => {
              const active = isDark === (t === 'dark');
              return (
                <button
                  key={t}
                  onClick={() => { if (!active) onToggleTheme(); }}
                  className={`h-7 px-3 inline-flex items-center gap-1.5 rounded-sm text-[12px] cursor-pointer transition-colors ${
                    active ? 'bg-surface-3 text-content font-medium' : 'text-content-faint'
                  }`}
                >
                  {t === 'dark' ? <Icons.Moon size={12} /> : <Icons.Sun size={12} />}
                  {t === 'dark' ? 'Dusk' : 'Paper'}
                </button>
              );
            })}
          </div>
        </Row>
      </Group>

      <Group label="Layout">
        <Row label="Default layout" desc="Workbench shows sidebar + tabbed context. Focus hides chrome.">
          <div className="inline-flex p-0.5 rounded-md bg-surface-2 border border-line">
            {(['workbench', 'focus'] as const).map((l) => {
              const active = layout === l;
              return (
                <button
                  key={l}
                  onClick={() => onLayoutChange(l)}
                  className={`h-7 px-3 inline-flex items-center gap-1.5 rounded-sm text-[12px] cursor-pointer transition-colors ${
                    active ? 'bg-surface-3 text-content font-medium' : 'text-content-faint'
                  }`}
                >
                  <Icons.Panel size={12} />
                  {l === 'workbench' ? 'Workbench' : 'Focus'}
                </button>
              );
            })}
          </div>
        </Row>
      </Group>
    </SectionWrap>
  );
}

function RuntimePanel({
  payloadMimeType, onPayloadMimeTypeChange,
  classpath, onClasspathChange,
  timeoutMs, onTimeoutMsChange,
}: {
  payloadMimeType: MimeType;
  onPayloadMimeTypeChange: (m: MimeType) => void;
  classpath: string[];
  onClasspathChange: (cp: string[]) => void;
  timeoutMs: number;
  onTimeoutMsChange: (ms: number) => void;
}) {
  return (
    <SectionWrap title="Runtime" desc="DataWeave CLI execution settings">
      <Group label="Execution">
        <Row label="Default input format" desc="MIME type used for the payload pane.">
          <select
            value={payloadMimeType}
            onChange={(e) => onPayloadMimeTypeChange(e.target.value as MimeType)}
            className="h-7 bg-surface-2 border border-line rounded-md px-2 text-[12px] text-content focus:outline-none focus:border-accent cursor-pointer"
          >
            {MIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </Row>
        <Row label="Timeout (ms)" desc="0 = no timeout. Useful for long-running transformations.">
          <input
            type="number"
            min={0}
            step={1000}
            value={timeoutMs}
            onChange={(e) => onTimeoutMsChange(Number(e.target.value))}
            className="h-7 w-[120px] bg-surface-2 border border-line rounded-md px-2 text-[12px] text-content focus:border-accent focus:outline-none"
          />
        </Row>
      </Group>

      <Group label="Classpath">
        <div className="px-4 py-3 border-b border-line flex items-center gap-2">
          <span className="flex-1 text-[12px] text-content-faint">
            Add directories or JAR files for custom modules.
          </span>
          <button
            onClick={async () => {
              const selected = await open({ multiple: true, directory: true });
              if (selected) {
                const entries = Array.isArray(selected) ? selected : [selected];
                onClasspathChange([...classpath, ...entries.filter((e) => !classpath.includes(e))]);
              }
            }}
            className="h-7 px-2.5 rounded-md border border-line text-[11.5px] text-content-secondary hover:bg-surface-2 cursor-pointer"
          >
            + Directory
          </button>
          <button
            onClick={async () => {
              const selected = await open({
                multiple: true,
                directory: false,
                filters: [{ name: 'JAR / DWL', extensions: ['jar', 'dwl'] }],
              });
              if (selected) {
                const entries = Array.isArray(selected) ? selected : [selected];
                onClasspathChange([...classpath, ...entries.filter((e) => !classpath.includes(e))]);
              }
            }}
            className="h-7 px-2.5 rounded-md border border-line text-[11.5px] text-content-secondary hover:bg-surface-2 cursor-pointer"
          >
            + JAR
          </button>
        </div>
        {classpath.length === 0 ? (
          <div className="px-4 py-4 text-[11.5px] text-content-ghost italic">No classpath entries.</div>
        ) : (
          <div className="max-h-[220px] overflow-y-auto">
            {classpath.map((entry, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-2 border-b border-line-subtle last:border-b-0 group">
                <span className="font-mono text-[11px] text-content-secondary truncate flex-1" title={entry}>
                  {entry}
                </span>
                <button
                  onClick={() => onClasspathChange(classpath.filter((_, j) => j !== i))}
                  className="text-content-ghost hover:text-err opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-1"
                  aria-label="Remove"
                >
                  <Icons.X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Group>
    </SectionWrap>
  );
}

function ShortcutsList() {
  const groups = [
    { title: 'Run & execute', items: [['Run script', '⌘ ↵'], ['Toggle auto-run', '⌘ ⇧ A']] },
    { title: 'Workspace', items: [['Save', '⌘ S'], ['New', '⌘ N']] },
    { title: 'Navigation', items: [['Command palette', '⌘ K'], ['Toggle sidebar', '⌘ B'], ['Workbench', '⌘ 1'], ['Focus', '⌘ 2']] },
    { title: 'Appearance', items: [['Toggle theme', '⌘ ⇧ T'], ['Open settings', '⌘ ,']] },
    { title: 'Tools', items: [['Shortcuts', '⌘ /'], ['Import cURL', '⌘ ⇧ I'], ['Secure properties', '⌘ ⇧ E']] },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5">
      {groups.map((g) => (
        <div key={g.title} className="space-y-1.5">
          <div className="text-[10.5px] uppercase tracking-[0.6px] font-semibold text-content-faint">{g.title}</div>
          <div className="space-y-1">
            {g.items.map(([label, keys], i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <span className="flex-1 text-[12px] text-content-secondary">{label}</span>
                <span className="font-mono text-[10.5px] text-content-faint px-1.5 h-5 inline-flex items-center rounded bg-surface-3 border border-line-secondary">
                  {keys}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AboutPanel({ appVersion, onOpenAbout }: { appVersion: string; onOpenAbout: () => void }) {
  return (
    <SectionWrap title="About">
      <div className="flex items-center gap-5 p-6 bg-surface border border-line rounded-lg">
        <div
          className="w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center font-mono font-extrabold text-[26px]"
          style={{
            background: 'linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 55%, var(--violet)))',
            color: 'var(--accent-ink)',
            boxShadow: '0 8px 24px color-mix(in oklch, var(--accent) 25%, transparent)',
          }}
        >
          dw
        </div>
        <div className="flex-1">
          <div className="text-[18px] font-semibold text-content tracking-tight">DataWeave Studio</div>
          <div className="text-[12px] text-content-faint mt-0.5">
            Offline desktop IDE for MuleSoft DataWeave 2.0
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span
              className="inline-flex items-center gap-1.5 h-5 px-2 rounded font-mono text-[10.5px]"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
            >
              <Icons.Dot size={7} /> v{appVersion || '—'}
            </span>
            <button
              onClick={onOpenAbout}
              className="text-[11.5px] text-accent hover:text-accent-hover cursor-pointer"
            >
              View full details →
            </button>
          </div>
        </div>
      </div>
    </SectionWrap>
  );
}
