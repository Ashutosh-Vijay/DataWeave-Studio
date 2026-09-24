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

export interface PracticeQuestion {
  id: string;
  /** The curriculum unit this came from — see scripts/practice/curriculum.json. */
  unit: string;
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
  if (compare === 'text') {
    return got.replace(/\r\n/g, '\n').trimEnd() === want.replace(/\r\n/g, '\n').trimEnd();
  }
  try {
    return deepEqual(JSON.parse(got), JSON.parse(want));
  } catch {
    return got.trim() === want.trim();
  }
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
