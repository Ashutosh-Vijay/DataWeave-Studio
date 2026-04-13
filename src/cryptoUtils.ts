/**
 * MuleSoft Secure Properties encryption/decryption.
 *
 * Supports the `![Base64EncodedBlob]` format used in secure-config.yaml.
 * Implements AES-CBC (the MuleSoft default) via the Web Crypto API.
 *
 * Format:
 *   useRandomIVs=true  → blob = IV (16 bytes) || ciphertext
 *   useRandomIVs=false → blob = ciphertext, IV = zero-filled (legacy)
 *
 * Padding: PKCS7 (handled automatically by Web Crypto)
 * Key derivation: MD5(UTF-8(keyString)) → 16 bytes (AES-128)
 *   This matches MuleSoft's secure-properties-tool.jar behaviour exactly.
 *   Any key length is accepted; the MD5 hash normalises it to 16 bytes.
 */

/**
 * MD5 hash (RFC 1321).
 * Used only for MuleSoft key derivation — not for security-critical purposes.
 */
function md5(data: Uint8Array): Uint8Array {
  const s = [
    7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,
    5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,
    4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,
    6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,
  ];
  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
    0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
    0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ];

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  const msgLen = data.length;
  const totalLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(data);
  padded[msgLen] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(totalLen - 8, (msgLen * 8) >>> 0, true);
  dv.setUint32(totalLen - 4, Math.floor(msgLen / 536870912), true);

  for (let off = 0; off < totalLen; off += 64) {
    const M: number[] = [];
    for (let j = 0; j < 16; j++) M.push(dv.getUint32(off + j * 4, true));

    let A = a0, B = b0, C = c0, D = d0;

    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if      (i < 16) { F = (B & C) | (~B & D);  g = i; }
      else if (i < 32) { F = (D & B) | (~D & C);  g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D;            g = (3 * i + 5) % 16; }
      else             { F = C ^ (B | ~D);          g = (7 * i) % 16; }

      F = (F + A + K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + ((F << s[i]) | (F >>> (32 - s[i])))) | 0;
    }

    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }

  const result = new Uint8Array(16);
  const rv = new DataView(result.buffer);
  rv.setInt32(0, a0, true); rv.setInt32(4, b0, true);
  rv.setInt32(8, c0, true); rv.setInt32(12, d0, true);
  return result;
}

/**
 * Derive the AES key from a passphrase using MD5, matching MuleSoft's
 * secure-properties-tool.jar key derivation.
 */
function deriveKeyBytes(key: string): Uint8Array {
  return md5(new TextEncoder().encode(key));
}

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

  if (!key) throw new Error('Encryption key is required.');
  const keyBytes = deriveKeyBytes(key); // MD5(key) → 16 bytes, matches MuleSoft

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

  if (!key) throw new Error('Encryption key is required.');
  const keyBytes = deriveKeyBytes(key); // MD5(key) → 16 bytes, matches MuleSoft

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
