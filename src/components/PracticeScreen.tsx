/**
 * Practice — LeetCode for DataWeave, offline.
 *
 * A question, a payload, an editor, and hidden cases that decide whether you
 * solved it. The engine is already in the app, so there is no account, no
 * network and no per-run cost, which is what makes it usable from behind a
 * corporate proxy at work.
 *
 * Grading lives in ../practiceGrading (shared with the authoring pipeline in
 * scripts/practice, so a question is graded by the same code that let it in).
 * The questions themselves are generated — every answer, every hidden case and
 * every snippet inside an explanation was executed by this engine before it
 * shipped. See scripts/practice/README.md.
 *
 * Run vs Submit is the LeetCode split and it matters here: Run shows you the
 * sample's real output so you can iterate, Submit puts your script through the
 * hidden cases. Viewing the solution stops you submitting for the session —
 * borrowed from dwcode, and honest in a way a silent points deduction is not.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { BeforeMount } from '@monaco-editor/react';
import { invoke } from '../bridge';
import { WindowControls } from './WindowControls';
import { Icons } from './Icons';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { useTheme } from '../ThemeContext';
import { useEditorFont } from '../hooks/useEditorFont';
import type { TraceRow } from '../hooks/useDWRunner';
import {
  gradeSubmission,
  nextUnsolved,
  type GradeResult,
  type PracticeQuestion,
} from '../practiceGrading';
import QUESTIONS_JSON from '../practiceQuestions.json';

const QUESTIONS = QUESTIONS_JSON as unknown as PracticeQuestion[];

const TIERS = ['easy', 'medium', 'hard', 'extra', 'max', 'ultra'] as const;
type Tier = (typeof TIERS)[number];

/** How each tier reads, and what it means. */
const TIER_META: Record<Tier, { colour: string; label: string; blurb: string }> = {
  easy:   { colour: 'var(--ok)',     label: 'Easy',   blurb: 'One idea at a time' },
  medium: { colour: 'var(--cyan)',   label: 'Medium', blurb: 'Two ideas, and a shape that surprises you' },
  hard:   { colour: 'var(--warn)',   label: 'Hard',   blurb: 'Something a working Mule developer hits' },
  extra:  { colour: 'var(--accent)', label: 'Extra',  blurb: 'Needs a technique, not just a function' },
  max:    { colour: 'var(--err)',    label: 'Max',    blurb: 'Recursive, or a shape discovered from the data' },
  ultra:  { colour: 'var(--err)',    label: 'Ultra',  blurb: 'Write an interpreter in a mapping language' },
};

/**
 * What is remembered about a question.
 *
 * Deliberately NOT a best time. Offline, with the solution one click away and
 * nobody to compare against, a fastest-time measures how recently you re-opened
 * the page — re-entering a question and pasting the answer scored three
 * seconds. Same for points: they only mean something on a site with a
 * leaderboard, and adding one would need a server, which is the opposite of
 * the point of this. What is worth knowing is which ideas you have covered.
 */
interface Progress {
  solved: boolean;
  /** Solved after reading the answer still counts as done — just differently. */
  viewedSolution: boolean;
  attempts: number;
}

const STORE = 'dw-practice-progress-v1';

function loadProgress(): Record<string, Progress> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}');
  } catch {
    return {};
  }
}

function saveProgress(p: Record<string, Progress>) {
  try {
    localStorage.setItem(STORE, JSON.stringify(p));
  } catch {
    /* private window, blocked storage — practice still works, it just forgets */
  }
}

/**
 * What you had typed, per question.
 *
 * Kept apart from progress on purpose: these are bulk and disposable, progress
 * is small and meaningful, and clearing one should not take the other with it.
 *
 * It stores the live editor contents rather than the last *submitted* answer,
 * which is the more useful of the two — a half-finished attempt you walked away
 * from is exactly the thing worth coming back to, and a submitted answer is
 * just a draft that happened to be run.
 */
const DRAFTS = 'dw-practice-drafts-v1';

function loadDrafts(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS) ?? '{}');
  } catch {
    return {};
  }
}

