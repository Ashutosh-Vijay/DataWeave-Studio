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
 * Parse YAML config strings and substitute ${key} / ${secure::key} placeholders.
 * Synchronous — does NOT decrypt ![...] values (App.tsx has an async variant
 * for that). Used for the Flow Designer and the query-template preview.
 */
export function substituteProperties(text: string, configYaml?: string, secureConfigYaml?: string): string {
  if (!configYaml && !secureConfigYaml) return text;

  let configFlat: Record<string, string> = {};
  let secureFlat: Record<string, string> = {};

  if (configYaml) {
    try { configFlat = flattenYaml(yaml.load(configYaml)); } catch { /* skip */ }
  }
  if (secureConfigYaml) {
    try { secureFlat = flattenYaml(yaml.load(escapeBangBracketValues(secureConfigYaml))); } catch { /* skip */ }
  }

  return substituteFromMaps(text, configFlat, secureFlat);
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
): Promise<string> {
  if (!configYaml && !secureConfigYaml) return text;

  let configFlat: Record<string, string> = {};
  let secureFlat: Record<string, string> = {};

  if (configYaml) {
    try { configFlat = flattenYaml(yaml.load(configYaml)); } catch { /* skip */ }
  }

  if (secureConfigYaml) {
    try {
      secureFlat = flattenYaml(yaml.load(escapeBangBracketValues(secureConfigYaml)));
      // Decrypt ![...] values if a key is provided.
      if (encryptionKey && hasEncryptedValues(secureConfigYaml)) {
        const settings = encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS;
        secureFlat = await decryptFlatMap(secureFlat, encryptionKey, settings);
      }
    } catch (e) {
      console.warn('Secure config parse failed:', e);
    }
  }

  return substituteFromMaps(text, configFlat, secureFlat);
}
