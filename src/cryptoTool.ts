/**
 * Encrypt / Decrypt tool: settings, presets and the Java that does the work.
 *
 * The crypto runs in the app's own JVM (the DataWeave engine) through a small
 * Java class compiled once per session, so results match what a Mule app's
 * Java produces, byte for byte, with the same JCE provider. "Get the code"
 * hands out the SAME core methods with the chosen settings baked in, so the
 * code a user copies behaves exactly like the tool did.
 */

export type CryptoOp = 'encrypt' | 'decrypt' | 'hash' | 'hmac';

export interface CryptoSettings {
  algorithm: string;   // AES-128 | AES-192 | AES-256 | DES | DESede | Blowfish
  mode: string;        // GCM | CBC | CTR | ECB | CFB | OFB
  padding: string;     // PKCS5Padding | NoPadding (CBC and ECB only)
  keyMode: string;     // text | sha256 | pbkdf2 | base64 | hex | openssl
  ivMode: string;      // prefix | fixed | zero
  iv: string;          // hex or Base64, when ivMode is fixed
  encoding: string;    // base64 | hex
  iterations: number;  // PBKDF2
  hashAlg: string;     // MD5 | SHA-1 | SHA-256 | SHA-384 | SHA-512
  hmacAlg: string;     // HmacSHA256 | HmacSHA1 | HmacSHA512 | HmacMD5
  hmacKeyMode: string; // text | base64 | hex
}

export const ALGORITHMS = ['AES-256', 'AES-192', 'AES-128', 'DESede', 'DES', 'Blowfish'];
export const modesFor = (algorithm: string) => (algorithm.startsWith('AES') ? ['GCM', 'CBC', 'CTR', 'ECB', 'CFB', 'OFB'] : ['CBC', 'ECB', 'CTR', 'CFB', 'OFB']);
export const KEY_MODES: [string, string][] = [
  ['sha256', 'SHA-256 of the text (any length)'],
  ['text', 'The text itself (exact length)'],
  ['pbkdf2', 'PBKDF2 from the text (random salt in front)'],
  ['openssl', 'OpenSSL / CryptoJS passphrase'],
  ['base64', 'Base64-encoded key bytes'],
  ['hex', 'Hex-encoded key bytes'],
];
export const IV_MODES: [string, string][] = [
  ['prefix', 'Random, put in front of the result'],
  ['fixed', 'Fixed IV I give'],
  ['zero', 'All zeros'],
];
export const HASH_ALGS = ['SHA-256', 'SHA-512', 'SHA-384', 'SHA-1', 'MD5'];
export const HMAC_ALGS = ['HmacSHA256', 'HmacSHA512', 'HmacSHA1', 'HmacMD5'];

export const DEFAULT_SETTINGS: CryptoSettings = {
  algorithm: 'AES-256', mode: 'GCM', padding: 'PKCS5Padding', keyMode: 'sha256', ivMode: 'prefix', iv: '',
  encoding: 'base64', iterations: 65536, hashAlg: 'SHA-256', hmacAlg: 'HmacSHA256', hmacKeyMode: 'text',
};

/** Named starting points for the formats people meet most. */
export const PRESETS: { name: string; hint: string; s: Partial<CryptoSettings> }[] = [
  { name: 'AES-256-GCM (recommended)', hint: 'Key from SHA-256 of your text, random IV in front, Base64. Tamper-proof.', s: { algorithm: 'AES-256', mode: 'GCM', keyMode: 'sha256', ivMode: 'prefix', encoding: 'base64' } },
  { name: 'CryptoJS / OpenSSL passphrase', hint: 'CryptoJS.AES.encrypt(text, "pass") and openssl enc -aes-256-cbc -md md5. Output starts with U2FsdGVkX1.', s: { algorithm: 'AES-256', mode: 'CBC', padding: 'PKCS5Padding', keyMode: 'openssl', encoding: 'base64' } },
  { name: 'Java Cipher.getInstance("AES")', hint: 'What plain "AES" means in Java: AES/ECB/PKCS5Padding with a 16-character key. Common in older code.', s: { algorithm: 'AES-128', mode: 'ECB', padding: 'PKCS5Padding', keyMode: 'text', encoding: 'base64' } },
  { name: 'Fixed key and IV, as text', hint: 'AES-256-CBC with a 32-character key and a 16-character IV written in the code, the same every time. Common in Java utility classes.', s: { algorithm: 'AES-256', mode: 'CBC', padding: 'PKCS5Padding', keyMode: 'text', ivMode: 'fixed', encoding: 'base64' } },
  { name: 'AES-256-CBC, IV in front', hint: 'A 32-character key, random IV before the data. Common in Node and .NET code.', s: { algorithm: 'AES-256', mode: 'CBC', padding: 'PKCS5Padding', keyMode: 'text', ivMode: 'prefix', encoding: 'base64' } },
  { name: 'PBKDF2 + AES-256-GCM', hint: 'Key stretched from your text with a random salt (65,536 rounds). Salt and IV in front.', s: { algorithm: 'AES-256', mode: 'GCM', keyMode: 'pbkdf2', ivMode: 'prefix', iterations: 65536, encoding: 'base64' } },
];

