/**
 * Client side of the DataWeave debugger.
 *
 * The engine pauses by parking the thread that is executing the script, so the
 * server runs it on a worker and stays responsive. That means there are no
 * events to subscribe to: starting a session returns immediately, and progress
 * is read back by asking. Everything here is plain request/response.
 *
 * `start` goes through `run_dataweave` on purpose — a debug run IS a run, and
 * reusing that path means payload, attributes, vars and named inputs are
 * prepared exactly the same way as a normal execution instead of by a second,
 * drifting copy.
 */
import { invoke } from './bridge';

/** One variable in a frame, already rendered for display by the engine. */
export interface DebugVariable {
  name: string;
  type: string;
  value: string;
}

/** A stack frame. Frame 0 is the outermost (the script itself). */
export interface DebugFrame {
  id: number;
  name?: string;
  line: number;
  variables: DebugVariable[];
}

export interface DebugState {
  /** `idle` before anything has run; `running` while the worker is executing. */
  status: 'idle' | 'running' | 'paused' | 'finished';
  line?: number;
  column?: number;
  /** The engine's stop reason. 1 is a breakpoint, everything else is a step. */
  reason?: number;
  frames?: DebugFrame[];
  /** Present once finished, and mutually exclusive. */
  output?: string;
  error?: string;
  /** Only on an `evaluate` call. */
  result?: string;
}

export type DebugAction = 'state' | 'resume' | 'stepOver' | 'stepInto' | 'stepOut' | 'stop' | 'evaluate';

/** Everything `run_dataweave` needs, plus where to break. */
export interface DebugStartArgs {
  script: string;
  payload: string;
  payloadMimeType: string;
  attributesJson: string;
  varsJson: string;
  namedInputsJson: string;
  payloadFilePath?: string | null;
  classpath?: string[];
  modulesJson?: string | null;
  breakpoints: number[];
}

export async function startDebug(args: DebugStartArgs): Promise<void> {
  await invoke('run_dataweave', {
    script: args.script,
    payload: args.payload,
    payloadMimeType: args.payloadMimeType,
    attributesJson: args.attributesJson,
    varsJson: args.varsJson,
    namedInputsJson: args.namedInputsJson,
    payloadFilePath: args.payloadFilePath ?? null,
    classpath: args.classpath ?? [],
    // No timeout: a paused session is stopped on purpose and must not be
    // killed for being slow.
    timeoutMs: 0,
    multipartPartsJson: null,
    modulesJson: args.modulesJson ?? null,
    // Version gating is a separate concern; debug against the full engine so a
    // target can't make stepping itself fail.
    languageLevel: null,
    debug: true,
    debugBreakpoints: args.breakpoints,
  });
}

export async function debugCommand(
  action: DebugAction,
  expression = '',
  frameIndex = -1,
): Promise<DebugState> {
  const res = await invoke<DebugState | null>('dw_debug', { action, expression, frameIndex });
  return res ?? { status: 'idle' };
}
