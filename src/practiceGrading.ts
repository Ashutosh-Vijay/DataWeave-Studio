/**
 * Grading a practice submission.
 *
 * Shared by the practice screen and by the authoring pipeline
 * (scripts/practice/), so a question that passes the gate on the way in is
 * graded by the same code on the way out. Pure — it takes the engine's output
 * as a string and never talks to the engine itself, which is what makes it
 * testable without a JVM.
 *
 * On why this is not `dw::test`: a suite gets no payload (see the note at the
 * top of hooks/useTestRunner.ts — it is bound to `{}` deliberately), and a
 * practice question is payload-in, output-out. A suite cannot see that shape,
 * and it cannot invoke the text of somebody's mapping script either. So
 * grading is what LeetCode does: run the submission once per hidden case and
 * compare. `dw::test` stays a feature the practice set can teach.
 */

export interface PracticeCase {
  /** The payload the script is run against. */
  input: string;
  /** What the script must produce. */
  output: string;
}

/**
 * What kind of thing you are being asked to do.
 *
 * The first forty questions were all `build`, and that is the real reason the
 * set felt short rather than the count: every one of them was "write this from
 * scratch", which is the slowest and most effortful interaction there is. A
 * mode is a different *shape* of question over the same material, and it is
 * what makes one more feel like one more.
 *
 * - `build`   — write the transform. The original.
 * - `debug`   — here is a script that is wrong; make it pass. The editor starts
 *               with the broken code. Graded identically to `build`, so it
 *               costs no new grading at all.
 * - `predict` — here is a script and a payload; say what it returns, without
 *               running it. Fast, and it teaches reading rather than writing.
 * - `choice`  — multiple choice, which is what MCD Level 1 actually is. It is
 *               also the most verifiable format here: when the options are
 *               code or outputs, the engine can run all of them and prove that
 *               exactly one satisfies the question. A distractor that happens
 *               to also be right gets caught mechanically, which is the check
 *               every braindump lacks.
 */
export type PracticeMode = 'build' | 'debug' | 'predict' | 'choice';

/**
 * The three multiple-choice shapes the engine can adjudicate on its own.
 *
 * Anything that cannot be settled by running something — "what is the default
 * MIME type", "which module is `lookup` in" — is deliberately not here. Those
 * are answer keys somebody asserted, and asserting is the thing we do not do.
 */
export type ChoiceKind =
  /** Options are scripts. Exactly one must turn `payload` into `target`. */
  | 'which-script'
  /** Options are outputs. Exactly one must equal what `given.script` returns. */
  | 'which-output'
  /** Options are scripts. Exactly one must fail to run. */
  | 'which-fails';

export interface PracticeChoice {
  kind: ChoiceKind;
  /** Four or five of them: scripts for which-script/which-fails, outputs for which-output. */
  options: string[];
  /** Index into `options`. The gate proves this is the one the engine agrees with. */
  answer: number;
  /** which-script: the payload every option is run against. */
  payload?: string;
  /** which-script: the output the right option has to produce. */
  target?: string;
}

/**
 * Is a multiple-choice question sound, given how each option actually behaved?
 *
 * `satisfies[i]` is whether option i did what the stem asks — produced the
 * target, matched the real output, failed to run. Two ways a question is
 * broken, and both are common in hand-written exam material: no option is
 * right, or more than one is. The third is an answer key that disagrees with
 * the engine, which is the one a model is most likely to produce.
 */
export function soundChoice(
  satisfies: boolean[],
  answer: number,
): { ok: boolean; why: string } {
  const hits = satisfies.flatMap((s, i) => (s ? [i] : []));
  if (hits.length === 0) return { ok: false, why: 'no option satisfies the question' };
  if (hits.length > 1) return { ok: false, why: `options ${hits.join(' and ')} both satisfy it` };
  if (hits[0] !== answer) {
    return { ok: false, why: `the key says ${answer} but the engine says ${hits[0]}` };
  }
  return { ok: true, why: `only option ${answer} satisfies it` };
}

