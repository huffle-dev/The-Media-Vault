// Expo implementation of packages/core/cryptoSync.js's crypto adapter
// interface, for mobile. Two libraries split the work because neither
// alone covers it:
//   - expo-crypto gives real AES-256-GCM (native, Expo-Go-compatible) but
//     no password-based key derivation at all (no PBKDF2, no Argon2id).
//   - crypto-js gives a pure-JS PBKDF2 — no native code, so no WASM issue
//     (Hermes, React Native's JS engine, has no WebAssembly support at
//     all, which is exactly why libsodium/Argon2id — the decision table's
//     original pick — isn't usable here without a custom development
//     build; PBKDF2-HMAC-SHA256 at a strong iteration count is the
//     standard fallback, not a hand-rolled substitute).
//
// Ciphertext format must match lib/cryptoAdapterNode.js's exactly (both
// wrap/unwrap the same master key and secrets): plaintext is always passed
// as raw UTF-8 bytes, never a base64-wrapped string — aesEncryptAsync
// happens to accept a base64 string too, but using it would silently
// encrypt different bytes than Node's Buffer.from(str, "utf8") does,
// making the two platforms' ciphertext mutually undecryptable. "combined"
// format (iv(12) || ciphertext || tag(16), base64) is expo-crypto's own
// standard layout and matches Node's Buffer.concat([iv, ciphertext, tag])
// byte for byte.
import * as Crypto from "expo-crypto";
import CryptoJS from "crypto-js";
import { PBKDF2_ITERATIONS } from "@media-vault/core/cryptoSync";

function utf8ToBytes(str) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
  // ASCII-safe fallback — every real payload here (a hex master key, a
  // typical API key) is plain ASCII, so this never actually needs the
  // multi-byte path, but it's implemented properly rather than assumed away.
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return new Uint8Array(bytes);
}
function bytesToUtf8(bytes) {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return str;
}
function bytesToBase64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function randomBytesBase64(n) {
  const bytes = await Crypto.getRandomBytesAsync(n);
  return bytesToBase64(bytes);
}

// crypto-js needs the salt as its own WordArray type, not a plain string.
function deriveKeyHex(passphrase, saltBase64) {
  const salt = CryptoJS.enc.Base64.parse(saltBase64);
  const derived = CryptoJS.PBKDF2(passphrase, salt, {
    keySize: 256 / 32, // words, not bytes — 8 words = 32 bytes = 256 bits
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
  return Promise.resolve(derived.toString(CryptoJS.enc.Hex));
}

async function encrypt(keyHex, plaintextUtf8) {
  const key = await Crypto.AESEncryptionKey.import(keyHex, "hex");
  const sealed = await Crypto.aesEncryptAsync(utf8ToBytes(plaintextUtf8), key);
  return sealed.combined("base64");
}

async function decrypt(keyHex, combinedBase64) {
  const key = await Crypto.AESEncryptionKey.import(keyHex, "hex");
  // fromCombined's JS types claim a base64 string is accepted, but the
  // native Android binding declares this call as `(combined: ByteArray,
  // config: SealedDataConfig?)` — unlike fromParts (which takes an
  // Either<ByteArray, String> and decodes base64 itself), fromCombined
  // never does that decode, so handing it a string throws a native
  // "Value is a string, expected an Object" error. Decode to raw bytes
  // ourselves first. (Confirmed against expo-crypto's sdk-57 source:
  // packages/expo-crypto/android/.../AesCryptoModule.kt.)
  const sealed = Crypto.AESSealedData.fromCombined(base64ToBytes(combinedBase64), { ivLength: 12, tagLength: 16 });
  const plaintextBytes = await Crypto.aesDecryptAsync(sealed, key, { output: "bytes" });
  return bytesToUtf8(plaintextBytes);
}

export default { randomBytesBase64, deriveKeyHex, encrypt, decrypt };
