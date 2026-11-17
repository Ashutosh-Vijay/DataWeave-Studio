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
import { invoke } from '../bridge';

export interface DwModule {
  name: string;
  content: string;
  /** "dwl" when absent. Schemas are imported with `jsonschema!name` /
   *  `xmlschema!name`, and their top-level type is `Root`. */
  kind?: 'dwl' | 'json' | 'xsd';
}

type Kind = 'dwl' | 'json' | 'xsd';
const kindOf = (m: DwModule): Kind => m.kind ?? 'dwl';

const SAMPLE_JSON_SCHEMA = `{
  "title": "Order",
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "qty": { "type": "integer", "minimum": 1 }
  },
  "required": ["id", "qty"]
}
`;

const SAMPLE_XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="customer">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="name" type="xs:string"/>
        <xs:element name="age" type="xs:int"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
`;

const importLine = (kind: Kind, name: string) =>
  kind === 'json' ? `import * from jsonschema!${name}`
    : kind === 'xsd' ? `import * from xmlschema!${name}`
      : `import x from ${name}`;

/** One Markdown reference for every DataWeave module, read from the engine:
 *  each module's own doc, then its functions, variables and types with the
 *  signature the engine infers and their doc comments. */
async function buildModuleDocs(modules: DwModule[]): Promise<string> {
  const out: string[] = ['# DataWeave module reference', ''];
  for (const m of modules.filter((x) => kindOf(x) === 'dwl')) {
    const res = await invoke<{ doc?: string | null; declarations?: { name: string; kind: number; type?: string; doc?: string }[] }>(
      'dw_tooling', { kind: 'moduleDocs', script: m.content, offset: 0 });
    out.push(`## ${m.name}`, '', '```dataweave', `import * from ${m.name}`, '```', '');
    if (res?.doc) out.push(res.doc.trim(), '');
    const decls = res?.declarations ?? [];
    // LSP symbol kinds: 12 function, 13/14 variable/constant, anything else a type.
    const groups: [string, (k: number) => boolean][] = [
      ['Functions', (k) => k === 12],
      ['Variables', (k) => k === 13 || k === 14],
      ['Types', (k) => k !== 12 && k !== 13 && k !== 14],
    ];
    for (const [title, test] of groups) {
      const items = decls.filter((d) => test(d.kind));
      if (!items.length) continue;
      out.push(`### ${title}`, '');
      for (const d of items) {
        out.push(`#### ${d.name}`, '');
        if (d.type) out.push('```dataweave', title === 'Functions' ? `${d.name}${d.type.startsWith('(') ? d.type : `: ${d.type}`}` : `${d.name}: ${d.type}`, '```', '');
        if (d.doc) out.push(d.doc.trim(), '');
      }
    }
  }
  return out.join('\n').replace(/\r\n/g, '\n');
}