/** The settings that matter for encrypt/decrypt, with irrelevant ones normalised, for comparing to presets. */
export function effective(s: CryptoSettings) {
  const usesIv = s.mode !== 'ECB' && s.keyMode !== 'openssl';
  return {
    algorithm: s.algorithm, mode: s.mode,
    padding: s.mode === 'CBC' || s.mode === 'ECB' ? s.padding : 'NoPadding',
    keyMode: s.keyMode, ivMode: usesIv ? s.ivMode : '-', iv: usesIv && s.ivMode === 'fixed' ? s.iv : '',
    encoding: s.encoding, iterations: s.keyMode === 'pbkdf2' ? s.iterations : 0,
  };
}
export function presetOf(s: CryptoSettings, own: { name: string; s: Partial<CryptoSettings> }[] = []): string {
  const e = JSON.stringify(effective(s));
  return [...PRESETS, ...own].find((p) => JSON.stringify(effective({ ...s, ...p.s })) === e)?.name ?? '';
}

// ── The Java ───────────────────────────────────────────────────────────

const CORE = String.raw`
    // ---- The rest is the same in DataWeave Studio and in the code it gives you. ----

    static String cipherName(String algorithm) { return algorithm.startsWith("AES") ? "AES" : algorithm; }

    static int keyLength(String algorithm) {
        switch (algorithm) {
            case "AES-128": return 16;
            case "AES-192": return 24;
            case "AES-256": return 32;
            case "DES": return 8;
            case "DESede": return 24;
            default: return 16; // Blowfish
        }
    }

    static int ivLength(String algorithm, String mode) {
        if (mode.equals("ECB")) return 0;
        if (mode.equals("GCM")) return 12;
        return algorithm.startsWith("AES") ? 16 : 8;
    }

    static byte[] decode(String text, String encoding) {
        String t = text.trim();
        if (encoding.equals("hex")) {
            if (t.length() % 2 != 0 || !t.matches("[0-9a-fA-F]*")) throw new IllegalArgumentException("That isn't valid hex.");
            byte[] out = new byte[t.length() / 2];
            for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(t.substring(i * 2, i * 2 + 2), 16);
            return out;
        }
        try {
            return Base64.getDecoder().decode(t.replaceAll("\\s", ""));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("That isn't valid Base64.");
        }
    }

    static String encode(byte[] bytes, String encoding) {
        if (!encoding.equals("hex")) return Base64.getEncoder().encodeToString(bytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    /** Key bytes from the secret, the way keyMode says. */
    static byte[] keyBytes(String algorithm, String keyMode, String secret, byte[] salt, int iterations) throws Exception {
        int n = keyLength(algorithm);
        byte[] k;
        switch (keyMode) {
            case "sha256":
                return Arrays.copyOf(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)), n);
            case "pbkdf2":
                return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                        .generateSecret(new PBEKeySpec(secret.toCharArray(), salt, iterations, n * 8)).getEncoded();
            case "base64": k = decode(secret, "base64"); break;
            case "hex": k = decode(secret, "hex"); break;
            default: k = secret.getBytes(StandardCharsets.UTF_8);
        }
        boolean blowfish = algorithm.equals("Blowfish");
        if (blowfish ? k.length < 4 || k.length > 56 : k.length != n) {
            throw new IllegalArgumentException("The key is " + k.length + " bytes long; " + algorithm + " needs "
                    + (blowfish ? "4 to 56" : "exactly " + n) + ". To use a key of any length, take the SHA-256 of it instead.");
        }
        return k;
    }

    /** OpenSSL's EVP_BytesToKey with MD5: what CryptoJS and "openssl enc -md md5" use for a passphrase. */
    static byte[][] opensslKeyIv(String secret, byte[] salt, int keyLen, int ivLen) throws Exception {
        MessageDigest md5 = MessageDigest.getInstance("MD5");
        byte[] pass = secret.getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] prev = new byte[0];
        while (out.size() < keyLen + ivLen) {
            md5.reset();
            md5.update(prev);
            md5.update(pass);
            md5.update(salt);
            prev = md5.digest();
            out.write(prev);
        }
        byte[] all = out.toByteArray();
        return new byte[][] { Arrays.copyOfRange(all, 0, keyLen), Arrays.copyOfRange(all, keyLen, keyLen + ivLen) };
    }

    static Cipher cipher(int op, String algorithm, String mode, String padding, byte[] key, byte[] iv) throws Exception {
        String pad = mode.equals("CBC") || mode.equals("ECB") ? padding : "NoPadding";
        Cipher c = Cipher.getInstance(cipherName(algorithm) + "/" + mode + "/" + pad);
        SecretKeySpec k = new SecretKeySpec(key, cipherName(algorithm));
        if (mode.equals("ECB")) c.init(op, k);
        else if (mode.equals("GCM")) c.init(op, k, new GCMParameterSpec(128, iv));
        else c.init(op, k, new IvParameterSpec(iv));
        return c;
    }

    static byte[] givenIv(String ivMode, String iv, int len) {
        if (ivMode.equals("zero")) return new byte[len];
        String t = iv.trim();
        byte[] b;
        if (t.length() == len * 2 && t.matches("[0-9a-fA-F]+")) b = decode(t, "hex");
        // Typed as plain text, like IV_STRING = "03yoekic4820219f". Never ambiguous:
        // the same number of bytes in hex or Base64 is longer than this.
        else if (t.getBytes(StandardCharsets.UTF_8).length == len) b = t.getBytes(StandardCharsets.UTF_8);
        else b = decode(t, "base64");
        if (b.length != len) throw new IllegalArgumentException("The IV is " + b.length + " bytes; this mode needs " + len + ".");
        return b;
    }

    static void need(byte[] data, int upTo) {
        if (data.length < upTo) throw new IllegalArgumentException("Too short to have been encrypted with these settings.");
    }

    static String encryptText(String algorithm, String mode, String padding, String keyMode, String secret,
                              String ivMode, String iv, String encoding, int iterations, String text) throws Exception {
        SecureRandom random = new SecureRandom();
        int ivLen = ivLength(algorithm, mode);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] key;
        byte[] ivBytes = null;
        if (keyMode.equals("openssl")) {
            byte[] salt = new byte[8];
            random.nextBytes(salt);
            byte[][] ki = opensslKeyIv(secret, salt, keyLength(algorithm), ivLen);
            key = ki[0];
            ivBytes = ki[1];
            out.write("Salted__".getBytes(StandardCharsets.US_ASCII));
            out.write(salt);
        } else {
            byte[] salt = new byte[16];
            if (keyMode.equals("pbkdf2")) {
                random.nextBytes(salt);
                out.write(salt);
            }
            key = keyBytes(algorithm, keyMode, secret, salt, iterations);
            if (ivLen > 0 && ivMode.equals("prefix")) {
                ivBytes = new byte[ivLen];
                random.nextBytes(ivBytes);
                out.write(ivBytes);
            } else if (ivLen > 0) {
                ivBytes = givenIv(ivMode, iv, ivLen);
            }
        }
        out.write(cipher(Cipher.ENCRYPT_MODE, algorithm, mode, padding, key, ivBytes).doFinal(text.getBytes(StandardCharsets.UTF_8)));
        return encode(out.toByteArray(), encoding);
    }

    static String decryptText(String algorithm, String mode, String padding, String keyMode, String secret,
                              String ivMode, String iv, String encoding, int iterations, String encrypted) throws Exception {
        byte[] data = decode(encrypted, encoding);
        int ivLen = ivLength(algorithm, mode);
        int pos = 0;
        byte[] key;
        byte[] ivBytes = null;
        if (keyMode.equals("openssl")) {
            if (data.length < 16 || !new String(data, 0, 8, StandardCharsets.US_ASCII).equals("Salted__")) {
                throw new IllegalArgumentException("This isn't OpenSSL or CryptoJS output: that starts with \"Salted__\" (U2FsdGVkX1 in Base64).");
            }
            byte[][] ki = opensslKeyIv(secret, Arrays.copyOfRange(data, 8, 16), keyLength(algorithm), ivLen);
            key = ki[0];
            ivBytes = ki[1];
            pos = 16;
        } else {
            byte[] salt = new byte[16];
            if (keyMode.equals("pbkdf2")) {
                need(data, 16);
                salt = Arrays.copyOfRange(data, 0, 16);
                pos = 16;
            }
            key = keyBytes(algorithm, keyMode, secret, salt, iterations);
            if (ivLen > 0 && ivMode.equals("prefix")) {
                need(data, pos + ivLen);
                ivBytes = Arrays.copyOfRange(data, pos, pos + ivLen);
                pos += ivLen;
            } else if (ivLen > 0) {
                ivBytes = givenIv(ivMode, iv, ivLen);
            }
        }
        byte[] plain = cipher(Cipher.DECRYPT_MODE, algorithm, mode, padding, key, ivBytes).doFinal(data, pos, data.length - pos);
        return new String(plain, StandardCharsets.UTF_8);
    }

    static String hashText(String algorithm, String encoding, String text) throws Exception {
        return encode(MessageDigest.getInstance(algorithm).digest(text.getBytes(StandardCharsets.UTF_8)), encoding);
    }

    static String hmacText(String algorithm, String keyMode, String secret, String encoding, String text) throws Exception {
        byte[] k = keyMode.equals("text") ? secret.getBytes(StandardCharsets.UTF_8) : decode(secret, keyMode);
        if (k.length == 0) throw new IllegalArgumentException("Type a secret key.");
        Mac mac = Mac.getInstance(algorithm);
        mac.init(new SecretKeySpec(k, algorithm));
        return encode(mac.doFinal(text.getBytes(StandardCharsets.UTF_8)), encoding);
    }
}
`;

