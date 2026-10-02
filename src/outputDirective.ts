/**
 * The script's `output` directive, read and rewritten for the output format
 * menu. Picking a format edits the script, as in MuleSoft's playground, so what
 * runs here is exactly what would run in Mule. "Auto" removes the directive,
 * and the engine server then picks the format by Mule's rule.
 */

export const OUTPUT_FORMATS: { mime: string; label: string }[] = [
  { mime: 'application/json', label: 'JSON' },
  { mime: 'application/xml', label: 'XML' },
  { mime: 'application/csv', label: 'CSV' },
  { mime: 'application/yaml', label: 'YAML' },
  { mime: 'text/plain', label: 'Text' },
  { mime: 'application/dw', label: 'DataWeave' },
  { mime: 'application/x-ndjson', label: 'NDJSON' },
  { mime: 'application/xlsx', label: 'Excel' },
  { mime: 'multipart/form-data', label: 'Multipart' },
  { mime: 'application/x-www-form-urlencoded', label: 'URL-encoded' },
  { mime: 'application/java', label: 'Java' },
];

export function formatLabel(mime: string): string {
  const base = mime.split(';')[0].trim();
  return OUTPUT_FORMATS.find((f) => f.mime === base)?.label ?? base;
}

/** The mime type the script's header declares, or null when it has no `output` line. */
export function declaredOutput(script: string): string | null {
  const lines = script.split(/\r?\n/);
  const sep = lines.findIndex((l) => l.trim() === '---');
  if (sep < 0) return null;
  for (const l of lines.slice(0, sep)) {
    const m = l.match(/^\s*output\s+([^\s]+)/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Sets the script's output directive to `mime`, or removes it when `mime` is
 * null. A script with no header gets one. Only the directive line changes; any
 * writer properties on it go too, since they belong to the old format.
 */
export function setOutput(script: string, mime: string | null): string {
  const eol = script.includes('\r\n') ? '\r\n' : '\n';
  const lines = script.split(/\r?\n/);
  const sep = lines.findIndex((l) => l.trim() === '---');
  const directive = mime ? `output ${mime}` : null;

  if (sep < 0) {
    if (!directive) return script;
    const dw = lines.findIndex((l) => l.trim().startsWith('%dw'));
    // A header with no separator yet: add the directive and close it.
    if (dw >= 0) {
      const kept = lines.filter((l) => !/^\s*output\s/.test(l));
      const at = kept.findIndex((l) => l.trim().startsWith('%dw')) + 1;
      kept.splice(at, 0, directive);
      return [...kept, '---'].join(eol);
    }
    // Just an expression: give it a header.
    return ['%dw 2.0', directive, '---', ...lines].join(eol);
  }

  const outIdx = lines.slice(0, sep).findIndex((l) => /^\s*output\s/.test(l));
  if (outIdx >= 0) {
    if (directive) lines[outIdx] = directive;
    else lines.splice(outIdx, 1);
  } else if (directive) {
    lines.splice(sep, 0, directive);
  }
  return lines.join(eol);
}
