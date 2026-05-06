import { useEffect, useMemo, useRef, useState } from 'react';
import { DW_FUNCTIONS, FnDoc, FnOverload } from '../dataweaveDocs';
import { Icons } from './Icons';

interface FunctionBrowserProps {
  open: boolean;
  onClose: () => void;
  /** Insert the given text at the current cursor position in the script editor. */
  onInsertAtCursor?: (text: string) => void;
}

const ALL_FUNCTIONS: FnDoc[] = Object.values(DW_FUNCTIONS).sort((a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
);

const ALL_MODULES: string[] = Array.from(
  new Set(ALL_FUNCTIONS.flatMap((f) => f.overloads.map((o) => o.module))),
).sort();

function modulesOf(doc: FnDoc): string[] {
  return Array.from(new Set(doc.overloads.map((o) => o.module)));
}

function matches(doc: FnDoc, query: string, moduleFilter: string | null): boolean {
  if (moduleFilter && !doc.overloads.some((o) => o.module === moduleFilter)) return false;
  if (!query) return true;
  const q = query.toLowerCase();
  if (doc.name.toLowerCase().includes(q)) return true;
  return doc.overloads.some(
    (o) => o.signature.toLowerCase().includes(q) || o.description.toLowerCase().includes(q),
  );
}

export function FunctionBrowser({ open, onClose, onInsertAtCursor }: FunctionBrowserProps) {
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Esc to close, ⌘F / Ctrl+F to refocus search
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Auto-focus search on open
  useEffect(() => {
    if (open) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [open]);

  const filtered = useMemo(
    () => ALL_FUNCTIONS.filter((f) => matches(f, query, moduleFilter)),
    [query, moduleFilter],
  );

  // Auto-select the first match when filter narrows or selection becomes invalid
  useEffect(() => {
    if (!open) return;
    if (!selectedName || !filtered.some((f) => f.name === selectedName)) {
      setSelectedName(filtered[0]?.name ?? null);
    }
  }, [filtered, selectedName, open]);

  const selectedDoc = selectedName ? DW_FUNCTIONS[selectedName.toLowerCase()] : null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-bg">
      {/* Header bar */}
      <header className="h-11 shrink-0 flex items-center gap-3 px-4 bg-surface border-b border-line">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
          title="Back to workspace"
        >
          <Icons.ChevronRight size={12} className="rotate-180" />
          Back
        </button>
        <div className="w-px h-4 bg-line" />
        <Icons.Braces size={14} className="text-accent" />
        <span className="text-[13px] font-semibold text-content tracking-tight">
          DataWeave function reference
        </span>
        <span className="text-[11px] text-content-faint font-mono">
          · {ALL_FUNCTIONS.length} functions · {ALL_MODULES.length} modules
        </span>
        <span className="flex-1" />
        <span className="text-[10.5px] text-content-ghost font-mono">
          dw 2.11 · MuleSoft (BSD-3-Clause)
        </span>
      </header>

      {/* Body — left list, right detail */}
      <div className="flex-1 flex min-h-0">
        {/* Left: search + list */}
        <aside className="w-[340px] shrink-0 border-r border-line flex flex-col bg-surface-panel">
          <div className="p-3 space-y-2 border-b border-line-subtle">
            {/* Search */}
            <div className="flex items-center gap-2 h-9 px-3 bg-surface-2 border border-line rounded-md focus-within:border-accent">
              <Icons.Search size={13} className="text-content-faint shrink-0" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search functions, signatures, docs…"
                className="flex-1 bg-transparent text-[12.5px] text-content placeholder-content-ghost focus:outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="text-content-faint hover:text-content cursor-pointer"
                  title="Clear (Esc)"
                >
                  <Icons.X size={12} />
                </button>
              )}
            </div>

            {/* Module filter chips */}
            <div className="flex flex-wrap gap-1">
              <Chip
                active={moduleFilter === null}
                label={`all · ${ALL_FUNCTIONS.length}`}
                onClick={() => setModuleFilter(null)}
              />
              {ALL_MODULES.map((m) => (
                <Chip
                  key={m}
                  active={moduleFilter === m}
                  label={m}
                  onClick={() => setModuleFilter(m === moduleFilter ? null : m)}
                />
              ))}
            </div>

            <div className="text-[10.5px] text-content-ghost px-0.5">
              {filtered.length === ALL_FUNCTIONS.length
                ? `${ALL_FUNCTIONS.length} functions`
                : `${filtered.length} of ${ALL_FUNCTIONS.length} match`}
            </div>
          </div>

          {/* Function list */}
          <div ref={listRef} className="flex-1 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="text-center text-[11.5px] text-content-faint py-10">
                No matches.
              </div>
            )}
            {filtered.map((doc) => {
              const isSelected = doc.name === selectedName;
              return (
                <button
                  key={doc.name}
                  onClick={() => setSelectedName(doc.name)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-accent-dim text-content'
                      : 'text-content-secondary hover:bg-surface-2'
                  }`}
                  style={isSelected ? { borderLeft: '2px solid var(--accent)', paddingLeft: 'calc(0.75rem - 2px)' } : undefined}
                >
                  <span className="font-mono text-[12.5px] truncate">{doc.name}</span>
                  <span className="flex-1" />
                  <span className="text-[9.5px] text-content-faint font-mono">
                    {modulesOf(doc).join(', ')}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right: detail pane */}
        <main className="flex-1 overflow-y-auto bg-bg">
          {selectedDoc ? (
            <DetailPane doc={selectedDoc} onInsertAtCursor={onInsertAtCursor} onClose={onClose} />
          ) : (
            <div className="h-full flex items-center justify-center text-content-faint text-[13px]">
              Select a function on the left.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 h-6 rounded-full text-[10.5px] font-medium cursor-pointer transition-colors border ${
        active
          ? 'bg-accent-dim text-accent border-accent-border'
          : 'text-content-faint border-line-subtle hover:border-line-secondary'
      }`}
    >
      {label}
    </button>
  );
}

function DetailPane({
  doc, onInsertAtCursor, onClose,
}: {
  doc: FnDoc;
  onInsertAtCursor?: (text: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="max-w-[920px] mx-auto px-8 py-8 space-y-6">
      {/* Function title */}
      <div className="flex items-baseline gap-3">
        <h2 className="font-mono text-[26px] font-semibold text-content tracking-tight">
          {doc.name}
        </h2>
        {onInsertAtCursor && (
          <button
            onClick={() => { onInsertAtCursor(doc.name); onClose(); }}
            className="ml-auto inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            <Icons.Plus size={11} /> Insert at cursor
          </button>
        )}
      </div>

      {doc.overloads.length > 1 && (
        <div className="text-[11px] text-content-faint">
          {doc.overloads.length} overloads — listed below.
        </div>
      )}

      {/* Each overload as its own section */}
      {doc.overloads.map((ov, i) => (
        <OverloadSection key={i} ov={ov} index={doc.overloads.length > 1 ? i + 1 : null} />
      ))}
    </div>
  );
}

function CopyableBlock({
  content, className, style, children,
}: {
  content: string;
  className: string;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre className={className} style={style}>{children}</pre>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch { /* clipboard not available */ }
        }}
        title={copied ? 'Copied' : 'Copy'}
        className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 h-6 rounded text-[10.5px] font-medium opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        style={{
          background: 'var(--surface)',
          color: copied ? 'var(--accent)' : 'var(--content-faint)',
          border: '1px solid var(--line)',
        }}
      >
        {copied ? <Icons.Dot size={9} /> : <Icons.Copy size={11} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function OverloadSection({ ov, index }: { ov: FnOverload; index: number | null }) {
  return (
    <section className="space-y-3.5">
      {/* Section header */}
      <div className="flex items-center gap-2 pb-2 border-b border-line-subtle">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.5px] font-semibold px-2 py-0.5 rounded"
          style={{
            background: 'color-mix(in oklch, var(--accent) 12%, transparent)',
            color: 'var(--accent)',
          }}
        >
          dw::{ov.module}
        </span>
        {index !== null && (
          <span className="text-[10.5px] text-content-faint uppercase tracking-[0.5px] font-semibold">
            Overload {index}
          </span>
        )}
      </div>

      {/* Signature */}
      <CopyableBlock
        content={ov.signature}
        className="px-4 py-3 rounded-lg font-mono text-[12.5px] text-content overflow-x-auto whitespace-pre-wrap break-all leading-relaxed border select-text"
        style={{
          background: 'var(--surface-2)',
          borderColor: 'var(--line)',
        }}
      >
        {ov.signature}
      </CopyableBlock>

      {/* Description */}
      {ov.description && (
        <div className="text-[13px] text-content-secondary leading-relaxed whitespace-pre-wrap">
          {ov.description}
        </div>
      )}

      {/* Examples */}
      {ov.examples.length > 0 && (
        <div className="space-y-3 pt-1">
          {ov.examples.map((ex, j) => (
            <div key={j} className="space-y-1.5">
              <div className="text-[10.5px] uppercase tracking-[0.5px] font-semibold text-content-faint">
                {ov.examples.length > 1 ? `Example ${j + 1}` : 'Example'}
              </div>
              <CopyableBlock
                content={ex.source}
                className="px-4 py-3 rounded-md font-mono text-[12.5px] text-content overflow-x-auto whitespace-pre leading-relaxed border select-text"
                style={{
                  background: 'var(--surface-2)',
                  borderColor: 'var(--line)',
                }}
              >
                {ex.source}
              </CopyableBlock>
              {ex.output && (
                <>
                  <div className="text-[10px] uppercase tracking-[0.5px] font-semibold text-content-ghost">
                    Output
                  </div>
                  <CopyableBlock
                    content={ex.output}
                    className="px-4 py-3 rounded-md font-mono text-[12px] overflow-x-auto whitespace-pre leading-relaxed border select-text"
                    style={{
                      background: 'color-mix(in oklch, var(--accent) 4%, var(--surface-2))',
                      borderColor: 'var(--line)',
                      color: 'var(--accent)',
                    }}
                  >
                    {ex.output}
                  </CopyableBlock>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
