/**
 * DataWeave Academy: the route from "what is a payload?" to the Practice units.
 *
 * Chapter 0 is nine lessons for people who have never seen DataWeave, from
 * src/academy/chapter0.json. That file is written by scripts/academy/verify-chapter0.mjs
 * only after every example and every check has run on the engine, so nothing
 * shown here teaches something the engine does not do. Parts 1-3 are Practice's
 * own units in course order: a unit card opens Practice at that unit.
 *
 * Units are never locked. The order is a suggestion; anyone can skip ahead.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { BeforeMount } from '@monaco-editor/react';
import { invoke } from '../bridge';
import { WindowControls } from './WindowControls';
import { Icons } from './Icons';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { useTheme } from '../ThemeContext';
import { useEditorFont } from '../hooks/useEditorFont';
import { gradeSubmission, type GradeResult, type PracticeQuestion } from '../practiceGrading';
import QUESTIONS_JSON from '../practiceQuestions.json';
import CHAPTER0 from '../academy/chapter0.json';

const QUESTIONS = QUESTIONS_JSON as unknown as PracticeQuestion[];

type Block =
  | { p: string }
  | { list: string[] }
  | { callout: string; text: string }
  | { code: string }
  | { shape: string }
  | { diagram: string; steps: string[] };
interface Example {
  label: string; script: string; payload: string; output?: string;
  payloadMime?: string; outputMime?: string; attributes?: string; vars?: string;
  config?: Record<string, string>; fails?: boolean;
}
interface Case { input: string; output: string; attributes?: string }
type Check =
  | { kind: 'choice'; question: string; options: { text: string; correct: boolean; why: string }[] }
  | { kind: 'build'; prompt: string; starter: string; solution: string; cases: Case[]; hints: string[];
      compare?: 'json' | 'text'; outputMime?: string; finish?: string };
interface Interactive {
  kind: 'json-explorer' | 'mapper' | 'editor' | 'format-switch' | 'context';
  label?: string; payload?: string; source?: string; target?: string;
  links?: { to: string; from: string[] }[]; example?: number; chips?: string[];
  formats?: string[]; fromCheck?: boolean;
}
interface Lesson {
  id: string; title: string; minutes: number; body: Block[]; examples?: Example[];
  interactive: Interactive; check: Check; payloadLabel?: string;
}
const { lessons: LESSONS, terms: TERMS } = CHAPTER0 as unknown as { lessons: Lesson[]; terms: Record<string, string> };

// ── Progress ────────────────────────────────────────────────────────────────
const STORE = 'dw-academy-v1';
const PRACTICE_STORE = 'dw-practice-progress-v1';
interface AcademyProgress { done: Record<string, boolean>; drafts: Record<string, string> }
function loadProgress(): AcademyProgress {
  try {
    const p = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    return { done: p.done ?? {}, drafts: p.drafts ?? {} };
  } catch {
    return { done: {}, drafts: {} };
  }
}
function saveProgress(p: AcademyProgress) {
  try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* blocked storage: it just forgets */ }
}
function practiceSolved(): Record<string, { solved: boolean }> {
  try { return JSON.parse(localStorage.getItem(PRACTICE_STORE) ?? '{}'); } catch { return {}; }
}

// ── Units (Practice's curriculum, in course order) ──────────────────────────
const UNIT_TITLES: Record<string, string> = {
  'select-and-shape': 'Select and shape', 'map-basics': 'Map basics', 'filter-and-null': 'Filter and null',
  'default-and-missing': 'Default and missing', 'string-basics': 'String basics', 'numbers-and-rounding': 'Numbers and rounding',
  'sizeof-and-slicing': 'sizeOf and slicing', 'concat-and-remove': 'Concat and remove', 'groupby-shape': 'groupBy',
  'pluck-and-mapobject': 'pluck and mapObject', 'duplicate-keys': 'Duplicate keys', 'distinct-and-order': 'Distinct and order',
  'conditional-fields': 'Conditional fields', 'update-operator': 'The update operator', 'type-coercion': 'Type coercion',
  'csv-round-trip': 'CSV round trip', 'xml-selectors': 'XML selectors', 'dates-formatting': 'Dates and formatting',
  'match-and-types': 'match and types', 'do-and-scope': 'do and scope', recursion: 'Recursion', 'tree-module': 'The Tree module',
  joins: 'Joins', 'dynamic-keys': 'Dynamic keys', precision: 'Precision', 'nested-aggregation': 'Nested aggregation',
  'multi-format-embed': 'Mixing formats', 'higher-order': 'Higher-order functions', 'error-handling': 'Error handling',
  'generic-key-rewrite': 'Generic key rewrite', denormalize: 'Denormalize', pivot: 'Pivot', 'expression-evaluator': 'Expression evaluator',
  'schema-validator': 'Schema validator', 'reduce-seed': 'reduce with a seed', 'flatten-vs-flatmap': 'flatten vs flatMap',
  'date-arithmetic': 'Date arithmetic', 'xml-namespaces': 'XML namespaces', 'custom-types': 'Custom types', 'flat-file': 'Flat files',
};
/** The MCD Level 1 exam objectives the problems are tagged with, shortened for a chip. */
const OBJECTIVE_SHORT: [RegExp, string][] = [
  [/coerce, format, order, and filter/i, 'Transform and filter'],
  [/Predicting the result/i, 'Core functions'],
  [/Converting between output types/i, 'Types and formats'],
  [/modules, functions, and variables/i, 'Functions and modules'],
];
const shortObjective = (o?: string) => (o ? OBJECTIVE_SHORT.find(([re]) => re.test(o))?.[1] : undefined);

