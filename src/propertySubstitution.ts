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
 * Substitute ${key} / ${secure::key} using pre-flattened maps.
 * The secure map may already have decrypted ![...] values.
 */
export function substituteFromMaps(
  text: string,
  configFlat: Record<string, string>,
  secureFlat: Record<string, string>,
): string {
  let result = text;

  // Use a function replacement (not a string) so a `$` inside the property
  // VALUE is inserted literally. A string replacement treats `$$`, `$&`, `$1`,
  // etc. as special — so a decrypted secret like `Pa$$w0rd` would collapse to
  // `Pa$w0rd`, and `$&` would re-inject the placeholder, corrupting the script
  // and throwing an engine error.
  for (const [key, value] of Object.entries(configFlat)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\$\\{${escaped}\\}`, 'g'), () => value);
  }

  for (const [key, value] of Object.entries(secureFlat)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\$\\{secure::${escaped}\\}`, 'g'), () => value);
    // Also allow ${key} to reference secure props (MuleSoft behavior)
    result = result.replace(new RegExp(`\\$\\{${escaped}\\}`, 'g'), () => value);
  }

  return result;
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
