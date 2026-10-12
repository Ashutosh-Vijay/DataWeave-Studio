/**
 * Resolve `expression`-typed single-script vars by evaluating each one through
 * the DataWeave engine against the current message — so `vars.x = payload.name`
 * actually computes instead of being stored as the literal string "payload.name".
 *
 * Expression vars are evaluated in order (against the payload, attributes, the
 * literal vars and the expression vars above them), so one bad expression can't
 * blank out the others; an empty or failing expression resolves to null, and a
 * failure is reported in a toast. Literal (string/json) vars pass
 * straight through `buildVarsJson`. Returns the final `vars` JSON for the run.
 *
 * Lives outside runInput.ts on purpose: that module is kept pure/Tauri-free for
 * unit tests, and this one calls `invoke`.
 */
import { invoke } from './bridge';
import type { VarEntry } from './types';
import { buildVarsJson } from './runInput';
import { toast } from './components/Toast';

interface RunResult { output: string; error: string | null; execution_time_ms: number; }

export async function resolveVarsJson(
  vars: VarEntry[],
  payload: string,
  payloadMimeType: string,
  attributesJson: string,
  namedInputsJson: string,
  payloadFilePath: string | null,
  // Same as the run itself, so a var can use java! imports, custom modules
  // and a multipart payload.
  classpath: string[],
  multipartPartsJson: string | null,
  modulesJson: string | null,
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

  const failed: string[] = [];
  for (const v of vars) {
    if (!v.key || v.enabled === false || v.valueType !== 'expression') continue;
    if (v.value.trim() === '') { out[v.key] = null; continue; }
    // A whole script pasted in (%dw 2.0 / output / var x = ... / ---) keeps its
    // header declarations; only %dw and output are replaced, since the value
    // has to come back as JSON.
    let header = '';
    let body = v.value;
    const sep = v.value.match(/^[ \t]*---[ \t]*$/m);
    if (sep && sep.index !== undefined) {
      header = v.value.slice(0, sep.index).split('\n')
        .filter((l) => !/^\s*(%dw\b|output\b)/.test(l)).join('\n');
      body = v.value.slice(sep.index + sep[0].length);
    }
    try {
      const result = await invoke<RunResult>('run_dataweave', {
        script: `%dw 2.0\noutput application/json\n${header}\n---\n${body}`,
        payload,
        payloadMimeType,
        attributesJson,
        // Earlier expression vars are already resolved, so vars.a works in b.
        varsJson: JSON.stringify(out),
        namedInputsJson,
        payloadFilePath,
        classpath,
        timeoutMs: 0,
        multipartPartsJson,
        modulesJson,
      });
      if (result.error) {
        out[v.key] = null;
        failed.push(`vars.${v.key}: ${result.error.split('\n')[0]}`);
      } else {
        try { out[v.key] = JSON.parse(result.output); } catch { out[v.key] = result.output; }
      }
    } catch (e) {
      out[v.key] = null;
      failed.push(`vars.${v.key}: ${String(e)}`);
    }
  }
  if (failed.length > 0) {
    toast({ title: 'A variable failed, so it is null for this run', message: failed.join('\n'), variant: 'error' });
  }
  return JSON.stringify(out);
}
