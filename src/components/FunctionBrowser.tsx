import { useEffect, useMemo, useRef, useState } from 'react';
import { DW_FUNCTIONS, FnDoc, FnOverload } from '../dataweaveDocs';
import { Icons } from './Icons';
import { WindowControls } from './WindowControls';

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
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-3 pl-4 bg-surface border-b border-line">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
          title="Back to workspace"
        >
          <Icons.ChevronRight size={12} className="rotate-180" />
          Back
        </button>
        <div className="w-px h-4 bg-line" />
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}
        >
          <Icons.Library size={14} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold text-content tracking-tight">
            DataWeave function reference
          </span>
          <span className="text-[10.5px] text-content-faint font-mono">
            {ALL_FUNCTIONS.length} functions · {ALL_MODULES.length} modules · dw 2.11
          </span>
        </div>
        <span className="flex-1" />
        <span
          className="hidden md:inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[10.5px] font-mono"
          style={{
            background: 'var(--surface-2)',
            color: 'var(--content-muted)',
            border: '1px solid var(--line-subtle)',
          }}
        >
          <Icons.Dot size={6} style={{ color: 'var(--accent)' }} /> MuleSoft · BSD-3-Clause
        </span>
        {/* OS window controls — Function reference is fixed-fullscreen, so
            the main app's top-bar controls are covered. */}
        <WindowControls />
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

/** Lightweight AsciiDoc-to-JSX renderer for the function descriptions.
 *  Handles: tables, `code`, _italics_, WARNING:/NOTE: admonitions,
 *  _Introduced in ..._ version tags, and HTML entities like &#124;. */
function RenderedDescription({ text }: { text: string }) {
  // Decode HTML entities
  const decoded = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

  // Split out AsciiDoc tables:  [%header, cols="..."] \n|===\n...\n|===
  const parts: React.ReactNode[] = [];
  let remaining = decoded;
  let key = 0;

  // Extract tables
  const tableRe = /\[%header[^\]]*\]\n\|===\n([\s\S]*?)\n\|===/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(remaining)) !== null) {
    if (m.index > lastIdx) {
      parts.push(...renderInlineBlocks(remaining.slice(lastIdx, m.index), key));
      key += 100;
    }
    // Parse table rows: each row is "| col1 | col2 ..."
    const rows = m[1].split('\n').filter((r) => r.trim().startsWith('|'));
    const parsed = rows.map((r) =>
      r.split('|').slice(1).map((c) => c.trim()),
    );
    const [header, ...body] = parsed;
    parts.push(
      <table
        key={`tbl-${key++}`}
        className="text-[12.5px] border border-line rounded-md overflow-hidden my-2"
        style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}
      >
        {header && (
          <thead>
            <tr className="bg-surface-2">
              {header.map((h, i) => (
                <th
                  key={i}
                  className="text-left px-3 py-1.5 text-content-faint font-semibold text-[11px] uppercase tracking-wide border-b border-line"
                >
                  {renderInline(h)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 1 ? 'bg-surface-2/50' : ''}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-content-secondary border-b border-line-subtle">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>,
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < remaining.length) {
    parts.push(...renderInlineBlocks(remaining.slice(lastIdx), key));
  }

  return <div className="text-[13px] text-content-secondary leading-relaxed space-y-2">{parts}</div>;
}

/** Render a block of text, splitting paragraphs and handling special blocks
 *  like _Introduced in..._ version tags and WARNING:/NOTE: admonitions. */
function renderInlineBlocks(text: string, startKey: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let key = startKey;

  // Split into paragraphs on double newline
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());

  for (const para of paragraphs) {
    const trimmed = para.trim();

    // Version tag: _Introduced in DataWeave version X.Y.Z._
    const versionMatch = trimmed.match(/^_Introduced in (.+?)\._?$/);
    if (versionMatch) {
      nodes.push(
        <div
          key={key++}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
          style={{
            background: 'color-mix(in oklch, var(--accent) 10%, transparent)',
            color: 'var(--accent)',
            border: '1px solid color-mix(in oklch, var(--accent) 20%, transparent)',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
            <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm.5 3.5a.5.5 0 00-1 0v5a.5.5 0 00.27.45l3 1.5a.5.5 0 10.46-.9L8.5 8.15V3.5z" />
          </svg>
          {versionMatch[1]}
        </div>,
      );
      continue;
    }

    // Admonitions: WARNING: ..., NOTE: ...
    const admonitionMatch = trimmed.match(/^(WARNING|NOTE|TIP|IMPORTANT):\s*([\s\S]*)$/);
    if (admonitionMatch) {
      const kind = admonitionMatch[1];
      const isWarn = kind === 'WARNING' || kind === 'IMPORTANT';
      nodes.push(
        <div
          key={key++}
          className="flex items-start gap-2 px-3 py-2 rounded-lg text-[12.5px] leading-relaxed my-1"
          style={{
            background: isWarn
              ? 'color-mix(in oklch, #f59e0b 8%, transparent)'
              : 'color-mix(in oklch, var(--accent) 6%, transparent)',
            border: `1px solid ${isWarn
              ? 'color-mix(in oklch, #f59e0b 25%, transparent)'
              : 'color-mix(in oklch, var(--accent) 15%, transparent)'}`,
            color: isWarn ? '#f59e0b' : 'var(--accent)',
          }}
        >
          <span className="font-semibold text-[10.5px] uppercase tracking-wide shrink-0 mt-0.5">{kind}</span>
          <span className="text-content-secondary">{renderInline(admonitionMatch[2])}</span>
        </div>,
      );
      continue;
    }

    // Regular paragraph
    nodes.push(
      <p key={key++}>{renderInline(trimmed.replace(/\n/g, ' '))}</p>,
    );
  }

  return nodes;
}

/** Render inline AsciiDoc markup: `code`, _italic_ */
function renderInline(text: string): React.ReactNode {
  // Process backtick code and _italic_ inline markers
  const parts: React.ReactNode[] = [];
  // Match `code` or _italic_ (but not __double underscores__ or mid-word underscores)
  const inlineRe = /`([^`]+)`|(?<![a-zA-Z0-9])_([^_]+?)_(?![a-zA-Z0-9])/g;
  let last = 0;
  let im: RegExpExecArray | null;
  let k = 0;
  while ((im = inlineRe.exec(text)) !== null) {
    if (im.index > last) parts.push(text.slice(last, im.index));
    if (im[1] !== undefined) {
      // Backtick code
      parts.push(
        <code
          key={k++}
          className="px-1 py-0.5 rounded text-[12px] font-mono"
          style={{
            background: 'var(--surface-2)',
            color: 'var(--content)',
          }}
        >
          {im[1]}
        </code>,
      );
    } else if (im[2] !== undefined) {
      // Italic
      parts.push(<em key={k++} className="text-content-muted">{im[2]}</em>);
    }
    last = im.index + im[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
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
      {ov.description && <RenderedDescription text={ov.description} />}

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
