/**
 * MuleSoft Secure Properties — thin wrapper around the bundled
 * `secure-properties-tool.jar` invoked via the Rust backend.
 *
 * All crypto runs through MuleSoft's official tool, so output is byte-for-byte
 * compatible with what the Mule runtime decrypts. Supports the full algorithm
 * matrix the JAR supports: AES, Blowfish, DES, DESede, RC2 × CBC, CFB, ECB, OFB.
 *
 * Requires a system Java runtime (JRE 8+, JAR ships supporting up to Java 17).
 */

import { invoke } from './bridge';

export interface EncryptionSettings {
  algorithm: string; // 'AES' | 'Blowfish' | 'DES' | 'DESede' | 'RC2'
  mode: string;      // 'CBC' | 'CFB' | 'ECB' | 'OFB'
  useRandomIVs: boolean;
}

export const DEFAULT_ENCRYPTION_SETTINGS: EncryptionSettings = {
  algorithm: 'AES',
  mode: 'CBC',
  useRandomIVs: false, // matches the JAR's default
};

const ENCRYPTED_VALUE_RE = /^!\[(.+)]$/;

export function isEncryptedValue(value: string): boolean {
  return ENCRYPTED_VALUE_RE.test(value.trim());
}

export function hasEncryptedValues(yamlStr: string): boolean {
  return /!\[.+]/.test(yamlStr);
}

async function invokeTool(
  operation: 'encrypt' | 'decrypt',
  value: string,
  key: string,
  settings: EncryptionSettings
): Promise<string> {
  if (!key) throw new Error('Encryption key is required.');
  if (!value) throw new Error('Value is required.');
  return await invoke<string>('secure_properties_invoke', {
    operation,
    algorithm: settings.algorithm,
    mode: settings.mode,
    key,
    value,
    useRandomIv: settings.useRandomIVs,
  });
}

/** Decrypt the inner Base64 of a `![...]` value (pass the raw inner blob, no brackets). */
export async function decryptValue(
  encryptedBase64: string,
  key: string,
  settings: EncryptionSettings
): Promise<string> {
  return invokeTool('decrypt', encryptedBase64, key, settings);
}

/** Encrypt plaintext → `![Base64Blob]`. */
export async function encryptValue(
  plaintext: string,
  key: string,
  settings: EncryptionSettings
): Promise<string> {
  const inner = await invokeTool('encrypt', plaintext, key, settings);
  return `![${inner}]`;
}

/**
 * Decrypt every `![...]` value in a flattened key→value map. Other values pass through.
 * Failures are reported inline as `[DECRYPT_ERROR: reason]`. Runs in parallel.
 */
export async function decryptFlatMap(
  flatMap: Record<string, string>,
  key: string,
  settings: EncryptionSettings
): Promise<Record<string, string>> {
  const entries = Object.entries(flatMap);
  const results = await Promise.all(
    entries.map(async ([k, v]) => {
      const match = v.trim().match(ENCRYPTED_VALUE_RE);
      if (!match) return [k, v] as const;
      try {
        return [k, await decryptValue(match[1], key, settings)] as const;
      } catch (e) {
        return [k, `[DECRYPT_ERROR: ${(e as Error).message}]`] as const;
      }
    })
  );
  return Object.fromEntries(results);
}

/**
 * Advisory key-length hint for AES (purely a UI nicety on the key field).
 * Not a hard validator — the JAR is the source of truth.
 */
export function inspectAesKey(key: string): {
  bytes: number;
  aesValid: boolean;
  aesVariant: 'AES-128' | 'AES-192' | 'AES-256' | null;
} {
  const bytes = new TextEncoder().encode(key).length;
  const variant =
    bytes === 16 ? 'AES-128' : bytes === 24 ? 'AES-192' : bytes === 32 ? 'AES-256' : null;
  return { bytes, aesValid: variant !== null, aesVariant: variant };
}
