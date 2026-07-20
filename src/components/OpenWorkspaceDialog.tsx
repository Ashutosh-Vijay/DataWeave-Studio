/**
 * Workspace Manager (⌘O) — the one authoritative surface for workspaces.
 *
 * Split palette: search + grouped list (Pinned / Recent) on the left, a live
 * preview of the selected workspace on the right — its requests with
 * node-type dots (same colors as the Flow designer), flow badge, timestamps,
 * and the on-disk filename. Everything works without opening anything:
 * ↵ open · F2 rename · ⌘D duplicate · Del delete · pin. Renames and
 * duplicates operate on the file directly (rename_workspace /
 * duplicate_workspace_file); the sidebar stays in sync via dw:workspaces-changed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from './Icons';
import { ConfirmDialog, ConfirmFile } from './ConfirmDialog';
import { toast } from './Toast';

export interface WorkspaceMeta {
  filename: string;
  projectName: string;
  requestCount?: number;
  updatedAt?: string;
  createdAt?: string;
  flowCount?: number;
  requests?: { name: string; nodeLabel: string }[];
}

const PINNED_KEY = 'dw.pinned'; // shared with Sidebar — same set, same event

function getPinned(): Set<string> {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}
function savePinned(s: Set<string>) {
  try { localStorage.setItem(PINNED_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

function timeAgo(iso?: string): string {
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

function shortDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}

/** Node-type dot color — the Flow designer's own palette, so the whole app
 *  speaks one color language (Transform=accent, SF=#00a1e0, DB=#a855f7).
 *  Shared with the sidebar's request rows. */
export function nodeDot(label: string): string {
  if (label === 'Salesforce Query') return '#00a1e0';
  if (label === 'DB Query') return '#a855f7';
  if (label === 'Transform') return 'var(--accent)';
  return 'var(--content-faint)';
}

interface OpenWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  listWorkspaces: () => Promise<WorkspaceMeta[]>;
  onOpen: (filename: string) => void | Promise<void>;
  onNew?: () => void;
  currentFile?: string | null;
  isDirty?: boolean;
  onRename?: (filename: string, newName: string) => Promise<string>;
  onDuplicate?: (filename: string) => Promise<string>;
  onDelete?: (filename: string) => Promise<void>;
}

