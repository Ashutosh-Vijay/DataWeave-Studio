import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { Icons } from './Icons';
import { ConfirmDialog, ConfirmFile } from './ConfirmDialog';
import { nodeDot } from './OpenWorkspaceDialog';
import { toast } from './Toast';
import { invoke, isTauri } from '../bridge';
import { openPath } from '@tauri-apps/plugin-opener';

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

/** Saved-workspace listing entry (from list_workspaces_meta). */
export interface WsMeta {
  filename: string;
  projectName: string;
  requestCount: number;
  updatedAt: string;
  flowCount?: number;
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
}

export type RailTab = 'workspaces' | 'import' | 'snippets';

interface SidebarProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  currentFile: string | null;
  isDirty: boolean;
  onNew: () => void;
  onSave: () => Promise<unknown>;
  onLoad: (filename: string) => Promise<void>;
  onDelete: (filename: string) => Promise<void>;
  listWorkspaces: () => Promise<WsMeta[]>;
  onOpenCurlImport: () => void;
  onInsertSnippet?: (body: string) => void;
  onOpenReference: () => void;
  onOpenRecipes: () => void;
  onOpenSecure: () => void;
  onOpenCompare: () => void;
  onOpenFlowDesigner: () => void;
  onOpenJavaTester: () => void;
  onOpenOpenApi: () => void;
  onOpenModules: () => void;
  onOpenMcp: () => void;
  mcpRunning: boolean;
  onOpenSettings: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;

  // Active workspace's requests — drives the in-line request list at the
  // top of the Workspaces tab so users can browse + switch + add without
  // a separate tab strip elsewhere.
  requests: { id: string; name: string; nodeLabel?: string }[];
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
    projectName, onProjectNameChange, currentFile, isDirty,
    onNew, onSave, onLoad, onDelete, listWorkspaces,
    onOpenCurlImport, onInsertSnippet, onOpenSecure, onOpenCompare, onOpenFlowDesigner, onOpenJavaTester, onOpenOpenApi, onOpenModules, onOpenMcp, mcpRunning, onOpenSettings,
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
  const [files, setFiles] = useState<WsMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [pinned, setPinned] = useState<Set<string>>(() => getPinned());
  const [confirmDelete, setConfirmDelete] = useState<WsMeta | null>(null);

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

  // Stay in sync with saves/deletes/renames made anywhere in the app (⌘S,
  // header menu, the ⌘O dialog) — the hook dispatches this on every mutation.
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail as { renamedFrom?: string; renamedTo?: string } | undefined;
      if (detail?.renamedFrom && detail.renamedTo) {
        // A rename moves the file — carry the pin over instead of losing it.
        // Work off localStorage (shared with the ⌘O manager), then re-read.
        const cur = getPinned();
        if (cur.has(detail.renamedFrom)) {
          cur.delete(detail.renamedFrom);
          cur.add(detail.renamedTo);
          savePinned(cur);
        }
      }
      // Pins can change from the ⌘O manager too — localStorage is the truth.
      setPinned(getPinned());
      refreshFiles();
    };
    window.addEventListener('dw:workspaces-changed', onChanged);
    return () => window.removeEventListener('dw:workspaces-changed', onChanged);
  }, [refreshFiles]);

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
    // cURL import is a full-screen dialog, not a sidebar panel — open it
    // directly instead of expanding a near-empty "Import" tab.
    if (id === 'import') { onOpenCurlImport(); return; }
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
          <Icons.Coffee size={18} />
        </button>
        <button
          data-tour="rail-modules"
          onClick={onOpenModules}
          title="Module library — save reusable .dwl modules, import them in any script"
          aria-label="Module library"
          className="relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors text-content-faint hover:text-content-secondary"
        >
          <Icons.Package size={18} />
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
        <button
          onClick={onOpenOpenApi}
          title="OpenAPI / Swagger reader — sample payloads + DataWeave from a spec"
          aria-label="OpenAPI / Swagger reader"
          className="relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors text-content-faint hover:text-content-secondary"
        >
          <Icons.ApiSpec size={18} />
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
                    isDirty={isDirty}
                    onRename={(next) => {
                      onProjectNameChange(next);
                      toast({ title: 'Workspace renamed', message: next, variant: 'success' });
                    }}
                  />
                  {/* Honest save button: accent only when there's something to
                      save; a quiet confirmation state when everything's on disk. */}
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`w-full py-1.5 rounded text-xs font-medium transition-all cursor-pointer disabled:opacity-50 ${
                      saveFlash || (!isDirty && currentFile)
                        ? 'bg-surface-2 border border-line text-content-faint'
                        : 'bg-accent hover:bg-accent-hover text-accent-ink'
                    }`}
                    title={isDirty ? 'Save workspace (⌘S)' : 'All changes saved'}
                  >
                    {saveFlash ? '✓ Saved' : saving ? 'Saving…' : (!isDirty && currentFile) ? '✓ Saved' : 'Save'}
                    {(isDirty || !currentFile) && !saveFlash && <span className="text-[10px] opacity-60 ml-1">⌘S</span>}
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
                        nodeLabel={r.nodeLabel}
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

                {/* === Saved workspaces (the current one included, highlighted) === */}
                <div className="px-1 pt-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] uppercase tracking-[0.5px] font-semibold flex-1"
                      style={{ color: 'var(--content-faint)' }}
                    >
                      Saved workspaces · {files.length}
                    </span>
                  </div>
                  {files.length === 0 ? (
                    <div
                      className="text-[11px] py-2 px-1 leading-relaxed"
                      style={{ color: 'var(--content-faint)' }}
                    >
                      Nothing saved yet — <span className="font-mono">⌘S</span> saves this workspace.
                    </div>
                  ) : (
                    <WorkspaceList
                      files={files}
                      pinned={pinned}
                      currentFile={currentFile}
                      isDirty={isDirty}
                      onLoad={onLoad}
                      onDelete={(m) => setConfirmDelete(m)}
                      onTogglePin={togglePin}
                    />
                  )}
                </div>
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
            {isTauri ? (
              <button
                onClick={async () => {
                  try {
                    const dir = await invoke<string>('get_workspaces_dir');
                    await openPath(dir);
                  } catch { /* ignore */ }
                }}
                className="truncate block w-full text-left cursor-pointer hover:text-content-faint transition-colors"
                title="Open the workspaces folder in Explorer"
              >
                Saves to AppData/Local/com.dwstudio.desktop ↗
              </button>
            ) : (
              <div className="truncate">Saved inside the VS Code extension storage</div>
            )}
            <div className="truncate" title="DataWeave runtime by MuleSoft/Salesforce, BSD-3-Clause License">
              DW runtime by MuleSoft (BSD-3-Clause)
            </div>
          </div>
        </div>
      )}

      {/* Workspace delete confirmation — replaces the silent delete with a
          small modal that names the workspace being removed. */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete workspace?"
        description={
          <>
            <ConfirmFile name={confirmDelete?.projectName || (confirmDelete?.filename || '').replace(/\.dwstudio$/, '')} /> will be permanently removed
            {confirmDelete && confirmDelete.requestCount > 1 ? <> (all {confirmDelete.requestCount} requests)</> : null}.
            This can&rsquo;t be undone.
          </>
        }
        tone="danger"
        confirmLabel="Delete"
        onConfirm={async () => {
          const m = confirmDelete;
          if (!m) return;
          await onDelete(m.filename);
          setFiles((prev) => prev.filter((x) => x.filename !== m.filename));
          // Drop the pin too, or it lingers as an orphaned entry forever.
          setPinned((prev) => {
            if (!prev.has(m.filename)) return prev;
            const next = new Set(prev);
            next.delete(m.filename);
            savePinned(next);
            return next;
          });
        }}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
});

