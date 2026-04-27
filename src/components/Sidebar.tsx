import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { CurlImporter, CurlImportResult } from './CurlImporter';
import { METHOD_COLORS } from '../types';
import { Icons } from './Icons';

const PINNED_KEY = 'dw.pinned';

function getPinned(): Set<string> {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}

function savePinned(s: Set<string>) {
  try { localStorage.setItem(PINNED_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

function methodBadgeColor(method: string): string {
  const m = METHOD_COLORS[method as keyof typeof METHOD_COLORS];
  if (m?.text?.includes('accent')) return 'var(--accent)';
  if (m?.text?.includes('cyan')) return 'var(--cyan)';
  if (m?.text?.includes('violet')) return 'var(--violet)';
  if (m?.text?.includes('warn')) return 'var(--warn)';
  if (m?.text?.includes('err')) return 'var(--err)';
  return 'var(--accent)';
}

export type RailTab = 'workspaces' | 'import' | 'snippets';

interface SidebarProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  currentFile: string | null;
  isDirty: boolean;
  currentMethod: string;
  onNew: () => void;
  onSave: () => Promise<unknown>;
  onLoad: (filename: string) => Promise<void>;
  onDelete: (filename: string) => Promise<void>;
  listWorkspaces: () => Promise<string[]>;
  onCurlImport: (result: CurlImportResult) => void;
  onInsertSnippet?: (body: string) => void;
  onOpenSecure: () => void;
  onOpenSettings: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const RAIL_ITEMS: { id: RailTab; title: string; Icon: (typeof Icons)[keyof typeof Icons] }[] = [
  { id: 'workspaces', title: 'Workspaces', Icon: Icons.Workspaces },
  { id: 'import', title: 'Import (cURL)', Icon: Icons.Import },
  { id: 'snippets', title: 'Snippets library', Icon: Icons.Library },
];

const SNIPPETS: { name: string; desc: string; body: string }[] = [
  {
    name: 'Map array',
    desc: 'payload map ((item) -> …)',
    body: `%dw 2.0\noutput application/json\n---\npayload map (item, index) -> {\n  index: index,\n  value: item\n}`,
  },
  {
    name: 'Filter array',
    desc: 'payload filter (cond)',
    body: `%dw 2.0\noutput application/json\n---\npayload filter ((item) -> item.active == true)`,
  },
  {
    name: 'Group by',
    desc: 'groupBy ((item) -> key)',
    body: `%dw 2.0\noutput application/json\n---\npayload groupBy ((item) -> item.category)`,
  },
  {
    name: 'Reduce / sum',
    desc: 'payload reduce ((i, acc) -> …)',
    body: `%dw 2.0\noutput application/json\n---\npayload reduce ((item, acc = 0) -> acc + item.amount)`,
  },
  {
    name: 'Object → array of entries',
    desc: 'pluck (v, k) -> { k, v }',
    body: `%dw 2.0\noutput application/json\n---\npayload pluck ((value, key) -> { key: key as String, value: value })`,
  },
  {
    name: 'Conditional output',
    desc: 'if … else …',
    body: `%dw 2.0\noutput application/json\n---\n{\n  status: if (payload.value > 100) "high" else "low"\n}`,
  },
  {
    name: 'Read named input',
    desc: 'inputs.<name>',
    body: `%dw 2.0\ninput accounts json\noutput application/json\n---\naccounts map ((a) -> { id: a.id, name: a.name })`,
  },
  {
    name: 'Format date',
    desc: 'as DateTime / format',
    body: `%dw 2.0\noutput application/json\n---\n{\n  iso: now() as String,\n  formatted: now() as String { format: "yyyy-MM-dd HH:mm:ss" }\n}`,
  },
];

export interface SidebarHandle {
  openTab: (tab: RailTab) => void;
}

export const Sidebar = forwardRef<SidebarHandle, SidebarProps>(function Sidebar(props, ref) {
  const {
    projectName, onProjectNameChange, currentFile, isDirty, currentMethod,
    onNew, onSave, onLoad, onDelete, listWorkspaces,
    onCurlImport, onInsertSnippet, onOpenSecure, onOpenSettings,
    collapsed, onToggleCollapse,
  } = props;

  const [tab, setTab] = useState<RailTab>('workspaces');

  useImperativeHandle(ref, () => ({
    openTab: (next: RailTab) => {
      setTab(next);
      if (collapsed) onToggleCollapse();
    },
  }), [collapsed, onToggleCollapse]);
  const [files, setFiles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [pinned, setPinned] = useState<Set<string>>(() => getPinned());

  const togglePin = (filename: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename); else next.add(filename);
      savePinned(next);
      return next;
    });
  };

  const refreshFiles = useCallback(() => {
    listWorkspaces().then(setFiles).catch(() => setFiles([]));
  }, [listWorkspaces]);

  useEffect(() => { refreshFiles(); }, [refreshFiles]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1200);
      refreshFiles();
    } finally {
      setSaving(false);
    }
  };

  const handleRailClick = (id: RailTab) => {
    if (collapsed) {
      onToggleCollapse();
      setTab(id);
    } else if (tab === id) {
      onToggleCollapse();
    } else {
      setTab(id);
    }
  };

  return (
    <div data-tour="sidebar" className="flex shrink-0 overflow-hidden">
      {/* Icon Rail — 48px */}
      <div className="w-12 shrink-0 bg-rail border-r border-line flex flex-col py-2.5">
        <button
          onClick={onOpenSecure}
          title="Secure Properties tool"
          aria-label="Secure Properties tool"
          className="relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors text-content-faint hover:text-content-secondary"
        >
          <Icons.Secure size={18} />
        </button>
        <div className="mx-2 my-1.5 h-px bg-line-subtle" />
        {RAIL_ITEMS.map(({ id, title, Icon }) => {
          const isActive = !collapsed && tab === id;
          return (
            <button
              key={id}
              onClick={() => handleRailClick(id)}
              title={title}
              aria-label={title}
              className={`relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors ${
                isActive
                  ? 'bg-surface-2 text-content'
                  : 'text-content-faint hover:text-content-secondary'
              }`}
            >
              {isActive && (
                <span className="absolute -left-2 top-2 bottom-2 w-0.5 bg-accent rounded-sm" />
              )}
              <Icon size={18} />
            </button>
          );
        })}
        <div className="flex-1" />
        {isDirty && (
          <div className="mx-auto w-1.5 h-1.5 rounded-full bg-warn mb-1" title="Unsaved changes" />
        )}
        <button
          onClick={onOpenSettings}
          title="Settings (⌘,)"
          aria-label="Settings"
          className="relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors text-content-faint hover:text-content-secondary"
        >
          <Icons.Settings size={18} />
        </button>
      </div>

      {/* Side Panel — 240px */}
      {!collapsed && (
        <div className="w-60 shrink-0 bg-surface border-r border-line flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="h-9 shrink-0 flex items-center px-3 border-b border-line-subtle">
            <span className="flex-1 text-[12.5px] font-semibold text-content">
              {tab === 'workspaces' && 'Workspaces'}
              {tab === 'import' && 'Import'}
              {tab === 'snippets' && 'Snippets'}
            </span>
            {tab === 'workspaces' && (
              <button
                onClick={() => { onNew(); refreshFiles(); }}
                title="New workspace"
                aria-label="New workspace"
                className="w-[22px] h-[22px] rounded flex items-center justify-center text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer"
              >
                <Icons.Plus size={13} />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {tab === 'workspaces' && (
              files.length === 0 ? (
                <WorkspacesEmpty onNew={() => { onNew(); refreshFiles(); }} onImport={() => setTab('import')} />
              ) : (
                <div className="p-2 space-y-3">
                  {/* Project name + save */}
                  <div className="px-1 space-y-2">
                    <label className="text-[10px] text-content-faint uppercase tracking-wide">Project Name</label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => onProjectNameChange(e.target.value)}
                      className="w-full bg-surface-2 border border-line rounded px-2 py-1.5 text-xs text-content placeholder-content-ghost focus:border-accent focus:outline-none"
                      placeholder="Untitled"
                    />
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className={`w-full py-1.5 rounded text-xs font-medium transition-all cursor-pointer ${
                        saveFlash
                          ? 'bg-accent text-accent-ink'
                          : 'bg-accent hover:bg-accent-hover text-accent-ink disabled:opacity-50'
                      }`}
                    >
                      {saveFlash ? 'Saved!' : saving ? 'Saving…' : 'Save'}
                      <span className="text-[10px] opacity-60 ml-1">Ctrl+S</span>
                    </button>
                  </div>

                  {/* Pinned + Recent */}
                  <WorkspaceList
                    files={files}
                    pinned={pinned}
                    currentFile={currentFile}
                    currentMethod={currentMethod}
                    isDirty={isDirty}
                    onLoad={onLoad}
                    onDelete={async (f) => {
                      await onDelete(f);
                      setFiles((prev) => prev.filter((x) => x !== f));
                    }}
                    onTogglePin={togglePin}
                  />
                </div>
              )
            )}

            {tab === 'import' && (
              <div className="p-3">
                <CurlImporter onImport={onCurlImport} />
              </div>
            )}

            {tab === 'snippets' && (
              <div className="p-2 space-y-1">
                <div className="px-1.5 py-1.5 text-[10.5px] uppercase tracking-[0.6px] font-semibold text-content-faint">
                  DataWeave 2.0
                </div>
                {SNIPPETS.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => onInsertSnippet?.(s.body)}
                    title="Insert at cursor / replace selection"
                    className="w-full text-left p-2 rounded-md border border-line-subtle hover:border-line-secondary hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <Icons.Library size={11} className="text-content-faint shrink-0" />
                      <span className="text-[12px] font-medium text-content truncate">{s.name}</span>
                    </div>
                    <div className="font-mono text-[10.5px] text-content-faint mt-0.5 truncate">{s.desc}</div>
                  </button>
                ))}
                <div className="px-1.5 pt-2 text-[10.5px] text-content-ghost">
                  Click to insert. Local snippets only.
                </div>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-line-subtle text-[9px] text-content-ghost space-y-0.5 shrink-0">
            <div className="truncate">Saves to AppData/Local/com.dwstudio.desktop</div>
            <div className="truncate" title="DataWeave CLI by MuleSoft/Salesforce, BSD-3-Clause License">
              DW CLI by MuleSoft (BSD-3-Clause)
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

function WorkspaceList({
  files, pinned, currentFile, currentMethod, isDirty, onLoad, onDelete, onTogglePin,
}: {
  files: string[];
  pinned: Set<string>;
  currentFile: string | null;
  currentMethod: string;
  isDirty: boolean;
  onLoad: (f: string) => Promise<void>;
  onDelete: (f: string) => Promise<void>;
  onTogglePin: (f: string) => void;
}) {
  const pinnedFiles = files.filter(f => pinned.has(f));
  const recentFiles = files.filter(f => !pinned.has(f));

  return (
    <div className="space-y-1">
      {pinnedFiles.length > 0 && (
        <>
          <SectionLabel>Pinned</SectionLabel>
          {pinnedFiles.map((f) => (
            <WSRow
              key={f}
              filename={f}
              active={f === currentFile}
              method={f === currentFile ? currentMethod : 'POST'}
              isPinned
              isDirty={isDirty && f === currentFile}
              onClick={() => onLoad(f)}
              onDelete={() => onDelete(f)}
              onTogglePin={() => onTogglePin(f)}
            />
          ))}
        </>
      )}
      {recentFiles.length > 0 && (
        <>
          <SectionLabel>Recent</SectionLabel>
          {recentFiles.map((f) => (
            <WSRow
              key={f}
              filename={f}
              active={f === currentFile}
              method={f === currentFile ? currentMethod : 'POST'}
              isPinned={false}
              isDirty={isDirty && f === currentFile}
              onClick={() => onLoad(f)}
              onDelete={() => onDelete(f)}
              onTogglePin={() => onTogglePin(f)}
            />
          ))}
        </>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-[0.5px] uppercase text-content-faint">
      {children}
    </div>
  );
}

function WSRow({
  filename, active, method, isPinned, isDirty, onClick, onDelete, onTogglePin,
}: {
  filename: string;
  active: boolean;
  method: string;
  isPinned: boolean;
  isDirty: boolean;
  onClick: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const name = filename.replace('.dwstudio', '').replace(/\.json$/, '');
  const color = methodBadgeColor(method);
  const meta = active ? (isDirty ? 'unsaved changes' : 'editing now') : 'saved';

  return (
    <div
      onClick={onClick}
      className="relative group flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors"
      style={{ background: active ? 'var(--surface-3)' : 'transparent' }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {active && <span className="absolute -left-0.5 top-2 bottom-2 w-0.5 bg-accent rounded-sm" />}
      <span
        className="font-mono text-[9px] font-bold tracking-[0.4px] w-[34px] text-center py-0.5 rounded shrink-0"
        style={{
          color,
          background: `color-mix(in oklch, ${color} 14%, transparent)`,
        }}
      >
        {method}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="text-[12.5px] truncate"
          style={{
            color: active ? 'var(--content)' : 'var(--content-secondary)',
            fontWeight: active ? 500 : 400,
          }}
        >
          {name}
        </div>
        <div className="text-[10.5px] text-content-faint truncate">{meta}</div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
        title={isPinned ? 'Unpin' : 'Pin'}
        aria-label={isPinned ? 'Unpin workspace' : 'Pin workspace'}
        className={`text-content-faint hover:text-content cursor-pointer transition-opacity ${isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        style={{ color: isPinned ? 'var(--accent)' : undefined }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14l-1.5-3V8a5.5 5.5 0 0 0-11 0v6L5 17z" />
        </svg>
      </button>
      <button
        onClick={async (e) => { e.stopPropagation(); await onDelete(); }}
        title="Delete"
        aria-label={`Delete workspace ${name}`}
        className="text-content-faint hover:text-err opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      >
        <Icons.X size={11} />
      </button>
    </div>
  );
}

function WorkspacesEmpty({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 gap-3.5 h-full">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{
          background: 'color-mix(in oklch, var(--accent) 10%, transparent)',
          border: '1px dashed var(--accent-border)',
          color: 'var(--accent)',
        }}
      >
        <Icons.Folder size={22} />
      </div>
      <div>
        <div className="text-[14px] font-semibold text-content">No workspaces yet</div>
        <div className="text-[12px] text-content-muted mt-1.5 max-w-[200px] leading-relaxed">
          Create your first workspace, or import a cURL command to generate one.
        </div>
      </div>
      <div className="flex flex-col gap-1.5 w-full">
        <button
          onClick={onNew}
          className="flex items-center justify-center gap-1.5 h-8 rounded-md text-[12.5px] font-semibold cursor-pointer"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          <Icons.Plus size={12} /> New workspace
        </button>
        <button
          onClick={onImport}
          className="flex items-center justify-center gap-1.5 h-8 rounded-md text-[12.5px] cursor-pointer border border-line text-content-secondary hover:bg-surface-2"
        >
          <Icons.Import size={12} /> Import cURL
        </button>
      </div>
      <div className="text-[10.5px] text-content-faint mt-1 font-mono">⌘N to start fresh</div>
    </div>
  );
}
