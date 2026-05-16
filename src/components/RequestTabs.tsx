import { useEffect, useRef, useState } from 'react';
import { Icons } from './Icons';
import { Request } from '../types';

interface RequestTabsProps {
  requests: Request[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * Horizontal tab strip showing all requests in the current workspace.
 * Each tab = one request. Right-click for rename / duplicate / delete.
 * The trailing `+` button creates a new blank request.
 *
 * Lives between the main header and the body so it's always visible
 * while the user works on any request.
 */
export function RequestTabs({ requests, activeId, onSelect, onAdd, onRename, onDuplicate, onRemove }: RequestTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) requestAnimationFrame(() => inputRef.current?.select());
  }, [editingId]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    return () => {
      window.removeEventListener('mousedown', close);
    };
  }, [contextMenu]);

  const commitRename = () => {
    if (editingId && draft.trim()) {
      onRename(editingId, draft.trim());
    }
    setEditingId(null);
  };

  return (
    <div
      className="h-9 shrink-0 flex items-center overflow-x-auto"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--line-subtle)',
      }}
    >
      <div className="flex items-stretch h-full">
        {requests.map((r) => {
          const isActive = r.id === activeId;
          const isEditing = editingId === r.id;
          return (
            <div
              key={r.id}
              onClick={() => !isEditing && onSelect(r.id)}
              onDoubleClick={() => { setEditingId(r.id); setDraft(r.name); }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ id: r.id, x: e.clientX, y: e.clientY });
              }}
              className="group relative inline-flex items-center gap-2 h-full px-3 cursor-pointer select-none whitespace-nowrap"
              style={{
                background: isActive ? 'var(--bg)' : 'transparent',
                color: isActive ? 'var(--content)' : 'var(--content-muted)',
                borderRight: '1px solid var(--line-subtle)',
                fontSize: 12,
                fontWeight: isActive ? 500 : 400,
              }}
            >
              {/* Active indicator bar at the top */}
              {isActive && (
                <span
                  className="absolute top-0 left-0 right-0"
                  style={{ height: 2, background: 'var(--accent)' }}
                />
              )}
              <Icons.Braces
                size={11}
                style={{ color: isActive ? 'var(--accent)' : 'var(--content-faint)' }}
              />
              {isEditing ? (
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                    if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent outline-none text-[12px] min-w-[80px] max-w-[180px]"
                  style={{ color: 'var(--content)' }}
                  spellCheck={false}
                />
              ) : (
                <span className="truncate max-w-[180px]">{r.name}</span>
              )}
              {requests.length > 1 && !isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(r.id);
                  }}
                  className="ml-1 w-4 h-4 rounded inline-flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-surface-2 cursor-pointer"
                  title="Close request"
                  aria-label={`Close ${r.name}`}
                >
                  <Icons.X size={9} />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={onAdd}
          className="inline-flex items-center justify-center w-9 h-full cursor-pointer hover:bg-surface-2"
          style={{ color: 'var(--content-faint)' }}
          title="New request"
          aria-label="Add request"
        >
          <Icons.Plus size={12} />
        </button>
      </div>

      {contextMenu && (
        <div
          className="fixed z-[60] py-1 rounded-md min-w-[160px]"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: '0 8px 24px color-mix(in oklch, oklch(0% 0 0) 40%, transparent)',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <MenuItem onClick={() => {
            setContextMenu(null);
            const r = requests.find((x) => x.id === contextMenu.id);
            if (r) { setEditingId(r.id); setDraft(r.name); }
          }}>Rename</MenuItem>
          <MenuItem onClick={() => { setContextMenu(null); onDuplicate(contextMenu.id); }}>Duplicate</MenuItem>
          {requests.length > 1 && (
            <>
              <div style={{ height: 1, background: 'var(--line-subtle)', margin: '4px 0' }} />
              <MenuItem
                danger
                onClick={() => { setContextMenu(null); onRemove(contextMenu.id); }}
              >
                Delete
              </MenuItem>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-[12px] cursor-pointer hover:bg-surface-2"
      style={{ color: danger ? 'var(--err)' : 'var(--content-secondary)' }}
    >
      {children}
    </button>
  );
}
