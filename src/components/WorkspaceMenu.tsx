import { useEffect, useRef, useState } from 'react';
import { Icons } from './Icons';

interface WorkspaceMenuProps {
  projectName: string;
  currentFile: string | null;
  isDirty: boolean;
  onSave: () => void;
  onNew: () => void;
  onOpen: () => void;
  onDuplicate: () => void;
  onImportPlayground: () => void;
  onExportPlayground: () => void;
}

export function WorkspaceMenu({
  projectName, currentFile, isDirty,
  onSave, onNew, onOpen, onDuplicate, onImportPlayground, onExportPlayground,
}: WorkspaceMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  const item = (label: string, shortcut: string | null, onClick: () => void, danger = false) => (
    <button
      onClick={() => { close(); onClick(); }}
      className="w-full flex items-center gap-3 px-3 py-1.5 text-left hover:bg-surface-2 cursor-pointer text-[12.5px] transition-colors"
      style={{ color: danger ? 'var(--err)' : 'var(--content)' }}
    >
      <span className="flex-1">{label}</span>
      {shortcut && <span className="font-mono text-[10px] text-content-faint">{shortcut}</span>}
    </button>
  );

  return (
    <div ref={ref} className="relative flex items-center min-w-0">
      <button
        onClick={() => setOpen(!open)}
        title="Workspace menu"
        className="flex items-center gap-2 min-w-0 h-7 px-2 rounded-md hover:bg-surface-2 cursor-pointer transition-colors"
      >
        <Icons.Braces size={13} className="text-content-faint shrink-0" />
        <span className="text-[13px] text-content-faint truncate">{projectName}</span>
        {currentFile && (
          <>
            <span className="text-content-ghost">/</span>
            <span className="text-[13px] text-content font-medium truncate">
              {currentFile.replace(/\.json$/, '').replace(/\.dwstudio$/, '')}
            </span>
          </>
        )}
        {isDirty && (
          <span className="text-warn text-base leading-none ml-0.5" title="Unsaved changes">•</span>
        )}
        <Icons.ChevronDown size={12} className="text-content-ghost shrink-0" />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 min-w-[240px] py-1 rounded-md border shadow-xl z-50"
          style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
        >
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-content-faint font-medium">Workspace</div>
          {item('Save', '⌘S', onSave)}
          {item('New blank', '⌘N', onNew)}
          {item('Open…', '⌘O', onOpen)}
          {item('Duplicate', '⌘D', onDuplicate)}
          <div className="my-1 border-t" style={{ borderColor: 'var(--line)' }} />
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-content-faint font-medium">Playground</div>
          {item('Import from Playground zip…', null, onImportPlayground)}
          {item('Export as Playground zip…', null, onExportPlayground)}
        </div>
      )}
    </div>
  );
}
