// Supabase's auth storage adapter, hardened against two problems with
// using either half naively: SecureStore (Keystore-backed) caps individual
// values around 2KB — too small for a full session object (access +
// refresh JWT plus user metadata) — while the sqlite-backed `localStorage`
// shim (see supabase.js) has no such limit but stores everything in plain
// text on disk. So: a random AES-256 key lives in SecureStore (small,
// Keystore-protected), and it encrypts whatever Supabase actually stores,
// which then goes into the unlimited-size localStorage shim as ciphertext
// only. Same expo-crypto primitives as cryptoAdapterExpo.js, but a
// separate, randomly-generated key — this isn't the vault's own secret
// sync, just at-rest protection for the session cache.
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const ENCRYPTION_KEY_NAME = "supabase_session_storage_key";

function utf8ToBytes(str) { return new TextEncoder().encode(str); }
function bytesToUtf8(bytes) { return new TextDecoder().decode(bytes); }
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

let keyPromise = null;
async function getOrCreateKeyHex() {
  if (!keyPromise) {
    keyPromise = (async () => {
      const existing = await SecureStore.getItemAsync(ENCRYPTION_KEY_NAME);
      if (existing) return existing;
      const bytes = await Crypto.getRandomBytesAsync(32);
      const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      await SecureStore.setItemAsync(ENCRYPTION_KEY_NAME, hex);
      return hex;
    })();
  }
  return keyPromise;
}

async function encrypt(plaintext) {
  const keyHex = await getOrCreateKeyHex();
  const key = await Crypto.AESEncryptionKey.import(keyHex, "hex");
  const sealed = await Crypto.aesEncryptAsync(utf8ToBytes(plaintext), key);
  return sealed.combined("base64");
}

async function decrypt(combinedBase64) {
  const keyHex = await getOrCreateKeyHex();
  const key = await Crypto.AESEncryptionKey.import(keyHex, "hex");
  const sealed = Crypto.AESSealedData.fromCombined(base64ToBytes(combinedBase64), { ivLength: 12, tagLength: 16 });
  const plaintextBytes = await Crypto.aesDecryptAsync(sealed, key, { output: "bytes" });
  return bytesToUtf8(plaintextBytes);
}

// Matches supabase-js's expected storage interface (getItem/setItem/
// removeItem, all async-tolerant).
export const secureSessionStorage = {
  async getItem(key) {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    try { return await decrypt(raw); } catch { /* not ciphertext, or the key was lost — see below */ }
    // A session stored by an earlier version of the app is plain JSON. Accept it
    // once and re-save it encrypted, so installing this update doesn't sign
    // anyone out. Anything else undecryptable (e.g. the key is gone) means
    // signed out, not a crash.
    if (raw.trimStart().startsWith("{")) {
      try {
        JSON.parse(raw);
        await this.setItem(key, raw);
        return raw;
      } catch { /* not JSON either */ }
    }
    localStorage.removeItem(key);
    return null;
  },
  async setItem(key, value) {
    localStorage.setItem(key, await encrypt(value));
  },
  async removeItem(key) {
    localStorage.removeItem(key);
  },
};
