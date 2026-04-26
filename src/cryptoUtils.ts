/**
 * MuleSoft Secure Properties encryption/decryption.
 *
 * Implements byte-for-byte interop with `secure-properties-tool.jar`.
 *
 * Wire format for `![Base64Blob]` values in secure-config.yaml:
 *   useRandomIVs=false (Mule DEFAULT) → blob = ciphertext   ; IV = 16 zero bytes
 *   useRandomIVs=true                 → blob = IV(16) || ciphertext
 *
 * Cipher:    AES/CBC/PKCS5Padding (Mule default — only AES is supported here)
 * Key bytes: raw UTF-8 of the password string, length MUST be 16 / 24 / 32
 *            for AES-128 / AES-192 / AES-256 respectively. MuleSoft's tool
 *            calls `new SecretKeySpec(password.getBytes(), "AES")` directly —
 *            it does NOT hash, pad, or derive the key. A wrong-length key
 *            throws InvalidKeyException; we mirror that with a clear error.
 */

export interface EncryptionSettings {
  algorithm: string;  // 'AES' | 'Blowfish' | 'DES' | 'DESede' | 'RC2'
  mode: string;       // 'CBC' | 'CFB' | 'ECB' | 'OFB'
  useRandomIVs: boolean;
}

export const DEFAULT_ENCRYPTION_SETTINGS: EncryptionSettings = {
  algorithm: 'AES',
  mode: 'CBC',
  useRandomIVs: false, // matches Mule's secure-properties-tool default
};

const ENCRYPTED_VALUE_RE = /^!\[(.+)]$/;

const VALID_AES_KEY_LENGTHS = [16, 24, 32] as const;

/** Check if a string is an encrypted `![...]` value */
export function isEncryptedValue(value: string): boolean {
  return ENCRYPTED_VALUE_RE.test(value.trim());
}

/** Check if a YAML string contains any `![...]` encrypted values */
export function hasEncryptedValues(yamlStr: string): boolean {
  return /!\[.+]/.test(yamlStr);
}

/**
 * Validate and return the raw UTF-8 key bytes for AES.
 * MuleSoft requires the password to be exactly 16, 24, or 32 BYTES (UTF-8) —
 * any other length is an error in the Java side too (InvalidKeyException).
 */
function getAesKeyBytes(key: string): Uint8Array {
  const bytes = new TextEncoder().encode(key);
  if (!VALID_AES_KEY_LENGTHS.includes(bytes.length as 16 | 24 | 32)) {
    throw new Error(
      `AES key must be exactly 16, 24, or 32 bytes (UTF-8) — got ${bytes.length}. ` +
      `Pad or trim your key string to 16 chars (AES-128), 24 (AES-192), or 32 (AES-256).`
    );
  }
  return bytes;
}

/** Internal: ensure the user is asking for something Web Crypto can do. */
function assertSupportedSettings(settings: EncryptionSettings): void {
  if (settings.algorithm !== 'AES') {
    throw new Error(
      `${settings.algorithm} is not supported in-app — only AES is available via Web Crypto. ` +
      `Use Mule's secure-properties-tool.jar for ${settings.algorithm}, or switch to AES.`
    );
  }
  if (settings.mode !== 'CBC') {
    throw new Error(
      `AES-${settings.mode} is not supported in-app — only AES-CBC is available via Web Crypto.`
    );
  }
}

/**
 * Decrypt a single `![Base64Blob]` value.
 * Returns the plaintext string.
 */
export async function decryptValue(
  encryptedBase64: string,
  key: string,
  settings: EncryptionSettings
): Promise<string> {
  assertSupportedSettings(settings);
  if (!key) throw new Error('Encryption key is required.');

  const keyBytes = getAesKeyBytes(key);

  let encryptedBytes: Uint8Array;
  try {
    encryptedBytes = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
  } catch {
    throw new Error('Invalid Base64 in encrypted value.');
  }

  const blockSize = 16; // AES block size
  let iv: Uint8Array;
  let ciphertext: Uint8Array;

  if (settings.useRandomIVs) {
    if (encryptedBytes.length <= blockSize) {
      throw new Error('Encrypted data too short — expected IV + ciphertext.');
    }
    iv = encryptedBytes.slice(0, blockSize);
    ciphertext = encryptedBytes.slice(blockSize);
  } else {
    iv = new Uint8Array(blockSize); // zero IV — Mule default
    ciphertext = encryptedBytes;
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      cryptoKey,
      ciphertext
    );
  } catch {
    throw new Error(
      'Decryption failed — wrong key, algorithm, or "Use random IVs" toggle. ' +
      'Verify the key matches the one used to encrypt, and that the IV setting matches.'
    );
  }

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Encrypt a plaintext string → `![Base64Blob]`.
 * Returns the encrypted value in MuleSoft format.
 */
export async function encryptValue(
  plaintext: string,
  key: string,
  settings: EncryptionSettings
): Promise<string> {
  assertSupportedSettings(settings);
  if (!key) throw new Error('Encryption key is required.');

  const keyBytes = getAesKeyBytes(key);
  const blockSize = 16;
  const iv = settings.useRandomIVs
    ? crypto.getRandomValues(new Uint8Array(blockSize))
    : new Uint8Array(blockSize);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  );

  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    plaintextBytes
  );

  let outputBytes: Uint8Array;
  if (settings.useRandomIVs) {
    outputBytes = new Uint8Array(iv.length + ciphertextBuffer.byteLength);
    outputBytes.set(iv, 0);
    outputBytes.set(new Uint8Array(ciphertextBuffer), iv.length);
  } else {
    outputBytes = new Uint8Array(ciphertextBuffer);
  }

  const base64 = btoa(String.fromCharCode(...outputBytes));
  return `![${base64}]`;
}

/**
 * Process a flattened key→value map, decrypting any `![...]` values in-place.
 * Returns a new map with decrypted plaintext values.
 * Values that fail to decrypt get `[DECRYPT_ERROR: reason]` as their value.
 */
export async function decryptFlatMap(
  flatMap: Record<string, string>,
  key: string,
  settings: EncryptionSettings
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  for (const [k, v] of Object.entries(flatMap)) {
    const match = v.trim().match(ENCRYPTED_VALUE_RE);
    if (match) {
      try {
        result[k] = await decryptValue(match[1], key, settings);
      } catch (e) {
        result[k] = `[DECRYPT_ERROR: ${(e as Error).message}]`;
      }
    } else {
      result[k] = v;
    }
  }

  return result;
}

/**
 * Inspect a key for AES validity. Returns a descriptor for UI hints.
 * - bytes: UTF-8 byte length
 * - aesValid: true if length is 16/24/32
 * - aesVariant: 'AES-128' | 'AES-192' | 'AES-256' | null
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
