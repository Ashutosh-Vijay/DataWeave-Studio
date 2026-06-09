import { useCallback, useState } from 'react';
import { invoke } from '../bridge';
import { TestCase, Request, ContextState } from '../types';

/**
 * Runs DataWeave tests against a request. Each test reuses the request's
 * script + (optionally) its own payload; the runner invokes the DW engine
 * the same way the main Run button does, then compares the output against
 * the test's `expectedOutput` using the chosen comparator.
 */

interface RunResult {
  output: string;
  error: string | null;
  execution_time_ms: number;
  error_line: number | null;
  error_column: number | null;
}

export interface TestRunOutcome {
  status: 'pass' | 'fail';
  timeMs: number;
  /** Set on fail — what the runner got back. */
  actualOutput?: string;
  /** Set on fail — first short reason ("script error", "output differs", etc.). */
  reason?: string;
  /** Set on script-level error (vs. mismatch). */
  errorMessage?: string;
}

function compare(comparator: TestCase['comparator'], expected: string, actual: string): boolean {
  if (comparator === 'exact') return expected.trim() === actual.trim();
  // semantic-json: parse both, deep-equal ignoring key order.
  try {
    return deepEqual(JSON.parse(expected), JSON.parse(actual));
  } catch {
    // Fall back to exact when either side isn't valid JSON.
    return expected.trim() === actual.trim();
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

function buildAttributesJson(ctx: ContextState): string {
  const headers: Record<string, string> = {};
  for (const h of ctx.headers) {
    if (h.enabled === false) continue;
    if (h.key) headers[h.key] = h.value;
  }
  const queryParams: Record<string, string> = {};
  for (const p of ctx.queryParams) {
    if (p.enabled === false) continue;
    if (p.key) queryParams[p.key] = p.value;
  }
  return JSON.stringify({ method: ctx.method, headers, queryParams });
}

function buildVarsJson(ctx: ContextState): string {
  const out: Record<string, unknown> = {};
  for (const v of ctx.vars) {
    if (v.enabled === false) continue;
    if (!v.key) continue;
    if (v.valueType === 'json') {
      try { out[v.key] = JSON.parse(v.value); } catch { out[v.key] = v.value; }
    } else {
      out[v.key] = v.value;
    }
  }
  return JSON.stringify(out);
}

/**
 * Executes a single test case against a request's runnable context. Returns
 * the outcome (pass/fail + timing) without mutating state — the caller (the
 * Tests UI) decides what to do with it.
 */
async function executeOne(test: TestCase, req: Request): Promise<TestRunOutcome> {
  const t0 = performance.now();
  try {
    const result = await invoke<RunResult>('run_dataweave', {
      script: req.script,
      payload: test.payload,
      payloadMimeType: test.payloadMimeType,
      attributesJson: buildAttributesJson(req.context),
      varsJson: buildVarsJson(req.context),
      namedInputsJson: JSON.stringify(req.namedInputs.map((n) => ({
        name: n.name,
        content: n.content,
        mime_type: n.mimeType,
        file_path: n.filePath ?? null,
      }))),
      payloadFilePath: null,
      classpath: req.classpath,
      timeoutMs: req.timeoutMs ?? 30000,
      multipartPartsJson: null,
    });
    const timeMs = Math.round(performance.now() - t0);

    if (result.error) {
      return {
        status: 'fail',
        timeMs,
        reason: 'script error',
        errorMessage: result.error,
      };
    }

    if (test.expectedOutput === undefined) {
      // No expected yet — caller should treat this as a "capture" flow.
      // Surfaced as pass=false so the UI doesn't claim success.
      return {
        status: 'fail',
        timeMs,
        actualOutput: result.output,
        reason: 'no expected output set',
      };
    }

    if (compare(test.comparator, test.expectedOutput, result.output)) {
      return { status: 'pass', timeMs };
    }
    return {
      status: 'fail',
      timeMs,
      actualOutput: result.output,
      reason: 'output differs from expected',
    };
  } catch (e) {
    return {
      status: 'fail',
      timeMs: Math.round(performance.now() - t0),
      reason: 'execution failed',
      errorMessage: (e as Error).message || String(e),
    };
  }
}

interface UseTestRunnerReturn {
  /** Map of test id → outcome from the most recent run. */
  outcomes: Record<string, TestRunOutcome>;
  /** Set of test ids that are currently executing. */
  running: Set<string>;
  /** Run a single test, return its outcome. */
  runOne: (test: TestCase, req: Request) => Promise<TestRunOutcome>;
  /** Run every test in a request, in order. */
  runAll: (req: Request) => Promise<TestRunOutcome[]>;
  /** Clear all recorded outcomes (e.g. when the request changes). */
  reset: () => void;
}

export function useTestRunner(): UseTestRunnerReturn {
  const [outcomes, setOutcomes] = useState<Record<string, TestRunOutcome>>({});
  const [running, setRunning] = useState<Set<string>>(new Set());

  const runOne = useCallback(async (test: TestCase, req: Request) => {
    setRunning((prev) => { const next = new Set(prev); next.add(test.id); return next; });
    const result = await executeOne(test, req);
    setOutcomes((prev) => ({ ...prev, [test.id]: result }));
    setRunning((prev) => { const next = new Set(prev); next.delete(test.id); return next; });
    return result;
  }, []);

  const runAll = useCallback(async (req: Request) => {
    const results: TestRunOutcome[] = [];
    for (const test of req.tests) {
      // eslint-disable-next-line no-await-in-loop
      const result = await runOne(test, req);
      results.push(result);
    }
    return results;
  }, [runOne]);

  const reset = useCallback(() => setOutcomes({}), []);

  return { outcomes, running, runOne, runAll, reset };
}
