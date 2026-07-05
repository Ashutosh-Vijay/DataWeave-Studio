/**
 * Module library — save reusable DataWeave `.dwl` modules once, and every run
 * resolves `import x from MyModule` against them automatically.
 *
 * This is the "save it once locally, from next time just use it" surface: the
 * modules persist globally (app-data, via load_modules/save_modules), not per
 * workspace, so a utility module written here is importable from every script.
 *
 * `name` is the import path — `Strings` → `import upper from Strings`; use `::`
 * for packages — `org::Utils` → `import f from org::Utils`. `content` is the
 * module's full `.dwl` source (a `%dw 2.0` header + `fun`/`var` definitions, no
 * `---` body). The engine writes each to a classpath dir keyed by content hash
 * and compiles against a fresh classloader, so edits take effect on the next run
 * with no engine restart.
 */
import { useState, useEffect } from 'react';
import { Icons } from './Icons';
import { WindowControls } from './WindowControls';
import { MiniEditor } from './MiniEditor';
import { ConfirmDialog } from './ConfirmDialog';

export interface DwModule {
  name: string;
  content: string;
}

const SAMPLE_MODULE = `%dw 2.0
/** Reusable helpers — import these from any script. */

fun greet(name: String): String = "Hello, " ++ name ++ "!"

fun toSlug(text: String): String =
  lower(text) replace /\\s+/ with "-"
`;

const isValidName = (n: string) => /^[A-Za-z_][A-Za-z0-9_]*(::[A-Za-z_][A-Za-z0-9_]*)*$/.test(n);

export function ModulesPanel({
  open,
  onClose,
  modules,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  modules: DwModule[];
  onChange: (modules: DwModule[]) => void;
}) {
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    // Skip Escapes Monaco already handled (suggest/find widget dismiss).
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Keep the selection in range as modules are added/removed.
  useEffect(() => {
    if (selected > modules.length - 1) setSelected(Math.max(0, modules.length - 1));
  }, [modules.length, selected]);

  if (!open) return null;

  const active = modules[selected];

  const addModule = () => {
    // First unused MyModule / MyModule2 / … so two quick adds don't collide.
    let n = 'MyModule';
    let i = 2;
    while (modules.some((m) => m.name === n)) { n = `MyModule${i}`; i++; }
    onChange([...modules, { name: n, content: SAMPLE_MODULE }]);
    setSelected(modules.length);
  };

  // Deleting destroys the module's whole source with no undo, and the X sits
  // right next to the row users click to select — always confirm first.
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const removeModule = (idx: number) => {
    onChange(modules.filter((_, i) => i !== idx));
    if (selected >= idx && selected > 0) setSelected(selected - 1);
  };

  const updateActive = (patch: Partial<DwModule>) => {
    onChange(modules.map((m, i) => (i === selected ? { ...m, ...patch } : m)));
  };

  const dupName = active && modules.some((m, i) => i !== selected && m.name === active.name);
  const badName = active && !isValidName(active.name);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-bg">
      {/* Header */}
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-2 pl-4 pr-3 border-b border-line bg-surface">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
          title="Back to workspace (Esc)"
        >
          <Icons.ChevronRight size={12} className="rotate-180" />
          Back
        </button>
        <div className="w-px h-4 bg-line" />
        <Icons.Package size={15} />
        <span className="text-[13px] font-semibold text-content">Module library</span>
        <span className="text-[11px] text-content-ghost">— save reusable modules once, import them from any script</span>
        <span className="flex-1" />
        <WindowControls />
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Module list */}
        <div className="w-64 shrink-0 border-r border-line flex flex-col min-h-0 bg-surface">
          <div className="px-3.5 py-2 border-b border-line-subtle">
            <div className="text-[11.5px] font-semibold text-content">Saved modules</div>
            <div className="text-[10px] text-content-ghost mt-0.5">Global — available to every run.</div>
          </div>
          <div className="flex-1 overflow-auto">
            {modules.length === 0 ? (
              <div className="px-3.5 py-3 text-[11px] text-content-faint italic">
                No modules yet. Add one, then <span className="font-mono not-italic">import x from Name</span> in any script.
              </div>
            ) : modules.map((m, i) => (
              <div
                key={i}
                onClick={() => setSelected(i)}
                className={`flex items-center gap-2 px-3.5 py-1.5 border-b border-line-subtle cursor-pointer group ${i === selected ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
              >
                <Icons.Braces size={11} />
                <div className="flex-1 min-w-0">
                  <div className={`text-[11px] font-mono truncate ${i === selected ? 'text-content' : 'text-content-secondary'}`} title={m.name}>{m.name || '(unnamed)'}</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setPendingDelete(i); }}
                  className="text-content-faint hover:text-err opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="Delete module"
                >
                  <Icons.X size={10} />
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-line-subtle p-2.5">
            <button onClick={addModule} className="w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-md text-[10.5px] font-medium text-accent border border-accent-border hover:bg-accent-dim cursor-pointer">
              <Icons.Plus size={10} /> Add module
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {active ? (
            <>
              <div className="shrink-0 flex items-center gap-2 px-3.5 h-11 border-b border-line-subtle">
                <span className="text-[10.5px] font-semibold text-content-faint uppercase tracking-[0.6px]">Module name</span>
                <input
                  value={active.name}
                  onChange={(e) => updateActive({ name: e.target.value })}
                  spellCheck={false}
                  placeholder="MyModule"
                  className={`w-64 h-7 px-2 text-[11.5px] font-mono bg-surface-2 border rounded outline-none text-content placeholder:text-content-ghost focus:border-accent ${dupName || badName ? 'border-err' : 'border-line'}`}
                />
                <span className="text-[10.5px] text-content-ghost font-mono">import x from {active.name || 'MyModule'}</span>
                <span className="flex-1" />
                {dupName && <span className="text-[10.5px] text-err">Duplicate name</span>}
                {badName && !dupName && <span className="text-[10.5px] text-err">Letters/digits/_, packages with ::</span>}
              </div>
              <div className="flex-1 min-h-0">
                <MiniEditor value={active.content} onChange={(v) => updateActive({ content: v })} language="dataweave" height="100%" />
              </div>
              <div className="shrink-0 px-3.5 py-2 border-t border-line-subtle text-[10px] text-content-ghost leading-relaxed">
                The name is the import path — <span className="font-mono text-content-faint">import fn from {active.name || 'MyModule'}</span>.
                {!active.name.includes('::') && <> A bare name also resolves the MuleSoft way as <span className="font-mono text-content-faint">modules::{active.name || 'MyModule'}</span>, so standard imports work too.</>}
                {' '}A module is a <span className="font-mono text-content-faint">%dw 2.0</span> header plus <span className="font-mono text-content-faint">fun</span>/<span className="font-mono text-content-faint">var</span> definitions — no <span className="font-mono text-content-faint">---</span> body. Edits apply on the next run.
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[12px] text-content-faint">
              Add a module to get started.
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete module?"
        description={<>The source of <span className="font-mono">{pendingDelete !== null ? (modules[pendingDelete]?.name || '(unnamed)') : ''}</span> will be permanently deleted. Scripts importing it will stop compiling.</>}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={() => { if (pendingDelete !== null) removeModule(pendingDelete); }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
