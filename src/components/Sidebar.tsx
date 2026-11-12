import { kbd } from '../shortcuts';
import type { Tool } from './ToolsLauncher';
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
  /** The tools the user pinned to the rail, in their order. The rest live in All tools. */
  railTools: Tool[];
  /** New order (or a shorter list, after an unpin) of the pinned tool ids. */
  onRailChange: (ids: string[]) => void;
  /** Every tool, labelled, including the ones that aren't pinned. */
  onOpenAllTools: () => void;
  mcpRunning: boolean;
  onOpenSettings: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;

  // Active workspace's requests — drives the in-line request list at the
  // top of the Workspaces tab so users can browse + switch + add without
  // a separate tab strip elsewhere.
  requests: { id: string; name: string; nodeLabel?: string; kind?: 'script' | 'test'; filePath?: string }[];
  /** Open a .dwl from the picked folder as a script entry (or go to it if it is open). */
  onOpenScriptFile: (path: string) => void;
  /** Show the inline transforms of a Mule flow XML from the picked folder. */
  onOpenMuleXml: (path: string) => void;
  activeRequestId: string;
  onSelectRequest: (id: string) => void;
  onAddRequest: (kind: 'script' | 'test') => void;
  onRenameRequest: (id: string, name: string) => void;
  onRemoveRequest: (id: string) => void;
  onDuplicateRequest: (id: string) => void;
}

