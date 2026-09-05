import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { logoUrl } from '../assets';
import { Icons } from './Icons';
import { TARGETS } from '../targetRuntime';
import { SHORTCUT_GROUPS } from '../shortcuts';
import { ConfirmDialog } from './ConfirmDialog';
import { MIME_OPTIONS, MimeType } from '../types';
import { notifyEditorFontChanged } from '../hooks/useEditorFont';
import { useTheme } from '../ThemeContext';
import { MiniPreview } from './MiniPreview';
import { resetFeatureIntros } from '../featureIntros';
import { toast } from './Toast';

type Section = 'appearance' | 'general' | 'runtime' | 'editor' | 'shortcuts' | 'advanced' | 'about';

interface SettingsScreenProps {
  /** App-wide default target runtime. '' = latest, no version gating. */
  targetRuntime: string;
  onTargetRuntimeChange: (level: string) => void;
  /** Let each workspace carry its own target instead of using the app default. */
  perWorkspaceTarget: boolean;
  onPerWorkspaceTargetChange: (on: boolean) => void;
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
  onRestartEngine: () => void;
  /** Section to land on. Set when something specific sent the user here — the
   *  status bar's target chip opens straight onto Runtime. */
  initialSection?: Section;
}

const SECTIONS: { id: Section; label: string; icon: keyof typeof Icons; keywords: string[] }[] = [
  { id: 'appearance', label: 'Appearance', icon: 'Panel', keywords: ['theme', 'dark', 'light', 'dusk', 'paper', 'accent', 'color', 'layout', 'workbench', 'focus', 'playground', 'compact', 'density'] },
  { id: 'general',    label: 'General',    icon: 'Settings', keywords: ['startup', 'autosave', 'tour', 'updates', 'last workspace'] },
  { id: 'runtime',    label: 'Runtime',    icon: 'Terminal', keywords: ['engine', 'restart', 'jvm', 'java', 'timeout', 'classpath', 'jar', 'mime', 'input format', 'target', 'mule', 'version', 'compatibility'] },
  { id: 'editor',     label: 'Editor',     icon: 'Braces', keywords: ['font', 'size', 'line height', 'tab', 'word wrap', 'bracket', 'minimap'] },
  { id: 'shortcuts',  label: 'Shortcuts',  icon: 'Command', keywords: ['keyboard', 'hotkey', 'binding'] },
  { id: 'advanced',   label: 'Advanced',   icon: 'Activity', keywords: ['data location', 'diagnostics', 'logging', 'reset', 'danger', 'delete'] },
  { id: 'about',      label: 'About',      icon: 'Help', keywords: ['version', 'build', 'credits'] },
];

const ACCENT_SWATCHES: { id: string; hue: number; chroma: number; name: string }[] = [
  { id: 'emerald', hue: 158, chroma: 0.15, name: 'Emerald' },
  { id: 'sky',     hue: 220, chroma: 0.13, name: 'Sky' },
  { id: 'violet',  hue: 290, chroma: 0.14, name: 'Violet' },
  { id: 'amber',   hue: 80,  chroma: 0.14, name: 'Amber' },
  { id: 'rose',    hue: 20,  chroma: 0.18, name: 'Rose' },
];

