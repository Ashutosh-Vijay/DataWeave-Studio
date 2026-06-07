import { useEffect, useMemo, useRef, useState } from 'react';
import { COOKBOOK_RECIPES, Recipe } from '../cookbookRecipes';
import { Icons } from './Icons';
import { WindowControls } from './WindowControls';

interface RecipeBrowserProps {
  open: boolean;
  onClose: () => void;
  /** Insert the recipe's script at the current cursor position. */
  onInsertAtCursor?: (text: string) => void;
  /** Load script + sample input into the playground and run it. */
  onOpenInPlayground: (recipe: Recipe) => void;
}

const ALL = [...COOKBOOK_RECIPES].sort(
  (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
);
const CATEGORIES = Array.from(new Set(ALL.map((r) => r.category))).sort();

function matches(r: Recipe, q: string, cat: string | null): boolean {
  if (cat && r.category !== cat) return false;
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    r.name.toLowerCase().includes(s) ||
    r.description.toLowerCase().includes(s) ||
    r.category.toLowerCase().includes(s) ||
    r.script.toLowerCase().includes(s)
  );
}

const DIFF_COLOR: Record<string, string> = {
  Beginner: 'var(--ok, #3fb950)',
  Intermediate: 'var(--accent)',
  Advanced: 'var(--warn, #d29922)',
};