const IMPORTS = `import javax.crypto.AEADBadTagException;
import javax.crypto.BadPaddingException;
import javax.crypto.Cipher;
import javax.crypto.IllegalBlockSizeException;
import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;`;

// What the tool itself calls: one entry point, every setting as a string, and
// errors returned as text in plain words instead of a Java stack trace.
const TOOL_ENTRY = String.raw`
    public static String run(String op, String algorithm, String mode, String padding, String keyMode, String secret,
                             String ivMode, String iv, String encoding, String iterations, String text) {
        try {
            int rounds = Integer.parseInt(iterations);
            switch (op) {
                case "encrypt": return "ok:" + encryptText(algorithm, mode, padding, keyMode, secret, ivMode, iv, encoding, rounds, text);
                case "decrypt": return "ok:" + decryptText(algorithm, mode, padding, keyMode, secret, ivMode, iv, encoding, rounds, text);
                case "hash": return "ok:" + hashText(algorithm, encoding, text);
                default: return "ok:" + hmacText(algorithm, keyMode, secret, encoding, text);
            }
        } catch (AEADBadTagException e) {
            return "error:Couldn't decrypt: the key or settings don't match, or the data was changed. GCM checks this, so nothing wrong comes out.";
        } catch (BadPaddingException e) {
            return "error:Couldn't decrypt: the key or settings don't match (the padding at the end didn't check out).";
        } catch (IllegalBlockSizeException e) {
            return "error:The data isn't a whole number of blocks. Is it complete, and is the encoding (Base64 or hex) right? With no padding, the text must be a multiple of the block size.";
        } catch (Exception e) {
            return "error:" + (e.getMessage() != null ? e.getMessage() : e.toString());
        }
    }
`;

