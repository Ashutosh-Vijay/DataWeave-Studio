import { useCallback, useEffect, useRef, useState } from 'react';
import { startDebug, debugCommand, DebugStartArgs, DebugState } from '../debugger';

/**
 * Drives one debug session.
 *
 * The server answers a step command only after the worker has either re-paused
 * or finished (it waits briefly before replying), so the common case needs no
 * polling at all — the response already carries the new position. Polling only
 * covers the gap after `start`, and the case where a step lands somewhere that
 * takes longer than the server's wait.
 */
export interface UseDebuggerReturn {
  state: DebugState;
  /** True from start until the user stops. Stays true once finished so the
   *  panel can show the result. */
  active: boolean;
  busy: boolean;
  /** Last evaluated expression result, kept separate from step state. */
  evalResult: string | null;
  start: (args: DebugStartArgs) => Promise<void>;
  resume: () => Promise<void>;
  stepOver: () => Promise<void>;
  stepInto: () => Promise<void>;
  stepOut: () => Promise<void>;
  stop: () => Promise<void>;
  evaluate: (expression: string, frameIndex?: number) => Promise<void>;
}

const IDLE: DebugState = { status: 'idle' };

export function useDebugger(): UseDebuggerReturn {
  const [state, setState] = useState<DebugState>(IDLE);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [evalResult, setEvalResult] = useState<string | null>(null);
  const pollRef = useRef(0);

  // Poll only while the worker is between pauses. Every step command already
  // returns the settled state, so this is a safety net rather than the
  // mechanism.
  useEffect(() => {
    if (!active || state.status !== 'running') return;
    const generation = ++pollRef.current;
    let stop = false;
    (async () => {
      while (!stop && pollRef.current === generation) {
        await new Promise((r) => setTimeout(r, 120));
        if (stop || pollRef.current !== generation) return;
        try {
          const next = await debugCommand('state');
          if (pollRef.current !== generation) return;
          setState(next);
          if (next.status !== 'running') return;
        } catch {
          return; // engine restarted mid-session; the panel shows the last state
        }
      }
    })();
    return () => { stop = true; };
  }, [active, state.status]);

  const send = useCallback(async (fn: () => Promise<DebugState>) => {
    setBusy(true);
    try {
      const next = await fn();
      setState(next);
      // Stay active when it finishes: the panel is where the result and any
      // error are shown, so tearing it down here would flash them away.
      return next;
    } catch (e) {
      setState({ status: 'finished', error: (e as Error).message });
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const start = useCallback(async (args: DebugStartArgs) => {
    setBusy(true);
    setEvalResult(null);
    setState({ status: 'running' });
    setActive(true);
    try {
      await startDebug(args);
      // The worker may already be parked on a breakpoint by the time this
      // returns, so ask once rather than waiting for the poll tick.
      const next = await debugCommand('state');
      setState(next);
    } catch (e) {
      setState({ status: 'finished', error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, []);

  const resume = useCallback(async () => { await send(() => debugCommand('resume')); }, [send]);
  const stepOver = useCallback(async () => { await send(() => debugCommand('stepOver')); }, [send]);
  const stepInto = useCallback(async () => { await send(() => debugCommand('stepInto')); }, [send]);
  const stepOut = useCallback(async () => { await send(() => debugCommand('stepOut')); }, [send]);

  const stop = useCallback(async () => {
    pollRef.current++;
    setActive(false);
    setState(IDLE);
    setEvalResult(null);
    try { await debugCommand('stop'); } catch { /* session already gone */ }
  }, []);

  const evaluate = useCallback(async (expression: string, frameIndex = -1) => {
    if (!expression.trim()) return;
    setBusy(true);
    try {
      const next = await debugCommand('evaluate', expression, frameIndex);
      setEvalResult(next.result ?? '');
      // `evaluate` also reports position, so keep the frames fresh.
      if (next.status === 'paused') setState(next);
    } catch (e) {
      setEvalResult((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, active, busy, evalResult, start, resume, stepOver, stepInto, stepOut, stop, evaluate };
}
