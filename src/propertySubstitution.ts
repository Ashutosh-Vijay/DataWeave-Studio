/**
 * Mule property placeholder substitution.
 *
 * Studio's Config / Secure Config YAML panels let you run production Mule
 * DataWeave unchanged: `${key}` and `${secure::key}` placeholders are replaced
 * with values from the YAML before each run. Shared by the single-script app
 * (App.tsx, which adds an async `![...]`-decrypting variant on top of these)
 * and the Flow Designer.
 */
import yaml from 'js-yaml';
import { decryptFlatMap, hasEncryptedValues, DEFAULT_ENCRYPTION_SETTINGS } from './cryptoUtils';
import { detectFormat } from './configCrypto';
import type { EncryptionSettings } from './types';

/**
 * Pre-process secure-config YAML before js-yaml gets it. The `!` character
 * is a YAML tag indicator, so a bare `![Base64Blob]` value gets parsed as
 * "apply tag `!` to flow sequence" — which either throws or returns junk.
 * We replace each bare `![...]` value with its quoted-string equivalent so
 * js-yaml parses it as a literal string. The leading `![` stays in the
 * value, so hasEncryptedValues + decryptFlatMap still find and decrypt it.
 */
export function escapeBangBracketValues(yamlSource: string): string {
  return yamlSource.replace(
    /(:\s*)(!\[[^\]\n]+\])(\s*$)/gm,
    (_, prefix, value, trailing) => `${prefix}"${value.replace(/"/g, '\\"')}"${trailing}`,
  );
}

/**
 * Flatten a nested YAML object into dot-notation keys.
 * e.g. { salesforce: { path: "/api" } } → { "salesforce.path": "/api" }
 */
export function flattenYaml(obj: unknown, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenYaml(value, fullKey));
      } else {
        result[fullKey] = String(value ?? '');
      }
    }
  }
  return result;
}

/**
 * A .properties file as a flat key -> value map. Handles `=`, `:` and
 * whitespace separators, `#` / `!` comments and backslash line continuations.
 */
export function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const unescape = (v: string) =>
    v.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c));
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trimStart();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    // An odd number of trailing backslashes continues the value on the next line.
    while (/(?:^|[^\\])(?:\\\\)*\\$/.test(line) && i + 1 < lines.length) {
      line = line.slice(0, -1) + lines[++i].trimStart();
    }
    // Key runs to the first unescaped `=`, `:` or whitespace.
    const m = line.match(/^((?:\\.|[^=:\s\\])+)\s*(?:[=:]\s*|\s+|$)(.*)$/);
    if (!m) continue;
    out[unescape(m[1])] = unescape(m[2].trimEnd());
  }
  return out;
}

/**
 * A config panel's text as a flat key -> value map. Mule takes both
 * config.yaml and config.properties; which one this is gets detected from the
 * text, so pasting either just works. Unparseable text gives an empty map.
 */
export function parseConfigFlat(text: string | undefined): Record<string, string> {
  if (!text || !text.trim()) return {};
  if (detectFormat(text) === 'properties') return parseProperties(text);
  try { return flattenYaml(yaml.load(escapeBangBracketValues(text))); } catch { return {}; }
}

/**
 * Escape a property value for insertion INSIDE a DataWeave string literal.
 * DataWeave treats `$` as interpolation inside both single- and double-quoted
 * strings (verified against the 2.11 engine), so a secret like `Pa$$w0rd` or
 * `$qwer%$#` injected raw into `"..."` makes DataWeave try to resolve `$...`
 * as a reference and throw a CompilationException. Escaping `$`→`\$` keeps it
 * literal; the quote char and backslash are escaped so the value can't break
 * out of the string, and CR/LF so a multi-line value can't terminate it.
 */
function escapeForDwString(value: string, quote: '"' | "'"): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(new RegExp(quote, 'g'), () => '\\' + quote)
    .replace(/\$/g, () => '\\$')
    .replace(/\r/g, () => '\\r')
    .replace(/\n/g, () => '\\n');
}

/**
 * Substitute ${key} / ${secure::key} using pre-flattened maps.
 * The secure map may already have decrypted ![...] values.
 *
 * Single-pass scanner that tracks whether each placeholder sits inside a
 * DataWeave string literal: values inside a string are escaped for that
 * context (see escapeForDwString), values in a bare position are inserted
 * verbatim. `${secure::key}` resolves from the secure map; a bare `${key}`
 * resolves from config first, then secure (MuleSoft behavior).
 */
export function substituteFromMaps(
  text: string,
  configFlat: Record<string, string>,
  secureFlat: Record<string, string>,
): string {
  const resolve = (name: string): string | undefined => {
    if (name.startsWith('secure::')) return secureFlat[name.slice('secure::'.length)];
    if (name in configFlat) return configFlat[name];
    if (name in secureFlat) return secureFlat[name];
    return undefined;
  };

  let out = '';
  let quote: '"' | "'" | null = null;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // Mule property placeholder `${...}` — resolved everywhere, in or out of
    // strings (it's our own pre-run substitution, not DataWeave syntax).
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

    // Track DataWeave string state so we know the placeholder's context.
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

/**
 * Parse YAML / .properties config strings and substitute ${key} / ${secure::key} placeholders.
 * Synchronous — does NOT decrypt ![...] values (App.tsx has an async variant
 * for that). Used for the Flow Designer and the query-template preview.
 */
export function substituteProperties(text: string, configYaml?: string, secureConfigYaml?: string): string {
  if (!configYaml && !secureConfigYaml) return text;
  return substituteFromMaps(text, parseConfigFlat(configYaml), parseConfigFlat(secureConfigYaml));
}

/**
 * Async variant that decrypts `![...]` secure values (using the encryption key)
 * before substituting. Used wherever a secret config might be encrypted — the
 * single-script run path and the Flow Designer.
 */
export async function substitutePropertiesAsync(
  text: string,
  configYaml: string | undefined,
  secureConfigYaml: string | undefined,
  encryptionKey: string,
  encryptionSettings?: EncryptionSettings,
  /** A key saved in the OS keychain, used instead of `encryptionKey` when set. */
  encryptionKeyName?: string,
): Promise<string> {
  if (!configYaml && !secureConfigYaml) return text;

  let secureFlat = parseConfigFlat(secureConfigYaml);
  // Decrypt ![...] values if a key is provided.
  if ((encryptionKey || encryptionKeyName) && secureConfigYaml && hasEncryptedValues(secureConfigYaml)) {
    secureFlat = await decryptFlatMap(secureFlat, encryptionKey, encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS, encryptionKeyName);
  }

  return substituteFromMaps(text, parseConfigFlat(configYaml), secureFlat);
}
