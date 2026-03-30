/**
 * MuleSoft Secure Properties decryption.
 *
 * Supports the `![Base64EncodedBlob]` format used in secure-config.yaml.
 * Currently implements AES-CBC (the MuleSoft default and recommended algorithm)
 * via the Web Crypto API.
 *
 * Format:
 *   useRandomIVs=true  → blob = IV (16 bytes) || ciphertext
 *   useRandomIVs=false → blob = ciphertext, IV = zero-filled (legacy)
 *
 * Padding: PKCS7 (handled automatically by Web Crypto)
 * Key: raw UTF-8 bytes of the key string (16 chars = AES-128, 32 chars = AES-256)
 */

export interface EncryptionSettings {
  algorithm: string;  // 'AES' | 'Blowfish' | 'DES' | 'DESede' | 'RC2'
  mode: string;       // 'CBC' | 'CFB' | 'ECB' | 'OFB'
  useRandomIVs: boolean;
}

export const DEFAULT_ENCRYPTION_SETTINGS: EncryptionSettings = {
  algorithm: 'AES',
  mode: 'CBC',
  useRandomIVs: true,
};

const ENCRYPTED_VALUE_RE = /^!\[(.+)]$/;

/** Check if a string is an encrypted `![...]` value */
export function isEncryptedValue(value: string): boolean {
  return ENCRYPTED_VALUE_RE.test(value.trim());
}

/** Check if a YAML string contains any `![...]` encrypted values */
export function hasEncryptedValues(yamlStr: string): boolean {
  return /!\[.+]/.test(yamlStr);
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
  if (settings.algorithm !== 'AES') {
    throw new Error(
      `${settings.algorithm} is not supported — only AES is available via Web Crypto. ` +
      `Enter plaintext values instead, or use AES.`
    );
  }
  if (settings.mode !== 'CBC') {
    throw new Error(
      `AES-${settings.mode} is not supported — only AES-CBC is available via Web Crypto.`
    );
  }

  const keyBytes = new TextEncoder().encode(key);
  if (![16, 24, 32].includes(keyBytes.length)) {
    throw new Error(
      `AES key must be exactly 16, 24, or 32 characters (got ${keyBytes.length}).`
    );
  }

  // Decode base64 → raw bytes
  let encryptedBytes: Uint8Array;
  try {
    encryptedBytes = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
  } catch {
    throw new Error('Invalid Base64 in encrypted value.');
  }

  // Extract IV + ciphertext
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  const blockSize = 16; // AES block size

  if (settings.useRandomIVs) {
    if (encryptedBytes.length <= blockSize) {
      throw new Error('Encrypted data too short — expected IV + ciphertext.');
    }
    iv = encryptedBytes.slice(0, blockSize);
    ciphertext = encryptedBytes.slice(blockSize);
  } else {
    // Legacy mode: zero-filled IV
    iv = new Uint8Array(blockSize);
    ciphertext = encryptedBytes;
  }

  // Import key and decrypt
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
      'Decryption failed — wrong key, algorithm, or useRandomIVs setting.'
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
  if (settings.algorithm !== 'AES') {
    throw new Error(
      `${settings.algorithm} is not supported — only AES is available via Web Crypto.`
    );
  }
  if (settings.mode !== 'CBC') {
    throw new Error(
      `AES-${settings.mode} is not supported — only AES-CBC is available via Web Crypto.`
    );
  }

  const keyBytes = new TextEncoder().encode(key);
  if (![16, 24, 32].includes(keyBytes.length)) {
    throw new Error(
      `AES key must be exactly 16, 24, or 32 characters (got ${keyBytes.length}).`
    );
  }

  const blockSize = 16;
  let iv: Uint8Array;

  if (settings.useRandomIVs) {
    iv = crypto.getRandomValues(new Uint8Array(blockSize));
  } else {
    iv = new Uint8Array(blockSize); // zero IV for legacy mode
  }

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

  // Build output: IV + ciphertext (if useRandomIVs), or just ciphertext
  let outputBytes: Uint8Array;
  if (settings.useRandomIVs) {
    outputBytes = new Uint8Array(iv.length + ciphertextBuffer.byteLength);
    outputBytes.set(iv, 0);
    outputBytes.set(new Uint8Array(ciphertextBuffer), iv.length);
  } else {
    outputBytes = new Uint8Array(ciphertextBuffer);
  }

  // Base64 encode and wrap in ![...]
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