/**
 * Inline `code`, **bold**, *italic*, and paragraphs. Enough for a task
 * description and a worked explanation, which is all this has to render.
 *
 * Bold is matched before italic in the alternation, or `**both**` would read as
 * an empty italic wrapping a bold.
 */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split('\n\n').map((para, pi) => (
        <p key={pi} className="text-[13px] text-content-secondary leading-relaxed mb-2.5 last:mb-0">
          {para.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g).map((part, i) => {
            if (part.startsWith('`') && part.endsWith('`')) {
              return (
                <code
                  key={i}
                  className="font-mono text-[12px] px-1 py-0.5 rounded"
                  style={{ background: 'var(--surface-2)', color: 'var(--content)' }}
                >
                  {part.slice(1, -1)}
                </code>
              );
            }
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="text-content font-semibold">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
              return <em key={i} className="text-content">{part.slice(1, -1)}</em>;
            }
            return <span key={i}>{part}</span>;
          })}
        </p>
      ))}
    </>
  );
}

const handleBeforeMount: BeforeMount = (monaco) => defineDataWeaveTheme(monaco);

export function PracticeScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isDark } = useTheme();
  const editorFont = useEditorFont();
  const [progress, setProgress] = useState<Record<string, Progress>>(loadProgress);
  const [openId, setOpenId] = useState<string | null>(null);
  const [script, setScript] = useState('');
  /**
   * Every question's editor contents, so leaving one and coming back does not
   * throw your work away. A ref rather than state because nothing renders from
   * it — it is read when a question opens and written as you type.
   */
  const drafts = useRef<Record<string, string>>(loadDrafts());
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [running, setRunning] = useState(false);
  const [sampleOut, setSampleOut] = useState<{ ok: boolean; text: string } | null>(null);
  /**
   * What every expression in the learner's script evaluated to, from the
   * engine's own execution listener (dw-server/Trace.scala). This is the
   * answer to "why is my result empty" without a model in the loop: a
   * mistyped selector shows up as a row whose value is null.
   *
   * Traced against the SAMPLE only, never a hidden case — the values in a
   * trace would otherwise hand over the hidden payload, and the hidden cases
   * are the only thing stopping a hardcoded answer.
   */
  const [trace, setTrace] = useState<TraceRow[] | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  /**
   * Time on this attempt. It is shown, never stored and never compared.
   *
   * `stopped` is latched separately from `result` on purpose: Trace clears the
   * result so the verdict card makes way for the trace, and keying the clock
   * off `result?.solved` meant pressing Trace after solving started it running
   * again.
   */
  const [seconds, setSeconds] = useState(0);
  const [stopped, setStopped] = useState(false);
  const startedAt = useRef<number>(0);

  const question = useMemo(() => QUESTIONS.find((q) => q.id === openId) ?? null, [openId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (openId) setOpenId(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, openId]);

  // Reset everything when a question is opened, including the clock — except
  // what you had written, which comes back.
  useEffect(() => {
    if (!question) return;
    setScript(drafts.current[question.id] ?? question.starter ?? '%dw 2.0\noutput application/json\n---\n');
    setSampleOut(null);
    setTrace(null);
    setResult(null);
    setHintsShown(0);
    setShowSolution(false);
    setShowExplanation(false);
    setSeconds(0);
    setStopped(false);
    startedAt.current = Date.now();
  }, [question]);

  useEffect(() => {
    if (!question || stopped) return;
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [question, stopped]);

  /** One engine run. The same shape the Run button uses. */
  const runOnce = useCallback(
    async (payload: string, q: PracticeQuestion, src: string, valueTrace = false) => {
      const res = await invoke<{
        output: string;
        error: string | null;
        execution_time_ms: number;
        trace?: TraceRow[];
      }>(
        'run_dataweave',
        {
          script: src,
          payload,
          payloadMimeType: q.inputMime ?? 'application/json',
          attributesJson: '{}',
          varsJson: '{}',
          namedInputsJson: '[]',
          payloadFilePath: null,
          classpath: [],
          timeoutMs: 15000,
          multipartPartsJson: null,
          modulesJson: null,
          languageLevel: null,
          outputMimeType: q.outputMime ?? 'application/json',
          valueTrace,
        },
      );
      return {
        ok: !res.error,
        output: res.output ?? '',
        error: res.error,
        ms: res.execution_time_ms,
        trace: res.trace ?? [],
      };
    },
    [],
  );

  const handleRun = async () => {
    if (!question) return;
    setRunning(true);
    setResult(null);
    setTrace(null);
    try {
      const r = await runOnce(question.cases[0].input, question, script);
      setSampleOut({ ok: r.ok, text: r.ok ? r.output : (r.error ?? 'failed') });
    } finally {
      setRunning(false);
    }
  };

  /**
   * Remember what is in the editor, debounced.
   *
   * `id` is captured at the call site rather than read back from state when the
   * timer fires: otherwise switching questions inside the debounce window would
   * save the old script under the new question's id.
   */
  const stashDraft = (id: string, text: string) => {
    drafts.current[id] = text;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFTS, JSON.stringify(drafts.current));
      } catch {
        /* blocked storage — practice still works, it just forgets */
      }
    }, 400);
  };

  // A pending write must not be lost because the screen closed.
  useEffect(
    () => () => {
      if (!draftTimer.current) return;
      clearTimeout(draftTimer.current);
      try {
        localStorage.setItem(DRAFTS, JSON.stringify(drafts.current));
      } catch {
        /* blocked storage */
      }
    },
    [],
  );

  /**
   * Run the sample with the engine's execution listener on, so every
   * expression's real value comes back. A wrong selector stops being a mystery
   * the moment you can see it evaluating to null.
   */
  const handleTrace = async () => {
    if (!question) return;
    setRunning(true);
    setResult(null);
    try {
      const r = await runOnce(question.cases[0].input, question, script, true);
      setSampleOut({ ok: r.ok, text: r.ok ? r.output : (r.error ?? 'failed') });
      setTrace(r.trace ?? []);
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!question) return;
    setRunning(true);
    setSampleOut(null);
    setTrace(null);
    try {
      const r = await gradeSubmission(question, (c) => runOnce(c.input, question, script));
      setResult(r);

      const prev = progress[question.id] ?? { solved: false, viewedSolution: false, attempts: 0 };
      const next: Progress = {
        solved: prev.solved || r.solved,
        viewedSolution: prev.viewedSolution || showSolution,
        attempts: prev.attempts + 1,
      };
      const updated = { ...progress, [question.id]: next };
      setProgress(updated);
      saveProgress(updated);
      if (r.solved) {
        setShowExplanation(true);
        setStopped(true);
      }
    } finally {
      setRunning(false);
    }
  };

  const solvedCount = QUESTIONS.filter((q) => progress[q.id]?.solved).length;
  /**
   * Coverage of the syllabus, which is the one number here that means
   * something: each question is the only one for its curriculum unit, so this
   * is how many distinct ideas you have actually worked through.
   */
  const topicsCovered = new Set(
    QUESTIONS.filter((q) => progress[q.id]?.solved).map((q) => q.unit),
  ).size;
  const topicsTotal = new Set(QUESTIONS.map((q) => q.unit)).size;

  /** Where "Next" goes: the next thing you have not done, wrapping around. */
  const upNext = question
    ? nextUnsolved(QUESTIONS, question.id, (id) => !!progress[id]?.solved)
    : null;

  if (!open) return null;

  const monacoTheme = isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME;
  const editorOptions = {
    ...editorFont,
    minimap: { enabled: false },
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    padding: { top: 10, bottom: 10 },
    renderLineHighlight: 'none' as const,
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-bg">
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-3 pl-4 pr-3 bg-surface border-b border-line">
        <button
          onClick={() => (openId ? setOpenId(null) : onClose())}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
          title="Back (Esc)"
        >
          <Icons.ChevronRight size={12} className="rotate-180" />
          Back
        </button>
        <div className="w-px h-4 bg-line" />
        <Icons.Play size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />
        <span className="text-[13px] font-semibold text-content tracking-tight">
          {question ? question.title : 'Practice'}
        </span>
        {question && (
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded-full"
            style={{
              background: `color-mix(in oklch, ${TIER_META[question.tier as Tier].colour} 14%, transparent)`,
              color: TIER_META[question.tier as Tier].colour,
            }}
          >
            {TIER_META[question.tier as Tier].label}
          </span>
        )}
        <span className="flex-1" />
        {question ? (
          <>
            <span
              className="text-[11px] font-mono text-content-faint tabular-nums"
              title={stopped ? 'Stopped — you solved it' : 'Time on this attempt. Not recorded, not compared.'}
              style={{ opacity: stopped ? 0.55 : 1 }}
            >
              {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
            </span>
            {upNext && (
              <button
                onClick={() => setOpenId(upNext.id)}
                title={`Next: ${upNext.title}`}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] cursor-pointer transition-colors"
                style={
                  // After a solve this is the obvious thing to do next, so it
                  // stops being a quiet link and becomes the accented one.
                  result?.solved
                    ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                    : { color: 'var(--content-faint)' }
                }
              >
                Next
                <Icons.ChevronRight size={12} />
              </button>
            )}
          </>
        ) : (
          <span className="text-[11px] text-content-faint">
            {solvedCount}/{QUESTIONS.length} solved · {topicsCovered}/{topicsTotal} topics covered
          </span>
        )}
        <WindowControls />
      </header>

      {!question ? (
        /* ---------------- the list ---------------- */
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">
            <h1 className="text-[20px] font-semibold text-content tracking-tight">Practice</h1>
            <p className="text-[13px] text-content-muted mt-1.5 mb-6 leading-relaxed">
              Real problems, graded by the engine in this app. Every answer and every worked
              explanation was executed before it shipped, so nothing here teaches you something
              that does not compile.
            </p>

            {TIERS.map((tier) => {
              const inTier = QUESTIONS.filter((q) => q.tier === tier);
              if (!inTier.length) return null;
              return (
                <div key={tier} className="mb-7">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.6px]" style={{ color: TIER_META[tier].colour }}>
                      {TIER_META[tier].label}
                    </span>
                    <span className="text-[11px] text-content-ghost">
                      {inTier.filter((q) => progress[q.id]?.solved).length}/{inTier.length} · {TIER_META[tier].blurb}
                    </span>
                  </div>
                  <div className="rounded-lg border border-line overflow-hidden">
                    {inTier.map((q, i) => {
                      const p = progress[q.id];
                      return (
                        <button
                          key={q.id}
                          onClick={() => setOpenId(q.id)}
                          className={`w-full text-left px-3.5 h-11 flex items-center gap-3 cursor-pointer hover:bg-surface-2 transition-colors ${i ? 'border-t border-line-subtle' : ''}`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            // Amber also covers "started but never submitted" —
                            // a saved draft is progress, and the list should
                            // show you where you left off, not only where you
                            // pressed Submit.
                            style={{
                              background: p?.solved
                                ? 'var(--ok)'
                                : p?.attempts || (drafts.current[q.id] ?? q.starter) !== q.starter
                                  ? 'var(--warn)'
                                  : 'var(--line)',
                            }}
                          />
                          <span className="text-[13px] text-content flex-1 truncate">{q.title}</span>
                          {p?.viewedSolution && (
                            <span className="text-[10px] text-content-ghost">solution seen</span>
                          )}
                          {(q.topics ?? []).slice(0, 2).map((t) => (
                            <span key={t} className="text-[10px] font-mono text-content-ghost hidden sm:inline">{t}</span>
                          ))}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ---------------- one question ---------------- */
        <div className="flex-1 flex min-h-0">
          {/* left: the task */}
          <div className="w-[42%] min-w-[320px] flex flex-col border-r border-line overflow-auto">
            <div className="px-5 py-4">
              {/* The primer, for someone meeting the idea here for the first
                  time. Collapsed by default so it never gets in the way of
                  somebody who already knows, and open by default on the first
                  tier, where a beginner actually is. */}
              {question.basics && (
                <details className="mb-3.5 rounded-lg border border-line overflow-hidden" open={question.tier === 'easy'}>
                  <summary className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.6px] text-content-faint bg-surface-2 cursor-pointer select-none">
                    New to this? Start here
                  </summary>
                  <div className="px-3.5 py-3">
                    <Prose text={question.basics} />
                  </div>
                </details>
              )}

              <Prose text={question.prompt} />

              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-[0.6px] font-semibold text-content-faint mb-1">Sample input</div>
                <pre className="rounded p-2.5 text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed border" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--content)' }}>
                  {question.cases[0].input}
                </pre>
                <div className="text-[10px] uppercase tracking-[0.6px] font-semibold text-content-faint mb-1 mt-3">Expected output</div>
                <pre className="rounded p-2.5 text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed border" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--content)' }}>
                  {question.cases[0].output}
                </pre>
                <div className="text-[11px] text-content-ghost mt-1.5">
                  Submit runs {question.cases.length - 1} more case{question.cases.length === 2 ? '' : 's'} you cannot see.
                </div>
              </div>

              {/* hints, one at a time */}
              {(question.hints ?? []).length > 0 && (
                <div className="mt-5">
                  {(question.hints ?? []).slice(0, hintsShown).map((h, i) => (
                    <div key={i} className="rounded-md border px-3 py-2 mb-1.5" style={{ background: 'color-mix(in oklch, var(--cyan) 5%, var(--surface))', borderColor: 'color-mix(in oklch, var(--cyan) 22%, transparent)' }}>
                      <div className="text-[10px] uppercase tracking-[0.6px] font-semibold mb-0.5" style={{ color: 'var(--cyan)' }}>Hint {i + 1}</div>
                      <div className="text-[12.5px] text-content-secondary leading-relaxed"><Prose text={h} /></div>
                    </div>
                  ))}
                  {hintsShown < (question.hints ?? []).length && (
                    <button
                      onClick={() => setHintsShown((n) => n + 1)}
                      className="h-7 px-2.5 rounded-md text-[12px] border border-line text-content-secondary hover:bg-surface-2 cursor-pointer"
                    >
                      {hintsShown === 0 ? 'Show a hint' : 'Another hint'}
                    </button>
                  )}
                </div>
              )}

              {/* the answer, and what it costs */}
              <div className="mt-4">
                {!showSolution ? (
                  <button
                    onClick={() => setShowSolution(true)}
                    className="h-7 px-2.5 rounded-md text-[12px] border border-line text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer"
                  >
                    Show the solution
                  </button>
                ) : (
                  <>
                    <div className="text-[10px] uppercase tracking-[0.6px] font-semibold text-content-faint mb-1">Reference solution</div>
                    <pre className="rounded p-2.5 text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed border" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--content)' }}>
                      {question.solution}
                    </pre>
                    <div className="text-[11px] text-content-ghost mt-1.5">
                      Solution viewed — submissions are disabled for the rest of this session.
                    </div>
                  </>
                )}
              </div>

              {/* the written explanation, once it can do no harm */}
              {question.explanation && (showExplanation || showSolution) && (
                <div className="mt-5 rounded-lg border border-line overflow-hidden">
                  <div className="px-3 py-1.5 text-[10.5px] uppercase tracking-[0.6px] font-semibold text-content-faint bg-surface-2 border-b border-line">
                    Why it works
                  </div>
                  <div className="px-3.5 py-3">
                    <Prose text={question.explanation.approach} />
                    {question.explanation.snippets.map((s, i) => (
                      <div key={i} className="mt-3.5">
                        <div className="text-[11.5px] font-semibold text-content mb-1">{s.label}</div>
                        <pre className="rounded p-2 text-[11px] font-mono whitespace-pre-wrap break-words leading-relaxed border" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--content)' }}>
                          {s.script}
                        </pre>
                        <div className="text-[11px] font-mono mt-1" style={{ color: s.expect.error ? 'var(--err)' : 'var(--ok)' }}>
                          {s.expect.error ? '→ the engine refuses this' : `→ ${s.expect.output}`}
                        </div>
                        {s.note && <div className="mt-1"><Prose text={s.note} /></div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* right: write and run */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="h-9 shrink-0 flex items-center gap-2 px-3.5 border-b border-line-subtle">
              <span className="text-[11px] font-medium text-content-secondary flex-1">Your script</span>
              {script !== (question.starter ?? '') && (
                <button
                  onClick={() => {
                    const fresh = question.starter ?? '%dw 2.0\noutput application/json\n---\n';
                    setScript(fresh);
                    stashDraft(question.id, fresh);
                    setSampleOut(null);
                    setTrace(null);
                    setResult(null);
                  }}
                  title="Clear what you have written and start from the blank script"
                  className="h-[26px] px-2.5 rounded-md text-[12px] border border-line text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer"
                >
                  Reset
                </button>
              )}
              <button
                onClick={handleRun}
                disabled={running}
                className="h-[26px] px-2.5 rounded-md text-[12px] border border-line text-content-secondary hover:bg-surface-2 cursor-pointer disabled:opacity-50"
              >
                Run on the sample
              </button>
              <button
                onClick={handleTrace}
                disabled={running}
                title="Run the sample and show what every expression in your script evaluated to"
                className="h-[26px] px-2.5 rounded-md text-[12px] border border-line text-content-secondary hover:bg-surface-2 cursor-pointer disabled:opacity-50"
              >
                Trace
              </button>
              <button
                onClick={handleSubmit}
                disabled={running || showSolution}
                title={showSolution ? 'Submissions are disabled once the solution has been viewed' : undefined}
                className="h-[26px] px-3 rounded-md text-[12px] font-medium cursor-pointer disabled:opacity-40"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                {running ? 'Running…' : 'Submit'}
              </button>
            </div>

            <div className="flex-1 min-h-0">
              <Editor
                height="100%"
                language="dataweave"
                theme={monacoTheme}
                value={script}
                onChange={(v) => {
                  setScript(v ?? '');
                  stashDraft(question.id, v ?? '');
                }}
                beforeMount={handleBeforeMount}
                options={editorOptions}
              />
            </div>

            {/* verdict */}
            <div className="shrink-0 max-h-[45%] overflow-auto border-t border-line px-3.5 py-3">
              {sampleOut && (
                <>
                  <div className="text-[10px] uppercase tracking-[0.6px] font-semibold text-content-faint mb-1">
                    Sample output
                  </div>
                  <pre className="rounded p-2.5 text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed border" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: sampleOut.ok ? 'var(--content)' : 'var(--err)' }}>
                    {sampleOut.text}
                  </pre>
                </>
              )}

              {trace && trace.length > 0 && (
                <div className="mt-2 rounded-lg border border-line overflow-hidden">
                  <div className="px-3 py-1.5 text-[10.5px] uppercase tracking-[0.6px] font-semibold text-content-faint bg-surface-2 border-b border-line">
                    What each expression evaluated to · on the sample
                  </div>
                  <div className="font-mono text-[11px]">
                    {trace.map((row, i) => (
                      <div key={i} className="flex gap-2 px-3 py-1 border-b border-line-subtle last:border-b-0">
                        <span className="w-10 shrink-0 text-content-ghost tabular-nums">{row.line}:{row.column}</span>
                        <span className="w-[34%] shrink-0 truncate text-content-secondary" title={row.expression}>
                          {row.expression}
                        </span>
                        <span className="w-16 shrink-0 truncate text-content-faint" title={row.type}>{row.type}</span>
                        <span
                          className="flex-1 truncate"
                          title={row.value}
                          // A null here is usually the answer: a selector that
                          // does not match produces one instead of an error.
                          style={{ color: row.value === 'null' ? 'var(--warn)' : 'var(--content)' }}
                        >
                          {row.value}
                        </span>
                        {row.count > 1 && <span className="shrink-0 text-content-ghost">×{row.count}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result && (
                <div
                  className="rounded-lg border px-3.5 py-3"
                  style={{
                    background: `color-mix(in oklch, var(--${result.solved ? 'ok' : 'err'}) 6%, transparent)`,
                    borderColor: `color-mix(in oklch, var(--${result.solved ? 'ok' : 'err'}) 25%, transparent)`,
                  }}
                >
                  <div className="text-[13px] font-semibold" style={{ color: result.solved ? 'var(--ok)' : 'var(--err)' }}>
                    {result.solved
                      ? `Solved — ${result.total} of ${result.total} cases, ${result.ms}ms`
                      : `Failed on ${result.failure?.hidden ? 'a hidden case' : 'the sample'} (${result.passed}/${result.total} passed)`}
                  </div>

                  {!result.solved && result.failure && (
                    <div className="mt-2 space-y-1.5">
                      {result.failure.error ? (
                        <pre className="text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed" style={{ color: 'var(--err)' }}>
                          {result.failure.error.split('\n').slice(0, 4).join('\n')}
                        </pre>
                      ) : (
                        <>
                          {/* A hidden case shows the gap without showing the case,
                              which is the only way to stay useful and still hidden. */}
                          <div className="text-[11px] text-content-faint">Expected</div>
                          <pre className="text-[11.5px] font-mono whitespace-pre-wrap break-words" style={{ color: 'var(--content-secondary)' }}>
                            {result.failure.want}
                          </pre>
                          <div className="text-[11px] text-content-faint">Your script returned</div>
                          <pre className="text-[11.5px] font-mono whitespace-pre-wrap break-words" style={{ color: 'var(--content-secondary)' }}>
                            {result.failure.got}
                          </pre>
                        </>
                      )}
                    </div>
                  )}

                  {result.solved && question.explanation && !showExplanation && (
                    <button
                      onClick={() => setShowExplanation(true)}
                      className="mt-2 h-7 px-2.5 rounded-md text-[12px] border border-line text-content-secondary hover:bg-surface-2 cursor-pointer"
                    >
                      Read why it works
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
