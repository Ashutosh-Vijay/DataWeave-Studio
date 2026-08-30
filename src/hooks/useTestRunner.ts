import { useCallback, useState } from 'react';
import { invoke } from '../bridge';
import { Request } from '../types';

/**
 * Runs a real `dw::test` suite through the bundled engine.
 *
 * This replaces the old snapshot runner, which ran the request's script against
 * a stored payload and diffed the output against a captured blob. That model
 * only ever answered "did the output change", and the captured blob went stale
 * the moment the transform legitimately changed.
 *
 * A suite is an ordinary DataWeave script whose result happens to be a test
 * report, so there is nothing special about executing one — it goes through the
 * same `run_dataweave` command as the Run button. What makes it work is that
 * `dw::test::Tests`, `dw::test::Asserts` and `dw::io::file` are now compiled
 * into the server jar. They have to be real dependencies rather than jars added
 * to the classpath at runtime: the file module registers native functions at
 * engine startup, and adding it late resolves the DWL modules while leaving the
 * natives missing ("Unable to find native module file").
 */

interface RunResult {
  output: string;
  error: string | null;
  execution_time_ms: number;
  error_line: number | null;
  error_column: number | null;
}

/**
 * A node in the engine's report. `describedBy` blocks nest, so a node is either
 * a suite (has `tests`) or a single test (has a status and maybe a message).
 */
export interface DWTestNode {
  name: string;
  status: string;
  time?: number;
  errorMessage?: string;
  location?: {
    start?: { index?: number; line?: number; column?: number };
    end?: { index?: number; line?: number; column?: number };
  };
  tests?: DWTestNode[];
}

export interface SuiteRun {
  root: DWTestNode | null;
  passed: number;
  failed: number;
  /** Wall-clock for the whole run, as the engine measured it. */
  timeMs: number;
  /** Set when the suite didn't run at all — a compile error, a timeout, no suite. */
  error: string | null;
  /** Line the compile error points at, so the editor can mark it. */
  errorLine: number | null;
}

export const EMPTY_RUN: SuiteRun = {
  root: null, passed: 0, failed: 0, timeMs: 0, error: null, errorLine: null,
};

/** A test node is a leaf if it has no children; only leaves count toward pass/fail. */
export function isLeaf(node: DWTestNode): boolean {
  return !node.tests || node.tests.length === 0;
}

/**
 * Count leaves by status.
 *
 * Deliberately does NOT trust the suite-level `status`: a suite containing a
 * failing test still came back as "OK" in testing, because that field reports
 * whether the suite executed rather than whether its tests passed.
 */
export function tally(node: DWTestNode | null): { passed: number; failed: number } {
  if (!node) return { passed: 0, failed: 0 };
  if (isLeaf(node)) {
    return node.status === 'OK'
      ? { passed: 1, failed: 0 }
      : { passed: 0, failed: 1 };
  }
  return (node.tests ?? []).reduce(
    (acc, child) => {
      const sub = tally(child);
      return { passed: acc.passed + sub.passed, failed: acc.failed + sub.failed };
    },
    { passed: 0, failed: 0 },
  );
}

export interface UseTestRunnerReturn {
  result: SuiteRun;
  running: boolean;
  runSuite: (req: Request) => Promise<SuiteRun>;
  reset: () => void;
}

export function useTestRunner(): UseTestRunnerReturn {
  const [result, setResult] = useState<SuiteRun>(EMPTY_RUN);
  const [running, setRunning] = useState(false);

  const runSuite = useCallback(async (req: Request): Promise<SuiteRun> => {
    const suite = (req.testScript ?? '').trim();
    if (!suite) {
      const out = { ...EMPTY_RUN, error: 'There is no test suite in this request yet.' };
      setResult(out);
      return out;
    }

    setRunning(true);
    try {
      const res = await invoke<RunResult>('run_dataweave', {
        script: req.testScript,
        // A suite drives its own inputs through assertions, but the request's
        // payload is still passed so a suite CAN reference `payload` if the
        // author wants to exercise the same fixture the transform uses.
        payload: req.payload,
        payloadMimeType: req.payloadMimeType,
        attributesJson: '{}',
        varsJson: '{}',
        namedInputsJson: '[]',
        payloadFilePath: null,
        classpath: req.classpath,
        timeoutMs: req.timeoutMs ?? 30000,
        multipartPartsJson: null,
      });

      if (res.error) {
        const out = {
          ...EMPTY_RUN,
          error: res.error,
          errorLine: res.error_line,
          timeMs: res.execution_time_ms,
        };
        setResult(out);
        return out;
      }

      let root: DWTestNode | null = null;
      try {
        root = JSON.parse(res.output) as DWTestNode;
      } catch {
        const out = {
          ...EMPTY_RUN,
          error: 'The suite ran but did not return a test report. A suite\'s body must be a `describedBy` block.',
          timeMs: res.execution_time_ms,
        };
        setResult(out);
        return out;
      }

      const { passed, failed } = tally(root);
      const out: SuiteRun = {
        root, passed, failed, timeMs: res.execution_time_ms, error: null, errorLine: null,
      };
      setResult(out);
      return out;
    } catch (e) {
      const out = { ...EMPTY_RUN, error: (e as Error)?.message ?? String(e) };
      setResult(out);
      return out;
    } finally {
      setRunning(false);
    }
  }, []);

  const reset = useCallback(() => setResult(EMPTY_RUN), []);

  return { result, running, runSuite, reset };
}