/** Small, stable hash so a changed source gets a new package (the engine caches loaded classes). */
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export const TOOL_PACKAGE = `dwstudio.crypto.v${shortHash(CORE + TOOL_ENTRY)}`;
export const TOOL_SOURCE = `package ${TOOL_PACKAGE};\n\n${IMPORTS}\n\npublic class CryptoTool {\n${TOOL_ENTRY}${CORE}`;

/** The DataWeave the tool runs; `payload` carries every argument as a string. */
export const TOOL_SCRIPT = `%dw 2.0
import java!${TOOL_PACKAGE.replace(/\./g, '::')}::CryptoTool
output text/plain
---
CryptoTool::run(payload.op, payload.algorithm, payload.mode, payload.padding, payload.keyMode, payload.secret,
  payload.ivMode, payload.iv, payload.encoding, payload.iterations, payload.text)`;

/** Arguments for one run of the tool, in TOOL_SCRIPT's order. */
export function toolArgs(op: CryptoOp, s: CryptoSettings, secret: string, text: string) {
  const isHash = op === 'hash', isHmac = op === 'hmac';
  return {
    op,
    algorithm: isHash ? s.hashAlg : isHmac ? s.hmacAlg : s.algorithm,
    mode: s.mode, padding: s.padding,
    keyMode: isHmac ? s.hmacKeyMode : s.keyMode,
    secret, ivMode: s.ivMode, iv: s.iv, encoding: s.encoding, iterations: String(s.iterations || 1), text,
  };
}

