import { useMemo, useState } from 'react';
import { DW_FUNCTIONS, FnDoc, FnOverload } from '../dataweaveDocs';
import { Icons } from './Icons';

interface FunctionBrowserProps {
  /** Insert the given text at the current cursor position in the script editor. */
  onInsertAtCursor?: (text: string) => void;
}

const ALL_FUNCTIONS: FnDoc[] = Object.values(DW_FUNCTIONS).sort((a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
);

const ALL_MODULES: string[] = Array.from(
  new Set(ALL_FUNCTIONS.flatMap((f) => f.overloads.map((o) => o.module))),
).sort();

function modulesOf(doc: FnDoc): string {
  const set = new Set(doc.overloads.map((o) => o.module));
  return Array.from(set).join(', ');
}

function matches(doc: FnDoc, query: string, moduleFilter: string | null): boolean {
  if (moduleFilter && !doc.overloads.some((o) => o.module === moduleFilter)) return false;
  if (!query) return true;
  const q = query.toLowerCase();
  if (doc.name.toLowerCase().includes(q)) return true;
  return doc.overloads.some(
    (o) =>
      o.signature.toLowerCase().includes(q) ||
      o.description.toLowerCase().includes(q),
  );
}

export function FunctionBrowser({ onInsertAtCursor }: FunctionBrowserProps) {
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(
    () => ALL_FUNCTIONS.filter((f) => matches(f, query, moduleFilter)),
    [query, moduleFilter],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search + filter */}
      <div className="p-2 space-y-2 border-b border-line-subtle">
        <div className="flex items-center gap-2 h-8 px-2.5 bg-surface-2 border border-line rounded-md focus-within:border-accent">
          <Icons.Search size={12} className="text-content-faint shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search functions, signatures, docs…"
            className="flex-1 bg-transparent text-[12px] text-content placeholder-content-ghost focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-content-faint hover:text-content cursor-pointer"
              title="Clear"
            >
              <Icons.X size={11} />
            </button>
          )}
        </div>

        {/* Module chips */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setModuleFilter(null)}
            className={`px-2 h-5 rounded-full text-[10px] font-medium cursor-pointer transition-colors ${
              moduleFilter === null
                ? 'bg-accent-dim text-accent border border-accent-border'
                : 'text-content-faint border border-line-subtle hover:border-line-secondary'
            }`}
          >
            all · {ALL_FUNCTIONS.length}
          </button>
          {ALL_MODULES.map((m) => (
            <button
              key={m}
              onClick={() => setModuleFilter(m === moduleFilter ? null : m)}
              className={`px-2 h-5 rounded-full text-[10px] font-medium cursor-pointer transition-colors ${
                moduleFilter === m
                  ? 'bg-accent-dim text-accent border border-accent-border'
                  : 'text-content-faint border border-line-subtle hover:border-line-secondary'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="text-[10px] text-content-ghost px-1">
          {filtered.length === ALL_FUNCTIONS.length
            ? `${ALL_FUNCTIONS.length} functions across ${ALL_MODULES.length} modules`
            : `${filtered.length} of ${ALL_FUNCTIONS.length} match`}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-1">
        {filtered.length === 0 && (
          <div className="text-center text-[11px] text-content-faint py-8">
            No matches.
          </div>
        )}
        {filtered.map((doc) => (
          <FnRow
            key={doc.name}
            doc={doc}
            expanded={expanded === doc.name}
            onToggle={() => setExpanded(expanded === doc.name ? null : doc.name)}
            onInsert={onInsertAtCursor}
          />
        ))}
      </div>
    </div>
  );
}

function FnRow({
  doc, expanded, onToggle, onInsert,
}: {
  doc: FnDoc;
  expanded: boolean;
  onToggle: () => void;
  onInsert?: (text: string) => void;
}) {
  return (
    <div className="rounded-md mb-0.5 border border-transparent hover:border-line-subtle">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left cursor-pointer"
      >
        <Icons.ChevronRight
          size={10}
          className="text-content-ghost shrink-0 transition-transform"
          style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}
        />
        <span className="font-mono text-[12px] text-content truncate">{doc.name}</span>
        <span className="flex-1" />
        <span className="text-[9.5px] text-content-faint font-mono">{modulesOf(doc)}</span>
      </button>
      {expanded && (
        <div className="pl-5 pr-2 pb-2 space-y-2.5">
          {doc.overloads.map((ov, i) => (
            <FnOverloadCard
              key={i}
              ov={ov}
              showInsert={!!onInsert}
              onInsert={() => onInsert?.(doc.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FnOverloadCard({
  ov, showInsert, onInsert,
}: {
  ov: FnOverload;
  showInsert: boolean;
  onInsert: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-[0.5px] text-content-faint font-semibold px-1.5 py-0.5 rounded bg-surface-3 font-mono">
          dw::{ov.module}
        </span>
        {showInsert && (
          <button
            onClick={onInsert}
            className="ml-auto text-[10px] text-content-faint hover:text-accent cursor-pointer inline-flex items-center gap-1"
            title="Insert at cursor"
          >
            <Icons.Plus size={10} /> insert
          </button>
        )}
      </div>
      <div
        className="px-2 py-1.5 rounded text-[11px] font-mono text-content bg-surface-2 border border-line-subtle break-all leading-relaxed"
      >
        {ov.signature}
      </div>
      {ov.description && (
        <div className="text-[11px] text-content-secondary leading-relaxed whitespace-pre-wrap">
          {ov.description}
        </div>
      )}
      {ov.examples.map((ex, j) => (
        <div key={j} className="space-y-1">
          {ov.examples.length > 1 && (
            <div className="text-[9.5px] text-content-faint uppercase tracking-[0.5px] font-semibold">
              Example {j + 1}
            </div>
          )}
          <pre className="px-2 py-1.5 rounded text-[10.5px] font-mono text-content bg-surface-2 border border-line-subtle overflow-x-auto whitespace-pre">
            {ex.source}
          </pre>
          {ex.output && (
            <pre className="px-2 py-1.5 rounded text-[10.5px] font-mono text-accent bg-surface-2 border border-line-subtle overflow-x-auto whitespace-pre">
              {ex.output}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
