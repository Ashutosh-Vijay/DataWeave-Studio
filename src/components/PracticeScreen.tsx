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
  gradePrediction,
  nextUnsolved,
  type GradeResult,
  type PracticeQuestion,
} from '../practiceGrading';
import {
  recentDays,
  activitySummary,
  goalStreak,
  trimLog,
  readActivity,
  readGoal,
  ACTIVITY_KEY,
  GOAL_KEY,
  type ActivityEvent,
} from '../practiceStats';
import QUESTIONS_JSON from '../practiceQuestions.json';

const QUESTIONS = QUESTIONS_JSON as unknown as PracticeQuestion[];

const TIERS = ['easy', 'medium', 'hard', 'extra', 'max', 'ultra'] as const;
type Tier = (typeof TIERS)[number];

/**
 * How each tier reads, and what it means.
 *
 * Difficulty is an ORDERED scale, so the colours are a sequential ramp — one
 * hue getting stronger — rather than six identities. Two real defects went with
 * the old set: `max` and `ultra` were literally the same colour, and `--accent`
 * is user-configurable, so a tier could change hue when somebody picked a new
 * accent. The ramp is fixed and its steps are validated for both surfaces.
 */
// Labels follow effort levels (Low → Ultra), not easy/hard. The ids stay
// easy/hard because every question file and the authoring pipeline use them.
const TIER_META: Record<Tier, { colour: string; label: string; blurb: string }> = {
  easy:   { colour: 'var(--tier-1)', label: 'Low',    blurb: 'One idea at a time' },
  medium: { colour: 'var(--tier-2)', label: 'Medium', blurb: 'Two ideas, and a shape that surprises you' },
  hard:   { colour: 'var(--tier-3)', label: 'High',   blurb: 'Something a working Mule developer hits' },
  extra:  { colour: 'var(--tier-4)', label: 'Extra',  blurb: 'Needs a technique, not just a function' },
  max:    { colour: 'var(--tier-5)', label: 'Max',    blurb: 'Recursive, or a shape discovered from the data' },
  ultra:  { colour: 'var(--tier-6)', label: 'Ultra',  blurb: 'Write an interpreter in a mapping language' },
};

/**
 * How a question is answered, so the list can be narrowed to one way of
 * working. `debug` sits with `build`: both mean writing a script that has to
 * pass hidden cases.
 */
const KINDS: { id: string; label: string; match: (q: PracticeQuestion) => boolean }[] = [
  { id: 'all',     label: 'All',             match: () => true },
  { id: 'choice',  label: 'Multiple choice', match: (q) => q.mode === 'choice' },
  { id: 'code',    label: 'Write code',      match: (q) => !q.mode || q.mode === 'build' || q.mode === 'debug' },
  { id: 'predict', label: 'Predict the output', match: (q) => q.mode === 'predict' },
];
const KIND_KEY = 'dw-practice-kind-v1';

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

/** A ratio against a limit, drawn as a track — never a two-slice pie. */
function Meter({ done, total, colour }: { done: number; total: number; colour: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div
      className="h-1.5 rounded-full overflow-hidden"
      style={{ background: 'color-mix(in oklch, var(--content) 12%, transparent)' }}
    >
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
    </div>
  );
}

/**
 * Everything you have actually done, above the question list.
 *
 * Forms are chosen by what the reader has to do, not by what is prettiest:
 * the set's make-up is part-to-whole, so it is one stacked bar rather than a
 * pie — slices are hard to compare and six of them are worse; how far through
 * a tier you are is a ratio against a limit, so it is a meter; and practice
 * over time is a time series, so it is columns.
 */