interface Unit { id: string; title: string; total: number; easy: number; objective?: string; full?: string }
const UNITS: Unit[] = (() => {
  const map = new Map<string, Unit & { objectives: Record<string, number> }>();
  for (const q of QUESTIONS) {
    const u = map.get(q.unit) ?? { id: q.unit, title: UNIT_TITLES[q.unit] ?? q.unit, total: 0, easy: 0, objectives: {} };
    u.total++;
    if (q.tier === 'easy') u.easy++;
    const o = (q as { examObjective?: string }).examObjective;
    if (o) u.objectives[o] = (u.objectives[o] ?? 0) + 1;
    map.set(q.unit, u);
  }
  return [...map.values()].map(({ objectives, ...u }) => {
    const full = Object.entries(objectives).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { ...u, full, objective: shortObjective(full) };
  });
})();
const PARTS = [
  { title: 'Part 1 · Foundations', note: 'The everyday tools. A short lesson, then problems that start easy.', units: UNITS.slice(0, 18) },
  { title: 'Part 2 · Going further', note: 'Types, recursion, joins and functions of your own.', units: UNITS.slice(18, 30) },
  { title: 'Part 3 · Advanced', note: 'The shapes real integrations throw at you.', units: UNITS.slice(30) },
];

// ── Running a script ───────────────────────────────────────────────────────
interface RunOut { ok: boolean; output: string; error: string | null; ms: number }
/** p('key') is rewritten to the Config value before a run, as the main editor does. */
const withProps = (script: string, config?: Record<string, string>) =>
  !config ? script : script.replace(/p\('([^']+)'\)/g, (m, k) => (k in config ? JSON.stringify(config[k]) : m));
async function runScript(script: string, o: { payload?: string; payloadMime?: string; attributes?: string; vars?: string; config?: Record<string, string> }): Promise<RunOut> {
  const res = await invoke<{ output: string; error: string | null; execution_time_ms: number }>('run_dataweave', {
    script: withProps(script, o.config),
    payload: o.payload ?? '{}',
    payloadMimeType: o.payloadMime ?? 'application/json',
    attributesJson: o.attributes ?? '{}',
    varsJson: o.vars ?? '{}',
    namedInputsJson: '[]',
    payloadFilePath: null,
    classpath: [],
    timeoutMs: 15000,
    multipartPartsJson: null,
    modulesJson: null,
    languageLevel: null,
  });
  return { ok: !res.error, output: res.output ?? '', error: res.error, ms: res.execution_time_ms };
}

// ── Small pieces ───────────────────────────────────────────────────────────
const CapIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 9 12 4 2 9l10 5 10-5Z" /><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /><path d="M22 9v5" />
  </svg>
);