export function RecipeBrowser({ open, onClose, onInsertAtCursor, onOpenInPlayground }: RecipeBrowserProps) {
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const filtered = useMemo(() => ALL.filter((r) => matches(r, query, catFilter)), [query, catFilter]);

  useEffect(() => {
    if (!open) return;
    if (!selectedId || !filtered.some((r) => r.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId, open]);

  const selected = selectedId ? ALL.find((r) => r.id === selectedId) ?? null : null;

  // group filtered list by category for section headers
  const grouped = useMemo(() => {
    const m = new Map<string, Recipe[]>();
    for (const r of filtered) {
      if (!m.has(r.category)) m.set(r.category, []);
      m.get(r.category)!.push(r);
    }
    return Array.from(m.entries());
  }, [filtered]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-bg">
      {/* Header */}
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-3 pl-4 pr-3 bg-surface border-b border-line">
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
          <Icons.Book size={14} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold text-content tracking-tight">
            DataWeave cookbook
          </span>
          <span className="text-[10.5px] text-content-faint font-mono">
            {ALL.length} recipes · {CATEGORIES.length} categories · runnable
          </span>
        </div>
        <span className="flex-1" />
        <span
          className="hidden md:inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[10.5px] font-mono"
          style={{ background: 'var(--surface-2)', color: 'var(--content-muted)', border: '1px solid var(--line-subtle)' }}
        >
          <Icons.Dot size={6} style={{ color: 'var(--accent)' }} /> mulesoft-cookbook · MIT
        </span>
        <WindowControls />
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Left: search + grouped list */}
        <aside className="w-[340px] shrink-0 border-r border-line flex flex-col bg-surface-panel">
          <div className="p-3 space-y-2 border-b border-line-subtle">
            <div className="flex items-center gap-2 h-9 px-3 bg-surface-2 border border-line rounded-md focus-within:border-accent">
              <Icons.Search size={13} className="text-content-faint shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search recipes, descriptions, code…"
                className="flex-1 bg-transparent text-[12.5px] text-content placeholder-content-ghost focus:outline-none"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-content-faint hover:text-content cursor-pointer" title="Clear (Esc)">
                  <Icons.X size={12} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1">
              <Chip active={catFilter === null} label={`all · ${ALL.length}`} onClick={() => setCatFilter(null)} />
              {CATEGORIES.map((c) => (
                <Chip key={c} active={catFilter === c} label={c} onClick={() => setCatFilter(c === catFilter ? null : c)} />
              ))}
            </div>

            <div className="text-[10.5px] text-content-ghost px-0.5">
              {filtered.length === ALL.length ? `${ALL.length} recipes` : `${filtered.length} of ${ALL.length} match`}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="text-center text-[11.5px] text-content-faint py-10">No matches.</div>
            )}
            {grouped.map(([cat, items]) => (
              <div key={cat} className="mb-1">
                <div className="px-3 pt-2 pb-1 text-[9.5px] font-semibold uppercase tracking-wider text-content-ghost">
                  {cat}
                </div>
                {items.map((r) => {
                  const isSel = r.id === selectedId;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer transition-colors ${
                        isSel ? 'bg-accent-dim text-content' : 'text-content-secondary hover:bg-surface-2'
                      }`}
                      style={isSel ? { borderLeft: '2px solid var(--accent)', paddingLeft: 'calc(0.75rem - 2px)' } : undefined}
                    >
                      <span className="text-[12.5px] truncate">{r.name}</span>
                      <span className="flex-1" />
                      {r.difficulty && (
                        <span className="text-[9px] font-mono shrink-0" style={{ color: DIFF_COLOR[r.difficulty] ?? 'var(--content-faint)' }}>
                          {r.difficulty.slice(0, 3).toLowerCase()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        {/* Right: detail */}
        <main className="flex-1 overflow-y-auto bg-bg">
          {selected ? (
            <DetailPane recipe={selected} onInsertAtCursor={onInsertAtCursor} onOpenInPlayground={onOpenInPlayground} onClose={onClose} />
          ) : (
            <div className="h-full flex items-center justify-center text-content-faint text-[13px]">Select a recipe on the left.</div>
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
        active ? 'bg-accent-dim text-accent border-accent-border' : 'text-content-faint border-line-subtle hover:border-line-secondary'
      }`}
    >
      {label}
    </button>
  );
}

function DetailPane({
  recipe, onInsertAtCursor, onOpenInPlayground, onClose,
}: {
  recipe: Recipe;
  onInsertAtCursor?: (text: string) => void;
  onOpenInPlayground: (r: Recipe) => void;
  onClose: () => void;
}) {
  return (
    <div className="max-w-[920px] mx-auto px-8 py-8 space-y-6">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-[24px] font-semibold text-content tracking-tight">{recipe.name}</h2>
        {recipe.difficulty && (
          <span className="text-[10.5px] font-mono px-2 h-5 inline-flex items-center rounded-full"
            style={{ color: DIFF_COLOR[recipe.difficulty] ?? 'var(--content-faint)', border: `1px solid ${DIFF_COLOR[recipe.difficulty] ?? 'var(--line)'}` }}>
            {recipe.difficulty}
          </span>
        )}
        <span className="text-[11px] text-content-faint">{recipe.category}</span>
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          {onInsertAtCursor && (
            <button
              onClick={() => { onInsertAtCursor(recipe.script); onClose(); }}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors text-content-secondary hover:text-content hover:bg-surface-2 border border-line"
            >
              <Icons.Plus size={11} /> Insert at cursor
            </button>
          )}
          <button
            onClick={() => { onOpenInPlayground(recipe); onClose(); }}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            <Icons.Play size={11} /> Open in playground
          </button>
        </div>
      </div>

      {recipe.description && (
        <p className="text-[13px] leading-relaxed text-content-secondary">{recipe.description}</p>
      )}

      {/* Script */}
      <Section label="DataWeave script">
        <CodeBlock content={recipe.script} />
      </Section>

      {/* Input + Output side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {recipe.input && (
          <Section label={`Sample input · ${recipe.inputMime || 'application/json'}`}>
            <CodeBlock content={recipe.input} />
          </Section>
        )}
        <Section label={`Output · ${recipe.outputMime || 'application/json'}`}>
          <CodeBlock content={recipe.output} />
        </Section>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-content-ghost">{label}</div>
      {children}
    </div>
  );
}

function CodeBlock({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre
        className="text-[12px] font-mono leading-relaxed overflow-x-auto p-3 rounded-md whitespace-pre"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--line-subtle)', color: 'var(--content)' }}
      >
        {content}
      </pre>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch { /* clipboard unavailable */ }
        }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 h-6 px-2 rounded text-[10.5px] cursor-pointer transition-all text-content-faint hover:text-content bg-surface border border-line"
        title="Copy"
      >
        <Icons.Copy size={11} /> {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