function ProgressPanel({
  questions,
  solvedIds,
  events,
  goal,
  onGoal,
}: {
  questions: PracticeQuestion[];
  solvedIds: Set<string>;
  events: ActivityEvent[];
  goal: number;
  onGoal: (n: number) => void;
}) {
  const [hover, setHover] = useState<{ day: string; count: number } | null>(null);

  const perTier = TIERS.map((tier) => {
    const all = questions.filter((q) => q.tier === tier);
    return { tier, total: all.length, done: all.filter((q) => solvedIds.has(q.id)).length };
  }).filter((r) => r.total > 0);

  const days = recentDays(events, 30);
  const summary = activitySummary(events);
  const streak = goalStreak(events, goal);
  const busiest = Math.max(1, ...days.map((d) => d.count));
  const solved = solvedIds.size;

  return (
    <div className="rounded-lg border border-line overflow-hidden mb-7">
      <div className="px-3.5 py-3 border-b border-line-subtle">
        <div className="flex items-baseline gap-2">
          <span className="text-[26px] font-semibold text-content tabular-nums leading-none">{solved}</span>
          <span className="text-[13px] text-content-muted">of {questions.length} solved</span>
        </div>

        {/* The set's make-up, one bar. A 2px gap keeps neighbouring segments
            from reading as one block. */}
        <div className="flex gap-[2px] mt-3">
          {perTier.map(({ tier, total, done }) => (
            <div key={tier} className="flex flex-col gap-1" style={{ flex: total }}>
              <div
                className="h-2 rounded-[3px] overflow-hidden"
                // Not --surface-2: on the light theme that is near-white and the
                // untouched tiers vanished into the panel. A tint of the ink
                // reads as an empty track on both surfaces.
                style={{ background: 'color-mix(in oklch, var(--content) 12%, transparent)' }}
              >
                <div
                  className="h-full"
                  style={{ width: `${(done / total) * 100}%`, background: TIER_META[tier].colour }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Six segments is past the point where colour alone identifies them,
            so every one is labelled rather than relying on a legend swatch. */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {perTier.map(({ tier, total, done }) => (
            <span key={tier} className="inline-flex items-center gap-1.5 text-[11px] text-content-faint">
              <span className="w-2 h-2 rounded-[2px]" style={{ background: TIER_META[tier].colour }} />
              {TIER_META[tier].label}
              <span className="tabular-nums text-content-secondary">{done}/{total}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Practice over time. */}
      <div className="px-3.5 py-3 border-b border-line-subtle">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[11px] uppercase tracking-[0.6px] font-semibold text-content-faint">
            Last 30 days
          </span>
          <span className="text-[11px] text-content-faint tabular-nums h-4">
            {hover ? `${hover.day} · ${hover.count} solved` : ''}
          </span>
        </div>
        <div className="flex items-end gap-[2px] h-14" onMouseLeave={() => setHover(null)}>
          {days.map((d) => (
            <div
              key={d.day}
              onMouseEnter={() => setHover(d)}
              className="flex-1 h-full flex items-end cursor-default"
              title={`${d.day} · ${d.count} solved`}
            >
              <div
                className="w-full rounded-t-[4px]"
                style={{
                  // A zero day still draws a sliver, so the axis reads as a
                  // run of days rather than gaps of missing data.
                  height: d.count ? `${Math.max(8, (d.count / busiest) * 100)}%` : '2px',
                  background: d.count ? 'var(--tier-3)' : 'var(--line)',
                  opacity: hover && hover.day !== d.day ? 0.45 : 1,
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Four numbers that need no plot. */}
      <div className="grid grid-cols-4 divide-x border-b border-line-subtle" style={{ borderColor: 'var(--line-subtle)' }}>
        {([
          ['Today', summary.today],
          ['Yesterday', summary.yesterday],
          ['This month', summary.month],
          ['This year', summary.year],
        ] as const).map(([label, n]) => (
          <div key={label} className="px-3.5 py-2.5" style={{ borderColor: 'var(--line-subtle)' }}>
            <div className="text-[17px] font-semibold text-content tabular-nums leading-none">{n}</div>
            <div className="text-[10.5px] text-content-faint mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* The goal you set yourself. */}
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-[0.6px] font-semibold text-content-faint">
            Daily goal
          </span>
          <span className="flex-1" />
          {[0, 1, 2, 3, 5].map((n) => (
            <button
              key={n}
              onClick={() => onGoal(n)}
              className="h-6 min-w-[28px] px-2 rounded-md text-[11.5px] border cursor-pointer transition-colors"
              style={
                goal === n
                  ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' }
                  : { borderColor: 'var(--line)', color: 'var(--content-secondary)' }
              }
            >
              {n === 0 ? 'Off' : n}
            </button>
          ))}
        </div>
        {goal > 0 && (
          <div className="mt-2.5">
            <Meter done={Math.min(summary.today, goal)} total={goal} colour="var(--accent)" />
            <div className="flex items-baseline justify-between mt-1.5">
              <span className="text-[11.5px] text-content-secondary">
                {summary.today >= goal
                  ? `Done for today — ${summary.today} of ${goal}`
                  : `${goal - summary.today} more today`}
              </span>
              {streak > 1 && (
                <span className="text-[11px] text-content-faint tabular-nums">
                  {streak} days in a row
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const handleBeforeMount: BeforeMount = (monaco) => defineDataWeaveTheme(monaco);

export function PracticeScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isDark } = useTheme();
  const editorFont = useEditorFont();
  const [progress, setProgress] = useState<Record<string, Progress>>(loadProgress);
  const [openId, setOpenId] = useState<string | null>(null);
  const [kind, setKind] = useState<string>(() => {
    try {
      return localStorage.getItem(KIND_KEY) ?? 'all';
    } catch {
      return 'all';
    }
  });
  const [script, setScript] = useState('');
  /**
   * Every question's editor contents, so leaving one and coming back does not
   * throw your work away. A ref rather than state because nothing renders from
   * it — it is read when a question opens and written as you type.
   */
  const [events, setEvents] = useState<ActivityEvent[]>(readActivity);
  const [goal, setGoal] = useState<number>(readGoal);
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
  /** `predict` mode: what you typed, and how it compared to the engine. */
  const [guess, setGuess] = useState('');
  /**
   * `predict` mode as a flashcard: think of the answer, reveal what the engine
   * returns, say whether you had it. Typing stays available behind `typing` —
   * almost nobody wants to type JSON into a box with no completion, and that
   * made the largest group of questions the one people skipped.
   */
  const [revealed, setRevealed] = useState<string | null>(null);
  const [selfMark, setSelfMark] = useState<boolean | null>(null);
  const [typing, setTyping] = useState(false);
  /** `choice` mode: which option was clicked, or null while unanswered. */
  const [picked, setPicked] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<{ correct: boolean; because: string; actual: string } | null>(null);
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
    setGuess('');
    setVerdict(null);
    setRevealed(null);
    setSelfMark(null);
    setTyping(false);
    setPicked(null);
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
    if (!question?.cases.length) return;
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
    if (!question?.cases.length) return;
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

  /**
   * Mark a prediction. The script is run now rather than compared against a
   * stored answer, so the expected value is whatever this engine really does
   * — there is nothing saved that could drift away from it.
   */
  const handleCheck = async () => {
    if (!question?.given) return;
    setRunning(true);
    try {
      const r = await runOnce(question.given.payload ?? '{}', question, question.given.script);
      const v = gradePrediction(guess, r);
      setVerdict({ ...v, actual: r.ok ? r.output : (r.error ?? 'it errored') });
      recordPrediction(v.correct);
    } finally {
      setRunning(false);
    }
  };

  /** Flashcard: run the script now and show what it really returns. */
  const handleReveal = async () => {
    if (!question?.given) return;
    setRunning(true);
    try {
      const r = await runOnce(question.given.payload ?? '{}', question, question.given.script);
      setRevealed(r.ok ? r.output : `Error — ${(r.error ?? 'it errored').split('\n')[0]}`);
    } finally {
      setRunning(false);
    }
  };

  /**
   * A prediction marked either way — by comparison when typed, by your own
   * word on a flashcard. Offline with the answer on screen, your word is all
   * a check could ever be, so it counts the same.
   */
  const recordPrediction = (correct: boolean) => {
    if (!question) return;
    const prev = progress[question.id] ?? { solved: false, viewedSolution: false, attempts: 0 };
    const next: Progress = {
      solved: prev.solved || correct,
      viewedSolution: prev.viewedSolution,
      attempts: prev.attempts + 1,
    };
    const updated = { ...progress, [question.id]: next };
    setProgress(updated);
    saveProgress(updated);

    const log = trimLog([...events, { t: Date.now(), id: question.id, solved: correct }]);
    setEvents(log);
    try {
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
    } catch {
      /* blocked storage */
    }
    if (correct) {
      setStopped(true);
      setShowExplanation(true);
    }
  };

  /**
   * Answer a multiple-choice question. No engine call: the key was already
   * adjudicated by the gate, which ran every option and proved exactly one
   * satisfies the stem. Clicking is just reading off that verdict.
   */
  const handlePick = (i: number) => {
    if (!question) return;
    setPicked(i);
    const right = i === question.choice?.answer;
    const prev = progress[question.id] ?? { solved: false, viewedSolution: false, attempts: 0 };
    const updated = {
      ...progress,
      [question.id]: { solved: prev.solved || right, viewedSolution: prev.viewedSolution, attempts: prev.attempts + 1 },
    };
    setProgress(updated);
    saveProgress(updated);

    const log = trimLog([...events, { t: Date.now(), id: question.id, solved: right }]);
    setEvents(log);
    try {
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
    } catch {
      /* blocked storage */
    }
    if (right) {
      setStopped(true);
      setShowExplanation(true);
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

      // Every submission is logged, pass or fail — the chart counts the
      // passes, but keeping the failures means the log can answer a different
      // question later without a migration.
      const log = trimLog([...events, { t: Date.now(), id: question.id, solved: r.solved }]);
      setEvents(log);
      try {
        localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
      } catch {
        /* blocked storage — the chart just stays empty */
      }
      if (r.solved) {
        setShowExplanation(true);
        setStopped(true);
      }
    } finally {
      setRunning(false);
    }
  };

  // Each question is the only one for its curriculum unit, so solved count IS
  // topics covered — there is no second number to report.
  const solvedCount = QUESTIONS.filter((q) => progress[q.id]?.solved).length;

  const shown = QUESTIONS.filter((KINDS.find((k) => k.id === kind) ?? KINDS[0]).match);

  /**
   * Where "Next" goes: the next thing you have not done, wrapping around —
   * within the filter, so choosing "Multiple choice" means Next stays on
   * multiple choice.
   */
  const upNext = question
    ? nextUnsolved(shown, question.id, (id) => !!progress[id]?.solved) ??
      nextUnsolved(QUESTIONS, question.id, (id) => !!progress[id]?.solved)
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
            {solvedCount}/{QUESTIONS.length} solved
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

            <ProgressPanel
              questions={QUESTIONS}
              solvedIds={new Set(QUESTIONS.filter((q) => progress[q.id]?.solved).map((q) => q.id))}
              events={events}
              goal={goal}
              onGoal={(n) => {
                setGoal(n);
                try {
                  localStorage.setItem(GOAL_KEY, String(n));
                } catch {
                  /* blocked storage */
                }
              }}
            />

            <div className="flex flex-wrap gap-1 mb-5 p-1 rounded-lg border border-line w-fit">
              {KINDS.map((k) => {
                const all = QUESTIONS.filter(k.match);
                const active = k.id === kind;
                return (
                  <button
                    key={k.id}
                    onClick={() => {
                      setKind(k.id);
                      try {
                        localStorage.setItem(KIND_KEY, k.id);
                      } catch {
                        /* blocked storage — the filter just is not remembered */
                      }
                    }}
                    className={`h-7 px-3 rounded-md text-[12px] cursor-pointer transition-colors ${
                      active ? 'bg-surface-2 text-content font-medium' : 'text-content-faint hover:text-content'
                    }`}
                  >
                    {k.label}
                    <span className="ml-1.5 text-[11px] text-content-ghost tabular-nums">
                      {all.filter((q) => progress[q.id]?.solved).length}/{all.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {TIERS.map((tier) => {
              const inTier = shown.filter((q) => q.tier === tier);
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
                          {kind === 'all' && q.mode && q.mode !== 'build' && (
                            <span className="text-[10px] font-mono text-content-faint px-1.5 rounded border border-line-subtle">
                              {{ choice: 'MCQ', debug: 'Fix', predict: 'Predict' }[q.mode]}
                            </span>
                          )}
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

              {/* A predict question has no cases — it asks you to read a
                  script, not to satisfy one. Reading cases[0] unconditionally
                  took the whole screen down with an error boundary. */}
              {question.cases.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10px] uppercase tracking-[0.6px] font-semibold text-content-faint mb-1">Sample input</div>
                  <pre className="rounded p-2.5 text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed border" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--content)' }}>
                    {question.cases[0].input}
                  </pre>
                  <div className="text-[10px] uppercase tracking-[0.6px] font-semibold text-content-faint mb-1 mt-3">Expected output</div>
                  <pre className="rounded p-2.5 text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed border" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--content)' }}>
                    {question.cases[0].output}
                  </pre>
                  {question.cases.length > 1 && (
                    <div className="text-[11px] text-content-ghost mt-1.5">
                      Submit runs {question.cases.length - 1} more case{question.cases.length === 2 ? '' : 's'} you cannot see.
                    </div>
                  )}
                </div>
              )}

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

          {/* right: read it and say what it returns, or write and run */}
          {question.mode === 'choice' ? (
            <div className="flex-1 flex flex-col min-w-0">
              <div className="h-9 shrink-0 flex items-center gap-2 px-3.5 border-b border-line-subtle">
                <span className="text-[11px] font-medium text-content-secondary flex-1">
                  {question.choice?.kind === 'which-output' ? 'Read this' : 'Pick one'}
                </span>
              </div>
              <div className="px-3.5 py-3 overflow-auto">
                {question.given?.script && (
                  <pre
                    className="rounded p-2.5 text-[12px] font-mono whitespace-pre-wrap break-words leading-relaxed border mb-2"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--content)' }}
                  >
                    {question.given.script}
                  </pre>
                )}
                {(question.given?.payload ?? question.choice?.payload) && (
                  <>
                    <div className="text-[10px] uppercase tracking-[0.6px] font-semibold text-content-faint mt-2 mb-1">
                      Payload
                    </div>
                    <pre
                      className="rounded p-2.5 text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed border mb-3"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--content)' }}
                    >
                      {question.given?.payload ?? question.choice?.payload}
                    </pre>
                  </>
                )}

                <div className="space-y-1.5">
                  {(question.choice?.options ?? []).map((opt, i) => {
                    const answered = picked !== null;
                    const isKey = i === question.choice?.answer;
                    const isPicked = i === picked;
                    // After answering, the right one is always marked — being
                    // told only "wrong" teaches nothing.
                    const tone = !answered ? null : isKey ? 'ok' : isPicked ? 'err' : null;
                    return (
                      <button
                        key={i}
                        onClick={() => { if (!answered) handlePick(i); }}
                        disabled={answered}
                        className="w-full text-left rounded-md border px-3 py-2 flex gap-2.5 items-start cursor-pointer disabled:cursor-default"
                        style={{
                          borderColor: tone ? `color-mix(in oklch, var(--${tone}) 45%, transparent)` : 'var(--line)',
                          background: tone ? `color-mix(in oklch, var(--${tone}) 8%, transparent)` : 'transparent',
                        }}
                      >
                        <span className="font-mono text-[11px] text-content-faint mt-0.5 shrink-0">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <pre className="flex-1 text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed text-content">
                          {opt}
                        </pre>
                      </button>
                    );
                  })}
                </div>

                {picked !== null && (
                  <div
                    className="mt-3 rounded-lg border px-3.5 py-3"
                    style={{
                      background: `color-mix(in oklch, var(--${picked === question.choice?.answer ? 'ok' : 'err'}) 6%, transparent)`,
                      borderColor: `color-mix(in oklch, var(--${picked === question.choice?.answer ? 'ok' : 'err'}) 25%, transparent)`,
                    }}
                  >
                    <div
                      className="text-[13px] font-semibold"
                      style={{ color: picked === question.choice?.answer ? 'var(--ok)' : 'var(--err)' }}
                    >
                      {picked === question.choice?.answer
                        ? 'Correct'
                        : `Not quite — the answer is ${String.fromCharCode(65 + (question.choice?.answer ?? 0))}`}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : question.mode === 'predict' ? (
            <div className="flex-1 flex flex-col min-w-0">
              <div className="h-9 shrink-0 flex items-center gap-2 px-3.5 border-b border-line-subtle">
                <span className="text-[11px] font-medium text-content-secondary flex-1">
                  Read this
                </span>
              </div>
              <div className="px-3.5 py-3 overflow-auto">
                <pre
                  className="rounded p-2.5 text-[12px] font-mono whitespace-pre-wrap break-words leading-relaxed border"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--content)' }}
                >
                  {question.given?.script}
                </pre>
                {question.given?.payload && (
                  <>
                    <div className="text-[10px] uppercase tracking-[0.6px] font-semibold text-content-faint mt-3 mb-1">
                      Payload
                    </div>
                    <pre
                      className="rounded p-2.5 text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed border"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--content)' }}
                    >
                      {question.given.payload}
                    </pre>
                  </>
                )}

                {!typing ? (
                  <div className="mt-4">
                    {revealed === null ? (
                      <>
                        <p className="text-[12px] text-content-secondary mb-2.5">
                          Work out what it returns in your head, then reveal it.
                        </p>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleReveal}
                            disabled={running}
                            className="h-8 px-3.5 rounded-md text-[12px] font-medium cursor-pointer disabled:opacity-40"
                            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                          >
                            {running ? 'Running…' : 'Reveal the answer'}
                          </button>
                          <button
                            onClick={() => setTyping(true)}
                            className="text-[12px] text-content-faint hover:text-content underline underline-offset-2 cursor-pointer"
                          >
                            or type it and have it checked
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border px-3.5 py-3" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
                        <div className="text-[11px] text-content-faint mb-1">The engine returns</div>
                        <pre className="text-[12px] font-mono whitespace-pre-wrap break-words" style={{ color: 'var(--content)' }}>
                          {revealed}
                        </pre>
                        {selfMark === null ? (
                          <div className="flex items-center gap-2 mt-3">
                            <span className="text-[12px] text-content-secondary mr-1">Did you have it?</span>
                            {[true, false].map((got) => (
                              <button
                                key={String(got)}
                                onClick={() => {
                                  setSelfMark(got);
                                  recordPrediction(got);
                                  // A miss is exactly when the why is worth reading.
                                  setShowExplanation(true);
                                }}
                                className="h-7 px-3 rounded-md text-[12px] font-medium border cursor-pointer"
                                style={{
                                  color: got ? 'var(--ok)' : 'var(--err)',
                                  borderColor: `color-mix(in oklch, var(--${got ? 'ok' : 'err'}) 35%, transparent)`,
                                  background: `color-mix(in oklch, var(--${got ? 'ok' : 'err'}) 7%, transparent)`,
                                }}
                              >
                                {got ? 'Got it' : 'Missed it'}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[12px] mt-3" style={{ color: selfMark ? 'var(--ok)' : 'var(--content-secondary)' }}>
                            {selfMark ? 'Marked as solved.' : 'Marked as missed. The explanation is on the left.'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                <>
                <div className="mt-4">
                  <label className="text-[12px] text-content-secondary block mb-1.5">
                    What does it return? Type the value, or <code className="font-mono text-[11.5px]">error</code>.{' '}
                    <button
                      onClick={() => setTyping(false)}
                      className="text-content-faint hover:text-content underline underline-offset-2 cursor-pointer"
                    >
                      Just reveal it instead
                    </button>
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={guess}
                      onChange={(e) => setGuess(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !running) handleCheck(); }}
                      placeholder='e.g. [ "Ada" ]'
                      spellCheck={false}
                      className="flex-1 h-8 px-2.5 rounded-md border text-[12.5px] font-mono bg-surface text-content"
                      style={{ borderColor: 'var(--line)' }}
                    />
                    <button
                      onClick={handleCheck}
                      disabled={running || !guess.trim()}
                      className="h-8 px-3 rounded-md text-[12px] font-medium cursor-pointer disabled:opacity-40"
                      style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                    >
                      {running ? 'Checking…' : 'Check'}
                    </button>
                  </div>
                </div>

                {verdict && (
                  <div
                    className="mt-3 rounded-lg border px-3.5 py-3"
                    style={{
                      background: `color-mix(in oklch, var(--${verdict.correct ? 'ok' : 'err'}) 6%, transparent)`,
                      borderColor: `color-mix(in oklch, var(--${verdict.correct ? 'ok' : 'err'}) 25%, transparent)`,
                    }}
                  >
                    <div
                      className="text-[13px] font-semibold"
                      style={{ color: verdict.correct ? 'var(--ok)' : 'var(--err)' }}
                    >
                      {verdict.correct ? 'Correct' : verdict.because}
                    </div>
                    {/* Wrong or right, you get to see the real thing — being
                        told "no" without being shown the answer teaches
                        nothing. */}
                    <div className="text-[11px] text-content-faint mt-2 mb-1">The engine returns</div>
                    <pre className="text-[11.5px] font-mono whitespace-pre-wrap break-words" style={{ color: 'var(--content-secondary)' }}>
                      {verdict.actual}
                    </pre>
                  </div>
                )}
                </>
                )}
              </div>
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}
