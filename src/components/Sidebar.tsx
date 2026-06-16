import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { CurlImporter, CurlImportResult } from './CurlImporter';
import { METHOD_COLORS } from '../types';
import { Icons } from './Icons';
import { ConfirmDialog, ConfirmFile } from './ConfirmDialog';
import { toast } from './Toast';

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
  listWorkspaces: () => Promise<{ filename: string; projectName: string }[]>;
  onCurlImport: (result: CurlImportResult) => void;
  onInsertSnippet?: (body: string) => void;
  onOpenReference: () => void;
  onOpenRecipes: () => void;
  onOpenSecure: () => void;
  onOpenCompare: () => void;
  onOpenFlowDesigner: () => void;
  onOpenJavaTester: () => void;
  onOpenModules: () => void;
  onOpenMcp: () => void;
  mcpRunning: boolean;
  onOpenSettings: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;

  // Active workspace's requests — drives the in-line request list at the
  // top of the Workspaces tab so users can browse + switch + add without
  // a separate tab strip elsewhere.
  requests: { id: string; name: string }[];
  activeRequestId: string;
  onSelectRequest: (id: string) => void;
  onAddRequest: () => void;
  onRenameRequest: (id: string, name: string) => void;
  onRemoveRequest: (id: string) => void;
  onDuplicateRequest: (id: string) => void;
}

const RAIL_ITEMS: { id: RailTab; title: string; Icon: (typeof Icons)[keyof typeof Icons] }[] = [
  { id: 'workspaces', title: 'Workspaces (⌘O)', Icon: Icons.Workspaces },
  { id: 'import', title: 'Import (cURL) — ⌘⇧I', Icon: Icons.Import },
  { id: 'snippets', title: 'Snippets library (⌘L)', Icon: Icons.Library },
];

const SNIPPETS: { name: string; desc: string; body: string }[] = [
  {
    name: 'Hello world',
    desc: 'Minimal starter',
    body: `%dw 2.0\noutput application/json\n---\n{\n  message: "Hello, " ++ (payload.name default "world")\n}`,
  },
  {
    name: 'Map array',
    desc: 'payload map ((item) -> …)',
    body: `%dw 2.0\noutput application/json\n---\npayload map ((item, index) -> {\n  index: index,\n  value: item\n})`,
  },
  {
    name: 'Filter array',
    desc: 'payload filter ((item) -> cond)',
    body: `%dw 2.0\noutput application/json\n---\npayload filter ((item) -> item.active == true)`,
  },
  {
    name: 'Sort array',
    desc: 'orderBy ((item) -> key)',
    body: `%dw 2.0\noutput application/json\n---\npayload orderBy ((item) -> item.name)`,
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
    name: 'Object → entries',
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
    desc: 'input <name> application/…',
    body: `%dw 2.0\ninput accounts application/json\noutput application/json\n---\naccounts map ((a) -> {\n  id: a.id,\n  name: a.name\n})`,
  },
  {
    name: 'Format date',
    desc: 'now() as String { format }',
    body: `%dw 2.0\noutput application/json\n---\n{\n  iso: now() as String,\n  date: now() as String { format: "yyyy-MM-dd" },\n  full: now() as String { format: "yyyy-MM-dd HH:mm:ss" }\n}`,
  },
  {
    name: 'JSON → XML',
    desc: 'output application/xml',
    body: `%dw 2.0\noutput application/xml\n---\n{\n  root: {\n    items: payload map ((item) -> {\n      item: item\n    })\n  }\n}`,
  },
  {
    name: 'Variable + function',
    desc: 'var / fun declarations',
    body: `%dw 2.0\noutput application/json\n\nvar discount = 0.1\nfun applyDiscount(price: Number) = price * (1 - discount)\n\n---\npayload map ((item) -> {\n  name: item.name,\n  price: applyDiscount(item.price)\n})`,
  },
];

export interface SidebarHandle {
  openTab: (tab: RailTab) => void;
}

