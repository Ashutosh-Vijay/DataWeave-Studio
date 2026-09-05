/**
 * Whole-file secure properties: find every value in a config, encrypt or
 * decrypt the ones that need it, and hand back the same file.
 *
 * The Secure Properties tool beside this one does one value at a time, which is
 * fine for a single password and miserable for a config with a dozen. This
 * works on the file.
 *
 * Two rules shape everything here:
 *
 *  - **Never re-encrypt.** A value already written as `![...]` is left exactly
 *    as it is, and decrypt ignores everything that isn't. Running either
 *    direction twice is a no-op, and a half-encrypted file (the normal state of
 *    a config someone has been editing) comes out right.
 *  - **Rewrite lines, don't reserialise.** Parsing YAML and dumping it back
 *    would lose every comment, blank line and quoting choice in the file. So
 *    the scanner records the character range of each *value* and only those
 *    ranges are replaced; everything else in the file survives byte for byte.
 *
 * The crypto itself is MuleSoft's own `secure-properties-tool.jar` (see
 * cryptoUtils), so output is what the Mule runtime decrypts.
 */

import { encryptValue, decryptValue, EncryptionSettings } from './cryptoUtils';

export type ConfigFormat = 'yaml' | 'properties';

export interface ConfigField {
  /** 0-based index of the line this value sits on. */
  line: number;
  /** Dotted path, e.g. `db.password`. Display only. */
  path: string;
  /** The value with any surrounding quotes and escapes removed. */
  value: string;
  /** Character range of the value token *including* quotes, within its line. */
  start: number;
  end: number;
  /** True when the value is already `![...]`. */
  encrypted: boolean;
  /** Set when this line can't be rewritten safely; the UI shows the reason. */
  skip?: string;
}

const ENCRYPTED_RE = /^!\[(.*)\]$/;

/** Key names that usually hold a secret. Powers the "Secrets only" selection —
 *  a starting point for the user to adjust, never something applied silently. */
const SECRET_HINTS =
  /(pass|pwd|secret|token|credential|private|apikey|api_key|access_key|salt|signature|cert)/i;

export function looksLikeSecret(path: string): boolean {
  return SECRET_HINTS.test(path);
}

/**
 * Which syntax is this? Counted rather than guessed from the first line, since
 * a YAML file often opens with comments and a properties file with blanks.
 */
export function detectFormat(text: string): ConfigFormat {
  let properties = 0;
  let yaml = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    if (/^[^=\s:]+\s*=/.test(line)) properties++;
    else if (/^[^:]+:(\s|$)/.test(line)) yaml++;
  }
  return properties > yaml ? 'properties' : 'yaml';
}

export function scanConfig(text: string, format: ConfigFormat): ConfigField[] {
  return format === 'properties' ? scanProperties(text) : scanYaml(text);
}

/**
 * YAML, one line at a time.
 *
 * Indentation drives the dotted path, so `db:` then `  password:` reports as
 * `db.password`. Anything whose value cannot be replaced in place — a block
 * scalar, a flow collection, a list item — is reported with a reason rather
 * than quietly dropped, because a value silently left in plaintext is the worst
 * possible outcome for this tool.
 */
