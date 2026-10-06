// Encrypted key sync orchestration (V3 suggested-order step 5). Pure logic
// over an injected crypto adapter — the actual primitives (PBKDF2, AES-GCM,
// random bytes) are real platform APIs that differ enough (Node's crypto
// module vs. Expo's async Crypto API) that there's nothing safe to share
// below this line; only the setup/unlock/wrap/unwrap *sequence* is shared,
// same reasoning as movie.js's storage adapter.
//
// Adapter shape every platform must implement, all async:
//   randomBytesBase64(n)                      -> Promise<string>  (base64)
//   deriveKeyHex(passphrase, saltBase64)      -> Promise<string>  (hex, 256-bit)
//   encrypt(keyHex, plaintextUtf8)            -> Promise<string>  (base64: iv+ciphertext+tag)
//   decrypt(keyHex, combinedBase64)           -> Promise<string>  (plaintext utf8)
//
// PBKDF2 (not Argon2id) is the deliberate compromise here: libsodium's
// Argon2id is WASM-based, and Hermes (React Native's JS engine) has no
// WebAssembly support at all — shipping it would mean a custom development
// build instead of Expo Go, a much bigger ask than this feature warrants
// right now. PBKDF2-HMAC-SHA256 at a strong iteration count is the
// standard, well-analyzed fallback when Argon2 isn't available (OWASP's
// own 2023 guidance lists it as an acceptable alternative), not a
// hand-rolled substitute.
const PBKDF2_ITERATIONS = 210000; // OWASP 2023 minimum for PBKDF2-HMAC-SHA256

// Recovery key: 20 random bytes (160 bits) chosen so its base32 display
// comes out to a clean 32 characters — but AES-256 needs a 32-*byte*
// (256-bit) key, so it's stretched through the same KDF as the passphrase
// path uses, under a fixed, non-secret salt (RECOVERY_KEY_SALT below).
// That's safe specifically because the input here is already 160 bits of
// real random entropy, not a guessable human passphrase — a salt exists to
// defeat precomputation against *low*-entropy secrets shared across many
// users, which doesn't apply to a value this random and this unique.
const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_KEY_SALT = "bWVkaWEtdmF1bHQtcmVjb3ZlcnkS"; // fixed, public — see comment above

function bytesToRecoveryKey(bytes) {
  // 20 bytes -> 32 base32 characters (5 bits each), grouped in 4s.
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += RECOVERY_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out.match(/.{1,4}/g).join("-");
}

function recoveryKeyToBytes(displayKey) {
  const chars = displayKey.replace(/-/g, "").toUpperCase();
  let bits = "";
  for (const c of chars) {
    const v = RECOVERY_ALPHABET.indexOf(c);
    if (v === -1) throw new Error(`Invalid recovery key character: ${c}`);
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

// Exported mainly for direct unit testing of the encode/decode round trip —
// unlockWithRecoveryKey itself goes through recoveryKeyToBytes -> base64 ->
// the same deriveKeyHex path setupNewVault used, not this.
function recoveryKeyToHex(displayKey) {
  return Array.from(recoveryKeyToBytes(displayKey)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// First-ever setup on any device for this account: generates a fresh
// master key and wraps it two independent ways. Returns everything the
// caller needs to both store in the cloud (salt + both wrapped copies) and
// show the user once (recoveryKeyDisplay) — the master key itself
// (masterKeyHex) is for this call's caller to cache locally right away,
// never re-derived from the wrapped copies on the device that just made them.
async function setupNewVault(adapter, passphrase) {
  const masterKeyHex = await adapter.randomBytesBase64(32).then(b64ToHex);
  const saltBase64 = await adapter.randomBytesBase64(16);
  const passphraseKeyHex = await adapter.deriveKeyHex(passphrase, saltBase64);
  const wrappedByPassphrase = await adapter.encrypt(passphraseKeyHex, masterKeyHex);

  const recoveryBytesBase64 = await adapter.randomBytesBase64(20);
  const recoveryKeyDisplay = bytesToRecoveryKey(base64ToBytes(recoveryBytesBase64));
  const recoveryKeyHex = await adapter.deriveKeyHex(recoveryBytesBase64, RECOVERY_KEY_SALT);
  const wrappedByRecovery = await adapter.encrypt(recoveryKeyHex, masterKeyHex);

  return { masterKeyHex, saltBase64, wrappedByPassphrase, wrappedByRecovery, recoveryKeyDisplay };
}

// A device joining an already-set-up vault (or re-unlocking after
// disconnect) — derives the same passphrase key from the stored salt and
// unwraps the master key the first device made.
async function unlockWithPassphrase(adapter, passphrase, saltBase64, wrappedByPassphrase) {
  const passphraseKeyHex = await adapter.deriveKeyHex(passphrase, saltBase64);
  return adapter.decrypt(passphraseKeyHex, wrappedByPassphrase);
}

// Passphrase forgotten — the recovery key shown once at setup unwraps the
// same master key independently of the passphrase path. Goes through the
// same bytes -> base64 -> deriveKeyHex(RECOVERY_KEY_SALT) path setupNewVault
// used to wrap it, so it must be reproduced exactly, not shortcut.
async function unlockWithRecoveryKey(adapter, recoveryKeyDisplay, wrappedByRecovery) {
  const recoveryBytesBase64 = bytesToBase64(recoveryKeyToBytes(recoveryKeyDisplay));
  const recoveryKeyHex = await adapter.deriveKeyHex(recoveryBytesBase64, RECOVERY_KEY_SALT);
  return adapter.decrypt(recoveryKeyHex, wrappedByRecovery);
}

async function encryptSecret(adapter, masterKeyHex, plaintext) {
  return adapter.encrypt(masterKeyHex, plaintext);
}

async function decryptSecret(adapter, masterKeyHex, ciphertextBase64) {
  return adapter.decrypt(masterKeyHex, ciphertextBase64);
}

// ── tiny base64/hex helpers ──────────────────────────────────────────────
// atob/btoa deliberately used bare, no Buffer fallback: Hermes (React
// Native's JS engine) has no Buffer global, but does have atob/btoa (Expo's
// own SDK docs use them bare in example code) — and Node 18+ (what this
// project runs) has both globally too, so one code path covers both
// platforms without a speculative fallback.
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToBase64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64ToHex(b64) {
  return Array.from(base64ToBytes(b64)).map(b => b.toString(16).padStart(2, "0")).join("");
}

module.exports = {
  PBKDF2_ITERATIONS,
  setupNewVault, unlockWithPassphrase, unlockWithRecoveryKey,
  encryptSecret, decryptSecret,
  bytesToRecoveryKey, recoveryKeyToHex, // exported for direct unit testing
};