export interface PracticeQuestion {
  id: string;
  /** The curriculum unit this came from — see scripts/practice/curriculum.json. */
  unit: string;
  /** Defaults to `build` — the forty original questions predate modes. */
  mode?: PracticeMode;
  /**
   * `predict` only: the script and payload being read. The expected answer is
   * NOT stored — it is whatever this engine returns when the script is run,
   * which keeps the one rule intact and means a stored answer cannot drift
   * away from what the engine actually does.
   */
  given?: { script: string; payload?: string };
  /** `choice` only: the options, the key, and what the key has to satisfy. */
  choice?: PracticeChoice;
  tier: 'easy' | 'medium' | 'hard' | 'extra' | 'max' | 'ultra';
  title: string;
  topics?: string[];
  /** Markdown. */
  prompt: string;
  /**
   * A primer for someone meeting this idea for the first time, shown above the
   * task behind "New to this?".
   *
   * The set is ordered as a course, and somebody working through it towards a
   * MuleSoft certification may be meeting `groupBy` — or `payload` — for the
   * first time here. A question that assumes the concept teaches only people
   * who already knew it. Optional: questions written before this existed do not
   * have one, and the block is simply absent.
   */
  basics?: string;
  inputMime?: string;
  outputMime?: string;
  starter?: string;
  /**
   * `cases[0]` is shown with the question; the rest are hidden. The hidden ones
   * are the whole point — a solution that hardcodes the sample's answer has to
   * fail on case two, or the question teaches nothing.
   */
  cases: PracticeCase[];
  hints?: string[];
  solution: string;
  /**
   * Semantic by default: parse both sides and deep-compare, so formatting is
   * never the thing that fails someone. A question whose point IS the literal
   * output — duplicate keys, key order, a CSV's exact bytes — uses 'text'.
   */
  compare?: 'json' | 'text';
  explanation?: {
    approach: string;
    snippets: {
      label: string;
      script: string;
      payload?: string;
      payloadMime?: string;
      outputMime?: string;
      expect: { output?: string; error?: boolean };
      note?: string;
    }[];
  };
}

/**
 * The next question worth opening after this one.
 *
 * Prefers the next unsolved question in course order, wrapping to the start, so
 * finishing one hands you the next thing you have not done rather than the next
 * thing alphabetically. Falls back to the plain next question when everything
 * else is solved, and returns null when there is only one.
 */
export function nextUnsolved(
  questions: PracticeQuestion[],
  currentId: string,
  solved: (id: string) => boolean,
): PracticeQuestion | null {
  const here = questions.findIndex((q) => q.id === currentId);
  if (here < 0 || questions.length < 2) return null;
  for (let step = 1; step < questions.length; step++) {
    const q = questions[(here + step) % questions.length];
    if (!solved(q.id)) return q;
  }
  return questions[(here + 1) % questions.length];
}

/**
 * Deep equality with array order significant and object key order ignored.
 *
 * Key order is ignored on purpose: DataWeave preserves the order you write, but
 * failing somebody for putting `total` above `id` would be grading formatting
 * rather than the transform. A question that genuinely depends on order uses
 * `compare: 'text'`.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  // Two strings that differ only in line endings are the same answer. Inside
  // JSON output a line ending is the ESCAPED sequence \r\n, so it is still two
  // ordinary characters until the parse — normalising the raw text beforehand
  // cannot reach it, and a CSV embedded in a JSON field slips through.
  if (typeof a === 'string' && typeof b === 'string') {
    return a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
  }
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ka = Object.keys(ao);
  const kb = Object.keys(bo);
  return ka.length === kb.length && ka.every((k) => k in bo && deepEqual(ao[k], bo[k]));
}

/**
 * Did this run produce the expected output?
 *
 * In 'json' mode a value that will not parse falls back to a trimmed string
 * compare, so a question with an XML or CSV output still works without anyone
 * having to remember to set the mode.
 */