function scanYaml(text: string): ConfigField[] {
  const out: ConfigField[] = [];
  const parents: { indent: number; key: string }[] = [];

  text.split(/\r?\n/).forEach((raw, line) => {
    if (!raw.trim() || raw.trimStart().startsWith('#')) return;

    // A list item's value has no key to address it by.
    if (/^\s*-\s/.test(raw)) return;

    const m = raw.match(/^(\s*)([^:#\s][^:#]*?)(\s*:\s*)(.*)$/);
    if (!m) return;
    const [, indent, key, sep, rest] = m;

    while (parents.length && parents[parents.length - 1].indent >= indent.length) parents.pop();

    const trimmed = rest.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      parents.push({ indent: indent.length, key: key.trim() });
      return;
    }

    const path = [...parents.map((p) => p.key), key.trim()].join('.');
    const start = indent.length + key.length + sep.length;
    const field: ConfigField = { line, path, value: '', start, end: raw.length, encrypted: false };

    if (/^[|>]/.test(trimmed)) {
      out.push({ ...field, skip: 'multi-line block' });
      return;
    }
    if (/^[[{]/.test(trimmed)) {
      out.push({ ...field, skip: 'list or map' });
      return;
    }
    if (/^[&*]/.test(trimmed)) {
      out.push({ ...field, skip: 'anchor or alias' });
      return;
    }
    // `![...]` is the one tag we understand; any other is someone else's meaning.
    if (trimmed.startsWith('!') && !trimmed.startsWith('![') && !trimmed.startsWith('"')) {
      out.push({ ...field, skip: 'tagged value' });
      return;
    }

    const token = readYamlScalar(raw, start);
    const value = token.value;
    if (!value) {
      out.push({ ...field, end: token.end, skip: 'empty' });
      return;
    }
    // A `${...}` reference points at a value, it isn't one — and encrypting a
    // string that merely contains one would break the substitution too.
    if (/\$\{[^}]*\}/.test(value)) {
      out.push({ ...field, value, end: token.end, skip: 'placeholder' });
      return;
    }
    out.push({ ...field, value, end: token.end, encrypted: ENCRYPTED_RE.test(value) });
  });

  return out;
}

/** The scalar starting at `from`, honouring quotes and ` #` comments. */
function readYamlScalar(raw: string, from: number): { value: string; end: number } {
  const first = raw[from];
  if (first === '"' || first === "'") {
    let i = from + 1;
    while (i < raw.length) {
      if (first === '"' && raw[i] === '\\') { i += 2; continue; }
      if (raw[i] === first) {
        // '' is an escaped single quote inside a single-quoted scalar.
        if (first === "'" && raw[i + 1] === "'") { i += 2; continue; }
        break;
      }
      i++;
    }
    const inner = raw.slice(from + 1, i);
    const value = first === '"'
      ? inner.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      : inner.replace(/''/g, "'");
    return { value, end: Math.min(i + 1, raw.length) };
  }
  // Unquoted: a `#` only starts a comment when preceded by whitespace.
  const commentAt = raw.slice(from).search(/\s#/);
  const slice = commentAt >= 0 ? raw.slice(from, from + commentAt) : raw.slice(from);
  return { value: slice.trimEnd(), end: from + slice.trimEnd().length };
}

/**
 * Java properties. Simpler than YAML: no nesting, no quoting, and `#`/`!` start
 * a comment only at the beginning of a line.
 */
function scanProperties(text: string): ConfigField[] {
  const out: ConfigField[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, line) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) return;
    // A backslash at end of line continues the value onto the next one; the
    // value is not confined to this line, so leave it alone.
    if (/\\$/.test(raw)) {
      const m0 = raw.match(/^(\s*)([^=:\s][^=:]*?)(\s*[=:]\s*)/);
      if (m0) out.push({ line, path: m0[2].trim(), value: '', start: raw.length, end: raw.length, encrypted: false, skip: 'continued over lines' });
      return;
    }
    // Only a continuation line reaches here without a separator; skip it.
    const m = raw.match(/^(\s*)([^=:\s][^=:]*?)(\s*[=:]\s*)(.*)$/);
    if (!m) return;
    const [, indent, key, sep, rest] = m;

    const start = indent.length + key.length + sep.length;
    const value = unescapeProperties(rest);
    const field: ConfigField = {
      line,
      path: key.trim(),
      value,
      start,
      end: raw.length,
      encrypted: ENCRYPTED_RE.test(value),
    };
    if (!value) out.push({ ...field, skip: 'empty' });
    else if (/\$\{[^}]*\}/.test(value)) out.push({ ...field, skip: 'placeholder' });
    else out.push(field);
  });

  return out;
}

function unescapeProperties(v: string): string {
  return v.replace(/\\(n|t|r|=|:|\\| )/g, (_, c) =>
    c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c);
}

/** Escape for a properties *value* position, where `=` and `:` are literal. */
function escapeProperties(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

/**
 * Render a value as a YAML scalar, quoting only when it has to.
 *
 * An encrypted value always gets quotes: a bare `![...]` reads as "apply tag
 * `!` to a flow sequence" to every YAML parser there is — including the one
 * behind Studio's own Secure Config panel — and Mule is perfectly happy with
 * the quoted form.
 */
export function yamlScalar(v: string): string {
  const needsQuotes =
    v === '' ||
    /^[!&*>|%@`]/.test(v) ||
    /^[-?:]\s/.test(v) ||
    /[:#'"\\\n\r\t]/.test(v) ||
    v !== v.trim();
  if (!needsQuotes) return v;
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`;
}

/** Replace the value ranges named by `edits`, leaving every other byte alone. */
export function applyEdits(
  text: string,
  edits: { line: number; start: number; end: number; text: string }[],
): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  for (const e of edits) {
    const raw = lines[e.line];
    if (raw === undefined) continue;
    lines[e.line] = raw.slice(0, e.start) + e.text + raw.slice(e.end);
  }
  return lines.join(eol);
}

export interface ConvertOutcome {
  text: string;
  changed: number;
  failures: { path: string; message: string }[];
}

/**
 * Encrypt or decrypt the given fields and return the rewritten file.
 *
 * Every value costs one JVM start, so this runs a few at a time rather than all
 * at once — fifty parallel `java` processes is not a kindness. `onProgress`
 * reports completions so a long file doesn't look frozen.
 */
export async function convertConfig(
  text: string,
  format: ConfigFormat,
  fields: ConfigField[],
  direction: 'encrypt' | 'decrypt',
  key: string,
  settings: EncryptionSettings,
  onProgress?: (done: number, total: number) => void,
): Promise<ConvertOutcome> {
  const targets = fields.filter(
    (f) => !f.skip && (direction === 'encrypt' ? !f.encrypted : f.encrypted),
  );
  const edits: { line: number; start: number; end: number; text: string }[] = [];
  const failures: { path: string; message: string }[] = [];
  let done = 0;

  const CONCURRENCY = 4;
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= targets.length) return;
      const f = targets[i];
      try {
        let replacement: string;
        if (direction === 'encrypt') {
          replacement = await encryptValue(f.value, key, settings);
        } else {
          const inner = f.value.match(ENCRYPTED_RE)?.[1] ?? f.value;
          replacement = await decryptValue(inner, key, settings);
        }
        edits.push({
          line: f.line,
          start: f.start,
          end: f.end,
          text: format === 'yaml' ? yamlScalar(replacement) : escapeProperties(replacement),
        });
      } catch (e) {
        failures.push({ path: f.path, message: (e as Error).message });
      } finally {
        done++;
        onProgress?.(done, targets.length);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  return { text: applyEdits(text, edits), changed: edits.length, failures };
}