const railBtn = 'relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors [&>svg]:w-[18px] [&>svg]:h-[18px]';

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
    onOpenCurlImport, onInsertSnippet, railTools, onRailChange, onOpenAllTools, mcpRunning, onOpenSettings,
    collapsed, onToggleCollapse,
    requests, activeRequestId, onSelectRequest, onAddRequest, onRenameRequest, onRemoveRequest, onDuplicateRequest,
    onOpenScriptFile, onOpenMuleXml,
  } = props;

  // The folder whose .dwl files are listed for opening. Per machine, not per
  // workspace: it is a path on this disk.
  const [folder, setFolder] = useState(() => { try { return localStorage.getItem('dw.scriptFolder') || ''; } catch { return ''; } });
  const [folderFiles, setFolderFiles] = useState<string[]>([]);
  const [folderFilter, setFolderFilter] = useState('');
  const refreshFolder = useCallback(() => {
    if (!folder) { setFolderFiles([]); return; }
    invoke<string[]>('list_dwl_files', { dir: folder }).then(setFolderFiles).catch(() => setFolderFiles([]));
  }, [folder]);
  // Re-list on save (a new .dwl may have landed in it) and when the window
  // comes back, since a branch switch adds and removes files.
  useEffect(() => {
    refreshFolder();
    window.addEventListener('focus', refreshFolder);
    window.addEventListener('dw:workspaces-changed', refreshFolder);
    return () => {
      window.removeEventListener('focus', refreshFolder);
      window.removeEventListener('dw:workspaces-changed', refreshFolder);
    };
  }, [refreshFolder]);
  const pickFolder = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ directory: true, defaultPath: folder || undefined });
    if (typeof picked !== 'string') return;
    try { localStorage.setItem('dw.scriptFolder', picked); } catch { /* ignore */ }
    setFolderFilter('');
    setFolder(picked);
  };
  const folderSep = folder.includes('\\') ? '\\' : '/';
  const dirOf = (rel: string) => rel.slice(0, Math.max(0, rel.lastIndexOf('/')));
  const folderShown = folderFiles
    .filter((rel) => rel.toLowerCase().includes(folderFilter.trim().toLowerCase()))
    .sort((a, b) => dirOf(a).localeCompare(dirOf(b)) || a.localeCompare(b));
  // Test files get a group of their own, closed until asked for: recorded
  // MUnit fixtures can outnumber the real scripts a hundred to one.
  const isTestFile = (rel: string) => /(^|\/)src\/test\//.test(rel);
  const folderMain = folderShown.filter((rel) => !isTestFile(rel));
  const folderTests = folderShown.filter(isTestFile);
  const [folderTestsOpen, setFolderTestsOpen] = useState(false);
  const [folderCollapsed, setFolderCollapsed] = useState(() => { try { return localStorage.getItem('dw.scriptFolderCollapsed') === '1'; } catch { return false; } });
  const folderRow = (rel: string, prev: string | undefined) => {
    const full = folder.replace(/[\\/]+$/, '') + folderSep + rel.split('/').join(folderSep);
    const open = requests.find((r) => r.filePath?.toLowerCase() === full.toLowerCase());
    const dir = dirOf(rel);
    return (
      <div key={rel}>
        {dir && (prev === undefined || dirOf(prev) !== dir) && (
          <div className="px-1 pt-1.5 pb-0.5 text-[10.5px] font-mono truncate" style={{ color: 'var(--content-faint)' }} title={dir}>
            {dir}
          </div>
        )}
        <button
          onClick={() => (rel.toLowerCase().endsWith('.xml') ? onOpenMuleXml(full) : onOpenScriptFile(full))}
          title={full}
          className={`w-full flex items-center gap-2 h-7 px-2 rounded-md text-left cursor-pointer text-[12px] ${open?.id === activeRequestId ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
          style={{ color: 'var(--content)' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: open ? 'var(--accent)' : 'var(--line)' }}
            title={open ? 'Open in this workspace' : undefined}
          />
          <span className="truncate">{rel.slice(rel.lastIndexOf('/') + 1)}</span>
        </button>
      </div>
    );
  };

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
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string; kind: 'script' | 'test' } | null>(null);

  const togglePin = (filename: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename); else next.add(filename);
      savePinned(next);
      return next;
    });
  };

  // Shown in the footer; it changes when Settings moves the workspace folder.
  const [wsDir, setWsDir] = useState('');
  const refreshFiles = useCallback(() => {
    listWorkspaces().then(setFiles).catch(() => setFiles([]));
    invoke<string>('get_workspaces_dir').then(setWsDir).catch(() => setWsDir(''));
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
    } catch (e) {
      toast({ title: 'Could not save workspace', message: (e as Error).message || String(e), variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [railMenu, setRailMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const moveRail = (from: number, to: number) => {
    if (from === to) return;
    const ids = railTools.map((t) => t.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    onRailChange(ids);
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
        {/* Workspaces is the sidebar itself, so it is always first. */}
        <button
          onClick={() => handleRailClick('workspaces')}
          title={kbd('Workspaces (⌘O)')}
          aria-label="Workspaces"
          className={`${railBtn} ${!collapsed && tab === 'workspaces' ? 'bg-surface-2 text-content' : 'text-content-faint hover:text-content-secondary'}`}
        >
          {!collapsed && tab === 'workspaces' && <span className="absolute -left-2 top-2 bottom-2 w-0.5 bg-accent rounded-sm" />}
          <Icons.Workspaces size={18} />
        </button>
        <div className="mx-2 my-1.5 h-px bg-line-subtle" />

        {/* Pinned tools: drag to reorder, right-click to move or unpin. */}
        {railTools.map((t, i) => {
          const isActive = t.id === 'snippets' && !collapsed && tab === 'snippets';
          const lit = t.id === 'mcp' && mcpRunning;
          return (
            <button
              key={t.id}
              data-tour={`rail-${t.id}`}
              draggable
              onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); setDragOver(i); } }}
              onDragLeave={() => setDragOver((o) => (o === i ? null : o))}
              onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) moveRail(dragFrom, i); setDragFrom(null); setDragOver(null); }}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
              onClick={() => (t.id === 'snippets' ? handleRailClick('snippets') : t.run())}
              onContextMenu={(e) => { e.preventDefault(); setRailMenu({ index: i, x: e.clientX, y: e.clientY }); }}
              title={`${t.label}: ${t.desc}
Drag to reorder, or right-click to move or unpin.`}
              aria-label={t.label}
              className={`${railBtn} ${
                isActive ? 'bg-surface-2 text-content' : lit ? 'text-accent' : 'text-content-faint hover:text-content-secondary'
              } ${dragFrom === i ? 'opacity-40' : ''}`}
            >
              {isActive && <span className="absolute -left-2 top-2 bottom-2 w-0.5 bg-accent rounded-sm" />}
              {dragOver === i && dragFrom !== null && dragFrom !== i && (
                <span className={`absolute left-1 right-1 h-0.5 bg-accent rounded-sm ${dragFrom > i ? '-top-0.5' : '-bottom-0.5'}`} />
              )}
              {t.icon}
              {lit && <span className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-accent" style={{ boxShadow: '0 0 0 2px var(--rail)' }} />}
            </button>
          );
        })}
        <button
          data-tour="rail-all-tools"
          onClick={onOpenAllTools}
          title="All tools. Pin the ones you use to keep them here."
          aria-label="All tools"
          className={`${railBtn} text-content-faint hover:text-content-secondary`}
        >
          <Icons.More size={18} />
        </button>
        <div className="flex-1" />
        {isDirty && (
          <div className="mx-auto w-1.5 h-1.5 rounded-full bg-warn mb-1" title="Unsaved changes" />
        )}
        <button
          onClick={onOpenSettings}
          title={kbd("Settings (⌘,)")}
          aria-label="Settings"
          className="relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors text-content-faint hover:text-content-secondary"
        >
          <Icons.Settings size={18} />
        </button>
      </div>

      {railMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setRailMenu(null)} onContextMenu={(e) => { e.preventDefault(); setRailMenu(null); }} />
          <div
            role="menu"
            className="fixed z-50 min-w-[150px] py-1 rounded-lg border border-line bg-surface shadow-xl text-[12px]"
            style={{ left: railMenu.x + 4, top: railMenu.y }}
          >
            {[
              { label: 'Move up', show: railMenu.index > 0, run: () => moveRail(railMenu.index, railMenu.index - 1) },
              { label: 'Move down', show: railMenu.index < railTools.length - 1, run: () => moveRail(railMenu.index, railMenu.index + 1) },
              { label: 'Unpin from rail', show: true, run: () => onRailChange(railTools.filter((_, j) => j !== railMenu.index).map((t) => t.id)) },
            ].filter((m) => m.show).map((m) => (
              <button
                key={m.label}
                role="menuitem"
                onClick={() => { m.run(); setRailMenu(null); }}
                className="w-full text-left px-3 py-1.5 text-content-secondary hover:bg-surface-2 hover:text-content cursor-pointer"
              >
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}

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
                title={kbd("New workspace (⌘N)")}
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
                    title={isDirty ? kbd('Save workspace (⌘S)') : 'All changes saved'}
                  >
                    {saveFlash ? '✓ Saved' : saving ? 'Saving…' : (!isDirty && currentFile) ? '✓ Saved' : 'Save'}
                    {(isDirty || !currentFile) && !saveFlash && <span className="text-[10px] opacity-60 ml-1">{kbd('⌘S')}</span>}
                  </button>
                </div>

                {/* === What is in this workspace ===
                    Transforms and suites are separate lists, because they are
                    separate documents: clicking one is what decides whether
                    Run, Share and the editor are acting on a transform or on a
                    suite. They used to be one list where a suite hid inside a
                    transform, and nothing on screen said which you had. */}
                {([
                  ['script', 'Scripts', 'New script in this workspace'],
                  ['test', 'Tests', 'New dw::test suite in this workspace'],
                ] as const).map(([kind, heading, addTitle]) => {
                  const rows = requests.filter((r) => (r.kind ?? 'script') === kind);
                  return (
                    <div key={kind} className="px-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] uppercase tracking-[0.5px] font-semibold flex-1"
                          style={{ color: 'var(--content-faint)' }}
                        >
                          {heading} · {rows.length}
                        </span>
                        <button
                          onClick={() => onAddRequest(kind)}
                          title={addTitle}
                          className="w-5 h-5 rounded inline-flex items-center justify-center cursor-pointer hover:bg-surface-2"
                          style={{ color: 'var(--content-faint)' }}
                        >
                          <Icons.Plus size={11} />
                        </button>
                      </div>
                      {rows.length === 0 ? (
                        <div className="text-[11px] py-1 px-1 leading-relaxed" style={{ color: 'var(--content-faint)' }}>
                          No suites yet. Add one to write <span className="font-mono">dw::test</span> assertions.
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {rows.map((r) => (
                            <RequestNode
                              key={r.id}
                              name={r.name}
                              nodeLabel={kind === 'test' ? 'dw::test' : r.nodeLabel}
                              active={r.id === activeRequestId}
                              // The workspace always keeps one script; suites are
                              // free to be deleted down to none.
                              canRemove={kind === 'test' || rows.length > 1}
                              onClick={() => onSelectRequest(r.id)}
                              onRename={(next) => {
                                onRenameRequest(r.id, next);
                                toast({ title: kind === 'test' ? 'Suite renamed' : 'Script renamed', message: next, variant: 'success' });
                              }}
                              onDuplicate={() => onDuplicateRequest(r.id)}
                              onRemove={() => setConfirmRemove({ id: r.id, name: r.name, kind })}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* === .dwl files in a folder on disk === */}
                <div className="px-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (!folder) return;
                        try { localStorage.setItem('dw.scriptFolderCollapsed', folderCollapsed ? '0' : '1'); } catch { /* ignore */ }
                        setFolderCollapsed(!folderCollapsed);
                      }}
                      title={!folder ? undefined : folderCollapsed ? 'Show the file list' : 'Hide the file list'}
                      className={`flex items-center gap-1 flex-1 text-left text-[10px] uppercase tracking-[0.5px] font-semibold ${folder ? 'cursor-pointer' : ''}`}
                      style={{ color: 'var(--content-faint)' }}
                    >
                      {folder && <Icons.ChevronDown size={11} style={{ transform: folderCollapsed ? 'rotate(-90deg)' : undefined }} />}
                      Folder{folder ? ` · ${folderFiles.filter((rel) => !isTestFile(rel)).length}` : ''}
                    </button>
                    {folder && (
                      <button
                        onClick={() => {
                          try { localStorage.removeItem('dw.scriptFolder'); } catch { /* ignore */ }
                          setFolder('');
                          // Closing only hides the list, and that is not obvious from an X.
                          toast({
                            title: `Closed ${folder.split(/[\\/]/).filter(Boolean).pop()}`,
                            message: 'Only the file list is gone. Scripts you opened from it are still in this workspace, and nothing on disk changed.',
                            variant: 'success',
                          });
                        }}
                        title="Close this folder (opened scripts stay, files are not changed)"
                        aria-label="Stop listing this folder"
                        className="w-5 h-5 rounded inline-flex items-center justify-center cursor-pointer hover:bg-surface-2"
                        style={{ color: 'var(--content-faint)' }}
                      >
                        <Icons.X size={11} />
                      </button>
                    )}
                    <button
                      onClick={pickFolder}
                      title={folder ? 'Pick another folder' : 'Pick a folder'}
                      aria-label={folder ? 'Pick another folder' : 'Pick a folder'}
                      className="w-5 h-5 rounded inline-flex items-center justify-center cursor-pointer hover:bg-surface-2"
                      style={{ color: 'var(--content-faint)' }}
                    >
                      <Icons.Folder size={11} />
                    </button>
                  </div>
                  {!folder ? (
                    <div className="text-[11px] py-1 px-1 leading-relaxed" style={{ color: 'var(--content-faint)' }}>
                      Pick a folder, such as a Mule project, to open its flow XML transforms and <span className="font-mono">.dwl</span> files from here.
                    </div>
                  ) : folderCollapsed ? null : (
                    <>
                      <div className="px-1 text-[10.5px] font-mono truncate" style={{ color: 'var(--content-faint)' }} title={folder}>
                        {folder.split(/[\\/]/).filter(Boolean).pop()}
                      </div>
                      {folderFiles.length > 8 && (
                        <input
                          value={folderFilter}
                          onChange={(e) => setFolderFilter(e.target.value)}
                          placeholder="Filter files"
                          spellCheck={false}
                          className="w-full h-6 px-2 rounded text-[11.5px] outline-none"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--content)' }}
                        />
                      )}
                      {folderShown.length === 0 ? (
                        <div className="text-[11px] py-1 px-1 leading-relaxed" style={{ color: 'var(--content-faint)' }}>
                          {folderFiles.length === 0 ? <>No flow XML or <span className="font-mono">.dwl</span> files in this folder.</> : 'No matches.'}
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {folderMain.map((rel, i) => folderRow(rel, folderMain[i - 1]))}
                          {folderTests.length > 0 && (
                            <button
                              onClick={() => setFolderTestsOpen((o) => !o)}
                              title="Files under src/test"
                              className="w-full flex items-center gap-1.5 h-6 px-1 mt-1 rounded text-left cursor-pointer hover:bg-surface-2 text-[10px] uppercase tracking-[0.5px] font-semibold"
                              style={{ color: 'var(--content-faint)' }}
                            >
                              <Icons.ChevronDown size={11} style={{ transform: folderTestsOpen || folderFilter.trim() ? undefined : 'rotate(-90deg)' }} />
                              Tests · {folderTests.length}
                            </button>
                          )}
                          {(folderTestsOpen || folderFilter.trim() !== '') && folderTests.map((rel, i) => folderRow(rel, folderTests[i - 1]))}
                        </div>
                      )}
                    </>
                  )}
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
                      Nothing saved yet. <span className="font-mono">{kbd('⌘S')}</span> saves this workspace.
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
                  Click to replace the current script. Use <span className="font-mono">{kbd('⌘Z')}</span> to undo.
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
                title={`Open the workspace folder${wsDir ? `: ${wsDir}` : ''}`}
              >
                Saves to {wsDir ? wsDir.split(/[\\/]/).filter(Boolean).slice(-2).join('/') : 'the workspace folder'} ↗
              </button>
            ) : (
              <div className="truncate">Saved inside the VS Code extension storage</div>
            )}
            <div className="truncate" title="DataWeave runtime by MuleSoft/Salesforce, Apache License 2.0">
              DW runtime by MuleSoft (Apache 2.0)
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
            {confirmDelete && confirmDelete.requestCount > 1 ? <> (all {confirmDelete.requestCount} scripts and suites in it)</> : null}.
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

      {/* Deleting a script or suite had no confirmation and no undo. */}
      <ConfirmDialog
        open={confirmRemove !== null}
        title={requests.find((r) => r.id === confirmRemove?.id)?.filePath ? 'Remove from workspace?' : confirmRemove?.kind === 'test' ? 'Delete test suite?' : 'Delete script?'}
        description={
          <>
            <ConfirmFile name={confirmRemove?.name || ''} /> will be removed from this workspace
            {confirmRemove?.kind === 'test' ? '' : ', along with its payload and context'}.{' '}
            {requests.find((r) => r.id === confirmRemove?.id)?.filePath
              ? <>The file on disk is not changed, so you can open it again. Edits you have not saved are lost.</>
              : <>This can&rsquo;t be undone.</>}
          </>
        }
        tone="danger"
        confirmLabel={requests.find((r) => r.id === confirmRemove?.id)?.filePath ? 'Remove' : 'Delete'}
        onConfirm={() => { if (confirmRemove) onRemoveRequest(confirmRemove.id); }}
        onClose={() => setConfirmRemove(null)}
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
  const reqs = `${meta.requestCount} script${meta.requestCount === 1 ? '' : 's'}`;
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
          title="Rename, duplicate or delete"
          aria-label="Script actions"
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
          title={`${name || 'Untitled'}. Double-click to rename`}
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

