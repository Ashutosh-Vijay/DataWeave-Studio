import { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from './Icons';

interface OpenWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  listWorkspaces: () => Promise<string[]>;
  onOpen: (filename: string) => void | Promise<void>;
  currentFile?: string | null;
}

export function OpenWorkspaceDialog({ open, onClose, listWorkspaces, onOpen, currentFile }: OpenWorkspaceDialogProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    listWorkspaces().then((list) => setFiles(list)).catch(() => setFiles([]));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, listWorkspaces]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return files;
    return files.filter((f) => f.toLowerCase().includes(needle));
  }, [files, q]);

  useEffect(() => { setActive(0); }, [q]);

  if (!open) return null;

  const choose = (idx: number) => {
    const f = filtered[idx];
    if (!f) return;
    onOpen(f);
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
      style={{ background: 'color-mix(in oklch, var(--bg) 60%, transparent)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface border border-line rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="h-11 shrink-0 flex items-center gap-2 px-3.5 border-b border-line">
          <Icons.Search size={14} className="text-content-faint shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Open workspace…"
            className="flex-1 bg-transparent text-[13px] text-content placeholder:text-content-ghost outline-none"
          />
          <span className="font-mono text-[10.5px] text-content-faint">Esc</span>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-content-faint">
              {files.length === 0 ? 'No saved workspaces yet.' : 'No matches.'}
            </div>
          ) : (
            filtered.map((f, i) => {
              const isActive = i === active;
              const isCurrent = currentFile === f;
              return (
                <button
                  key={f}
                  data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={`w-full flex items-center gap-2.5 px-3.5 h-8 text-left cursor-pointer ${
                    isActive ? 'bg-surface-2' : 'hover:bg-surface-2'
                  }`}
                >
                  <Icons.Braces size={13} className="text-content-faint shrink-0" />
                  <span className="flex-1 text-[12.5px] text-content truncate">
                    {f.replace(/\.json$/, '').replace(/\.dwstudio$/, '')}
                  </span>
                  {isCurrent && (
                    <span className="font-mono text-[10px] text-content-ghost">current</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="h-8 shrink-0 px-3.5 flex items-center border-t border-line text-[10.5px] text-content-ghost gap-3">
          <span>↑↓ to navigate</span>
          <span>↵ to open</span>
          <span className="flex-1" />
          <span>{filtered.length} workspace{filtered.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}