export function OpenWorkspaceDialog({
  open, onClose, listWorkspaces, onOpen, onNew, currentFile, isDirty,
  onRename, onDuplicate, onDelete,
}: OpenWorkspaceDialogProps) {
  const [items, setItems] = useState<WorkspaceMeta[]>([]);
  const [q, setQ] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(() => getPinned());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<WorkspaceMeta | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const refresh = () => listWorkspaces().then(setItems).catch(() => setItems([]));

  useEffect(() => {
    if (!open) return;
    setQ('');
    setRenaming(null);
    setPinned(getPinned());
    refresh();
    requestAnimationFrame(() => inputRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (renaming) requestAnimationFrame(() => renameRef.current?.select());
  }, [renaming]);

  // Search matches workspace names, filenames, AND request names — "loan"
  // finds the workspace containing a request called "loan lookup".
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((m) =>
      m.filename.toLowerCase().includes(needle) ||
      m.projectName.toLowerCase().includes(needle) ||
      (m.requests ?? []).some((r) => r.name.toLowerCase().includes(needle)),
    );
  }, [items, q]);

  // Pinned first, then recent — one flat order for ↑↓ navigation.
  const pinnedList = filtered.filter((m) => pinned.has(m.filename));
  const recentList = filtered.filter((m) => !pinned.has(m.filename));
  const flat = [...pinnedList, ...recentList];

  // Selection tracks a filename (stable across refreshes); falls back to first.
  const selIdx = Math.max(0, flat.findIndex((m) => m.filename === selectedFile));
  const sel: WorkspaceMeta | undefined = flat[selIdx];

  useEffect(() => { setSelectedFile(flat[0]?.filename ?? null); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [q, open]);

  // Keep the selected row in view while arrowing.
  useEffect(() => {
    if (!listRef.current || !sel) return;
    listRef.current.querySelector<HTMLElement>(`[data-file="${CSS.escape(sel.filename)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel?.filename]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (dir: 1 | -1) => {
    if (flat.length === 0) return;
    const next = Math.min(flat.length - 1, Math.max(0, selIdx + dir));
    setSelectedFile(flat[next].filename);
  };

  const openSel = () => {
    if (!sel) return;
    if (sel.filename === currentFile) { onClose(); return; } // already open
    void onOpen(sel.filename);
    onClose();
  };

  const startRename = () => {
    if (!sel || !onRename) return;
    setDraft(sel.projectName || sel.filename.replace(/\.dwstudio$/, ''));
    setRenaming(sel.filename);
  };

  const commitRename = async () => {
    const file = renaming;
    const name = draft.trim();
    setRenaming(null);
    // The rename input unmounts and focus falls to <body> — outside the React
    // root, where the dialog's onKeyDown never fires. Reclaim it or every
    // shortcut (↑↓, ↵, ⌘D…) goes dead until the user clicks the search box.
    requestAnimationFrame(() => inputRef.current?.focus());
    if (!file || !name || !onRename) return;
    const before = items.find((m) => m.filename === file);
    if (before && before.projectName === name) return;
    try {
      const newFile = await onRename(file, name);
      // Pin + selection follow the file to its new name.
      setPinned((prev) => {
        if (!prev.has(file)) return prev;
        const next = new Set(prev);
        next.delete(file); next.add(newFile);
        savePinned(next);
        return next;
      });
      setSelectedFile(newFile);
      await refresh();
      toast({ title: 'Workspace renamed', message: name, variant: 'success' });
    } catch (err) {
      toast({ title: 'Rename failed', message: String(err), variant: 'error' });
    }
  };

  const duplicateSel = async () => {
    if (!sel || !onDuplicate) return;
    try {
      const newFile = await onDuplicate(sel.filename);
      await refresh();
      setSelectedFile(newFile);
      toast({ title: 'Workspace duplicated', message: newFile.replace(/\.dwstudio$/, ''), variant: 'success' });
    } catch (err) {
      toast({ title: 'Duplicate failed', message: String(err), variant: 'error' });
    }
  };

  const deleteSel = async () => {
    const m = confirmDelete;
    if (!m || !onDelete) return;
    await onDelete(m.filename);
    setPinned((prev) => {
      if (!prev.has(m.filename)) return prev;
      const next = new Set(prev);
      next.delete(m.filename);
      savePinned(next);
      return next;
    });
    await refresh();
    toast({ title: 'Workspace deleted', message: m.projectName || m.filename, variant: 'success' });
  };

  const togglePin = (filename: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename); else next.add(filename);
      savePinned(next);
      return next;
    });
    // Nudge the sidebar to re-read the pin set.
    window.dispatchEvent(new CustomEvent('dw:workspaces-changed'));
  };

  // Keyboard handling lives on WINDOW, not the panel: action buttons and the
  // rename input take focus and then unmount, dropping focus onto <body> —
  // outside the React root, where a panel onKeyDown would never fire again.
  // A window listener keeps ↑↓/↵/F2/⌘D alive no matter where focus landed.
  // (The rename input stopPropagation's its own Enter/Escape before this runs.)
  const onKey = (e: KeyboardEvent) => {
    if (confirmDelete) return; // the ConfirmDialog owns Enter/Escape while open
    if (e.key === 'Escape') {
      if (renaming) { setRenaming(null); requestAnimationFrame(() => inputRef.current?.focus()); return; }
      onClose(); return;
    }
    if (renaming) return; // rename input owns the keyboard
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); openSel(); }
    else if (e.key === 'F2') { e.preventDefault(); startRename(); }
    else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault(); void duplicateSel();
    } else if (e.key === 'Delete' && sel && onDelete) {
      // Only when it can't be text editing: outside the input, or input empty.
      const t = e.target as HTMLElement;
      if (!(t instanceof HTMLInputElement) || !t.value) { e.preventDefault(); setConfirmDelete(sel); }
    }
  };
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey; // fresh closure every render — no stale state

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  // Early return must sit BELOW every hook — a hook after a conditional
  // return crashes React ("Rendered more hooks than during the previous
  // render") the moment `open` flips.
  if (!open) return null;

  const isCurrent = (f: string) => f === currentFile;

  const row = (m: WorkspaceMeta) => {
    const active = m.filename === sel?.filename;
    const name = m.projectName || m.filename.replace(/\.dwstudio$/, '');
    const isPin = pinned.has(m.filename);
    const meta = [
      m.requestCount != null ? `${m.requestCount} request${m.requestCount === 1 ? '' : 's'}` : null,
      (m.flowCount ?? 0) > 0 ? `${m.flowCount === 1 ? 'flow' : `${m.flowCount} flows`}` : null,
      timeAgo(m.updatedAt) || null,
    ].filter(Boolean).join(' · ');
    return (
      <div
        key={m.filename}
        data-file={m.filename}
        onMouseEnter={() => !renaming && setSelectedFile(m.filename)}
        // Hover already previews, so a click goes straight to opening — same
        // one-click speed as the old picker. (While renaming, clicks only
        // commit/cancel via the input's blur; they never switch workspaces.)
        onClick={() => { if (renaming) return; setSelectedFile(m.filename); if (m.filename === sel?.filename) openSel(); }}
        className="group w-full flex items-center gap-2.5 px-3 py-2 my-px rounded-md text-left cursor-pointer"
        style={{
          background: active ? 'var(--accent-dim)' : 'transparent',
          borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
          paddingLeft: active ? '10px' : '12px',
        }}
      >
        <Icons.Braces size={14} style={{ color: active ? 'var(--accent)' : 'var(--content-faint)' }} className="shrink-0" />
        <div className="flex-1 min-w-0">
          {renaming === m.filename ? (
            <input
              ref={renameRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); void commitRename(); }
                if (e.key === 'Escape') setRenaming(null);
              }}
              className="w-full bg-transparent outline-none text-[13px]"
              style={{ color: 'var(--content)', borderBottom: '1px solid var(--accent)' }}
              spellCheck={false}
            />
          ) : (
            <div className="text-[13px] truncate" style={{ color: active ? 'var(--content)' : 'var(--content-secondary)', fontWeight: active ? 500 : 400 }}>
              {name}
            </div>
          )}
          <div className="text-[10.5px] font-mono truncate mt-0.5" style={{ color: 'var(--content-faint)' }}>
            {isCurrent(m.filename) ? (isDirty ? 'editing now · unsaved changes' : 'editing now') : meta || m.filename}
          </div>
        </div>
        {isCurrent(m.filename) && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
            open
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); togglePin(m.filename); }}
          title={isPin ? 'Unpin' : 'Pin to top'}
          aria-label={isPin ? `Unpin ${name}` : `Pin ${name}`}
          className={`shrink-0 cursor-pointer transition-opacity ${isPin ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          style={{ color: isPin ? 'var(--accent)' : 'var(--content-faint)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={isPin ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="17" x2="12" y2="22" />
            <path d="M5 17h14l-1.5-3V8a5.5 5.5 0 0 0-11 0v6L5 17z" />
          </svg>
        </button>
      </div>
    );
  };

  const sectionLabel = (text: string) => (
    <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold tracking-[0.6px] uppercase" style={{ color: 'var(--content-faint)' }}>
      {text}
    </div>
  );

  const selName = sel ? (sel.projectName || sel.filename.replace(/\.dwstudio$/, '')) : '';
  const selReqs = sel?.requests ?? [];
  const selShown = selReqs.slice(0, 8);
  const selMore = (sel?.requestCount ?? selReqs.length) - selShown.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 60%, transparent)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <style>{`
        @keyframes wmPop { from { opacity: 0; transform: translateY(10px) scale(.985) } to { opacity: 1; transform: none } }
        @keyframes wmFade { from { opacity: 0 } to { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .wm-pop, .wm-fade { animation: none !important } }
      `}</style>
      <div
        className="wm-pop w-full max-w-[880px] rounded-xl overflow-hidden flex flex-col"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: '0 28px 80px color-mix(in oklch, oklch(0% 0 0) 55%, transparent)',
          maxHeight: 'min(66vh, 580px)',
          height: 'min(66vh, 580px)',
          animation: 'wmPop .18s cubic-bezier(.2,.9,.3,1) both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-3.5 pb-2.5 flex items-center gap-2.5 shrink-0">
          <Icons.Workspaces size={15} style={{ color: 'var(--content-muted)' }} />
          <span className="text-[14px] font-semibold" style={{ color: 'var(--content)' }}>Workspaces</span>
          <span className="text-[11px] font-mono" style={{ color: 'var(--content-ghost)' }}>{items.length}</span>
          <span className="flex-1" />
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center cursor-pointer hover:bg-surface-2"
            style={{ color: 'var(--content-faint)' }}
            aria-label="Close"
          >
            <Icons.X size={13} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3 shrink-0">
          <div className="flex items-center gap-2 h-8 px-2.5 rounded-md" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <Icons.Search size={13} style={{ color: 'var(--content-muted)' }} />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search workspaces and requests…"
              className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-content-ghost"
              style={{ color: 'var(--content)' }}
            />
            <span className="text-[10.5px] font-mono px-1.5 rounded" style={{ background: 'var(--surface-3)', color: 'var(--content-faint)' }}>⌘O</span>
          </div>
        </div>

        {/* Body: list | preview */}
        <div className="flex-1 flex min-h-0">
          <div ref={listRef} className="flex-1 min-w-0 overflow-y-auto px-2 pb-2">
            {flat.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <div className="text-[13px] mb-1" style={{ color: 'var(--content-secondary)' }}>
                  {items.length === 0 ? 'Nothing saved yet.' : `No matches for “${q.trim()}”.`}
                </div>
                <div className="text-[11.5px]" style={{ color: 'var(--content-faint)' }}>
                  {items.length === 0 ? '⌘S saves your first workspace.' : 'Search also looks inside request names.'}
                </div>
              </div>
            ) : (
              <>
                {pinnedList.length > 0 && sectionLabel('Pinned')}
                {pinnedList.map(row)}
                {pinnedList.length > 0 && recentList.length > 0 && sectionLabel('Recent')}
                {recentList.map(row)}
              </>
            )}
          </div>

          {/* Preview pane — the point of the manager: see inside before opening. */}
          {sel && (
            <div
              key={sel.filename}
              className="wm-fade w-[290px] shrink-0 flex flex-col px-4 pt-3 pb-3.5 overflow-y-auto"
              style={{ borderLeft: '1px solid var(--line-subtle)', animation: 'wmFade .12s ease both' }}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold truncate" style={{ color: 'var(--content)' }}>{selName}</div>
                  <div className="text-[10.5px] font-mono mt-1" style={{ color: isCurrent(sel.filename) && isDirty ? 'var(--warn)' : 'var(--content-faint)' }}>
                    {isCurrent(sel.filename)
                      ? (isDirty ? 'editing now · unsaved changes' : 'editing now')
                      : [
                          `${sel.requestCount ?? 0} request${(sel.requestCount ?? 0) === 1 ? '' : 's'}`,
                          (sel.flowCount ?? 0) > 0 ? `${sel.flowCount} flow${(sel.flowCount ?? 0) === 1 ? '' : 's'}` : null,
                        ].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>

              <div className="my-3 h-px shrink-0" style={{ background: 'var(--line-subtle)' }} />

              <div className="text-[10px] font-semibold tracking-[0.6px] uppercase mb-1.5" style={{ color: 'var(--content-faint)' }}>
                Requests
              </div>
              <div className="space-y-1">
                {selShown.length === 0 ? (
                  <div className="text-[11.5px]" style={{ color: 'var(--content-ghost)' }}>
                    {(sel.flowCount ?? 0) > 0 ? 'Flow-based workspace.' : 'No request details available.'}
                  </div>
                ) : (
                  selShown.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 min-w-0">
                      <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: nodeDot(r.nodeLabel) }} title={r.nodeLabel} />
                      <span className="text-[12px] truncate" style={{ color: 'var(--content-secondary)' }}>{r.name}</span>
                    </div>
                  ))
                )}
                {selMore > 0 && (
                  <div className="text-[11px] pl-[15px]" style={{ color: 'var(--content-ghost)' }}>+{selMore} more</div>
                )}
              </div>

              <div className="flex-1 min-h-[12px]" />

              <div className="space-y-1 text-[11px] shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-14" style={{ color: 'var(--content-ghost)' }}>Updated</span>
                  <span className="font-mono" style={{ color: 'var(--content-faint)' }}>{timeAgo(sel.updatedAt) || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-14" style={{ color: 'var(--content-ghost)' }}>Created</span>
                  <span className="font-mono" style={{ color: 'var(--content-faint)' }}>{shortDate(sel.createdAt)}</span>
                </div>
                <div className="font-mono text-[10px] truncate pt-1" style={{ color: 'var(--content-ghost)' }} title={sel.filename}>
                  {sel.filename}
                </div>
              </div>

              <div className="flex items-center gap-1.5 pt-3 shrink-0">
                {isCurrent(sel.filename) ? (
                  <span className="flex-1 h-7 rounded-md inline-flex items-center justify-center text-[12px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--content-faint)' }}>
                    Already open
                  </span>
                ) : (
                  <button
                    onClick={openSel}
                    className="flex-1 h-7 rounded-md inline-flex items-center justify-center gap-1.5 text-[12px] font-medium cursor-pointer hover:brightness-110"
                    style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                  >
                    Open <span className="font-mono text-[10px] opacity-70">↵</span>
                  </button>
                )}
                {onRename && (
                  <button
                    onClick={startRename}
                    title="Rename (F2)"
                    aria-label={`Rename ${selName}`}
                    className="w-7 h-7 rounded-md inline-flex items-center justify-center cursor-pointer hover:bg-surface-2"
                    style={{ border: '1px solid var(--line)', color: 'var(--content-faint)' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </button>
                )}
                {onDuplicate && (
                  <button
                    onClick={() => void duplicateSel()}
                    title="Duplicate (⌘D)"
                    aria-label={`Duplicate ${selName}`}
                    className="w-7 h-7 rounded-md inline-flex items-center justify-center cursor-pointer hover:bg-surface-2"
                    style={{ border: '1px solid var(--line)', color: 'var(--content-faint)' }}
                  >
                    <Icons.Copy size={12} />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => setConfirmDelete(sel)}
                    title="Delete (Del)"
                    aria-label={`Delete ${selName}`}
                    className="w-7 h-7 rounded-md inline-flex items-center justify-center cursor-pointer hover:bg-surface-2 hover:!text-err"
                    style={{ border: '1px solid var(--line)', color: 'var(--content-faint)' }}
                  >
                    <Icons.Trash size={12} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-10 shrink-0 px-4 flex items-center gap-3 text-[11px]" style={{ borderTop: '1px solid var(--line-subtle)', background: 'var(--surface-2)', color: 'var(--content-faint)' }}>
          <span className="font-mono">↑↓</span><span>navigate</span>
          <span className="font-mono">↵</span><span>open</span>
          <span className="font-mono">F2</span><span>rename</span>
          <span className="font-mono">⌘D</span><span>duplicate</span>
          <span className="flex-1" />
          {onNew && (
            <button
              onClick={() => { onClose(); onNew(); }}
              className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] cursor-pointer transition-colors"
              style={{ background: 'transparent', border: '1px solid var(--line-secondary)', color: 'var(--content-secondary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.color = 'var(--accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line-secondary)'; e.currentTarget.style.color = 'var(--content-secondary)'; }}
            >
              <Icons.Plus size={11} /> New workspace
            </button>
          )}
        </div>
      </div>

      {/* Delete confirmation — same pattern as the sidebar's. */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete workspace?"
        description={
          <>
            <ConfirmFile name={confirmDelete?.projectName || (confirmDelete?.filename || '').replace(/\.dwstudio$/, '')} /> will be permanently removed
            {confirmDelete && (confirmDelete.requestCount ?? 0) > 1 ? <> (all {confirmDelete.requestCount} requests)</> : null}.
            This can&rsquo;t be undone.
          </>
        }
        tone="danger"
        confirmLabel="Delete"
        onConfirm={deleteSel}
        // ConfirmDialog focused its own button; when it unmounts, focus falls
        // to <body> and the manager's keyboard dies — reclaim the search box.
        onClose={() => { setConfirmDelete(null); requestAnimationFrame(() => inputRef.current?.focus()); }}
      />
    </div>
  );
}
