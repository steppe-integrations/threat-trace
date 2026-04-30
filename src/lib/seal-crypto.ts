// ============================================================
// Shared seal/unseal logic — runs in BOTH the build-time CLI
// (`scripts/seal-key.ts`) and the browser runtime
// (`src/components/SettingsDrawer.tsx`). Identical PBKDF2 +
// AES-GCM parameters on both sides; if you change one, change
// both.
//
// Trust model:
//   - Bundle ships with a sealed payload + the question (plaintext).
//   - The answer is the only thing the holder needs to unlock.
//   - PBKDF2 600k iterations slows brute-force; the question
//     quality is the actual security ceiling.
//   - The decrypted key behaves exactly like a pasted key —
//     memory-only, excluded from export, cleared on tab close.
//
// Capability fallback: the holder can always paste their own
// key into the existing API-key field and ignore the unlock
// path. The seal is a convenience, not a gate.
// ============================================================

export interface SealedKeyV1 {
  sealed: true;
  version: 1;
  question: string;
  kdf: {
    iterations: number;
    salt: string; // base64
  };
  cipher: {
    iv: string; // base64
    ciphertext: string; // base64
  };
}

export type SealedKey = SealedKeyV1;

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;

// Latin1-byte-as-codepoint round trip is portable across Node
// (16+) and browsers; both expose `btoa`/`atob` globally and
// both treat `String.fromCharCode(byte)` as the inverse of
// `charCodeAt` for byte values.
function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    s += String.fromCharCode(bytes[i]!);
  }
  return btoa(s);
}

function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

// Single normalization rule used at both seal-time and unseal-
// time. If we change this, we re-seal. Trim+lowercase covers the
// common gotchas (trailing space from copy-paste, capitalization
// inconsistency) without becoming so aggressive that it changes
// the answer's meaning.
export function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase();
}

// Web Crypto APIs want `BufferSource`, which TS 5.7+ resolves to
// `ArrayBufferView<ArrayBuffer>` strictly — `Uint8Array<ArrayBufferLike>`
// from `getRandomValues` doesn't satisfy that. The casts below are
// safe: in Node and in browsers, neither `getRandomValues` nor a
// freshly-allocated `Uint8Array` is ever SharedArrayBuffer-backed.
async function deriveKey(
  answer: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(normalizeAnswer(answer)) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealApiKey(args: {
  question: string;
  answer: string;
  apiKey: string;
}): Promise<SealedKeyV1> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cryptoKey = await deriveKey(args.answer, salt, PBKDF2_ITERATIONS);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    cryptoKey,
    enc.encode(args.apiKey) as BufferSource,
  );
  return {
    sealed: true,
    version: 1,
    question: args.question,
    kdf: {
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: {
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    },
  };
}

/**
 * Throws `Error("WRONG_ANSWER")` if AES-GCM decryption fails
 * (bad answer or tampered ciphertext). Throws other errors only
 * for genuinely unexpected conditions (e.g. crypto.subtle missing).
 */
export async function unsealApiKey(
  sealed: SealedKeyV1,
  answer: string,
): Promise<string> {
  const salt = base64ToBytes(sealed.kdf.salt);
  const iv = base64ToBytes(sealed.cipher.iv);
  const ciphertext = base64ToBytes(sealed.cipher.ciphertext);
  const cryptoKey = await deriveKey(answer, salt, sealed.kdf.iterations);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      cryptoKey,
      ciphertext as BufferSource,
    );
  } catch {
    throw new Error("WRONG_ANSWER");
  }
  return new TextDecoder().decode(plaintext);
}