export const Sidebar = forwardRef<SidebarHandle, SidebarProps>(function Sidebar(props, ref) {
  const {
    projectName, onProjectNameChange, currentFile, isDirty, currentMethod,
    onNew, onSave, onLoad, onDelete, listWorkspaces,
    onCurlImport, onInsertSnippet, onOpenSecure, onOpenCompare, onOpenFlowDesigner, onOpenJavaTester, onOpenModules, onOpenMcp, mcpRunning, onOpenSettings,
    onOpenReference, onOpenRecipes,
    collapsed, onToggleCollapse,
    requests, activeRequestId, onSelectRequest, onAddRequest, onRenameRequest, onRemoveRequest, onDuplicateRequest,
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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const togglePin = (filename: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename); else next.add(filename);
      savePinned(next);
      return next;
    });
  };

  const refreshFiles = useCallback(() => {
    // Sidebar shows just filenames; OpenWorkspaceDialog uses the richer meta.
    listWorkspaces().then((metas) => setFiles(metas.map((m) => m.filename))).catch(() => setFiles([]));
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
          title="Secure Properties tool (⌘⇧E)"
          aria-label="Secure Properties tool"
          className="relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors text-content-faint hover:text-content-secondary"
        >
          <Icons.Secure size={18} />
        </button>
        <button
          data-tour="rail-ref"
          onClick={onOpenReference}
          title="Function reference"
          aria-label="Function reference"
          className="relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors text-content-faint hover:text-content-secondary"
        >
          <Icons.Braces size={18} />
        </button>
        <button
          onClick={onOpenRecipes}
          title="DataWeave cookbook"
          aria-label="DataWeave cookbook"
          className="relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors text-content-faint hover:text-content-secondary"
        >
          <Icons.Book size={18} />
        </button>
        <button
          data-tour="rail-flow"
          onClick={onOpenFlowDesigner}
          title="Message Flow designer"
          aria-label="Message Flow designer"
          className="relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors text-content-faint hover:text-content-secondary"
        >
          <Icons.Flow size={18} />
        </button>
        <button
          data-tour="rail-java"
          onClick={onOpenJavaTester}
          title="Java tester"
          aria-label="Java tester"
          className="relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors text-content-faint hover:text-content-secondary"
        >
          <Icons.Terminal size={18} />
        </button>
        <button
          data-tour="rail-modules"
          onClick={onOpenModules}
          title="Module library — save reusable .dwl modules, import them in any script"
          aria-label="Module library"
          className="relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors text-content-faint hover:text-content-secondary"
        >
          <Icons.Library size={18} />
        </button>
        <button
          data-tour="rail-mcp"
          onClick={onOpenMcp}
          title="MCP Server — serve the engine to AI agents"
          aria-label="MCP Server"
          className={`relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors ${mcpRunning ? 'text-accent' : 'text-content-faint hover:text-content-secondary'}`}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4" /><path d="M5.5 5.5 8 8" /><path d="M18.5 5.5 16 8" /><rect x="6" y="8" width="12" height="8" rx="3" /><path d="M9 16v3a3 3 0 0 0 6 0v-3" />
          </svg>
          {mcpRunning && <span className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-accent" style={{ boxShadow: '0 0 0 2px var(--rail)' }} />}
        </button>
        <button
          onClick={onOpenCompare}
          title="Compare two texts"
          aria-label="Compare two texts"
          className="relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors text-content-faint hover:text-content-secondary"
        >
          <Icons.Compare size={18} />
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
                title="New workspace (⌘N)"
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
              <div className="p-2 space-y-3">
                {/* === Active workspace === */}
                <div className="px-1 space-y-2">
                  <div
                    className="text-[10px] uppercase tracking-[0.5px] font-semibold"
                    style={{ color: 'var(--content-faint)' }}
                  >
                    This workspace
                  </div>
                  <WorkspaceNameRow
                    name={projectName}
                    onRename={(next) => {
                      onProjectNameChange(next);
                      toast({ title: 'Workspace renamed', message: next, variant: 'success' });
                    }}
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
                    <span className="text-[10px] opacity-60 ml-1">⌘S</span>
                  </button>
                </div>

                {/* === Requests in this workspace === */}
                <div className="px-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] uppercase tracking-[0.5px] font-semibold flex-1"
                      style={{ color: 'var(--content-faint)' }}
                    >
                      Requests · {requests.length}
                    </span>
                    <button
                      onClick={onAddRequest}
                      title="New request in this workspace"
                      className="w-5 h-5 rounded inline-flex items-center justify-center cursor-pointer hover:bg-surface-2"
                      style={{ color: 'var(--content-faint)' }}
                    >
                      <Icons.Plus size={11} />
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {requests.map((r) => (
                      <RequestNode
                        key={r.id}
                        name={r.name}
                        active={r.id === activeRequestId}
                        canRemove={requests.length > 1}
                        onClick={() => onSelectRequest(r.id)}
                        onRename={(next) => {
                          onRenameRequest(r.id, next);
                          toast({ title: 'Request renamed', message: next, variant: 'success' });
                        }}
                        onDuplicate={() => onDuplicateRequest(r.id)}
                        onRemove={() => onRemoveRequest(r.id)}
                      />
                    ))}
                  </div>
                </div>

                {/* === Other saved workspaces === */}
                <div className="px-1 pt-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] uppercase tracking-[0.5px] font-semibold flex-1"
                      style={{ color: 'var(--content-faint)' }}
                    >
                      Other workspaces · {files.filter(f => f !== currentFile).length}
                    </span>
                    <button
                      onClick={() => { onNew(); refreshFiles(); }}
                      title="Start a fresh blank workspace"
                      className="w-5 h-5 rounded inline-flex items-center justify-center cursor-pointer hover:bg-surface-2"
                      style={{ color: 'var(--content-faint)' }}
                    >
                      <Icons.Plus size={11} />
                    </button>
                  </div>
                  {files.filter(f => f !== currentFile).length === 0 ? (
                    <div
                      className="text-[11px] py-2 px-1 leading-relaxed"
                      style={{ color: 'var(--content-faint)' }}
                    >
                      No other workspaces. Hit + above to start one.
                    </div>
                  ) : (
                    <WorkspaceList
                      files={files.filter(f => f !== currentFile)}
                      pinned={pinned}
                      currentFile={currentFile}
                      currentMethod={currentMethod}
                      isDirty={isDirty}
                      onLoad={onLoad}
                      onDelete={(f) => setConfirmDelete(f)}
                      onTogglePin={togglePin}
                    />
                  )}
                </div>
              </div>
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
                    title="Replace the script with this snippet (Ctrl+Z to undo)"
                    className="w-full text-left p-2 rounded-md border border-line-subtle hover:border-line-secondary hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <Icons.Library size={11} className="text-content-faint shrink-0" />
                      <span className="text-[12px] font-medium text-content truncate">{s.name}</span>
                    </div>
                    <div className="font-mono text-[10.5px] text-content-faint mt-0.5 truncate">{s.desc}</div>
                  </button>
                ))}
                <div className="px-1.5 pt-2 text-[10.5px] text-content-ghost leading-snug">
                  Click to replace the current script. Use <span className="font-mono">⌘Z</span> to undo.
                </div>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-line-subtle text-[9px] text-content-ghost space-y-0.5 shrink-0">
            <div className="truncate">Saves to AppData/Local/com.dwstudio.desktop</div>
            <div className="truncate" title="DataWeave runtime by MuleSoft/Salesforce, BSD-3-Clause License">
              DW runtime by MuleSoft (BSD-3-Clause)
            </div>
          </div>
        </div>
      )}

      {/* Workspace delete confirmation — replaces the silent delete with a
          small modal that names the file being removed. */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete workspace?"
        description={
          <>
            <ConfirmFile name={(confirmDelete || '').replace(/\.dwstudio$|\.json$/, '')} /> will be permanently removed.
            This can&rsquo;t be undone.
          </>
        }
        tone="danger"
        confirmLabel="Delete"
        onConfirm={async () => {
          const f = confirmDelete;
          if (!f) return;
          await onDelete(f);
          setFiles((prev) => prev.filter((x) => x !== f));
        }}
        onClose={() => setConfirmDelete(null)}
      />
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
  onDelete: (f: string) => void;
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

/** A single request row in the active-workspace tree section.
 *  Click → switch to it. Double-click → rename in place. Right-click →
 *  rename / duplicate / delete. */
function RequestNode({
  name, active, canRemove, onClick, onRename, onDuplicate, onRemove,
}: {
  name: string;
  active: boolean;
  canRemove: boolean;
  onClick: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) requestAnimationFrame(() => inputRef.current?.select());
  }, [editing]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  return (
    <div
      onClick={() => !editing && onClick()}
      onDoubleClick={() => { setEditing(true); setDraft(name); }}
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
      className="group flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer"
      style={{
        background: active ? 'var(--accent-dim)' : 'transparent',
        borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
        paddingLeft: active ? '6px' : '8px',
      }}
    >
      <Icons.Braces size={10} style={{ color: active ? 'var(--accent)' : 'var(--content-faint)' }} className="shrink-0" />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => { if (draft.trim()) onRename(draft.trim()); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { if (draft.trim()) onRename(draft.trim()); setEditing(false); }
            if (e.key === 'Escape') setEditing(false);
          }}
          className="flex-1 bg-transparent outline-none text-[11.5px]"
          style={{ color: 'var(--content)' }}
          spellCheck={false}
        />
      ) : (
        <span
          className="flex-1 truncate text-[11.5px]"
          style={{ color: active ? 'var(--content)' : 'var(--content-secondary)', fontWeight: active ? 500 : 400 }}
        >
          {name}
        </span>
      )}
      {!editing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({ x: rect.right - 4, y: rect.bottom + 2 });
          }}
          title="Request actions"
          aria-label="Request actions"
          className="w-5 h-5 rounded inline-flex items-center justify-center opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-surface-2"
          style={{ color: 'var(--content-faint)' }}
        >
          <DotsGlyph />
        </button>
      )}

      {menu && (
        <div
          className="fixed z-[70] py-1 rounded-md min-w-[140px]"
          style={{
            top: menu.y,
            // Anchor by the right edge so the menu opens *into* the sidebar
            // (toward the content area), not off the screen to the right.
            right: window.innerWidth - menu.x,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: '0 8px 24px color-mix(in oklch, oklch(0% 0 0) 40%, transparent)',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setMenu(null); setEditing(true); setDraft(name); }}
            className="w-full text-left px-3 py-1.5 text-[12px] cursor-pointer hover:bg-surface-2"
            style={{ color: 'var(--content-secondary)' }}
          >
            Rename
          </button>
          <button
            onClick={() => { setMenu(null); onDuplicate(); }}
            className="w-full text-left px-3 py-1.5 text-[12px] cursor-pointer hover:bg-surface-2"
            style={{ color: 'var(--content-secondary)' }}
          >
            Duplicate
          </button>
          {canRemove && (
            <>
              <div style={{ height: 1, background: 'var(--line-subtle)', margin: '4px 0' }} />
              <button
                onClick={() => { setMenu(null); onRemove(); }}
                className="w-full text-left px-3 py-1.5 text-[12px] cursor-pointer hover:bg-surface-2"
                style={{ color: 'var(--err)' }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Workspace-name row in the sidebar header. Display-only by default;
 *  the `…` button opens a menu with Rename / Duplicate. Inline editing
 *  is the *commit path* for rename — picking 'Rename' swaps the row
 *  into an input, Enter commits and fires the rename toast. */
function WorkspaceNameRow({
  name, onRename,
}: {
  name: string;
  onRename: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) requestAnimationFrame(() => inputRef.current?.select());
  }, [editing]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== name) onRename(next);
    setEditing(false);
  };

  return (
    <div
      className="group flex items-center gap-2 h-8 px-2 rounded-md"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
      }}
    >
      <Icons.Braces size={11} className="shrink-0" style={{ color: 'var(--accent)' }} />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setEditing(false); setDraft(name); }
          }}
          className="flex-1 bg-transparent outline-none text-[12.5px]"
          style={{ color: 'var(--content)' }}
          placeholder="Untitled"
          spellCheck={false}
        />
      ) : (
        <span
          className="flex-1 truncate text-[12.5px]"
          style={{ color: 'var(--content)', fontWeight: 500 }}
          onDoubleClick={() => { setEditing(true); setDraft(name); }}
          title={name}
        >
          {name || 'Untitled'}
        </span>
      )}
      {!editing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({ x: rect.right, y: rect.bottom + 2 });
          }}
          title="Workspace actions"
          aria-label="Workspace actions"
          className="w-5 h-5 rounded inline-flex items-center justify-center cursor-pointer hover:bg-surface-3 opacity-60 hover:opacity-100"
          style={{ color: 'var(--content-faint)' }}
        >
          <DotsGlyph />
        </button>
      )}

      {menu && (
        <div
          className="fixed z-[70] py-1 rounded-md min-w-[160px]"
          style={{
            top: menu.y,
            right: window.innerWidth - menu.x,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: '0 8px 24px color-mix(in oklch, oklch(0% 0 0) 40%, transparent)',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setMenu(null); setEditing(true); setDraft(name); }}
            className="w-full text-left px-3 py-1.5 text-[12px] cursor-pointer hover:bg-surface-2"
            style={{ color: 'var(--content-secondary)' }}
          >
            Rename
          </button>
        </div>
      )}
    </div>
  );
}

/** Mini three-dot horizontal "more actions" glyph used throughout the
 *  sidebar tree. Inline SVG so it tracks `color` via currentColor. */
function DotsGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}

