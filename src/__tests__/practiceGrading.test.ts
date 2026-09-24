import { describe, it, expect } from 'vitest';
import {
  deepEqual,
  outputsMatch,
  gradeSubmission,
  gradePrediction,
  nextUnsolved,
  type PracticeQuestion,
  type RunOutcome,
} from '../practiceGrading';

/**
 * The grader decides whether somebody solved it, so the interesting tests are
 * the two ways it could be unfair: failing a correct answer over formatting,
 * and passing a wrong one. Both have a worked example below.
 */

describe('deepEqual', () => {
  it('ignores key order but not array order', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
  });

  it('does not treat an array as an object with numeric keys', () => {
    // JSON.parse never produces this pairing, but a hand-written expectation can.
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
  });

  it('distinguishes a missing key from a null one', () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: null })).toBe(false);
    expect(deepEqual({ a: null }, { a: null })).toBe(true);
  });

  it('compares nested structures all the way down', () => {
    expect(deepEqual({ a: [{ b: [1, { c: 2 }] }] }, { a: [{ b: [1, { c: 2 }] }] })).toBe(true);
    expect(deepEqual({ a: [{ b: [1, { c: 2 }] }] }, { a: [{ b: [1, { c: 3 }] }] })).toBe(false);
  });

  it('does not conflate a number with its string form', () => {
    // This one matters: groupBy coerces its key to a String, so "1" and 1 are
    // exactly the distinction a learner is being taught here.
    expect(deepEqual({ '1': 2 }, { 1: 2 })).toBe(true);   // JS object keys are strings either way
    expect(deepEqual({ a: '1' }, { a: 1 })).toBe(false);
  });
});

describe('outputsMatch — formatting must never be the thing that fails you', () => {
  it('accepts different whitespace and indentation', () => {
    expect(outputsMatch('{\n  "a": 1\n}', '{"a":1}')).toBe(true);
    expect(outputsMatch('[\n 1,\n 2\n]', '[1,2]')).toBe(true);
  });

  it('accepts a different key order', () => {
    expect(outputsMatch('{"b":2,"a":1}', '{"a":1,"b":2}')).toBe(true);
  });

  it('still rejects a different value', () => {
    expect(outputsMatch('{"a":2}', '{"a":1}')).toBe(false);
  });

  it('falls back to text when the output is not JSON, so XML and CSV work untold', () => {
    expect(outputsMatch('a,b\n1,2\n', 'a,b\n1,2\n')).toBe(true);
    expect(outputsMatch('<r><a>1</a></r>', '<r><a>1</a></r>')).toBe(true);
    expect(outputsMatch('a,b\n1,3\n', 'a,b\n1,2\n')).toBe(false);
  });
});

describe('outputsMatch — text mode, for questions whose point IS the literal output', () => {
  it('is picky about whitespace', () => {
    expect(outputsMatch('{ "a": 1 }', '{"a":1}', 'text')).toBe(false);
  });

  it('forgives only the trailing newline and CRLF', () => {
    expect(outputsMatch('a,b\r\n1,2\r\n', 'a,b\n1,2', 'text')).toBe(true);
  });

  it('is the only mode that can see duplicate keys', () => {
    // DataWeave objects legally hold duplicate keys and the JSON writer emits
    // them; JSON.parse collapses them, so json mode would pass an answer that
    // produced only the last one. A question about duplicates needs text mode.
    const bothKeys = '{\n  "a": 1,\n  "a": 2\n}';
    const lastOnly = '{\n  "a": 2\n}';
    expect(outputsMatch(lastOnly, bothKeys, 'json')).toBe(true);    // the hole
    expect(outputsMatch(lastOnly, bothKeys, 'text')).toBe(false);   // why text mode exists
  });
});

// ---------------------------------------------------------------------------

const QUESTION: PracticeQuestion = {
  id: 'q', unit: 'u', tier: 'easy', title: 'doubles',
  prompt: 'double every number',
  solution: 'payload map ($ * 2)',
  cases: [
    { input: '[1,2]', output: '[2,4]' },
    { input: '[3]', output: '[6]' },
    { input: '[]', output: '[]' },
  ],
};

/** Stands in for the engine: answers from a table, records what it was asked. */
function runner(byInput: Record<string, RunOutcome>, seen: string[] = []) {
  return async (c: { input: string }) => {
    seen.push(c.input);
    return byInput[c.input] ?? { ok: false, output: '', error: 'no fixture' };
  };
}

