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
  cliError: string | null;
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
  restartCli: () => Promise<void>;
}

export function useDWRunner(): UseDWRunnerReturn {
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const [errorColumn, setErrorColumn] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | undefined>(undefined);
  const [isWarmedUp, setIsWarmedUp] = useState(false);
  const [cliError, setCliError] = useState<string | null>(null);
  const pollGenRef = useRef(0);
  const runningRef = useRef(false);

  const startPolling = useCallback(() => {
    const myGen = ++pollGenRef.current;
    const check = async () => {
      if (pollGenRef.current !== myGen) return;
      try {
        const status = await invoke<WarmupStatus>('get_warmup_status');
        if (status.ready) {
          setIsWarmedUp(true);
          setCliError(status.error ?? null);
          return;
        }
      } catch {
        try {
          const ready = await invoke<boolean>('is_warmed_up');
          if (ready) { setIsWarmedUp(true); return; }
        } catch { /* ignore */ }
      }
      setTimeout(check, 500);
    };
    check();
  }, []);

  useEffect(() => {
    startPolling();
    return () => { ++pollGenRef.current; }; // stop polling on unmount
  }, [startPolling]);

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

  const restartCli = useCallback(async () => {
    setIsWarmedUp(false);
    setCliError(null);
    try {
      await invoke('restart_cli');
    } catch (e) {
      setCliError(String(e));
      setIsWarmedUp(true);
      return;
    }
    startPolling();
  }, [startPolling]);

  return {
    output,
    error,
    errorLine,
    errorColumn,
    isRunning,
    executionTimeMs,
    isWarmedUp,
    cliError,
    run,
    cancel,
    restartCli,
  };
}