export function SettingsScreen(props: SettingsScreenProps) {
  const { open: isOpen, onClose, appVersion, layout, onLayoutChange,
    payloadMimeType, onPayloadMimeTypeChange,
    classpath, onClasspathChange,
    timeoutMs, onTimeoutMsChange,
    targetRuntime, onTargetRuntimeChange,
    perWorkspaceTarget, onPerWorkspaceTargetChange,
    onShowTour, onShowAbout, onRestartEngine } = props;
  const { isDark, pref, setPref, matchVsCode, setMatchVsCode, inVsCode } = useTheme();
  const [section, setSection] = useState<Section>(props.initialSection ?? 'appearance');
  // A later open with a different target section has to move — the state is
  // already initialised by then.
  useEffect(() => {
    if (isOpen && props.initialSection) setSection(props.initialSection);
  }, [isOpen, props.initialSection]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const visibleSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter(s =>
      s.label.toLowerCase().includes(q) || s.keywords.some(k => k.includes(q))
    );
  }, [search]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 70%, transparent)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-xl shadow-2xl w-full max-w-[1000px] h-[680px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="h-11 shrink-0 flex items-center gap-2.5 px-4 border-b border-line bg-surface">
          <Icons.Settings size={15} />
          <span className="text-[14px] font-semibold text-content">Settings</span>
          <span className="flex-1" />
          <div className="hidden md:flex items-center gap-2 h-7 px-2.5 bg-surface-2 border border-line rounded-md w-[240px]">
            <Icons.Search size={13} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings…"
              className="flex-1 bg-transparent outline-none text-[12.5px] text-content placeholder-content-faint"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-content-faint hover:text-content cursor-pointer" aria-label="Clear search">
                <Icons.X size={11} />
              </button>
            )}
          </div>
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
          <div className="w-[220px] shrink-0 bg-surface border-r border-line py-3.5 px-2.5 overflow-y-auto">
            {visibleSections.map((s) => {
              const active = section === s.id;
              const Icon = Icons[s.icon];
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`relative w-full px-2.5 py-1.5 my-px rounded-md flex items-center gap-2.5 text-[13px] cursor-pointer transition-colors ${
                    active ? 'bg-surface-3 text-content font-medium' : 'text-content-secondary hover:text-content'
                  }`}
                >
                  {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent rounded-sm" />}
                  <span className="text-content-faint inline-flex"><Icon size={14} /></span>
                  {s.label}
                </button>
              );
            })}
            {visibleSections.length === 0 && (
              <div className="px-2 py-3 text-[11.5px] text-content-faint italic">No matches.</div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-10 py-7 bg-bg">
            {section === 'appearance' && (
              <AppearancePanel isDark={isDark} pref={pref} setPref={setPref} matchVsCode={matchVsCode} setMatchVsCode={setMatchVsCode} inVsCode={inVsCode} layout={layout} onLayoutChange={onLayoutChange} />
            )}
            {section === 'general' && <GeneralPanel onShowTour={onShowTour} />}
            {section === 'runtime' && (
              <RuntimePanel
                targetRuntime={targetRuntime}
                onTargetRuntimeChange={onTargetRuntimeChange}
                perWorkspaceTarget={perWorkspaceTarget}
                onPerWorkspaceTargetChange={onPerWorkspaceTargetChange}
                payloadMimeType={payloadMimeType}
                onPayloadMimeTypeChange={onPayloadMimeTypeChange}
                classpath={classpath}
                onClasspathChange={onClasspathChange}
                timeoutMs={timeoutMs}
                onTimeoutMsChange={onTimeoutMsChange}
                onRestartEngine={onRestartEngine}
              />
            )}
            {section === 'editor' && <EditorPanel />}
            {section === 'shortcuts' && (
              <SectionWrap title="Keyboard shortcuts" desc="Press ⌘/ at any time to bring this up as a floating reference. Use Ctrl on Windows/Linux.">
                <ShortcutsList />
              </SectionWrap>
            )}
            {section === 'advanced' && <AdvancedPanel />}
            {section === 'about' && <AboutPanel appVersion={appVersion} onOpenAbout={onShowAbout} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Primitives ---------- */

function SectionWrap({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[680px] space-y-9">
      <div>
        <h2 className="text-[18px] font-semibold text-content tracking-tight">{title}</h2>
        {desc && <p className="text-[12.5px] text-content-muted mt-1 leading-relaxed">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Group({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold text-content">{title}</h3>
      {desc && <p className="text-[12px] text-content-muted mt-1">{desc}</p>}
      <div className={desc ? 'mt-4' : 'mt-3.5'}>{children}</div>
    </div>
  );
}

function SRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-5 py-3.5 border-t border-line-subtle first:border-t-0">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-content font-medium">{label}</div>
        {desc && <div className="text-[11.5px] text-content-muted mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className="relative w-[34px] h-5 rounded-full cursor-pointer transition-colors"
      style={{
        background: on ? 'var(--accent)' : 'var(--surface-3)',
        border: `1px solid ${on ? 'var(--accent-border)' : 'var(--line)'}`,
      }}
    >
      <span
        className="absolute top-px w-4 h-4 rounded-full transition-all"
        style={{
          left: on ? 15 : 1,
          background: on ? 'var(--bg)' : 'var(--content)',
        }}
      />
    </button>
  );
}

function SelectInput({ value, options, onChange, width }: { value: string; options: string[]; onChange: (v: string) => void; width?: number }) {
  return (
    <div className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 pl-2.5 pr-7 rounded-md bg-surface-2 border border-line text-[12.5px] text-content-secondary focus:outline-none focus:border-accent cursor-pointer appearance-none"
        style={{ width: width || 'auto' }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-content-faint">
        <Icons.ChevronDown size={11} />
      </span>
    </div>
  );
}

function OutlineBtn({ children, onClick, danger }: { children: React.ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="h-7 px-3 inline-flex items-center gap-1.5 rounded-md border text-[12px] cursor-pointer hover:bg-surface-2"
      style={{
        borderColor: danger ? 'color-mix(in oklch, var(--err) 40%, transparent)' : 'var(--line)',
        color: danger ? 'var(--err)' : 'var(--content-secondary)',
      }}
    >
      {children}
    </button>
  );
}

/* ---------- Panels ---------- */

function AppearancePanel({
  isDark, pref, setPref, matchVsCode, setMatchVsCode, inVsCode, layout, onLayoutChange,
}: {
  isDark: boolean;
  pref: 'dark' | 'light' | 'system';
  setPref: (p: 'dark' | 'light' | 'system') => void;
  matchVsCode: boolean;
  setMatchVsCode: (v: boolean) => void;
  inVsCode: boolean;
  layout: 'workbench' | 'focus';
  onLayoutChange: (l: 'workbench' | 'focus') => void;
}) {
  const [accent, setAccent] = useState<string>(() => {
    try { return localStorage.getItem('dw.accent') || 'emerald'; } catch { return 'emerald'; }
  });
  const [compact, setCompact] = useState<boolean>(() => {
    try { return localStorage.getItem('dw.compact') === '1'; } catch { return false; }
  });
  const [showLineNums, setShowLineNums] = useState<boolean>(() => {
    try { return localStorage.getItem('dw.lineNumbers') !== '0'; } catch { return true; }
  });

  const applyAccent = (id: string) => {
    setAccent(id);
    const sw = ACCENT_SWATCHES.find(s => s.id === id);
    if (!sw) return;
    const root = document.documentElement;
    const lightness = isDark ? 72 : 55;
    const hoverL = isDark ? 78 : 50;
    root.style.setProperty('--accent', `oklch(${lightness}% ${sw.chroma} ${sw.hue})`);
    root.style.setProperty('--accent-hover', `oklch(${hoverL}% ${sw.chroma} ${sw.hue})`);
    root.style.setProperty('--accent-dim', `oklch(${lightness}% ${sw.chroma} ${sw.hue} / 0.14)`);
    root.style.setProperty('--accent-border', `oklch(${lightness}% ${sw.chroma} ${sw.hue} / 0.32)`);
    try { localStorage.setItem('dw.accent', id); } catch { /* ignore */ }
    // Notify Monaco editors to re-bake their themes — the cursor, selection,
    // and suggest-widget highlight color all live inside Monaco's cached
    // theme definition and don't pick up CSS-var changes on their own.
    window.dispatchEvent(new CustomEvent('dw:accent-changed'));
  };

  return (
    <SectionWrap title="Appearance" desc="Theme, layout, accent, and density">
      <Group title="Layout" desc="Pick how the app is arranged. Both layouts share the same features.">
        <div className="grid grid-cols-2 gap-3.5">
          {(['workbench', 'focus'] as const).map((id) => {
            const selected = layout === id;
            const name = id === 'workbench' ? 'Workbench' : 'Playground';
            const desc = id === 'workbench' ? 'Sidebar · tabs · tests' : 'Clean three-pane';
            return (
              <button
                key={id}
                onClick={() => onLayoutChange(id)}
                className="relative text-left rounded-[10px] p-2.5 cursor-pointer transition-shadow"
                style={{
                  background: 'var(--surface)',
                  border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--line)'}`,
                  boxShadow: selected ? '0 6px 20px color-mix(in oklch, var(--accent) 20%, transparent)' : 'none',
                }}
              >
                {selected && (
                  <span
                    className="absolute top-3.5 right-3.5 w-[18px] h-[18px] rounded-full flex items-center justify-center"
                    style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                )}
                <div
                  className="rounded-md overflow-hidden p-2"
                  style={{ aspectRatio: '1.6 / 1', border: '1px solid var(--line-subtle)', background: isDark ? '#1a1815' : '#f6f1e8' }}
                >
                  <MiniPreview variant={id} theme={isDark ? 'dark' : 'light'} />
                </div>
                <div className="px-0.5 pt-2.5">
                  <div className="text-[13.5px] font-semibold text-content">{name}</div>
                  <div className="text-[11.5px] text-content-muted mt-0.5">{desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Theme">
        {inVsCode && (
          <SRow label="Match VS Code theme" desc="Use your active VS Code color theme — surfaces, text, and accent — instead of the app's own.">
            <Toggle on={matchVsCode} onChange={setMatchVsCode} />
          </SRow>
        )}
        {matchVsCode ? (
          <div className="text-[11.5px] text-content-faint mt-1">
            The app is following your VS Code color theme — currently {isDark ? 'dark' : 'light'}. Switch your theme in VS Code and it re-skins instantly.
          </div>
        ) : (
          <>
            <div className="inline-flex p-[3px] rounded-[8px] bg-surface-2 border border-line gap-0.5">
              {([
                ['dark', 'Dusk', <Icons.Moon size={12} key="d" />],
                ['light', 'Paper', <Icons.Sun size={12} key="l" />],
                ['system', 'System', <Icons.Activity size={12} key="s" />],
              ] as const).map(([id, label, icon]) => {
                const active = pref === id;
                return (
                  <button
                    key={id as string}
                    onClick={() => setPref(id as 'dark' | 'light' | 'system')}
                    className="inline-flex items-center gap-1.5 px-3.5 h-[26px] rounded-md text-[12.5px] font-medium cursor-pointer transition-colors"
                    style={{
                      background: active ? 'var(--surface-3)' : 'transparent',
                      color: active ? 'var(--content)' : 'var(--content-muted)',
                    }}
                  >
                    {icon} {label}
                  </button>
                );
              })}
            </div>
            {pref === 'system' && (
              <div className="text-[11.5px] text-content-faint mt-2">
                Following {inVsCode ? 'VS Code' : 'OS'} appearance — currently {isDark ? 'Dusk' : 'Paper'}.
              </div>
            )}
          </>
        )}
      </Group>

      {!matchVsCode && (
      <Group title="Accent color">
        <div className="flex gap-2.5">
          {ACCENT_SWATCHES.map((s) => {
            const active = accent === s.id;
            const lightness = isDark ? 72 : 55;
            const swatchColor = `oklch(${lightness}% ${s.chroma} ${s.hue})`;
            return (
              <button
                key={s.id}
                onClick={() => applyAccent(s.id)}
                className="text-center cursor-pointer"
                title={s.name}
              >
                <span
                  className="block w-9 h-9 rounded-[10px] transition-all"
                  style={{
                    background: swatchColor,
                    border: active ? '2px solid var(--content)' : '2px solid transparent',
                    boxShadow: active ? `0 0 0 2px var(--bg), 0 0 0 3px ${swatchColor}` : 'none',
                  }}
                />
                <span className="block text-[10.5px] text-content-faint mt-1.5">{s.name}</span>
              </button>
            );
          })}
        </div>
      </Group>
      )}

      <Group title="Density">
        <SRow label="Compact mode" desc="Reduce padding in panels and rows.">
          <Toggle on={compact} onChange={(v) => { setCompact(v); try { localStorage.setItem('dw.compact', v ? '1' : '0'); } catch {} }} />
        </SRow>
        <SRow label="Show line numbers in output">
          <Toggle on={showLineNums} onChange={(v) => { setShowLineNums(v); try { localStorage.setItem('dw.lineNumbers', v ? '1' : '0'); } catch {} }} />
        </SRow>
      </Group>
    </SectionWrap>
  );
}

function GeneralPanel({ onShowTour }: { onShowTour: () => void }) {
  // The old Startup/Autosave toggles were placebos — nothing read their keys.
  // Update-check lives in Advanced > Privacy (dw.updateCheck, actually wired),
  // auto-run is the header's Auto button (persisted), drafts always save.
  return (
    <SectionWrap title="General" desc="Workspace and app behavior">
      <Group title="Welcome">
        <SRow label="Show guided tour" desc="Walk through script editor, payload, context, and output.">
          <OutlineBtn onClick={onShowTour}>Show tour</OutlineBtn>
        </SRow>
        <SRow label="Replay feature hints" desc="Show the one-time tips again the next time you open each tool.">
          <OutlineBtn onClick={() => { resetFeatureIntros(); toast('Feature hints reset — they’ll show again as you use each tool.', 'success'); }}>Reset hints</OutlineBtn>
        </SRow>
      </Group>
    </SectionWrap>
  );
}

function RuntimePanel({
  targetRuntime, onTargetRuntimeChange,
  perWorkspaceTarget, onPerWorkspaceTargetChange,
  payloadMimeType, onPayloadMimeTypeChange,
  classpath, onClasspathChange,
  timeoutMs, onTimeoutMsChange,
  onRestartEngine,
}: {
  targetRuntime: string;
  onTargetRuntimeChange: (level: string) => void;
  perWorkspaceTarget: boolean;
  onPerWorkspaceTargetChange: (on: boolean) => void;
  payloadMimeType: MimeType;
  onPayloadMimeTypeChange: (m: MimeType) => void;
  classpath: string[];
  onClasspathChange: (cp: string[]) => void;
  timeoutMs: number;
  onTimeoutMsChange: (ms: number) => void;
  onRestartEngine: () => void;
}) {
  return (
    <SectionWrap title="Runtime" desc="DataWeave runtime execution settings">
      <Group
        title="Target runtime"
        desc="The engine here is the newest DataWeave. If you deploy to an older Mule, target it and anything too new becomes an error here instead of failing on the server."
      >
        <SRow
          label="Target"
          desc="Applies to Run, the Tests panel, and the editor's diagnostics."
        >
          <div className="relative inline-flex">
            <select
              value={targetRuntime}
              onChange={(e) => onTargetRuntimeChange(e.target.value)}
              className="h-7 pl-2.5 pr-7 rounded-md bg-surface-2 border border-line text-[12.5px] text-content-secondary focus:outline-none focus:border-accent cursor-pointer appearance-none"
              style={{ width: 180 }}
            >
              <option value="">Latest — no check</option>
              {TARGETS.map((t) => (
                <option key={t.level} value={t.level}>{t.label}</option>
              ))}
            </select>
          </div>
        </SRow>
        <SRow
          label="Set it per workspace"
          desc="Off, one target covers everything. On, each workspace carries its own, and the picker above edits this workspace's."
        >
          <Toggle on={perWorkspaceTarget} onChange={onPerWorkspaceTargetChange} />
        </SRow>
      </Group>

      <Group title="DataWeave Engine">
        <SRow label="Restart engine" desc="Reload the DataWeave runtime. Use this if it stops responding or after changing the classpath.">
          <OutlineBtn onClick={onRestartEngine}><Icons.Zap size={11} /> Restart</OutlineBtn>
        </SRow>
        <SRow label="Timeout (ms)" desc="Per-execution timeout. 0 = no limit.">
          <input
            type="number"
            min={0}
            step={1000}
            value={timeoutMs}
            onChange={(e) => onTimeoutMsChange(Number(e.target.value))}
            className="h-7 w-[120px] bg-surface-2 border border-line rounded-md px-2 text-[12px] font-mono text-content focus:border-accent focus:outline-none text-right"
          />
        </SRow>
        <SRow label="Default input format" desc="MIME type used for the payload pane.">
          <SelectInput
            value={payloadMimeType}
            options={MIME_OPTIONS.map(o => o.value)}
            onChange={(v) => onPayloadMimeTypeChange(v as MimeType)}
            width={170}
          />
        </SRow>
      </Group>

      <Group title="Classpath" desc="Extra modules and JARs available to every workspace.">
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          {classpath.length === 0 && (
            <div className="px-4 py-4 text-[11.5px] text-content-faint italic">No classpath entries.</div>
          )}
          {classpath.map((entry, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-line-subtle last:border-b-0 group">
              <Icons.Folder size={13} />
              <span className="flex-1 font-mono text-[11.5px] text-content-secondary truncate" title={entry}>{entry}</span>
              <button
                onClick={() => onClasspathChange(classpath.filter((_, j) => j !== i))}
                className="text-content-faint hover:text-err opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                aria-label="Remove"
              >
                <Icons.X size={11} />
              </button>
            </div>
          ))}
          <div className="px-3.5 py-2.5 flex gap-2 border-t border-line-subtle">
            <OutlineBtn onClick={async () => {
              const selected = await open({ multiple: true, directory: true });
              if (selected) {
                const entries = Array.isArray(selected) ? selected : [selected];
                onClasspathChange([...classpath, ...entries.filter((e) => !classpath.includes(e))]);
              }
            }}><Icons.Plus size={11} /> Add directory</OutlineBtn>
            <OutlineBtn onClick={async () => {
              const selected = await open({ multiple: true, directory: false, filters: [{ name: 'JAR / DWL', extensions: ['jar', 'dwl'] }] });
              if (selected) {
                const entries = Array.isArray(selected) ? selected : [selected];
                onClasspathChange([...classpath, ...entries.filter((e) => !classpath.includes(e))]);
              }
            }}><Icons.Plus size={11} /> Add JAR</OutlineBtn>
          </div>
        </div>
      </Group>
    </SectionWrap>
  );
}

function EditorPanel() {
  const useStoredStr = (k: string, def: string) => {
    const [v, setV] = useState<string>(() => {
      try { return localStorage.getItem(k) || def; } catch { return def; }
    });
    return [v, (nv: string) => { setV(nv); try { localStorage.setItem(k, nv); } catch {} }] as const;
  };
  const useStoredBool = (k: string, def: boolean) => {
    const [v, setV] = useState<boolean>(() => {
      try { const s = localStorage.getItem(k); return s == null ? def : s === '1'; } catch { return def; }
    });
    return [v, (nv: boolean) => { setV(nv); try { localStorage.setItem(k, nv ? '1' : '0'); } catch {} }] as const;
  };

  const [fontSize, setFontSize] = useStoredStr('dw.fontSize', '13 px');
  const [lineHeight, setLineHeight] = useStoredStr('dw.lineHeight', '1.6');
  const [tabSize, setTabSize] = useStoredStr('dw.tabSize', '2 spaces');
  const [wordWrap, setWordWrap] = useStoredBool('dw.wordWrap', true);
  const [bracketColor, setBracketColor] = useStoredBool('dw.bracketColor', true);
  const [minimap, setMinimap] = useStoredBool('dw.minimap', false);
  const [enterAccepts, setEnterAccepts] = useStoredBool('dw.enterAcceptsSuggestion', false);

  return (
    <SectionWrap title="Editor" desc="Script editor preferences">
      <Group title="Font">
        <SRow label="Font size">
          <SelectInput value={fontSize} options={['11 px', '12 px', '13 px', '14 px', '15 px', '16 px']} onChange={(v) => { setFontSize(v); notifyEditorFontChanged(); }} width={100} />
        </SRow>
        <SRow label="Line height">
          <SelectInput value={lineHeight} options={['1.4', '1.5', '1.6', '1.7', '1.8']} onChange={(v) => { setLineHeight(v); notifyEditorFontChanged(); }} width={80} />
        </SRow>
      </Group>

      <Group title="Behavior">
        <SRow label="Tab size">
          <SelectInput value={tabSize} options={['2 spaces', '4 spaces', 'Tab character']} onChange={(v) => { setTabSize(v); notifyEditorFontChanged(); }} width={140} />
        </SRow>
        <SRow label="Word wrap" desc="Script editor only — data panes always wrap.">
          <Toggle on={wordWrap} onChange={(v) => { setWordWrap(v); notifyEditorFontChanged(); }} />
        </SRow>
        <SRow label="Bracket pair colorization"><Toggle on={bracketColor} onChange={(v) => { setBracketColor(v); notifyEditorFontChanged(); }} /></SRow>
        <SRow label="Minimap" desc="Script editor only.">
          <Toggle on={minimap} onChange={(v) => { setMinimap(v); notifyEditorFontChanged(); }} />
        </SRow>
        <SRow label="Enter accepts suggestion" desc="When the autocomplete popup is open, Enter inserts the highlighted suggestion instead of a line break. Tab always accepts, either way. Off by default.">
          <Toggle on={enterAccepts} onChange={(v) => { setEnterAccepts(v); notifyEditorFontChanged(); }} />
        </SRow>
      </Group>
    </SectionWrap>
  );
}

function AdvancedPanel() {
  const [verbose, setVerbose] = useState<boolean>(() => {
    try { return localStorage.getItem('dw.verbose') === '1'; } catch { return false; }
  });
  const [updateCheck, setUpdateCheck] = useState<boolean>(() => {
    try { return localStorage.getItem('dw.updateCheck') !== '0'; } catch { return true; }
  });
  const [resetOpen, setResetOpen] = useState(false);

  // The Rust backend uses app_local_data_dir — on Windows that's
  // %LOCALAPPDATA% (Local, not Roaming), matching the Sidebar footer.
  const ua = navigator.userAgent;
  const dataPath = (ua.includes('Windows') || (navigator as any).userAgentData?.platform === 'Windows')
    ? '%LOCALAPPDATA%\\com.dwstudio.desktop'
    : ua.includes('Mac')
      ? '~/Library/Application Support/com.dwstudio.desktop'
      : '~/.local/share/com.dwstudio.desktop';

  const doResetSettings = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('dw.'));
    keys.forEach(k => localStorage.removeItem(k));
    location.reload();
  };

  return (
    <SectionWrap title="Advanced">
      <Group title="Data location" desc="Where workspaces and settings are stored.">
        <div className="px-3.5 py-3 bg-surface border border-line rounded-lg flex items-center gap-2.5">
          <Icons.Folder size={14} />
          <span className="flex-1 font-mono text-[11.5px] text-content-secondary truncate">{dataPath}</span>
        </div>
      </Group>

      <Group title="Privacy" desc="DataWeave Studio runs fully offline. The only outbound network call is the update check below — turn it off for a 100% no-network app.">
        <SRow label="Check for updates on startup" desc="Contacts the release server once on launch to see if a newer version exists. No other data is sent.">
          <Toggle on={updateCheck} onChange={(v) => { setUpdateCheck(v); try { localStorage.setItem('dw.updateCheck', v ? '1' : '0'); } catch {} }} />
        </SRow>
      </Group>

      <Group title="Diagnostics">
        <SRow label="Enable verbose logging" desc="Includes engine stderr and stack traces in app logs.">
          <Toggle on={verbose} onChange={(v) => { setVerbose(v); try { localStorage.setItem('dw.verbose', v ? '1' : '0'); } catch {} }} />
        </SRow>
      </Group>

      <Group title="Danger zone">
        <SRow label="Reset all settings" desc="Layout, theme, fonts, preferences. Workspaces are not affected.">
          <OutlineBtn onClick={() => setResetOpen(true)} danger>Reset</OutlineBtn>
        </SRow>
      </Group>

      <ConfirmDialog
        open={resetOpen}
        title="Reset all settings?"
        description={
          <>
            Layout, theme, accent, fonts, and preferences will return to defaults.
            Your saved workspaces are <span style={{ color: 'var(--content)', fontWeight: 500 }}>not</span> affected.
          </>
        }
        tone="warn"
        confirmLabel="Reset"
        onConfirm={doResetSettings}
        onClose={() => setResetOpen(false)}
      />
    </SectionWrap>
  );
}

function ShortcutsList() {
  return (
    <div className="grid grid-cols-2 gap-x-7 gap-y-6">
      {SHORTCUT_GROUPS.map((g) => (
        <div key={g.title}>
          <div className="text-[10.5px] uppercase tracking-[0.5px] font-semibold text-content-faint mb-2">{g.title}</div>
          {g.items.map((it) => (
            <div key={it.label} className="flex items-center gap-2.5 py-1.5 border-b border-line-subtle">
              <span className="flex-1 text-[12.5px] text-content-secondary">{it.label}</span>
              <div className="flex gap-[3px]">
                {it.keys.map((k, i) => (
                  <span key={i} className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center font-mono text-[11px] text-content-secondary bg-surface-3 border border-line-subtle rounded">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AboutPanel({ appVersion, onOpenAbout }: { appVersion: string; onOpenAbout: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3.5 pt-10 pb-6">
      <img
        src={logoUrl}
        alt="DataWeave Studio"
        width="64"
        height="64"
        style={{ filter: 'drop-shadow(0 10px 30px color-mix(in oklch, var(--accent) 30%, transparent))' }}
      />
      <div className="text-center">
        <div className="text-[20px] font-semibold text-content">DataWeave Studio</div>
        <div className="text-[12.5px] text-content-muted mt-1 font-mono">Version {appVersion || '—'}</div>
      </div>
      <span
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px]"
        style={{
          background: 'color-mix(in oklch, var(--accent) 10%, transparent)',
          border: '1px solid var(--accent-border)',
          color: 'var(--accent)',
        }}
      >
        <Icons.Dot size={8} /> You're on the latest version
      </span>
      <button
        onClick={onOpenAbout}
        className="text-[12px] text-accent hover:text-accent-hover cursor-pointer mt-1"
      >
        View full details →
      </button>
      <div className="text-[11px] text-content-faint mt-2 text-center max-w-[400px] leading-relaxed">
        Built on the DataWeave runtime by MuleSoft/Salesforce (Apache 2.0).
        <br />Made with Tauri + React.
      </div>
    </div>
  );
}
