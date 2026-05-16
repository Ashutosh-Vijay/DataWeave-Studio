import { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from './Icons';

export interface WorkspaceMeta {
  filename: string;
  projectName: string;
}

interface OpenWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  listWorkspaces: () => Promise<WorkspaceMeta[]>;
  onOpen: (filename: string) => void | Promise<void>;
  onNew?: () => void;
  currentFile?: string | null;
}

export function OpenWorkspaceDialog({ open, onClose, listWorkspaces, onOpen, onNew, currentFile }: OpenWorkspaceDialogProps) {
  const [items, setItems] = useState<WorkspaceMeta[]>([]);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    listWorkspaces().then(setItems).catch(() => setItems([]));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, listWorkspaces]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (m) => m.filename.toLowerCase().includes(needle) || m.projectName.toLowerCase().includes(needle),
    );
  }, [items, q]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  // Keep active row scrolled into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const choose = (idx: number) => {
    const m = filtered[idx];
    if (!m) return;
    onOpen(m.filename);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      style={{
        background: 'color-mix(in oklch, var(--bg) 60%, transparent)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[620px] rounded-xl overflow-hidden flex flex-col"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: '0 28px 80px color-mix(in oklch, oklch(0% 0 0) 55%, transparent)',
          maxHeight: 'min(72vh, 620px)',
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        {/* Header strip */}
        <div className="px-4 pt-3.5 pb-2.5 flex items-center gap-2.5 shrink-0">
          <Icons.Folder size={15} style={{ color: 'var(--content-muted)' }} />
          <span className="text-[14px] font-semibold flex-1" style={{ color: 'var(--content)' }}>
            Open workspace
          </span>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center cursor-pointer hover:bg-surface-2"
            style={{ color: 'var(--content-faint)' }}
            aria-label="Close"
          >
            <Icons.X size={13} />
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 pb-3 shrink-0">
          <div
            className="flex items-center gap-2 h-8 px-2.5 rounded-md"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
            }}
          >
            <Icons.Search size={13} style={{ color: 'var(--content-muted)' }} />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search workspaces…"
              className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-content-ghost"
              style={{ color: 'var(--content)' }}
            />
            <span
              className="text-[10.5px] font-mono px-1.5 rounded"
              style={{
                background: 'var(--surface-3)',
                color: 'var(--content-faint)',
              }}
            >
              ⌘O
            </span>
          </div>
        </div>

        {/* List */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-2 pb-1"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="text-[13px] mb-1" style={{ color: 'var(--content-secondary)' }}>
                {items.length === 0 ? 'No saved workspaces yet.' : 'No matches.'}
              </div>
              <div className="text-[11.5px]" style={{ color: 'var(--content-faint)' }}>
                {items.length === 0 ? 'Save your first workspace with ⌘S.' : 'Try a different search.'}
              </div>
            </div>
          ) : (
            filtered.map((m, i) => {
              const isActive = i === active;
              const isCurrent = currentFile === m.filename;
              return (
                <button
                  key={m.filename}
                  data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 my-px rounded-md text-left cursor-pointer transition-colors"
                  style={{
                    background: isActive ? 'var(--accent-dim)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    paddingLeft: isActive ? '10px' : '12px',
                  }}
                >
                  <Icons.Braces
                    size={14}
                    style={{ color: isActive ? 'var(--accent)' : 'var(--content-faint)' }}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[13px] truncate"
                      style={{
                        color: isActive ? 'var(--content)' : 'var(--content-secondary)',
                        fontWeight: isActive ? 500 : 400,
                      }}
                    >
                      {m.projectName || m.filename}
                    </div>
                    <div
                      className="text-[11px] truncate mt-0.5 font-mono"
                      style={{ color: 'var(--content-faint)' }}
                    >
                      {m.filename}
                    </div>
                  </div>
                  {isCurrent && (
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
                      style={{
                        background: 'var(--accent-dim)',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent-border)',
                      }}
                    >
                      open
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          className="h-10 shrink-0 px-4 flex items-center gap-3 text-[11px]"
          style={{
            borderTop: '1px solid var(--line-subtle)',
            background: 'var(--surface-2)',
            color: 'var(--content-faint)',
          }}
        >
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span className="flex-1" />
          <span>{filtered.length} workspace{filtered.length === 1 ? '' : 's'}</span>
          {onNew && (
            <button
              onClick={() => { onClose(); onNew(); }}
              className="ml-2 inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] cursor-pointer transition-colors"
              style={{
                background: 'transparent',
                border: '1px solid var(--line-secondary)',
                color: 'var(--content-secondary)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.color = 'var(--accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line-secondary)'; e.currentTarget.style.color = 'var(--content-secondary)'; }}
            >
              <Icons.Plus size={11} /> New
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
