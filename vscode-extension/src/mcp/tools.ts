/**
 * MCP tool surface for DataWeave Studio (VS Code extension) — at parity with the
 * desktop's rmcp server (src-tauri/src/mcp_server.rs). Eight tools, all backed by
 * the SAME bundled DataWeave 2.12 engine via dwHost:
 *
 *   validate_and_run_dataweave · secure_properties · migrate_dw_1_to_2 ·
 *   format_dataweave · dw_function_reference · dw_cookbook
 *
 * SECURITY — Safe mode is the default and is a real pure-transform sandbox:
 * `import java!…`, `readUrl`, and `dw::io` are rejected before running (in the
 * script AND in any imported module body), and `classpath` is never accepted.
 * Advanced mode (env DWSTUDIO_MCP_ADVANCED=1) lifts the gate for FULL local
 * access — only enable it when you trust every script the agent will run.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import yaml from 'js-yaml';
import { DwServer, runDataweave, formatDataweave, toolingQuery } from '../dwHost';
import { securePropertiesInvoke } from './secureProps';
import { loadMcpJson } from './mcpResources';
import { migrateDW1to2 } from './dwMigrate';

// --- shared helpers (ports of mcp_server.rs) --------------------------------

/** A MuleSoft secure value looks like `![base64]`. Decrypt those before they
 *  reach the script — passing ciphertext through silently produces wrong data. */
function isEncryptedValue(v: string): boolean {
  const t = v.trim();
  return t.length > 3 && t.startsWith('![') && t.endsWith(']');
}

/** Flatten a nested object into dot-notation string keys. */
function flatten(obj: unknown, prefix: string, out: Record<string, string>): void {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
      else out[key] = String(v ?? '');
    }
  }
}

/** The `!` char is a YAML tag indicator, so a bare `![Blob]` value breaks the
 *  parse. Quote each `![...]` so js-yaml reads it as a literal string (the `![`
 *  stays in the value so isEncryptedValue still finds it). */
function escapeBangBrackets(src: string): string {
  return src.replace(/(:\s*)(!\[[^\]\n]+\])(\s*$)/gm, (_m, p, v, t) => `${p}"${v.replace(/"/g, '\\"')}"${t}`);
}

/** Parse a YAML config into a flat dot-key map (lenient — bad YAML → empty). */
function flattenYamlToMap(src: string | undefined, secure: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  if (!src || !src.trim()) return out;
  try {
    flatten(yaml.load(secure ? escapeBangBrackets(src) : src), '', out);
  } catch {
    /* malformed → empty, matches the Rust lenient path */
  }
  return out;
}

/** Escape a value for insertion INSIDE a DataWeave string literal. DataWeave
 *  interpolates `$` inside both single- and double-quoted strings, so a secret
 *  like `Pa$$w0rd` or `$qwer%$#` injected raw into `"..."` throws "Unable to
 *  resolve reference of `$`". Escape `$`→`\$`, plus the quote/backslash so the
 *  value can't break out, and CR/LF so it can't terminate the string. */
function escapeForDwString(value: string, quote: '"' | "'"): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(new RegExp(quote, 'g'), () => '\\' + quote)
    .replace(/\$/g, () => '\\$')
    .replace(/\r/g, () => '\\r')
    .replace(/\n/g, () => '\\n');
}

/** Substitute `${key}` / `${secure::key}` placeholders from the config + secure
 *  maps in a single pass. Values that land inside a DataWeave string literal are
 *  escaped for that context (see escapeForDwString); bare values are verbatim.
 *  `${secure::key}` → secure map; bare `${key}` → config first, then secure. */