describe('gradeSubmission', () => {
  it('solves only when every case passes', async () => {
    const r = await gradeSubmission(QUESTION, runner({
      '[1,2]': { ok: true, output: '[2,4]' },
      '[3]': { ok: true, output: '[6]' },
      '[]': { ok: true, output: '[]' },
    }));
    expect(r.solved).toBe(true);
    expect(r.passed).toBe(3);
    expect(r.failure).toBeNull();
  });

  it('catches an answer that hardcodes the sample, and names it a hidden case', async () => {
    // This is the whole reason hidden cases exist.
    const r = await gradeSubmission(QUESTION, runner({
      '[1,2]': { ok: true, output: '[2,4]' },
      '[3]': { ok: true, output: '[2,4]' },
      '[]': { ok: true, output: '[2,4]' },
    }));
    expect(r.solved).toBe(false);
    expect(r.passed).toBe(1);
    expect(r.failure?.index).toBe(1);
    expect(r.failure?.hidden).toBe(true);
  });

  it('stops at the first failure instead of running the rest', async () => {
    const seen: string[] = [];
    await gradeSubmission(QUESTION, runner({
      '[1,2]': { ok: true, output: 'wrong' },
      '[3]': { ok: true, output: '[6]' },
      '[]': { ok: true, output: '[]' },
    }, seen));
    expect(seen).toEqual(['[1,2]']);
  });

  it('treats an engine error as a failed case and keeps the message', async () => {
    const r = await gradeSubmission(QUESTION, runner({
      '[1,2]': { ok: false, output: '', error: 'CompilationException: Unable to resolve reference of: `paylod`.' },
    }));
    expect(r.solved).toBe(false);
    expect(r.failure?.error).toContain('Unable to resolve reference');
    expect(r.failure?.got).toBeUndefined();
  });

  it('does not call an empty case list solved', async () => {
    const r = await gradeSubmission({ ...QUESTION, cases: [] }, runner({}));
    expect(r.solved).toBe(false);
    expect(r.total).toBe(0);
  });

  it('passes the question compare mode through to every case', async () => {
    const textQ: PracticeQuestion = {
      ...QUESTION,
      compare: 'text',
      cases: [{ input: '[1]', output: '{\n  "a": 1,\n  "a": 2\n}' }],
    };
    const collapsed = await gradeSubmission(textQ, runner({ '[1]': { ok: true, output: '{\n  "a": 2\n}' } }));
    expect(collapsed.solved).toBe(false);
  });

  it('adds up the time the cases took', async () => {
    const r = await gradeSubmission(QUESTION, runner({
      '[1,2]': { ok: true, output: '[2,4]', ms: 10 },
      '[3]': { ok: true, output: '[6]', ms: 5 },
      '[]': { ok: true, output: '[]', ms: 2 },
    }));
    expect(r.ms).toBe(17);
  });
});

// ---------------------------------------------------------------------------

/**
 * "Next" exists because finishing a question used to leave you on a dead end
 * with nothing to click. It should hand you the next thing you have NOT done,
 * not merely the next row, or it walks you back through solved questions.
 */
describe('nextUnsolved', () => {
  const set = ['a', 'b', 'c', 'd'].map(
    (id) => ({ ...QUESTION, id, unit: id }) as PracticeQuestion,
  );

  it('skips over solved questions', () => {
    const solved = (id: string) => id === 'b';
    expect(nextUnsolved(set, 'a', solved)?.id).toBe('c');
  });

  it('wraps around to the start rather than stopping at the end', () => {
    expect(nextUnsolved(set, 'd', () => false)?.id).toBe('a');
  });

  it('wraps past solved ones too', () => {
    const solved = (id: string) => id === 'a' || id === 'b';
    expect(nextUnsolved(set, 'c', solved)?.id).toBe('d');
    expect(nextUnsolved(set, 'd', solved)?.id).toBe('c');
  });

  it('still moves on when everything is solved, instead of getting stuck', () => {
    // Otherwise the button vanishes for anyone who has finished the set, which
    // is the one person most likely to be browsing back through it.
    expect(nextUnsolved(set, 'b', () => true)?.id).toBe('c');
    expect(nextUnsolved(set, 'd', () => true)?.id).toBe('a');
  });

  it('returns null when there is nowhere to go', () => {
    expect(nextUnsolved(set.slice(0, 1), 'a', () => false)).toBeNull();
    expect(nextUnsolved(set, 'missing', () => false)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

/**
 * A predict question shows you a script and asks what it returns. It must be
 * lenient about typing and strict about understanding — the difference between
 * `1` and `"1"` is half of what these questions exist to teach.
 */
describe('gradePrediction', () => {
  const ran = (output: string) => ({ ok: true, output });
  const threw = { ok: false, output: '' };

  it('accepts the right answer typed in any reasonable shape', () => {
    expect(gradePrediction('{"a":1}', ran('{\n  "a": 1\n}')).correct).toBe(true);
    expect(gradePrediction('  [ 1, 2 ]  ', ran('[1,2]')).correct).toBe(true);
    expect(gradePrediction('{"b":2,"a":1}', ran('{"a":1,"b":2}')).correct).toBe(true);
  });

  it('rejects a different value', () => {
    expect(gradePrediction('[1,2,3]', ran('[1,2]')).correct).toBe(false);
  });

  it('keeps the string/number distinction, which is the whole lesson', () => {
    expect(gradePrediction('{"1":2}', ran('{"1":2}')).correct).toBe(true);
    expect(gradePrediction('{"a":1}', ran('{"a":"1"}')).correct).toBe(false);
  });

  it('lets "it errors" be the answer when the script really does', () => {
    expect(gradePrediction('error', threw).correct).toBe(true);
    expect(gradePrediction('It errors', threw).correct).toBe(true);
    expect(gradePrediction('compile error', threw).correct).toBe(true);
  });

  it('does not let "error" pass when the script runs fine', () => {
    const r = gradePrediction('error', ran('[1]'));
    expect(r.correct).toBe(false);
    expect(r.because).toMatch(/returns a value/);
  });

  it('does not let a value pass when the script errors', () => {
    const r = gradePrediction('[1]', threw);
    expect(r.correct).toBe(false);
    expect(r.because).toMatch(/errors/);
  });

  it('treats an empty answer as unanswered rather than wrong', () => {
    expect(gradePrediction('   ', ran('[1]')).because).toMatch(/Nothing typed/);
  });

  it('honours expectedError even when the run happened to succeed', () => {
    // Belt and braces: a question can declare the answer is an error.
    expect(gradePrediction('error', ran('anything'), true).correct).toBe(true);
  });
});
