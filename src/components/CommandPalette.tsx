import { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from './Icons';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  group?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((c) => {
      const hay = `${c.label} ${c.hint ?? ''} ${c.group ?? ''}`.toLowerCase();
      return needle.split(/\s+/).every((tok) => hay.includes(tok));
    });
  }, [commands, q]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const grouped: { group: string; items: Command[] }[] = [];
  for (const cmd of filtered) {
    const g = cmd.group ?? 'Actions';
    let bucket = grouped.find((b) => b.group === g);
    if (!bucket) {
      bucket = { group: g, items: [] };
      grouped.push(bucket);
    }
    bucket.items.push(cmd);
  }

  let flatIdx = 0;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[active];
      if (cmd) {
        onClose();
        cmd.run();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 60%, transparent)', backdropFilter: 'blur(2px)' }}
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-[560px] bg-surface border border-line rounded-lg shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        {/* Search row */}
        <div className="flex items-center gap-2 h-11 px-3 border-b border-line-subtle">
          <Icons.Search size={14} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search commands…"
            className="flex-1 bg-transparent outline-none text-[13px] text-content placeholder-content-ghost"
          />
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-content-muted">
            esc
          </span>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-content-faint text-[12.5px]">
              No commands match "{q}"
            </div>
          ) : (
            grouped.map(({ group, items }) => (
              <div key={group} className="py-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-content-faint">
                  {group}
                </div>
                {items.map((cmd) => {
                  const idx = flatIdx++;
                  const isActive = idx === active;
                  return (
                    <div
                      key={cmd.id}
                      data-cmd-idx={idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => {
                        onClose();
                        cmd.run();
                      }}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${
                        isActive ? 'bg-surface-2' : 'hover:bg-surface-2'
                      }`}
                    >
                      <span
                        className={`w-1 h-4 rounded-sm shrink-0 ${
                          isActive ? 'bg-accent' : 'bg-transparent'
                        }`}
                      />
                      <span className="text-[12.5px] text-content flex-1 truncate">
                        {cmd.label}
                      </span>
                      {cmd.hint && (
                        <span className="text-[11px] text-content-faint truncate max-w-[150px]">
                          {cmd.hint}
                        </span>
                      )}
                      {cmd.shortcut && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-content-muted shrink-0">
                          {cmd.shortcut}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-3 px-3 h-7 border-t border-line-subtle text-[10.5px] text-content-faint">
          <span><span className="font-mono">↑↓</span> navigate</span>
          <span><span className="font-mono">⏎</span> run</span>
          <span><span className="font-mono">esc</span> close</span>
          <div className="flex-1" />
          <span>{filtered.length} {filtered.length === 1 ? 'command' : 'commands'}</span>
        </div>
      </div>
    </div>
  );
}