function substituteProps(
  text: string,
  configMap: Record<string, string>,
  secureMap: Record<string, string>,
): string {
  const resolve = (name: string): string | undefined => {
    if (name.startsWith('secure::')) return secureMap[name.slice('secure::'.length)];
    if (name in configMap) return configMap[name];
    if (name in secureMap) return secureMap[name];
    return undefined;
  };

  let out = '';
  let quote: '"' | "'" | null = null;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '$' && text[i + 1] === '{') {
      const end = text.indexOf('}', i + 2);
      if (end !== -1) {
        const val = resolve(text.slice(i + 2, end));
        if (val !== undefined) {
          out += quote ? escapeForDwString(val, quote) : val;
          i = end + 1;
          continue;
        }
      }
      out += ch;
      i += 1;
      continue;
    }
    if (quote) {
      if (ch === '\\') { out += ch + (text[i + 1] ?? ''); i += 2; continue; }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** In Safe mode a script (or module) must be a PURE transform — no Java interop,
 *  no file/network I/O. `readUrl` reads file:// + the network; `dw::io` does I/O;
 *  neither goes through `java!`, so all three are blocked. Returns the reason. */
function safeModeBlockReason(script: string): string | null {
  if (script.includes('java!')) return 'Java interop (`import java!…`)';
  if (script.includes('readUrl')) return '`readUrl` (it reads local files via file:// and reaches the network)';
  if (script.includes('dw::io')) return 'the `dw::io` module (file / network I/O)';
  return null;
}

/** Render one function's full reference entry (all overloads + examples). */
function formatFnDoc(name: string, doc: any): string {
  let s = `# ${name}\n`;
  for (const ov of (doc?.overloads ?? []) as any[]) {
    const module = ov.module ?? 'core';
    const sig = ov.signature ?? '';
    const desc = ov.description ?? '';
    s += `\n## [${module}] ${sig}\n${desc}\n`;
    for (const ex of (ov.examples ?? []) as any[]) {
      s += `\nExample:\n${ex.source ?? ''}\n=>\n${ex.output ?? ''}\n`;
    }
  }
  return s;
}

/** Render one cookbook recipe in full (input + script + expected output). */
function formatRecipe(r: any): string {
  const g = (k: string) => (r?.[k] ?? '') as string;
  return (
    `# ${g('name')} (${g('category')} · ${g('difficulty')})\n${g('description')}\n\n` +
    `## Input (${g('inputMime')})\n${g('input')}\n\n` +
    `## Script\n${g('script')}\n\n` +
    `## Output (${g('outputMime')})\n${g('output')}`
  );
}

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const err = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });

// --- registration -----------------------------------------------------------

