import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface RunResult {
  output: string;
  error: string | null;
  execution_time_ms: number;
  error_line: number | null;
  error_column: number | null;
}

interface WarmupStatus {
  ready: boolean;
  error: string | null;
}

interface UseDWRunnerReturn {
  output: string;
  error: string | null;
  errorLine: number | null;
  errorColumn: number | null;
  isRunning: boolean;
  executionTimeMs: number | undefined;
  isWarmedUp: boolean;
  engineError: string | null;
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
  const pollGenRef = useRef(0);
  const runningRef = useRef(false);

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
    ) => {
      if (runningRef.current) return; // prevent double-clicks
      runningRef.current = true;
      setIsRunning(true);
      setError(null);
      setErrorLine(null);
      setErrorColumn(null);
      setOutput('');
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
        });

        if (result.error) {
          setError(result.error);
          setErrorLine(result.error_line);
          setErrorColumn(result.error_column);
        }
        if (result.output) setOutput(result.output);
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
    isRunning,
    executionTimeMs,
    isWarmedUp,
    engineError,
    run,
    cancel,
    restartEngine,
  };
}