export function outputsMatch(got: string, want: string, compare: 'json' | 'text' = 'json'): boolean {
  // Line endings are normalised for EVERY mode, before anything else.
  //
  // DataWeave's CSV writer uses the platform line separator, so the same
  // question produced "a,b\r\n" on Windows and "a,b\n" on Linux and the gate's
  // verdict changed with the operating system — which quietly breaks the rule
  // the whole pipeline rests on. It is not only the text path: CSV embedded in
  // a JSON string keeps its \r\n inside the value, so JSON.parse succeeds and
  // the strings still differ.
  //
  // The cost is that a question whose point IS the difference between CRLF and
  // LF cannot be expressed. That is a fair trade against questions that pass on
  // one machine and fail on another.
  const g = got.replace(/\r\n/g, '\n');
  const w = want.replace(/\r\n/g, '\n');

  if (compare === 'text') {
    return g.trimEnd() === w.trimEnd();
  }
  try {
    return deepEqual(JSON.parse(g), JSON.parse(w));
  } catch {
    return g.trim() === w.trim();
  }
}

/**
 * Mark a `predict` answer against what the engine really returned.
 *
 * Lenient in the two ways that are about typing rather than understanding:
 * formatting is ignored (`outputsMatch` parses both sides), and an answer
 * wrapped in nothing but quotes or stray whitespace still counts. It is NOT
 * lenient about the value, including the difference between `1` and `"1"` —
 * that distinction is half of what these questions teach.
 *
 * `typed` is compared against `actual`, which the caller obtained by running
 * the script. Nothing here decides what the right answer is.
 */
export function gradePrediction(
  typed: string,
  actual: { ok: boolean; output: string },
  expectedError = false,
): { correct: boolean; because: string } {
  const said = typed.trim();
  if (!said) return { correct: false, because: 'Nothing typed yet.' };

  // "it errors" is a legitimate prediction, and the only one available when the
  // script does not produce a value at all.
  const saidError = /^(error|it errors?|fails?|exception|compile error)\b/i.test(said);
  if (!actual.ok || expectedError) {
    return saidError
      ? { correct: true, because: 'It does error.' }
      : { correct: false, because: 'This one does not return a value at all — it errors.' };
  }
  if (saidError) {
    return { correct: false, because: 'It runs fine and returns a value.' };
  }

  return outputsMatch(said, actual.output)
    ? { correct: true, because: 'That is what it returns.' }
    : { correct: false, because: 'Not what it returns.' };
}

export interface CaseResult {
  index: number;
  /** Every case but the first is hidden from the learner. */
  hidden: boolean;
  pass: boolean;
  got?: string;
  want: string;
  error?: string | null;
  ms?: number;
}

export interface GradeResult {
  solved: boolean;
  passed: number;
  total: number;
  /** The first case that did not pass; null when everything did. */
  failure: CaseResult | null;
  results: CaseResult[];
  ms: number;
}

/** What one case's run came back with, whoever ran it. */
export interface RunOutcome {
  ok: boolean;
  output: string;
  error?: string | null;
  ms?: number;
}

/**
 * Run every case through `runCase` and stop at the first failure.
 *
 * Stopping early is deliberate: it mirrors what a learner is shown ("failed on
 * a hidden case"), and there is nothing to learn from the fourth failure when
 * the first already explains it.
 */
export async function gradeSubmission(
  question: PracticeQuestion,
  runCase: (c: PracticeCase, index: number) => Promise<RunOutcome>,
): Promise<GradeResult> {
  const results: CaseResult[] = [];

  for (const [index, c] of question.cases.entries()) {
    const r = await runCase(c, index);
    if (!r.ok) {
      results.push({ index, hidden: index > 0, pass: false, want: c.output, error: r.error ?? 'failed', ms: r.ms });
      break;
    }
    const pass = outputsMatch(r.output, c.output, question.compare ?? 'json');
    results.push({ index, hidden: index > 0, pass, got: r.output, want: c.output, error: null, ms: r.ms });
    if (!pass) break;
  }

  const passed = results.filter((r) => r.pass).length;
  return {
    solved: passed === question.cases.length && question.cases.length > 0,
    passed,
    total: question.cases.length,
    failure: results.find((r) => !r.pass) ?? null,
    results,
    ms: results.reduce((t, r) => t + (r.ms ?? 0), 0),
  };
}