function WorkspaceList({
  files, pinned, currentFile, isDirty, onLoad, onDelete, onTogglePin,
}: {
  files: WsMeta[];
  pinned: Set<string>;
  currentFile: string | null;
  isDirty: boolean;
  onLoad: (f: string) => Promise<void>;
  onDelete: (m: WsMeta) => void;
  onTogglePin: (f: string) => void;
}) {
  // Pinned first; within each group the hook's ordering (last saved first).
  const pinnedFiles = files.filter((m) => pinned.has(m.filename));
  const recentFiles = files.filter((m) => !pinned.has(m.filename));

  const row = (m: WsMeta, isPinned: boolean) => (
    <WSRow
      key={m.filename}
      meta={m}
      active={m.filename === currentFile}
      isPinned={isPinned}
      isDirty={isDirty && m.filename === currentFile}
      onClick={() => { if (m.filename !== currentFile) void onLoad(m.filename); }}
      onDelete={() => onDelete(m)}
      onTogglePin={() => onTogglePin(m.filename)}
    />
  );

  return (
    <div className="space-y-1">
      {pinnedFiles.length > 0 && (
        <>
          <SectionLabel>Pinned</SectionLabel>
          {pinnedFiles.map((m) => row(m, true))}
        </>
      )}
      {recentFiles.length > 0 && (
        <>
          {pinnedFiles.length > 0 && <SectionLabel>Recent</SectionLabel>}
          {recentFiles.map((m) => row(m, false))}
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
  meta, active, isPinned, isDirty, onClick, onDelete, onTogglePin,
}: {
  meta: WsMeta;
  active: boolean;
  isPinned: boolean;
  isDirty: boolean;
  onClick: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const name = meta.projectName || meta.filename.replace(/\.dwstudio$/, '');
  const reqs = `${meta.requestCount} request${meta.requestCount === 1 ? '' : 's'}`;
  const when = timeAgo(meta.updatedAt);
  const metaLine = active
    ? (isDirty ? 'editing now · unsaved changes' : 'editing now')
    : [reqs, (meta.flowCount ?? 0) > 0 ? 'flow' : null, when || null].filter(Boolean).join(' · ');

  return (
    <div
      onClick={onClick}
      className={`relative group flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors ${active ? '' : 'cursor-pointer'}`}
      style={{ background: active ? 'var(--surface-3)' : 'transparent' }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      title={active ? undefined : `Open ${name}`}
    >
      {active && <span className="absolute -left-0.5 top-2 bottom-2 w-0.5 bg-accent rounded-sm" />}
      <Icons.Braces
        size={13}
        className="shrink-0"
        style={{ color: active ? 'var(--accent)' : 'var(--content-faint)' }}
      />
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
        <div className="text-[10.5px] truncate" style={{ color: isDirty && active ? 'var(--warn)' : 'var(--content-faint)' }}>
          {metaLine}
        </div>
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
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
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
  name, nodeLabel, active, canRemove, onClick, onRename, onDuplicate, onRemove,
}: {
  name: string;
  nodeLabel?: string;
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
      {/* Node-type dot — same color language as the Flow designer & ⌘O manager. */}
      <span
        className="w-[7px] h-[7px] rounded-full shrink-0"
        style={{ background: nodeDot(nodeLabel || 'Transform'), opacity: active ? 1 : 0.7 }}
        title={nodeLabel || 'Transform'}
      />
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
  name, isDirty, onRename,
}: {
  name: string;
  isDirty?: boolean;
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
          title={`${name || 'Untitled'} — double-click to rename`}
        >
          {name || 'Untitled'}
        </span>
      )}
      {!editing && isDirty && (
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--warn)' }} title="Unsaved changes" />
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

