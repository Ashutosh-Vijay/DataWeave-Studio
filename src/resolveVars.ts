/**
 * Resolve `expression`-typed single-script vars by evaluating each one through
 * the DataWeave engine against the current message — so `vars.x = payload.name`
 * actually computes instead of being stored as the literal string "payload.name".
 *
 * Each expression var is evaluated independently (against the payload, attributes,
 * and the literal vars) so one bad expression can't blank out the others; an
 * empty or failing expression resolves to null. Literal (string/json) vars pass
 * straight through `buildVarsJson`. Returns the final `vars` JSON for the run.
 *
 * Lives outside runInput.ts on purpose: that module is kept pure/Tauri-free for
 * unit tests, and this one calls `invoke`.
 */
import { invoke } from './bridge';
import type { VarEntry } from './types';
import { buildVarsJson } from './runInput';

interface RunResult { output: string; error: string | null; execution_time_ms: number; }

export async function resolveVarsJson(
  vars: VarEntry[],
  payload: string,
  payloadMimeType: string,
  attributesJson: string,
  namedInputsJson: string,
  payloadFilePath: string | null,
): Promise<string> {
  const hasExpr = vars.some(
    (v) => v.key && v.enabled !== false && v.valueType === 'expression' && v.value.trim() !== '',
  );
  // Fast path: no expression vars → identical to the old synchronous behavior.
  if (!hasExpr) return buildVarsJson(vars);

  // Literal vars are both the evaluation context for the expressions and the
  // base of the final object.
  const literalVars = vars.filter((v) => v.valueType !== 'expression');
  const literalVarsJson = buildVarsJson(literalVars);
  const out = JSON.parse(literalVarsJson) as Record<string, unknown>;

  for (const v of vars) {
    if (!v.key || v.enabled === false || v.valueType !== 'expression') continue;
    if (v.value.trim() === '') { out[v.key] = null; continue; }
    try {
      const result = await invoke<RunResult>('run_dataweave', {
        script: `%dw 2.0\noutput application/json\n---\n${v.value}`,
        payload,
        payloadMimeType,
        attributesJson,
        varsJson: literalVarsJson,
        namedInputsJson,
        payloadFilePath,
        classpath: [],
        timeoutMs: 0,
        multipartPartsJson: null,
      });
      if (result.error) {
        out[v.key] = null;
      } else {
        try { out[v.key] = JSON.parse(result.output); } catch { out[v.key] = result.output; }
      }
    } catch {
      out[v.key] = null;
    }
  }
  return JSON.stringify(out);
}