/** `code`, **bold**, and *term* (dotted underline with its definition) or *emphasis*. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g).map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={i} className="font-mono text-[12.5px] px-1 py-0.5 rounded bg-surface-3 text-content">{part.slice(1, -1)}</code>;
        }
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="text-content font-semibold">{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          const word = part.slice(1, -1);
          const def = TERMS[word];
          return def ? (
            <span key={i} title={def} className="text-content cursor-help" style={{ borderBottom: '1px dashed var(--accent)' }}>{word}</span>
          ) : <em key={i} className="text-content">{word}</em>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function Reading({ body }: { body: Block[] }) {
  return (
    <div className="space-y-3 text-[14px] leading-relaxed text-content-secondary">
      {body.map((b, i) => {
        if ('p' in b) return <p key={i}><Rich text={b.p} /></p>;
        if ('list' in b) return <ul key={i} className="space-y-1.5 pl-1">{b.list.map((x, j) => <li key={j} className="flex gap-2"><span style={{ color: 'var(--accent)' }}>•</span><span><Rich text={x} /></span></li>)}</ul>;
        if ('callout' in b) return (
          <div key={i} className="px-3.5 py-3 rounded-r-lg" style={{ borderLeft: '3px solid var(--accent)', background: 'var(--accent-dim)' }}>
            <strong className="text-content">{b.callout}. </strong><Rich text={b.text} />
          </div>
        );
        if ('code' in b || 'shape' in b) return <pre key={i} className="font-mono text-[12.5px] leading-[1.6] p-3 rounded-lg bg-bg border border-line text-content overflow-x-auto">{'code' in b ? b.code : b.shape}</pre>;
        if ('diagram' in b) return (
          <div key={i} className="flex items-stretch gap-2 py-1">
            {b.steps.map((s, j) => (
              <div key={j} className="flex items-center gap-2 flex-1">
                <div className="flex-1 text-center text-[12px] px-2 py-2.5 rounded-lg border" style={j === 1 ? { borderColor: 'var(--accent)', background: 'var(--accent-dim)', color: 'var(--content)' } : { borderColor: 'var(--line)', background: 'var(--surface-2)' }}>{s}</div>
                {j < b.steps.length - 1 && <span style={{ color: 'var(--accent)' }}>→</span>}
              </div>
            ))}
          </div>
        );
        return null;
      })}
    </div>
  );
}

function PaneHeader({ title, note, right }: { title: string; note?: string; right?: React.ReactNode }) {
  return (
    <div className="h-9 shrink-0 flex items-center gap-2 px-3.5 border-b border-line bg-surface">
      <span className="text-[12.5px] font-semibold text-content">{title}</span>
      {note && <span className="text-[11px] font-mono text-content-faint truncate">{note}</span>}
      <span className="flex-1" />
      {right}
    </div>
  );
}

// ── Interactive: click a value, see its path ───────────────────────────────
function JsonExplorer({ json }: { json: string }) {
  const [path, setPath] = useState<string[] | null>(null);
  const data = useMemo(() => JSON.parse(json), [json]);
  const same = (p: string[]) => path !== null && p.join('.') === path.join('.');
  const onPath = (p: string[]) => path !== null && p.length <= path.length && p.every((x, i) => x === path[i]);
  const render = (v: unknown, p: string[], indent: number): React.ReactNode => {
    const pad = '  '.repeat(indent);
    if (v !== null && typeof v === 'object') {
      const arr = Array.isArray(v);
      const entries = arr ? (v as unknown[]).map((x, i) => [String(i), x] as const) : Object.entries(v as object);
      return (
        <>
          {arr ? '[' : '{'}{'\n'}
          {entries.map(([k, x], i) => (
            <span key={k}>
              {pad}  {!arr && <span className={onPath([...p, k]) ? 'font-bold' : ''} style={{ color: onPath([...p, k]) ? 'var(--accent)' : 'var(--violet)' }}>"{k}"</span>}{!arr && ': '}
              {render(x, [...p, k], indent + 1)}{i < entries.length - 1 ? ',' : ''}{'\n'}
            </span>
          ))}
          {pad}{arr ? ']' : '}'}
        </>
      );
    }
    return (
      <button onClick={() => setPath(p)} className="rounded px-0.5 cursor-pointer hover:bg-surface-3"
        style={same(p) ? { background: 'var(--accent-dim)', boxShadow: '0 0 0 1px var(--accent-border)', color: 'var(--content)' } : { color: typeof v === 'string' ? 'var(--warn)' : 'var(--ok)' }}>
        {JSON.stringify(v)}
      </button>
    );
  };
  const named = path?.filter((x) => !/^\d+$/.test(x)) ?? [];
  return (
    <div className="flex flex-col min-h-0 h-full">
      <PaneHeader title="payload" note="the shop's order · JSON" />
      <div className="px-4 py-3 border-b border-line bg-surface-2 text-[13px] min-h-[64px]">
        {path ? (
          <>
            <div className="text-content">order {named.map((n) => <span key={n}> → <strong>{n}</strong></span>)}{path.some((x) => /^\d+$/.test(x)) && <span className="text-content-faint"> (item {Number(path.find((x) => /^\d+$/.test(x))) + 1} of the list)</span>}</div>
            <div className="mt-1 font-mono text-[12px] text-content-faint">in a script: <span style={{ color: 'var(--accent)' }}>payload.{path.map((x) => (/^\d+$/.test(x) ? `[${x}]` : x)).join('.').replace(/\.\[/g, '[')}</span></div>
          </>
        ) : <span className="text-content-faint">Click any value below.</span>}
      </div>
      <pre className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-[1.7] text-content">{render(data, [], 0)}</pre>
    </div>
  );
}

// ── Interactive: connect target fields to their sources ────────────────────
function Mapper({ it }: { it: Interactive }) {
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const links = it.links ?? [];
  const lit = new Set(focus ? links.find((l) => l.to === focus)?.from ?? [] : []);
  const field = (path: string, side: 'source' | 'target') => {
    const isLit = side === 'source' ? lit.has(path) : focus === path;
    const done = side === 'target' && connected[path];
    return (
      <button key={path} onClick={() => { if (side === 'target') { setFocus(path); setConnected((c) => ({ ...c, [path]: true })); } }}
        disabled={side === 'source'}
        className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-md font-mono text-[12.5px] border transition-colors"
        style={{
          borderColor: isLit ? 'var(--accent)' : 'var(--line)',
          background: isLit ? 'var(--accent-dim)' : done ? 'var(--surface-2)' : 'var(--surface)',
          color: 'var(--content)', cursor: side === 'target' ? 'pointer' : 'default',
        }}>
        {side === 'target' && <span style={{ color: done ? 'var(--ok)' : 'var(--content-faint)' }}>{done ? '✓' : '○'}</span>}
        {path}
      </button>
    );
  };
  const sources = ['orderId', 'placedAt', 'total', 'currency', 'customer.firstName', 'customer.lastName', 'customer.email', 'customer.address.city', 'customer.address.country', 'lines[].sku', 'lines[].name', 'lines[].qty', 'lines[].price'];
  const count = Object.keys(connected).length;
  const rule = focus ? links.find((l) => l.to === focus) : null;
  return (
    <div className="flex flex-col min-h-0 h-full">
      <PaneHeader title="Mapping" note={it.label} right={<span className="text-[11px] font-mono" style={{ color: count === links.length ? 'var(--ok)' : 'var(--content-faint)' }}>{count}/{links.length} connected</span>} />
      <div className="px-4 py-3 border-b border-line bg-surface-2 text-[13px] min-h-[56px]">
        {rule ? (
          <span className="text-content"><strong>{rule.to}</strong> comes from {rule.from.map((f, i) => <span key={f}>{i > 0 && ' and '}<code className="font-mono text-[12px] px-1 rounded bg-surface-3">{f}</code></span>)}{rule.from.length > 1 ? ', joined.' : '.'}</span>
        ) : <span className="text-content-faint">Click a target field on the right to see where its value comes from.</span>}
      </div>
      <div className="flex-1 overflow-auto grid grid-cols-2 gap-6 p-4">
        <div className="space-y-1.5"><div className="text-[11px] uppercase tracking-wider text-content-faint mb-2">Source · the shop</div>{sources.map((s) => field(s, 'source'))}</div>
        <div className="space-y-1.5"><div className="text-[11px] uppercase tracking-wider text-content-faint mb-2">Target · the warehouse</div>{links.map((l) => field(l.to, 'target'))}
          <p className="pt-3 text-[12px] text-content-faint">Fields with no line in: <code className="font-mono">placedAt</code>, <code className="font-mono">total</code>, <code className="font-mono">currency</code>, <code className="font-mono">email</code>, <code className="font-mono">lines[].name</code>, <code className="font-mono">lines[].price</code>. They are left out.</p>
        </div>
      </div>
    </div>
  );
}

// ── The lesson ─────────────────────────────────────────────────────────────
function LessonView({ lesson, index, done, draft, onDraft, onDone, onPrev, onNext, onFinish }: {
  lesson: Lesson; index: number; done: boolean; draft?: string;
  onDraft: (s: string) => void; onDone: () => void; onPrev?: () => void; onNext?: () => void; onFinish: () => void;
}) {
  const { isDark } = useTheme();
  const editorFont = useEditorFont();
  const it = lesson.interactive;
  const check = lesson.check;
  const buildCheck = check.kind === 'build' ? check : null;

  // What the editor shows: the learner's own script for a build check, otherwise an example.
  const examples = lesson.examples ?? [];
  const hasEditor = it.kind === 'editor' || it.kind === 'format-switch' || it.kind === 'context';
  const tabs = [...(buildCheck ? ['Your script'] : []), ...examples.map((e) => e.label)];
  const [tab, setTab] = useState(0);
  const exampleFor = (t: number): Example | null => {
    const i = buildCheck ? t - 1 : t;
    return i >= 0 ? examples[i] ?? null : null;
  };
  const initialFor = (t: number) => {
    const ex = exampleFor(t);
    return ex ? ex.script : (draft ?? buildCheck?.starter ?? '');
  };
  const [script, setScript] = useState(() => initialFor(buildCheck ? 0 : (it.example ?? 0)));
  const [header, setHeader] = useState('web-shop');
  const [out, setOut] = useState<RunOut | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [hints, setHints] = useState(0);

  useEffect(() => { // a new lesson starts clean
    const t = buildCheck ? 0 : (it.example ?? 0);
    setTab(t); setScript(initialFor(t)); setOut(null); setPicked(null); setGrade(null); setHints(0);
  }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ex = exampleFor(tab);
  const context = ex ?? (buildCheck ? { payload: buildCheck.cases[0].input, attributes: buildCheck.cases[0].attributes } as Partial<Example> : null);
  const attributes = it.kind === 'context' && ex?.attributes ? JSON.stringify({ headers: { 'x-source': header } }) : context?.attributes;

  // Runs as you type.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasEditor) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setOut(await runScript(script, { payload: context?.payload, payloadMime: context?.payloadMime, attributes, vars: context?.vars, config: context?.config }));
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [script, tab, header, lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchTab = (t: number) => { setTab(t); setScript(initialFor(t)); setOut(null); };
  const edit = (s: string) => { setScript(s); if (buildCheck && tab === 0) onDraft(s); };

  const submit = useCallback(async () => {
    if (!buildCheck) return;
    const mine = tab === 0 ? script : (draft ?? buildCheck.starter);
    setGrading(true);
    try {
      const q = { cases: buildCheck.cases, compare: buildCheck.compare } as unknown as PracticeQuestion;
      const r = await gradeSubmission(q, (c) => runScript(mine, { payload: c.input, attributes: (c as Case).attributes }));
      setGrade(r);
      if (r.solved) onDone();
    } finally {
      setGrading(false);
    }
  }, [buildCheck, tab, script, draft, onDone]);

  const pick = (i: number) => {
    if (check.kind !== 'choice') return;
    setPicked(i);
    if (check.options[i].correct) onDone();
  };

  const monacoTheme = isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME;
  const beforeMount: BeforeMount = (monaco) => defineDataWeaveTheme(monaco);
  const roOptions = { ...editorFont, minimap: { enabled: false }, lineNumbers: 'on' as const, scrollBeyondLastLine: false, automaticLayout: true, readOnly: true, padding: { top: 8, bottom: 8 }, renderLineHighlight: 'none' as const, folding: false };
  const lines = script.split('\n').length;

  const setOutputFormat = (mime: string) => setScript((s) => s.replace(/^output\s+\S+/m, `output ${mime}`));
  const currentFormat = script.match(/^output\s+(\S+)/m)?.[1];

  return (
    <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: 'minmax(340px, 42%) minmax(0, 1fr)' }}>
      {/* Reading */}
      <section className="flex flex-col min-h-0 border-r border-line bg-surface">
        <div className="flex-1 overflow-auto px-7 py-6">
          <div className="flex gap-1 mb-5">
            {LESSONS.map((l, i) => <i key={l.id} className="flex-1 h-1 rounded-full" style={{ background: i < index || (i === index && done) ? 'var(--accent)' : i === index ? 'var(--accent-border)' : 'var(--surface-3)' }} />)}
          </div>
          <div className="text-[11px] font-mono uppercase tracking-[0.12em]" style={{ color: 'var(--accent)' }}>Chapter 0 · Lesson {index + 1} of {LESSONS.length} · about {lesson.minutes} min</div>
          <h1 className="mt-1.5 mb-4 text-[24px] font-semibold tracking-tight text-content">{lesson.title}</h1>
          <Reading body={lesson.body} />
        </div>

        {/* Check */}
        <div className="border-t border-line px-7 py-4 bg-surface-2">
          {check.kind === 'choice' ? (
            <>
              <div className="text-[13.5px] font-semibold text-content mb-2.5"><Rich text={`Check: ${check.question}`} /></div>
              <div className="space-y-1.5">
                {check.options.map((o, i) => {
                  const chosen = picked === i;
                  return (
                    <button key={i} onClick={() => pick(i)} className="w-full text-left px-3 py-2 rounded-lg border text-[13px] cursor-pointer transition-colors"
                      style={{ borderColor: chosen ? (o.correct ? 'var(--ok)' : 'var(--err)') : 'var(--line)', background: chosen ? 'var(--surface)' : 'transparent' }}>
                      <span className="text-content"><Rich text={o.text} /></span>
                      {chosen && <div className="mt-1 text-[12.5px]" style={{ color: o.correct ? 'var(--ok)' : 'var(--err)' }}>{o.correct ? '✓ ' : ''}<Rich text={o.why} /></div>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="text-[13.5px] font-semibold text-content"><Rich text={`Check: ${check.prompt}`} /> <span className="font-normal text-[12px] text-content-faint">graded by the engine on {check.cases.length} inputs</span></div>
              <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                <button onClick={submit} disabled={grading} className="h-8 px-3.5 rounded-lg text-[13px] font-semibold cursor-pointer disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                  {grading ? 'Checking…' : 'Check my script'}
                </button>
                {hints < check.hints.length && <button onClick={() => setHints((h) => h + 1)} className="text-[12.5px] text-content-faint hover:text-content cursor-pointer">Show a hint</button>}
                {grade && (grade.solved
                  ? <span className="text-[13px]" style={{ color: 'var(--ok)' }}>✓ Passed all {grade.total}. {check.finish ?? ''}</span>
                  : <span className="text-[13px]" style={{ color: 'var(--err)' }}>
                      {grade.failure?.error ? `Error on input ${grade.failure.index + 1}: ${grade.failure.error.split('\n')[0]}` : `Input ${(grade.failure?.index ?? 0) + 1} gave a different result. Compare your output with what it should be below.`}
                    </span>)}
              </div>
              {hints > 0 && <div className="mt-2.5 space-y-1 text-[12.5px] text-content-secondary">{check.hints.slice(0, hints).map((h, i) => <div key={i}>Hint {i + 1}: <Rich text={h} /></div>)}</div>}
              {grade && !grade.solved && grade.failure?.want && !grade.failure.error && (
                <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11.5px] font-mono">
                  <div><div className="text-content-faint mb-1">yours</div><pre className="p-2 rounded bg-bg border border-line max-h-28 overflow-auto text-content">{grade.failure.got}</pre></div>
                  <div><div className="text-content-faint mb-1">expected</div><pre className="p-2 rounded bg-bg border border-line max-h-28 overflow-auto text-content">{grade.failure.want}</pre></div>
                </div>
              )}
            </>
          )}
        </div>
        {/* Short labels with the lesson name in the tooltip: full titles wrapped in narrow windows. */}
        <div className="flex justify-between gap-3 px-7 py-2.5 border-t border-line bg-surface">
          <button onClick={onPrev} disabled={!onPrev} title={onPrev ? `${LESSONS[index - 1].id} ${LESSONS[index - 1].title}` : undefined}
            className="h-8 px-3 shrink-0 whitespace-nowrap rounded-lg border border-line text-[13px] text-content cursor-pointer disabled:opacity-40">‹ Previous</button>
          {onNext ? (
            <button onClick={onNext} title={`${LESSONS[index + 1].id} ${LESSONS[index + 1].title}`}
              className="h-8 px-3 min-w-0 truncate whitespace-nowrap rounded-lg text-[13px] font-semibold cursor-pointer"
              style={done ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : { border: '1px solid var(--line)', color: 'var(--content-secondary)' }}>
              Next: {LESSONS[index + 1].id} ›
            </button>
          ) : (
            <button onClick={onFinish} className="h-8 px-3 whitespace-nowrap rounded-lg text-[13px] font-semibold cursor-pointer" style={done ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : { border: '1px solid var(--line)', color: 'var(--content-secondary)' }}>
              On to Part 1 ›
            </button>
          )}
        </div>
      </section>

      {/* Interactive */}
      <section className="flex flex-col min-h-0 min-w-0 bg-bg">
        {it.kind === 'json-explorer' && <JsonExplorer json={it.payload ?? '{}'} />}
        {it.kind === 'mapper' && <Mapper it={it} />}
        {hasEditor && (
          <>
            <div className="h-9 shrink-0 flex items-center gap-1 px-2 border-b border-line bg-surface overflow-x-auto">
              {tabs.map((t, i) => (
                <button key={t} onClick={() => switchTab(i)} className="h-7 px-2.5 rounded-md text-[12px] whitespace-nowrap cursor-pointer"
                  style={tab === i ? { background: 'var(--accent-dim)', color: 'var(--accent)' } : { color: 'var(--content-faint)' }}>
                  {i === 0 && buildCheck ? '✎ ' : ''}{t}
                </button>
              ))}
              <span className="flex-1" />
              {out && <span className="text-[11px] font-mono px-1" style={{ color: out.ok ? 'var(--accent)' : 'var(--err)' }}>{out.ok ? `• ${out.ms}ms` : '• error'}</span>}
            </div>
            {it.kind === 'format-switch' && (
              <div className="flex items-center gap-2 px-3.5 py-2 border-b border-line bg-surface-2 text-[12px]">
                <span className="text-content-faint">Output as</span>
                {(it.formats ?? []).map((f) => (
                  <button key={f} onClick={() => setOutputFormat(f)} className="h-6 px-2.5 rounded-md font-mono cursor-pointer border"
                    style={currentFormat === f ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-dim)' } : { borderColor: 'var(--line)', color: 'var(--content-secondary)' }}>
                    {f.split('/')[1].toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            {it.kind === 'context' && ex?.attributes && (
              <div className="flex items-center gap-2 px-3.5 py-2 border-b border-line bg-surface-2 text-[12px]">
                <span className="text-content-faint">Context · Request header</span>
                <code className="font-mono text-content">x-source</code>
                <input value={header} onChange={(e) => setHeader(e.target.value)} className="h-6 px-2 rounded-md bg-surface border border-line font-mono text-[12px] text-content outline-none focus:border-[color:var(--accent)]" />
              </div>
            )}
            <div style={{ height: Math.min(18, Math.max(5, lines + 1)) * 21 + 16 }} className="shrink-0 border-b border-line">
              <Editor value={script} onChange={(v) => edit(v ?? '')} language="dataweave" theme={monacoTheme} beforeMount={beforeMount}
                options={{ ...editorFont, minimap: { enabled: false }, lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 8, bottom: 8 }, folding: false, renderLineHighlight: 'none' }} />
            </div>
            {it.chips && (
              <div className="flex flex-wrap gap-1.5 px-3.5 py-2 border-b border-line bg-surface">
                <span className="text-[11.5px] text-content-faint mr-1 self-center">Try:</span>
                {it.chips.map((c) => <button key={c} onClick={() => setScript(script.replace(/---\n[\s\S]*$/, `---\n${c}`))} className="h-6 px-2.5 rounded-full border border-line bg-surface-2 font-mono text-[11.5px] text-content-secondary hover:text-content cursor-pointer">{c}</button>)}
              </div>
            )}
            <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
              <div className="flex flex-col min-h-0 min-w-0 border-r border-line">
                <PaneHeader title="payload" note={lesson.payloadLabel ?? (ex?.payloadMime === 'application/xml' ? 'XML' : 'JSON')} />
                <div className="flex-1 min-h-0">
                  <Editor value={context?.payload ?? '{}'} language={ex?.payloadMime === 'application/xml' ? 'xml' : 'json'} theme={monacoTheme} beforeMount={beforeMount} options={roOptions} />
                </div>
              </div>
              <div className="flex flex-col min-h-0 min-w-0">
                <PaneHeader title="output" note={ex?.fails ? 'this one fails on purpose' : undefined} />
                <div className="flex-1 min-h-0 overflow-auto">
                  {out && !out.ok
                    ? <>
                        {/* The engine's words are exact but not for beginners; say which rule from the lesson it is. */}
                        {/xml/.test(currentFormat ?? '') && /second root|coerce Array/i.test(out.error ?? '') && (
                          <div className="m-3 mb-0 px-3 py-2.5 rounded-lg text-[12.5px] text-content-secondary" style={{ background: 'var(--accent-dim)', borderLeft: '3px solid var(--accent)' }}>
                            <strong className="text-content">XML needs exactly one outer element.</strong> This result is a list, or several fields side by side, so XML has nowhere to put it. Wrap it in one, like <code className="font-mono">{'{ order: { ... } }'}</code>, or switch back to JSON or CSV.
                          </div>
                        )}
                        {/csv/.test(currentFormat ?? '') && /csv|coerce Object/i.test(out.error ?? '') && (
                          <div className="m-3 mb-0 px-3 py-2.5 rounded-lg text-[12.5px] text-content-secondary" style={{ background: 'var(--accent-dim)', borderLeft: '3px solid var(--accent)' }}>
                            <strong className="text-content">CSV is a table.</strong> It needs a list of flat objects: one object per row, one field per column.
                          </div>
                        )}
                        <pre className="p-3.5 font-mono text-[12px] whitespace-pre-wrap" style={{ color: 'var(--err)' }}>{(out.error ?? '').split('\n').slice(0, 6).join('\n')}</pre>
                      </>
                    : <Editor value={out?.output ?? ''} language={/xml/.test(currentFormat ?? '') ? 'xml' : /json/.test(currentFormat ?? '') ? 'json' : 'plaintext'} theme={monacoTheme} beforeMount={beforeMount} options={roOptions} />}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ── The screen ─────────────────────────────────────────────────────────────
export function AcademyScreen({ open, onClose, onOpenUnit, covered = false }: {
  open: boolean; onClose: () => void; onOpenUnit: (unit: string) => void;
  /** Practice is open on top: Escape belongs to it, not to us. */
  covered?: boolean;
}) {
  const [progress, setProgress] = useState<AcademyProgress>(loadProgress);
  const [lessonIdx, setLessonIdx] = useState<number | null>(null);
  const solved = useMemo(() => (open ? practiceSolved() : {}), [open]);

  useEffect(() => {
    if (!open || covered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (lessonIdx !== null) setLessonIdx(null); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, lessonIdx, covered]);

  const update = (p: AcademyProgress) => { setProgress(p); saveProgress(p); };
  if (!open) return null;

  const doneCount = LESSONS.filter((l) => progress.done[l.id]).length;
  const nextIdx = Math.max(0, LESSONS.findIndex((l) => !progress.done[l.id]));
  const lesson = lessonIdx !== null ? LESSONS[lessonIdx] : null;
  const unitSolved = (u: Unit) => QUESTIONS.filter((q) => q.unit === u.id && solved[q.id]?.solved).length;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-bg">
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-3 pl-4 pr-3 bg-surface border-b border-line">
        <button onClick={() => (lesson ? setLessonIdx(null) : onClose())} title="Back (Esc)"
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors">
          <Icons.ChevronRight size={12} className="rotate-180" />Back
        </button>
        <div className="w-px h-4 bg-line" />
        <span style={{ color: 'var(--accent)' }}><CapIcon /></span>
        <span className="text-[13px] font-semibold text-content tracking-tight">DataWeave Academy</span>
        <span className="text-[11px] font-mono text-content-faint truncate">{lesson ? `/ Chapter 0 / ${lesson.id} ${lesson.title}` : `${LESSONS.length} lessons · ${UNITS.length} units · runs on the real engine`}</span>
        <span className="flex-1" />
        <WindowControls />
      </header>

      {lesson && lessonIdx !== null ? (
        <LessonView
          lesson={lesson}
          index={lessonIdx}
          done={!!progress.done[lesson.id]}
          draft={progress.drafts[lesson.id]}
          onDraft={(s) => update({ ...progress, drafts: { ...progress.drafts, [lesson.id]: s } })}
          onDone={() => update({ ...progress, done: { ...progress.done, [lesson.id]: true } })}
          onPrev={lessonIdx > 0 ? () => setLessonIdx(lessonIdx - 1) : undefined}
          onNext={lessonIdx < LESSONS.length - 1 ? () => setLessonIdx(lessonIdx + 1) : undefined}
          onFinish={() => onOpenUnit(UNITS[0].id)}
        />
      ) : (
        <main className="flex-1 overflow-auto">
          <div className="max-w-[1120px] mx-auto px-6 pt-8 pb-16">
            <section className="grid gap-6 items-end pb-6 border-b border-line" style={{ gridTemplateColumns: '1fr auto' }}>
              <div>
                <h1 className="text-[30px] font-semibold tracking-tight text-content">Learn DataWeave from zero</h1>
                <p className="mt-1.5 max-w-[640px] text-[14px] text-content-secondary leading-relaxed">
                  Start with what a payload is and what mapping means. Finish writing the transforms real Mule apps run. Every example and every check runs on the same engine Mule uses, on your machine.
                </p>
              </div>
              <div className="min-w-[270px] p-4 rounded-xl border border-line bg-surface">
                <div className="text-[22px] font-bold text-content">{doneCount} of {LESSONS.length}</div>
                <div className="text-[12px] text-content-faint">Chapter 0 lessons done</div>
                <div className="h-1.5 my-2.5 rounded-full bg-surface-3 overflow-hidden"><div className="h-full" style={{ width: `${(doneCount / LESSONS.length) * 100}%`, background: 'var(--accent)' }} /></div>
                <button onClick={() => (doneCount === LESSONS.length ? onOpenUnit(UNITS[0].id) : setLessonIdx(nextIdx))}
                  className="w-full h-9 rounded-lg text-[13px] font-semibold cursor-pointer" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                  {doneCount === 0 ? 'Start with 0.1' : doneCount === LESSONS.length ? 'Continue with Part 1' : `Continue: ${LESSONS[nextIdx].id} ${LESSONS[nextIdx].title}`}
                </button>
              </div>
            </section>

            <section className="mt-7">
              <div className="flex items-baseline gap-2.5 mb-3"><h2 className="text-[16px] font-semibold text-content">Chapter 0 · Start here</h2><span className="text-[12px] text-content-faint">No DataWeave or Mule knowledge needed · about {LESSONS.reduce((t, l) => t + l.minutes, 0)} minutes</span></div>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {LESSONS.map((l, i) => {
                  const done = progress.done[l.id];
                  const current = !done && i === nextIdx;
                  return (
                    <button key={l.id} onClick={() => setLessonIdx(i)} className="text-left p-3 rounded-xl border bg-surface cursor-pointer transition-colors hover:border-[color:var(--accent-border)]"
                      style={current ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-dim)' } : { borderColor: 'var(--line)' }}>
                      <div className="text-[11px] font-mono text-content-faint">{l.id}{done && <span style={{ color: 'var(--ok)' }}>  ✓ done</span>}{current && <span style={{ color: 'var(--accent)' }}>  → next</span>}</div>
                      <div className="mt-0.5 text-[13.5px] font-semibold text-content">{l.title}</div>
                      <div className="mt-1 text-[12px] text-content-faint">{l.minutes} min · {l.check.kind === 'build' ? 'write a script' : 'a quick question'}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            {PARTS.map((part) => (
              <section key={part.title} className="mt-7">
                <div className="flex items-baseline gap-2.5 mb-3"><h2 className="text-[16px] font-semibold text-content">{part.title}</h2><span className="text-[12px] text-content-faint">{part.note}</span></div>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
                  {part.units.map((u) => {
                    const n = UNITS.indexOf(u) + 1;
                    const s = unitSolved(u);
                    return (
                      <button key={u.id} onClick={() => onOpenUnit(u.id)} title={u.full ? `MCD exam objective: ${u.full}` : undefined}
                        className="grid items-center gap-2.5 p-2.5 rounded-xl border border-line bg-surface text-left cursor-pointer transition-colors hover:border-[color:var(--accent-border)]"
                        style={{ gridTemplateColumns: '28px 1fr auto' }}>
                        <span className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-mono" style={s > 0 ? { background: 'var(--accent-dim)', color: 'var(--accent)' } : { background: 'var(--surface-3)', color: 'var(--content-muted)' }}>{n}</span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-content truncate">{u.title}</span>
                          {u.objective && <span className="inline-block mt-0.5 px-1.5 rounded text-[10.5px] bg-surface-3 text-content-muted">MCD · {u.objective}</span>}
                        </span>
                        <span className="text-[11px] font-mono text-content-faint">{s}/{u.total}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </main>
      )}
    </div>
  );
}
