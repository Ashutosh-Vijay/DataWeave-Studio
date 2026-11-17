/**
 * Best-effort DataWeave 1.0 -> 2.0 source migration (client-side). Extracted
 * from ScriptEditor so it can be unit-tested in isolation.
 *
 * VENDORED COPY of ../../../src/dwMigrate.ts (the desktop UI's migrator). The
 * MCP server is a standalone Node process built only from vscode-extension/src,
 * so it can't reach the repo-root src/ file; this 112-line, import-free, stable
 * heuristic is copied rather than cross-imported. Keep in sync if the original
 * changes (rare — migration rules are settled).
 */
export interface MigrationChange { label: string; count: number; kind: 'ok' | 'warn' }

/** Mule 4's HTTP listener attribute for each Mule 3 `http.*` inbound property. */
const INBOUND_HTTP: Record<string, string> = {
  'http.method': 'attributes.method',
  'http.query.params': 'attributes.queryParams',
  'http.uri.params': 'attributes.uriParams',
  'http.query.string': 'attributes.queryString',
  'http.request.path': 'attributes.requestPath',
  'http.request.uri': 'attributes.requestUri',
  'http.remote.address': 'attributes.remoteAddress',
  'http.version': 'attributes.version',
  'http.scheme': 'attributes.scheme',
  'http.listener.path': 'attributes.listenerPath',
  'http.relative.path': 'attributes.relativePath',
};

export function migrateDW1to2(src: string): { output: string; warnings: string[]; changes: MigrationChange[] } {
  const lines = src.split('\n');
  const out: string[] = [];
  const warnings: string[] = [];
  // Tally of what actually got rewritten so the modal can show a summary.
  const tally: Record<string, number> = {};
  const bump = (k: string) => { tally[k] = (tally[k] || 0) + 1; };

  for (const raw of lines) {
    let line = raw;

    // %dw 1.0 → %dw 2.0
    line = line.replace(/^(\s*)%dw\s+1\.0\b/, (_, s) => { bump('header'); return `${s}%dw 2.0`; });

    // %input name mime → input name mime
    line = line.replace(/^(\s*)%input\b/, (_, s) => { bump('directive'); return `${s}input`; });

    // %output mime → output mime
    line = line.replace(/^(\s*)%output\b/, (_, s) => { bump('directive'); return `${s}output`; });

    // %var name = expr → var name = expr
    line = line.replace(/^(\s*)%var\b/, (_, s) => { bump('directive'); return `${s}var`; });

    // %namespace prefix = uri → (removed — DW 2.0 uses import)
    if (/^\s*%namespace\b/.test(line)) {
      out.push('// TODO: convert %namespace to import statement');
      warnings.push('%namespace: convert manually to `import * from <namespace>`');
      bump('warn');
      out.push(line.replace(/^\s*%namespace\b/, '// %namespace'));
      continue;
    }

    // %function name(params) = body → fun name(params) = body
    line = line.replace(/^(\s*)%function\b/, (_, s) => { bump('directive'); return `${s}fun`; });

    // flowVars → vars
    line = line.replace(/\bflowVars\b/g, () => { bump('mule'); return 'vars'; });

    // Mule 3 HTTP inbound properties -> the Mule 4 HTTP listener attributes, in
    // every spelling: ["http.x"], ['http.x'], ."http.x", .'http.x' (MuleSoft's
    // converter writes the third). An unknown http.* key falls to the headers rule.
    line = line.replace(/\binboundProperties(?:\[\s*["']|\.["'])(http\.[a-z.]+)["'](?:\s*\])?/g, (whole, key: string) => {
      const attr = INBOUND_HTTP[key];
      if (!attr) return whole;
      bump('mule');
      return attr;
    });
    // inboundProperties."header-name" → attributes.headers."header-name"
    line = line.replace(/\binboundProperties\b/g, () => { bump('mule'); return 'attributes.headers'; });

    // outboundProperties → (no direct equivalent)
    if (/\boutboundProperties\b/.test(line)) {
      warnings.push('outboundProperties: no direct DW 2.0 equivalent; remove it or pass it as a named input');
      bump('warn');
    }

    // sessionVars → (no direct equivalent)
    if (/\bsessionVars\b/.test(line)) {
      warnings.push('sessionVars: no direct DW 2.0 equivalent');
      bump('warn');
    }

    // as :string → as String  (type coercion syntax)
    const beforeCoerce = line;
    line = line.replace(/\bas\s+:string\b/gi, 'as String');
    line = line.replace(/\bas\s+:number\b/gi, 'as Number');
    line = line.replace(/\bas\s+:boolean\b/gi, 'as Boolean');
    line = line.replace(/\bas\s+:date\b/gi, 'as Date');
    line = line.replace(/\bas\s+:datetime\b/gi, 'as DateTime');
    line = line.replace(/\bas\s+:localtime\b/gi, 'as LocalTime');
    line = line.replace(/\bas\s+:localdatetime\b/gi, 'as LocalDateTime');
    line = line.replace(/\bas\s+:time\b/gi, 'as Time');
    line = line.replace(/\bas\s+:object\b/gi, 'as Object');
    line = line.replace(/\bas\s+:array\b/gi, 'as Array');
    if (line !== beforeCoerce) bump('coerce');

    // @(...) metadata annotation — warn
    if (/@\(/.test(line)) {
      warnings.push('@(...) metadata annotations: syntax may differ in DW 2.0');
      bump('warn');
    }

    // p("key") — not available in standalone DW CLI; use Config YAML + ${key} substitution
    if (/\bp\s*\(/.test(line) && !/\bapp\b/.test(line)) {
      warnings.push('p("key"): not available in DW CLI. Use ${key} / ${secure::key} placeholders with the Config YAML panel instead.');
      bump('warn');
    }

    // lookup("flowName", payload) → warn — no equivalent
    if (/\blookup\s*\(/.test(line)) {
      warnings.push('lookup(): not available in DW 2.0 standalone CLI');
      bump('warn');
    }

    out.push(line);
  }

  let result = out.join('\n');
  if (warnings.length > 0) {
    const header = warnings.map(w => `// ⚠ ${w}`).join('\n');
    result = header + '\n' + result;
  }

  const changes: MigrationChange[] = [];
  if (tally.header) changes.push({ label: '%dw 1.0 → 2.0', count: tally.header, kind: 'ok' });
  if (tally.directive) changes.push({ label: '%output / %var / %function / %input → 2.0', count: tally.directive, kind: 'ok' });
  if (tally.mule) changes.push({ label: 'flowVars / inboundProperties → vars / attributes', count: tally.mule, kind: 'ok' });
  if (tally.coerce) changes.push({ label: ':string / :number → String / Number', count: tally.coerce, kind: 'ok' });
  if (tally.warn) changes.push({ label: 'No direct DW 2.0 equivalent', count: tally.warn, kind: 'warn' });

  return { output: result, warnings, changes };
}
