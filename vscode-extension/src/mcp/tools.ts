/**
 * MCP tool surface for DataWeave Studio.
 *
 * FRAMEWORK SCAFFOLD — one functional tool (validate_and_run_dataweave) wired to
 * the existing engine via dwHost.runDataweave. The fuller tool/resource/prompt
 * surface (migrate, format, secure-properties, dw:// reference resources, the
 * debug prompt) is intentionally left to design later — see docs/MCP_PLAN.md §6.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ⚠ PHASE 0 SECURITY GATE — DO NOT SHIP/ENABLE FOR AGENTS UNTIL DONE.        │
 * │ dwstudio-server runs DataWeave with Java interop ON (`import java!…`), so  │
 * │ a script can shell out / read files. Fine when a human types it; an RCE    │
 * │ surface when an LLM runs generated scripts against untrusted payloads.     │
 * │ Before exposing this to an agent: lock down Java interop in the engine and │
 * │ keep `classpath` out of the tool input (we never pass it below).           │
 * │ Tracked as Phase 0 in docs/MCP_PLAN.md.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DwServer, runDataweave } from '../dwHost';

export function registerTools(mcp: McpServer, dw: DwServer): void {
  // registerTool's generic inference over a Zod raw shape trips TS2589
  // ("excessively deep") on modern zod. Cast the registration and type the
  // handler args explicitly — the real Zod schemas below still validate inputs
  // at runtime; only the compile-time inference is bypassed.
  const register = mcp.registerTool.bind(mcp) as (
    name: string,
    config: unknown,
    cb: (args: { script: string; payload: string; inputMimeType: string }) => Promise<{
      content: { type: 'text'; text: string }[];
      isError?: boolean;
    }>,
  ) => void;

  register(
    'validate_and_run_dataweave',
    {
      title: 'Validate & run DataWeave',
      description:
        'Execute a DataWeave 2.0 script against an input payload using the local ' +
        'engine and return the rendered output, or the exact error with line/column. ' +
        'You MUST call this to validate EVERY DataWeave script you generate BEFORE ' +
        'presenting it to the user; if it returns an error, fix the script and re-run ' +
        'until it succeeds. Never output an untested DataWeave script.',
      inputSchema: {
        script: z
          .string()
          .describe('The complete DataWeave 2.0 script. May include its own %dw / input / output / --- header; missing parts are inferred.'),
        payload: z
          .string()
          .describe('The input payload data, as a string (JSON, XML, CSV, …).'),
        inputMimeType: z
          .string()
          .default('application/json')
          .describe('MIME type of the payload, e.g. application/json, application/xml, application/csv, application/yaml.'),
      },
      // Honest ONLY once Phase 0 lands (interop off ⇒ a pure transform has no
      // side effects ⇒ clients won't re-prompt for permission on each retry).
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ script, payload, inputMimeType }) => {
      const result = await runDataweave(dw, {
        script,
        payload,
        payloadMimeType: inputMimeType,
        attributesJson: '{}',
        varsJson: '{}',
        namedInputsJson: '[]',
        // NEVER pass `classpath` — agents must not hot-add JARs (Phase 0).
      });

      if (result.error) {
        const where =
          result.error_line != null
            ? ` (line ${result.error_line}${result.error_column != null ? `, col ${result.error_column}` : ''})`
            : '';
        return {
          content: [{ type: 'text', text: `ERROR${where}:\n${result.error}` }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: result.output }] };
    }
  );
}
