import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '../bridge';
import { toast } from '../components/Toast';

interface RunResult {
  output: string;
  error: string | null;
  execution_time_ms: number;
  error_line: number | null;
  error_column: number | null;
  logs?: string[] | null;
}

interface WarmupStatus {
  ready: boolean;
  error: string | null;
  /** False when the engine failed its startup non-ASCII round-trip check. */
  encodingOk?: boolean;
  /** Version the engine reported at startup, e.g. "2.12.2-20260715". */
  weaveVersion?: string | null;
}

interface UseDWRunnerReturn {
  output: string;
  error: string | null;
  errorLine: number | null;
  errorColumn: number | null;
  /** Captured `log(...)` output from the last run (empty if the script logged nothing). */
  logs: string[];
  isRunning: boolean;
  executionTimeMs: number | undefined;
  isWarmedUp: boolean;
  engineError: string | null;
  /** The running engine's own version. Undefined until it has started. */
  engineVersion?: string;
  run: (
    script: string,
    payload: string,
    payloadMimeType: string,
    attributesJson: string,
    varsJson: string,
    namedInputsJson: string,
    payloadFilePath?: string | null,
    classpath?: string[],
    timeoutMs?: number,
    multipartPartsJson?: string,
    modulesJson?: string,
    languageLevel?: string,
  ) => Promise<void>;
  cancel: () => Promise<void>;
  restartEngine: () => Promise<void>;
}

export function useDWRunner(): UseDWRunnerReturn {
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const [errorColumn, setErrorColumn] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | undefined>(undefined);
  const [isWarmedUp, setIsWarmedUp] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [engineVersion, setEngineVersion] = useState<string | undefined>(undefined);
  const [logs, setLogs] = useState<string[]>([]);
  const pollGenRef = useRef(0);
  const runningRef = useRef(false);
  /** Result of the engine's startup encoding self-check, and whether we've
   *  already told the user about it (once per session is enough). */
  const encodingOkRef = useRef(true);
  const encodingWarnedRef = useRef(false);

  // Poll get_warmup_status until the engine reports ready (or errored), then
  // return its final status. Resolves null if a newer poll generation
  // superseded this one (unmount, or a subsequent restart).
  const pollUntilReady = useCallback(async (): Promise<WarmupStatus | null> => {
    const myGen = ++pollGenRef.current;
    while (pollGenRef.current === myGen) {
      try {
        const status = await invoke<WarmupStatus>('get_warmup_status');
        if (status.ready) return status;
      } catch {
        try {
          if (await invoke<boolean>('is_warmed_up')) return { ready: true, error: null };
        } catch { /* ignore */ }
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }, []);

  useEffect(() => {
    (async () => {
      const status = await pollUntilReady();
      if (status) {
        setIsWarmedUp(true);
        setEngineError(status.error ?? null);
        // Remember it, but say nothing yet — a user who only ever transforms
        // English data is unaffected and shouldn't be shown a scary startup
        // error. `run` raises it only if they actually send non-ASCII text.
        encodingOkRef.current = status.encodingOk !== false;
        if (status.weaveVersion) setEngineVersion(status.weaveVersion);
      }
    })();
    return () => { ++pollGenRef.current; }; // stop polling on unmount
  }, [pollUntilReady]);

  const run = useCallback(
    async (
      script: string,
      payload: string,
      payloadMimeType: string,
      attributesJson: string,
      varsJson: string,
      namedInputsJson: string,
      payloadFilePath?: string | null,
      classpath?: string[],
      timeoutMs?: number,
      multipartPartsJson?: string,
      modulesJson?: string,
      languageLevel?: string,
    ) => {
      if (runningRef.current) return; // prevent double-clicks

      // Only now — when this JVM can't round-trip non-ASCII AND the user has
      // actually put some in — is the encoding fault worth interrupting for.
      // Warn once per session, before they act on output we know is wrong.
      if (!encodingOkRef.current && !encodingWarnedRef.current && /[^\x00-\x7F]/.test(script + payload)) {
        encodingWarnedRef.current = true;
        toast({
          title: 'This engine can’t return non-English text',
          message: 'Your input contains characters (Hindi, Chinese, emoji, accents…) that this Java runtime turns into “?”. The result below will be wrong for those characters. Please report it with your OS and Java version.',
          variant: 'error',
          persist: true,
        });
      }

      runningRef.current = true;
      setIsRunning(true);
      setError(null);
      setErrorLine(null);
      setErrorColumn(null);
      setOutput('');
      setLogs([]);
      setExecutionTimeMs(undefined);

      try {
        const result = await invoke<RunResult>('run_dataweave', {
          script,
          payload,
          payloadMimeType,
          attributesJson,
          varsJson,
          namedInputsJson,
          payloadFilePath: payloadFilePath ?? null,
          classpath: classpath ?? [],
          timeoutMs: timeoutMs ?? 0,
          multipartPartsJson: multipartPartsJson ?? null,
          modulesJson: modulesJson ?? null,
          languageLevel: languageLevel || null,
          // Always trace: the engine only emits when the script calls log(), so
          // there's no cost for scripts that don't — and it powers the Logs panel.
          trace: true,
        });

        if (result.error) {
          setError(result.error);
          setErrorLine(result.error_line);
          setErrorColumn(result.error_column);
        }
        if (result.output) setOutput(result.output);
        setLogs(result.logs ?? []);
        setExecutionTimeMs(result.execution_time_ms);
      } catch (e: unknown) {
        setError(String(e));
      } finally {
        runningRef.current = false;
        setIsRunning(false);
      }
    },
    []
  );

  const cancel = useCallback(async () => {
    try {
      await invoke<boolean>('cancel_dataweave');
    } catch {
      /* nothing to cancel — ignore */
    }
  }, []);

  const restartEngine = useCallback(async () => {
    setIsWarmedUp(false);
    setEngineError(null);
    try {
      await invoke('restart_engine');
    } catch (e) {
      const msg = String(e);
      setEngineError(msg);
      setIsWarmedUp(true);
      throw new Error(msg);
    }
    // Wait for the backend to finish respawning the server (~1-3s) so the
    // caller can surface an accurate success/failure toast.
    const status = await pollUntilReady();
    if (!status) return; // superseded by unmount or another restart
    setIsWarmedUp(true);
    setEngineError(status.error ?? null);
    if (status.error) throw new Error(status.error);
  }, [pollUntilReady]);

  return {
    output,
    error,
    errorLine,
    errorColumn,
    logs,
    isRunning,
    executionTimeMs,
    isWarmedUp,
    engineError,
    engineVersion,
    run,
    cancel,
    restartEngine,
  };
}