// The header doc comment goes ABOVE `%dw 2.0`, not below it. A doc comment
// binds to the next thing after it, so one placed under the header documents
// `greet` instead of the module, and the library shows no description.
const SAMPLE_MODULE = `/**
 * Reusable helpers. Import these from any script.
 */
%dw 2.0

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
  // Each module's own header doc, read by the engine rather than pattern-matched
  // here: it strips the `*` gutter and converts the AsciiDoc the doc comments
  // are written in. Keyed by name, refreshed whenever the panel opens or a
  // module's source changes.
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const m of modules) {
        if (kindOf(m) !== 'dwl') continue;
        try {
          const res = await invoke<{ summary?: string }>('dw_tooling', {
            kind: 'moduleDoc',
            script: m.content,
            offset: 0,
          });
          if (res?.summary) next[m.name] = res.summary;
        } catch { /* engine cold - names alone are still usable */ }
      }
      if (!cancelled) setSummaries(next);
    })();
    return () => { cancelled = true; };
  }, [open, modules]);

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

  // Deleting destroys the module's whole source with no undo, and the X sits
  // right next to the row users click to select — always confirm first.
  // (Above the early return: hooks must run on every render.)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');

  if (!open) return null;

  const active = modules[selected];
  const activeKind: Kind = active ? kindOf(active) : 'dwl';

  const uniqueName = (base: string) => {
    let n = base;
    let i = 2;
    while (modules.some((m) => m.name === n)) { n = `${base}${i}`; i++; }
    return n;
  };

  const addModule = (kind: Kind) => {
    // First unused name so two quick adds don't collide.
    const name = uniqueName(kind === 'json' ? 'schemas::Order' : kind === 'xsd' ? 'schemas::Customer' : 'MyModule');
    const content = kind === 'json' ? SAMPLE_JSON_SCHEMA : kind === 'xsd' ? SAMPLE_XSD : SAMPLE_MODULE;
    onChange([...modules, kind === 'dwl' ? { name, content } : { name, content, kind }]);
    setSelected(modules.length);
    setAddMenu(false);
  };

  // .dwl, .json or .xsd files from disk. The file name becomes the module name.
  const importFiles = async () => {
    setAddMenu(false);
    const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
    const picked = await openDialog({ multiple: true, filters: [{ name: 'DataWeave module or schema', extensions: ['dwl', 'json', 'xsd'] }] });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    if (!paths.length) return;
    const added: DwModule[] = [];
    for (const p of paths) {
      const file = p.split(/[\\/]/).pop() ?? '';
      const ext = file.split('.').pop()?.toLowerCase();
      const kind: Kind = ext === 'json' ? 'json' : ext === 'xsd' ? 'xsd' : 'dwl';
      const base = file.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'Imported';
      let name = kind === 'dwl' ? base : `schemas::${base}`;
      while ([...modules, ...added].some((m) => m.name === name)) name += '2';
      const content = await invoke<string>('read_text_file', { path: p });
      added.push(kind === 'dwl' ? { name, content } : { name, content, kind });
    }
    onChange([...modules, ...added]);
    setSelected(modules.length);
  };

  const exportDocs = async () => {
    if (!modules.some((m) => kindOf(m) === 'dwl')) { setNotice('Add a DataWeave module first. Schemas have no docs to export.'); return; }
    setExporting(true);
    setNotice('');
    try {
      const md = await buildModuleDocs(modules);
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({ defaultPath: 'dataweave-modules.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
      if (path) {
        await invoke('save_output_file', { path, content: md });
        setNotice(`Saved ${path.split(/[\\/]/).pop()}`);
      }
    } catch (e) {
      setNotice(`Couldn't build the docs: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  };

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
        <span className="text-[11px] text-content-ghost">Save reusable modules and schemas once and import them from any script</span>
        <span className="flex-1" />
        {notice && <span className="text-[11px] text-content-faint mr-2 truncate max-w-[340px]" title={notice}>{notice}</span>}
        <button
          onClick={exportDocs}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] text-content-secondary border border-line hover:bg-surface-2 hover:text-content cursor-pointer disabled:opacity-50 disabled:cursor-default"
          title="Save a Markdown reference of every DataWeave module: descriptions, signatures and doc comments"
        >
          <Icons.Book size={12} /> {exporting ? 'Building…' : 'Export docs'}
        </button>
        <WindowControls />
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Module list */}
        <div className="w-64 shrink-0 border-r border-line flex flex-col min-h-0 bg-surface">
          <div className="px-3.5 py-2 border-b border-line-subtle">
            <div className="text-[11.5px] font-semibold text-content">Saved modules</div>
            <div className="text-[10px] text-content-ghost mt-0.5">Global: available to every run.</div>
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
                {kindOf(m) === 'dwl'
                  ? <Icons.Braces size={11} />
                  : <span className="text-[8.5px] font-bold font-mono px-1 rounded bg-surface-2 border border-line-subtle text-content-faint">{kindOf(m) === 'json' ? 'JSON' : 'XSD'}</span>}
                <div className="flex-1 min-w-0">
                  <div className={`text-[11px] font-mono truncate ${i === selected ? 'text-content' : 'text-content-secondary'}`} title={m.name}>{m.name || '(unnamed)'}</div>
                  {summaries[m.name] && (
                    <div className="text-[10px] text-content-ghost truncate" title={summaries[m.name]}>{summaries[m.name]}</div>
                  )}
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
          <div className="border-t border-line-subtle p-2.5 relative">
            {addMenu && (
              <div className="absolute left-2.5 right-2.5 bottom-[calc(100%-4px)] rounded-md border border-line bg-surface shadow-lg py-1 z-10">
                {([
                  ['dwl', 'DataWeave module', 'Functions and variables to import'],
                  ['json', 'JSON Schema', 'Types for jsonschema! imports'],
                  ['xsd', 'XML Schema (XSD)', 'Types for xmlschema! imports'],
                ] as [Kind, string, string][]).map(([k, label, sub]) => (
                  <button key={k} onClick={() => addModule(k)} className="w-full text-left px-3 py-1.5 hover:bg-surface-2 cursor-pointer">
                    <div className="text-[11px] text-content">{label}</div>
                    <div className="text-[10px] text-content-ghost">{sub}</div>
                  </button>
                ))}
                <div className="h-px bg-line-subtle my-1" />
                <button onClick={importFiles} className="w-full text-left px-3 py-1.5 hover:bg-surface-2 cursor-pointer">
                  <div className="text-[11px] text-content">Import from file…</div>
                  <div className="text-[10px] text-content-ghost">.dwl, .json or .xsd</div>
                </button>
              </div>
            )}
            <button onClick={() => setAddMenu((v) => !v)} className="w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-md text-[10.5px] font-medium text-accent border border-accent-border hover:bg-accent-dim cursor-pointer">
              <Icons.Plus size={10} /> Add
              <Icons.ChevronDown size={10} />
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
                <span className="text-[10.5px] text-content-ghost font-mono">{importLine(activeKind, active.name || 'MyModule')}</span>
                <span className="flex-1" />
                {dupName && <span className="text-[10.5px] text-err">Duplicate name</span>}
                {badName && !dupName && <span className="text-[10.5px] text-err">Letters/digits/_, packages with ::</span>}
              </div>
              {activeKind !== 'dwl' ? (
                <div className="shrink-0 px-3.5 py-1.5 border-b border-line-subtle text-[10.5px] text-content-ghost">
                  The schema&rsquo;s top-level type is named <span className="font-mono text-content-faint">Root</span>: write <span className="font-mono text-content-faint">payload as Root</span> or <span className="font-mono text-content-faint">fun f(o: Root)</span>, and missing required fields fail when the script compiles.
                </div>
              ) : summaries[active.name] ? (
                <div className="shrink-0 px-3.5 py-1.5 border-b border-line-subtle text-[11px] text-content-secondary">
                  {summaries[active.name]}
                </div>
              ) : (
                <div className="shrink-0 px-3.5 py-1.5 border-b border-line-subtle text-[10.5px] text-content-ghost">
                  No description. Put a <span className="font-mono text-content-faint">{'/** ... */'}</span> comment at the very top of the file, above <span className="font-mono text-content-faint">%dw 2.0</span>, and it shows here and in the list.
                </div>
              )}
              <div className="flex-1 min-h-0">
                <MiniEditor
                  key={`${selected}-${activeKind}`}
                  value={active.content}
                  onChange={(v) => updateActive({ content: v })}
                  language={activeKind === 'json' ? 'json' : activeKind === 'xsd' ? 'xml' : 'dataweave'}
                  height="100%"
                />
              </div>
              <div className="shrink-0 px-3.5 py-2 border-t border-line-subtle text-[10px] text-content-ghost leading-relaxed">
                {activeKind === 'dwl' ? (
                  <>
                    The name is the import path: <span className="font-mono text-content-faint">import fn from {active.name || 'MyModule'}</span>.
                    {!active.name.includes('::') && <> A bare name also resolves the MuleSoft way as <span className="font-mono text-content-faint">modules::{active.name || 'MyModule'}</span>, so standard imports work too.</>}
                    {' '}A module is a <span className="font-mono text-content-faint">%dw 2.0</span> header plus <span className="font-mono text-content-faint">fun</span>/<span className="font-mono text-content-faint">var</span> definitions, no <span className="font-mono text-content-faint">---</span> body. Edits apply on the next run.
                  </>
                ) : (
                  <>
                    The name is the path Mule would use: <span className="font-mono text-content-faint">{active.name || 'schemas::Order'}</span> stands for <span className="font-mono text-content-faint">{(active.name || 'schemas::Order').replace(/::/g, '/')}.{activeKind === 'json' ? 'json' : 'xsd'}</span> in src/main/resources.
                    {activeKind === 'json' ? ' JSON Schema draft 7.' : ''} Edits apply on the next run.
                  </>
                )}
                {' '}A script opened from a Mule project also sees that project&rsquo;s own modules and schemas in src/main/resources, with nothing to add here.
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