/** Which input field the decrypt box reads: a bare string, or the value inside { encryptedBody } / { decryptedBody }. */
export function encryptedFrom(input: string): string {
  const t = input.trim();
  try {
    const v = JSON.parse(t);
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const pick = v.encryptedBody ?? v.decryptedBody ?? Object.values(v).find((x) => typeof x === 'string');
      if (typeof pick === 'string') return pick;
    }
  } catch { /* not JSON: the text is the encrypted value */ }
  return t;
}

// ── "Get the code" ─────────────────────────────────────────────────────

const javaStr = (s: string) => JSON.stringify(s);

/** A ready-to-use class with the current settings baked in, built on the same core the tool runs. */
export function generateJava(op: CryptoOp, s: CryptoSettings, secret: string, pkg = 'com.mycompany.crypto', cls = 'PayloadCrypto'): string {
  let entry: string;
  if (op === 'hash') {
    entry = `
    // ${s.hashAlg}, ${s.encoding === 'hex' ? 'hex' : 'Base64'} output. Settings from DataWeave Studio's Encrypt / Decrypt tool.
    public static String hash(String text) throws Exception {
        return hashText(${javaStr(s.hashAlg)}, ${javaStr(s.encoding)}, text);
    }
`;
  } else if (op === 'hmac') {
    entry = `
    // ${s.hmacAlg}, ${s.encoding === 'hex' ? 'hex' : 'Base64'} output. Settings from DataWeave Studio's Encrypt / Decrypt tool.
    // For real use, pass the key in from a secure property: signWith(p('secure::hmac.key'), text).
    private static final String SECRET = ${javaStr(secret)};

    public static String sign(String text) throws Exception {
        return signWith(SECRET, text);
    }

    public static String signWith(String secret, String text) throws Exception {
        return hmacText(${javaStr(s.hmacAlg)}, ${javaStr(s.hmacKeyMode)}, secret, ${javaStr(s.encoding)}, text);
    }
`;
  } else {
    const e = effective(s);
    const args = `${javaStr(e.algorithm)}, ${javaStr(e.mode)}, ${javaStr(e.padding)}, ${javaStr(e.keyMode)}, secret, ${javaStr(s.ivMode)}, ${javaStr(e.iv)}, ${javaStr(e.encoding)}, ${s.iterations || 1}`;
    const preset = presetOf(s);
    entry = `
    // ${preset || `${e.algorithm}/${e.mode}`}. Settings from DataWeave Studio's Encrypt / Decrypt tool.
    // For real use, pass the key in from a secure property: encryptWith(p('secure::payload.key'), text).
    private static final String SECRET = ${javaStr(secret)};

    public static String encrypt(String text) throws Exception {
        return encryptWith(SECRET, text);
    }

    public static String decrypt(String encrypted) throws Exception {
        return decryptWith(SECRET, encrypted);
    }

    public static String encryptWith(String secret, String text) throws Exception {
        return encryptText(${args}, text);
    }

    public static String decryptWith(String secret, String encrypted) throws Exception {
        return decryptText(${args}, encrypted);
    }
`;
  }
  return `package ${pkg};\n\n${IMPORTS}\n\npublic class ${cls} {\n${entry}${CORE}`;
}

/** DataWeave scripts that call the generated class, in the { encryptedBody } shape. */
export function generateDataWeave(op: CryptoOp, pkg = 'com.mycompany.crypto', cls = 'PayloadCrypto'): { title: string; code: string }[] {
  const imp = `import java!${pkg.replace(/\./g, '::')}::${cls}`;
  if (op === 'hash') return [{ title: 'Hash the payload', code: `%dw 2.0\n${imp}\noutput application/json\n---\n{ hash: ${cls}::hash(write(payload, "application/json", { indent: false })) }` }];
  if (op === 'hmac') return [{ title: 'Sign the payload', code: `%dw 2.0\n${imp}\noutput application/json\n---\n{ signature: ${cls}::sign(write(payload, "application/json", { indent: false })) }` }];
  return [
    { title: 'Encrypt any payload', code: `%dw 2.0\n${imp}\noutput application/json\n---\n{ encryptedBody: ${cls}::encrypt(write(payload, "application/json", { indent: false })) }` },
    { title: 'Decrypt { encryptedBody } or a bare string', code: `%dw 2.0\n${imp}\noutput application/json\nvar encrypted = if (payload is String) payload else (payload.encryptedBody default payload.decryptedBody)\n---\nread(${cls}::decrypt(encrypted), "application/json")` },
  ];
}