export function registerTools(
  mcp: McpServer,
  dw: DwServer,
  extensionRoot: string,
  advanced: boolean,
): void {
  // registerTool's generic inference over a Zod raw shape trips TS2589 on modern
  // zod. Cast the registration and type handler args as any — the Zod schemas
  // still validate at runtime; only compile-time inference is bypassed.
  const register = mcp.registerTool.bind(mcp) as unknown as (
    name: string,
    config: unknown,
    cb: (args: any) => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>,
  ) => void;

  // 1) validate_and_run_dataweave -------------------------------------------
  register(
    'validate_and_run_dataweave',
    {
      title: 'Validate & run DataWeave',
      description:
        'Run and validate a DataWeave 2.0 script against a sample payload on the local, real DataWeave 2.12 ' +
        'engine; returns the rendered output, or the exact compile/runtime error with line & column. MANDATORY: ' +
        'call this on EVERY DataWeave script you write BEFORE showing it to the user — never present unverified ' +
        "DataWeave. On error, fix the script using the reported line/column and re-run until it succeeds (don't " +
        "web-search syntax — this tool's result is the ground truth). A bare body runs as `%dw 2.0` / `output " +
        'application/json`; include your own `output <mime>` + `---` for any other output format.',
      inputSchema: {
        script: z.string().describe('The complete DataWeave 2.0 script. A bare body works; for non-JSON output include your own %dw/output/--- header.'),
        payload: z.string().default('{}').describe('Sample input payload as a string matching input_mime_type. Pass {} if unused.'),
        inputMimeType: z.string().default('application/json').describe('MIME type of payload: application/json (default), application/xml, application/csv, application/yaml, etc.'),
        attributes: z.string().optional().describe('Optional inbound attributes as a JSON object — read as attributes.* (method/headers/queryParams/uriParams).'),
        vars: z.string().optional().describe('Optional flow variables as a JSON object {"name": value} — read as vars.*.'),
        config: z.string().optional().describe('Optional Config YAML. ${key} placeholders in script/payload are replaced before running.'),
        secureConfig: z.string().optional().describe('Optional Secure Config YAML. Replaces ${secure::key}/${key}. Encrypted ![…] values are decrypted first if a key is available.'),
        secureKey: z.string().optional().describe('Decryption key for ![…] values (overrides env DWSTUDIO_SECURE_KEY). If a ![…] appears with no key, the run is REJECTED (never runs ciphertext).'),
        secureAlgorithm: z.string().optional().describe('Decryption cipher: AES (default) | Blowfish | DES | DESede | RC2.'),
        secureMode: z.string().optional().describe('Cipher mode: CBC (default) | CFB | ECB | OFB.'),
        secureRandomIv: z.boolean().optional().describe('Whether encrypted values used a random IV (Mule --use-random-iv). Default false.'),
        namedInputs: z.string().optional().describe('Extra named inputs as a JSON array: [{"name":"account","mimeType":"application/json","content":"{...}"}]. Read in the script by name.'),
        multipart: z.string().optional().describe('multipart/form-data parts as a JSON array. Each: {name, contentType, filename, and one of value | contentBase64 (binary) | filePath (Advanced only)}. Read as payload.parts.<name>.content.'),
        modules: z.string().optional().describe('Custom DataWeave modules as a JSON array: [{"name":"MyModule","content":"%dw 2.0\\nfun greet(n)=..."}] so `import x from MyModule` resolves. Use :: in name for packages. Module bodies face the same Safe-mode gate.'),
        trace: z.boolean().optional().describe('When true, captures the script\'s log(...) output and returns it below the result. Use it for a few labelled checkpoints; for everything, use valueTrace.'),
        valueTrace: z.boolean().optional().describe('When true, returns what EVERY expression in the script evaluated to, as a table of `line:col  expression  =>  value`. Use this when the script RUNS but the output is wrong: read the actual intermediate values instead of guessing which stage broke. No log() calls and no edits to the script. Repeated expressions (a map body over 500 items) collapse to one row with a count. Costs a second compile, so leave it off for ordinary runs.'),
      },
      annotations: { readOnlyHint: !advanced, idempotentHint: true, openWorldHint: advanced },
    },
    async (a) => {
      // Effective decrypt settings: arg overrides env (the panel-equivalent).
      const effKey = (a.secureKey && a.secureKey.length ? a.secureKey : process.env.DWSTUDIO_SECURE_KEY) || undefined;
      const effAlgo = a.secureAlgorithm ?? 'AES';
      const effMode = a.secureMode ?? 'CBC';
      const effRiv = a.secureRandomIv ?? false;

      const cfgMap = flattenYamlToMap(a.config, false);
      const secMap = flattenYamlToMap(a.secureConfig, true);

      // Decrypt any ![...] values; refuse loudly if encrypted but no key.
      for (const map of [cfgMap, secMap]) {
        for (const k of Object.keys(map)) {
          if (!isEncryptedValue(map[k])) continue;
          if (!effKey) {
            return err(
              'This config contains encrypted secure values (`![…]`) but no decryption key is available. The ' +
              'server will NOT pass ciphertext to the script. Pass `secureKey` (plus `secureAlgorithm`/`secureMode` ' +
              'if not the AES/CBC default), or set the DWSTUDIO_SECURE_KEY env var on the MCP server.',
            );
          }
          const t = map[k].trim();
          const inner = t.slice(2, t.length - 1);
          try {
            map[k] = await securePropertiesInvoke(extensionRoot, 'decrypt', effAlgo, effMode, effKey, inner, effRiv);
          } catch (e) {
            return err(`Failed to decrypt a secure value (check the key/algorithm/mode): ${(e as Error).message}`);
          }
        }
      }

      const script = substituteProps(a.script, cfgMap, secMap);
      const payload = substituteProps(a.payload ?? '{}', cfgMap, secMap);

      // Safe-mode gate (checked on the SUBSTITUTED script so an injected config
      // value can't smuggle a readUrl past the gate).
      if (!advanced) {
        const reason = safeModeBlockReason(script);
        if (reason) {
          return err(
            `Safe mode rejected this script: ${reason} is not allowed here — this is a pure-transform sandbox ` +
            `with no file or network access, so it was NOT run. Rewrite it without that, or restart the MCP ` +
            `server with DWSTUDIO_MCP_ADVANCED=1.`,
          );
        }
      }

      // Multipart parts (binary-safe). value/contentBase64 run in any mode;
      // filePath reads the user's disk → Advanced only.
      let multipartJson: string | undefined;
      if (a.multipart && a.multipart.trim()) {
        let parts: any[];
        try { parts = JSON.parse(a.multipart); } catch (e) {
          return err(`Invalid \`multipart\` JSON: ${(e as Error).message}. Expected an array of {name, contentType, filename, and one of value|contentBase64|filePath}.`);
        }
        const normalized: any[] = [];
        for (const p of parts) {
          if (p.filePath && !advanced) {
            return err(`Part '${p.name}' uses \`filePath\`, which reads the user's disk and is only allowed in Advanced mode. In Safe mode, pass the bytes as \`contentBase64\` instead.`);
          }
          if (p.contentBase64) {
            try { Buffer.from(String(p.contentBase64).trim(), 'base64'); } catch {
              return err(`Part '${p.name}' has invalid base64 in \`contentBase64\`.`);
            }
          }
          normalized.push({
            name: p.name,
            value: p.value ?? '',
            contentType: p.contentType ?? (p.value != null ? 'text/plain' : 'application/octet-stream'),
            isFile: p.filePath != null,
            filePath: p.filePath,
            filename: p.filename,
            contentBase64: p.contentBase64,
          });
        }
        multipartJson = JSON.stringify(normalized);
      }

      // Extra named inputs. content runs in any mode; filePath → Advanced only.
      let namedInputsJson = '[]';
      if (a.namedInputs && a.namedInputs.trim()) {
        let inputs: any[];
        try { inputs = JSON.parse(a.namedInputs); } catch (e) {
          return err(`Invalid \`named_inputs\` JSON: ${(e as Error).message}. Expected an array of {name, mimeType, and one of content|filePath}.`);
        }
        const normalized: any[] = [];
        for (const ni of inputs) {
          if (ni.filePath && !advanced) {
            return err(`Named input '${ni.name}' uses \`filePath\`, which reads the user's disk and is only allowed in Advanced mode. In Safe mode, pass the data inline as \`content\` instead.`);
          }
          normalized.push({
            name: ni.name,
            content: ni.content ?? '',
            mimeType: ni.mimeType ?? 'application/json',
            filePath: ni.filePath ?? null,
          });
        }
        namedInputsJson = JSON.stringify(normalized);
      }

      // Custom modules — each body faces the SAME safe-mode gate as the script.
      let modulesJson: string | undefined;
      if (a.modules && a.modules.trim() && a.modules.trim() !== '[]') {
        let mods: any[];
        try { mods = JSON.parse(a.modules); } catch (e) {
          return err(`Invalid \`modules\` JSON: ${(e as Error).message}. Expected an array of {name, content}.`);
        }
        if (!advanced) {
          for (const m of mods) {
            const reason = safeModeBlockReason(String(m.content ?? ''));
            if (reason) {
              return err(`Safe mode rejected module '${m.name}': ${reason} is not allowed here — modules run in the same pure-transform sandbox as the script, so nothing was run. Rewrite the module without that, or enable Advanced mode.`);
            }
          }
        }
        modulesJson = JSON.stringify(mods.map((m) => ({ name: m.name, content: m.content })));
      }

      const result = await runDataweave(dw, {
        script,
        payload,
        payloadMimeType: a.inputMimeType ?? 'application/json',
        attributesJson: a.attributes ?? '{}',
        varsJson: a.vars ?? '{}',
        namedInputsJson,
        // NEVER pass classpath — agents must not hot-add JARs.
        multipartPartsJson: multipartJson ?? null,
        modulesJson: modulesJson ?? null,
        trace: a.trace === true,
        valueTrace: a.valueTrace === true,
      });

      // Trace logs appended below the result so the agent can inspect intermediate
      // pipeline values without restructuring the output.
      const traceBlock = result.logs && result.logs.length
        ? `\n\n--- trace (log output, ${result.logs.length} line${result.logs.length === 1 ? '' : 's'}) ---\n${result.logs.join('\n')}`
        : '';

      // Value trace: what each expression actually evaluated to. A flat table, not
      // JSON — a model reads this, and a JSON wrapper would cost tokens without
      // adding meaning. Errored rows keep only the FIRST LINE of the exception: the
      // full stack is already in the ERROR block, and repeating it per row buried
      // the values it is there to show.
      const valueTraceBlock = result.trace && result.trace.length
        ? `\n\n--- value trace (${result.trace.length} expression${result.trace.length === 1 ? '' : 's'}) ---\n` +
          result.trace.map((r) => {
            const times = r.count > 1 ? ` x${r.count}` : '';
            const val = r.error ? `!! ${r.error.split('\n')[0]}` : r.value;
            return `${r.line}:${r.column}  ${r.expression}  =>  (${r.type})${times} ${val}`;
          }).join('\n')
        : '';

      if (result.error) {
        const where = result.error_line != null
          ? ` (line ${result.error_line}${result.error_column != null ? `, col ${result.error_column}` : ''})`
          : '';
        return err(`ERROR${where}:\n${result.error}${traceBlock}${valueTraceBlock}`);
      }
      return ok(result.output + traceBlock + valueTraceBlock);
    },
  );

  // 2) secure_properties -----------------------------------------------------
  register(
    'secure_properties',
    {
      title: 'MuleSoft secure-properties encrypt/decrypt',
      description:
        'Encrypt or decrypt MuleSoft secure-properties values, byte-compatible with the Mule runtime (uses the ' +
        'official secure-properties-tool). operation:"encrypt" turns plaintext into the `![base64]` form for a ' +
        'secure config; operation:"decrypt" reads one (accepts the inner base64 OR the full `![...]`). Default ' +
        'cipher AES/CBC. Pass `value` for one, or `values` (a JSON array) for a whole config file at once — read ' +
        'the file yourself, pass the values you judge to be secrets, and write the results back in place; ' +
        'already-encrypted values passed to encrypt (and plaintext passed to decrypt) come back untouched, so ' +
        're-running is safe. Pure local crypto — allowed in Safe mode.',
      inputSchema: {
        operation: z.string().describe('"encrypt" or "decrypt".'),
        value: z.string().optional().describe('Plaintext to encrypt, or ciphertext (inner base64 or full ![...]) to decrypt. Omit when using `values`.'),
        values: z.string().optional().describe('A batch, as a JSON array of strings: ["hunter2","s3cret"]. Results come back in the same order, one per line — one call for a whole config file.'),
        key: z.string().describe('The secure-properties key (e.g. a 16/24/32-char AES key).'),
        algorithm: z.string().optional().describe('AES (default) | Blowfish | DES | DESede | RC2.'),
        mode: z.string().optional().describe('CBC (default) | CFB | ECB | OFB.'),
        useRandomIv: z.boolean().optional().describe('Whether a random IV was/should be used (Mule --use-random-iv). Default false.'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (a) => {
      const op = String(a.operation ?? '').trim().toLowerCase();
      if (op !== 'encrypt' && op !== 'decrypt') return err('`operation` must be "encrypt" or "decrypt".');

      // One value or a batch — a config file is the common case, and calling this
      // tool twelve times for one file is miserable for everyone.
      let items: string[];
      const batch = typeof a.values === 'string' && a.values.trim() !== '' && a.values.trim() !== '[]';
      if (batch) {
        try { items = JSON.parse(a.values as string) as string[]; }
        catch (e) { return err(`Invalid \`values\` JSON: ${(e as Error).message}. Expected an array of strings.`); }
      } else if (typeof a.value === 'string') {
        items = [a.value];
      } else {
        return err('Pass `value` (one string) or `values` (a JSON array of strings).');
      }

      const out: string[] = [];
      for (const raw of items) {
        const t = raw.trim();
        const wrapped = t.length > 3 && t.startsWith('![') && t.endsWith(']');
        // Already in the target state — hand it back untouched. Double-encrypting is
        // the classic way to make a config file unrecoverable. Only a batch skips
        // unwrapped values on decrypt: a single `value` may legitimately be bare base64.
        if ((op === 'encrypt' && wrapped) || (op === 'decrypt' && batch && !wrapped)) { out.push(raw); continue; }
        const value = op === 'decrypt' && wrapped ? t.slice(2, t.length - 1) : raw;
        try {
          const r = await securePropertiesInvoke(extensionRoot, op, a.algorithm ?? 'AES', a.mode ?? 'CBC', a.key, value, a.useRandomIv ?? false);
          out.push(op === 'encrypt' ? `![${r}]` : r);
        } catch (e) {
          return err(`secure-properties ${op} failed on value ${out.length + 1} of ${items.length} (check key / algorithm / mode): ${(e as Error).message}`);
        }
      }
      return ok(out.join('\n'));
    },
  );

  // 3) migrate_dw_1_to_2 -----------------------------------------------------
  register(
    'migrate_dw_1_to_2',
    {
      title: 'Migrate DataWeave 1.0 → 2.0',
      description:
        'Best-effort migrate a DataWeave 1.0 script to 2.0 syntax (header, %output/%var/%function/%input ' +
        'directives, flowVars→vars, inboundProperties→attributes, :string→String, etc.). Returns the migrated ' +
        'script with `// ⚠` comments flagging constructs that need manual work. HEURISTIC — ALWAYS run the result ' +
        'through validate_and_run_dataweave before presenting it.',
      inputSchema: { script: z.string().describe('A DataWeave 1.0 script to migrate to 2.0 syntax.') },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (a) => ok(migrateDW1to2(a.script).output),
  );

  // 4) format_dataweave ------------------------------------------------------
  register(
    'format_dataweave',
    {
      title: 'Format DataWeave',
      description:
        "Pretty-print / reformat a DataWeave script using the engine's own IDE formatter (canonical indentation " +
        '& spacing — the same one DataWeave editors use). Returns the formatted script.',
      inputSchema: { script: z.string().describe('A DataWeave script to pretty-print / reformat.') },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (a) => {
      try { return ok(await formatDataweave(dw, a.script)); }
      catch (e) { return err(`Format failed: ${(e as Error).message}`); }
    },
  );

  // 5) dw_function_reference -------------------------------------------------
  register(
    'dw_function_reference',
    {
      title: 'DataWeave function reference (offline)',
      description:
        'OFFLINE DataWeave 2.12 standard-library reference — every function the bundled engine has, with signatures, descriptions, ' +
        "and runnable examples. Pass `name` for one function's full doc, `search` for a keyword match list, or no " +
        'args to list every function name. Use THIS instead of recalling/web-searching DW syntax.',
      inputSchema: {
        name: z.string().optional().describe('Exact function name for the full doc (e.g. "map", "++", "groupBy").'),
        search: z.string().optional().describe('Keyword to search names/signatures/descriptions; returns a compact match list.'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (a) => {
      let obj: Record<string, any>;
      try { obj = loadMcpJson(extensionRoot, 'dw_functions.json') as Record<string, any>; }
      catch (e) { return err((e as Error).message); }

      const name = a.name?.trim();
      if (name) {
        const key = Object.keys(obj).find((k) => k.toLowerCase() === name.toLowerCase());
        if (key) return ok(formatFnDoc(key, obj[key]));
        const nl = name.toLowerCase();
        const near = Object.keys(obj).filter((k) => k.toLowerCase().includes(nl)).slice(0, 40);
        return err(near.length
          ? `No exact match for '${name}'. Closest names: ${near.join(', ')}`
          : `No DataWeave function named '${name}'. Use \`search\`, or omit args to list all.`);
      }
      const search = a.search?.trim();
      if (search) {
        const ql = search.toLowerCase();
        const lines: string[] = [];
        for (const [k, v] of Object.entries(obj)) {
          if (`${k} ${JSON.stringify(v)}`.toLowerCase().includes(ql)) {
            const sig = v?.overloads?.[0]?.signature ?? '';
            lines.push(`${k} — ${sig}`);
          }
        }
        lines.sort();
        return ok(lines.length ? `${lines.length} match(es) for '${search}':\n${lines.join('\n')}` : `No functions match '${search}'.`);
      }
      const names = Object.keys(obj).sort();
      return ok(`${names.length} DataWeave functions (pass \`name\` for full docs, \`search\` to filter):\n${names.join(', ')}`);
    },
  );

  // 6) dw_cookbook -----------------------------------------------------------
  register(
    'dw_cookbook',
    {
      title: 'DataWeave cookbook (offline)',
      description:
        'OFFLINE DataWeave cookbook — validated recipes (each runs cleanly on this engine) for common MuleSoft ' +
        'tasks: array/object/string transforms, XML/CSV, dates, error handling. Pass `id` for a full recipe, ' +
        '`search`/`category` to filter, or no args to list all. Grab a verified starting pattern before writing a ' +
        'complex transform.',
      inputSchema: {
        id: z.string().optional().describe('Recipe id for the full recipe (sample input, script, expected output).'),
        search: z.string().optional().describe('Keyword to search recipe name/description/script.'),
        category: z.string().optional().describe('Filter by category, e.g. "Array Manipulation", "XML Handling".'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (a) => {
      let arr: any[];
      try { arr = loadMcpJson(extensionRoot, 'dw_cookbook.json') as any[]; }
      catch (e) { return err((e as Error).message); }
      const g = (r: any, k: string) => String(r?.[k] ?? '');

      const id = a.id?.trim();
      if (id) {
        const r = arr.find((x) => g(x, 'id').toLowerCase() === id.toLowerCase());
        return r ? ok(formatRecipe(r)) : err(`No recipe with id '${id}'. Omit \`id\` to list all.`);
      }
      const search = a.search?.trim().toLowerCase();
      const category = a.category?.trim().toLowerCase();
      const lines: string[] = [];
      for (const r of arr) {
        if (category && !g(r, 'category').toLowerCase().includes(category)) continue;
        if (search && !`${g(r, 'name')} ${g(r, 'description')} ${g(r, 'script')}`.toLowerCase().includes(search)) continue;
        lines.push(`${g(r, 'id')} — ${g(r, 'name')} [${g(r, 'category')} · ${g(r, 'difficulty')}]`);
      }
      return ok(lines.length ? `${lines.length} recipe(s) (pass \`id\` for the full recipe):\n${lines.join('\n')}` : 'No recipes match. Omit args to list all.');
    },
  );
  // 7) run_dataweave_tests ---------------------------------------------------
  register(
    'run_dataweave_tests',
    {
      title: 'Run a dw::test suite',
      description:
        'Run a `dw::test` suite on the local engine and report which assertions passed. Use this to PROVE a ' +
        'transform is right instead of eyeballing one sample: write a suite whose body is a `describedBy` block ' +
        'containing `in do { ... must ... }` tests, and this returns a pass/fail tree plus the failure message for ' +
        'anything that broke. `dw::test::Tests` and `dw::test::Asserts` are compiled into this engine, so just ' +
        'import them. Prefer this over validate_and_run_dataweave whenever the user asks for tests, or whenever a ' +
        'transform has edge cases worth pinning down.',
      inputSchema: {
        suite: z.string().describe('A dw::test suite. Its body must be a single `describedBy` block.'),
        payload: z.string().optional().describe('Optional sample payload the suite can reference as `payload`.'),
        payloadMimeType: z.string().optional().describe('MIME type of payload. Default application/json.'),
      },
      annotations: { readOnlyHint: !advanced, idempotentHint: true, openWorldHint: advanced },
    },
    async (a) => {
      const suite = String(a.suite ?? '').trim();
      if (!suite) return err('`suite` is empty. Pass a dw::test suite whose body is a `describedBy` block.');
      // A suite is an ordinary script that happens to return a test report, so it
      // goes through the same runner — and therefore the same Safe-mode gate.
      if (!advanced) {
        const reason = safeModeBlockReason(suite);
        if (reason) return err(`Safe mode rejected this suite: ${reason} is not allowed here — it was NOT run.`);
      }
      const result = await runDataweave(dw, {
        script: suite,
        payload: a.payload ?? '{}',
        payloadMimeType: a.payloadMimeType ?? 'application/json',
        attributesJson: '{}',
        varsJson: '{}',
        namedInputsJson: '[]',
      });
      if (result.error) {
        const where = result.error_line != null ? ` (line ${result.error_line})` : '';
        return err(`The suite did not compile or run${where}:\n${result.error}`);
      }
      let report: any;
      try { report = JSON.parse(result.output); }
      catch {
        return err('The suite ran but did not return a test report — its body must be a `describedBy` block. It returned:\n' + result.output);
      }
      // Only leaves are tests. A `describedBy` block reports its own status as OK
      // even when the tests inside it failed, so pass/fail is counted from leaves.
      let passed = 0, failed = 0;
      const lines: string[] = [];
      const walk = (node: any, depth: number) => {
        const indent = '  '.repeat(depth);
        const name = String(node?.name ?? '(unnamed)');
        const kids: any[] = Array.isArray(node?.tests) ? node.tests : [];
        if (kids.length) {
          lines.push(`${indent}${name}`);
          for (const k of kids) walk(k, depth + 1);
          return;
        }
        const isOk = node?.status === 'OK';
        if (isOk) passed++; else failed++;
        lines.push(`${indent}${isOk ? 'PASS' : 'FAIL'} ${name}`);
        if (!isOk && node?.errorMessage) {
          lines.push(`${indent}     ${String(node.errorMessage).split('\n').join(`\n${indent}     `)}`);
        }
      };
      walk(report, 0);
      const text = `${lines.join('\n')}\n${passed} passed, ${failed} failed in ${result.execution_time_ms}ms`;
      return failed > 0 ? err(text) : ok(text);
    },
  );

  // 8) lint_dataweave --------------------------------------------------------
  register(
    'lint_dataweave',
    {
      title: 'Type-check and lint DataWeave',
      description:
        "Check a DataWeave script WITHOUT running it — the engine's own type checker and linter. Reports " +
        'undefined references, wrong argument counts, syntax errors, type mismatches, insecure hash algorithms ' +
        '(MD5/SHA-1), leftover log() calls and unused imports, each with a line/column and a rule id. Use this when ' +
        'you have no sample payload to run against, when reviewing a script someone else wrote, or as a fast first ' +
        'pass before validate_and_run_dataweave. A clean script returns nothing. This does NOT replace running: it ' +
        'cannot tell you the output is wrong, only that the code is.',
      inputSchema: {
        script: z.string().describe('The DataWeave script to check. A full script with a header is best; a bare body is accepted.'),
        payload: z.string().optional().describe('Optional sample payload, so `payload.field` references can be resolved.'),
        payloadMimeType: z.string().optional().describe('MIME type of payload. Default application/json.'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (a) => {
      // Type checking compiles the script, which is enough to load a Java class,
      // so it goes through the same Safe-mode gate as a run.
      if (!advanced) {
        const reason = safeModeBlockReason(a.script);
        if (reason) return err(`Safe mode rejected this script: ${reason} is not allowed here — it was NOT compiled.`);
      }
      let res: any;
      try {
        res = await toolingQuery(dw, 'typeCheck', a.script, 0, a.payload ?? '', undefined, undefined, a.payloadMimeType ?? 'application/json', 1);
      } catch (e) {
        return err(`Type check failed: ${(e as Error).message}`);
      }
      const messages: any[] = Array.isArray(res?.messages) ? res.messages : [];
      if (!messages.length) return ok('No problems found.');
      const lines: string[] = [];
      for (const m of messages) {
        const line = m?.location?.startLine, col = m?.location?.startColumn;
        const at = line != null ? (col != null ? `line ${line}, col ${col}` : `line ${line}`) : 'somewhere';
        lines.push(`[${m?.severity ?? 'error'}] ${at} — ${m?.message ?? ''} (${m?.code ?? ''})`);
        const fixes = (Array.isArray(m?.quickFixes) ? m.quickFixes : []).map((f: any) => f?.name).filter(Boolean);
        if (fixes.length) lines.push(`    available fixes: ${fixes.join(', ')}`);
      }
      lines.push(`\n${messages.length} problem${messages.length === 1 ? '' : 's'} found.`);
      return ok(lines.join('\n'));
    },
  );
}
