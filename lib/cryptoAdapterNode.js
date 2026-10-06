// Node implementation of packages/core/cryptoSync.js's crypto adapter
// interface, for desktop. Deliberately kept out of packages/core — it
// requires Node's built-in "crypto" module directly, which Metro can't
// resolve for a mobile bundle (same class of problem movie.js's storage
// adapter exists to avoid — see that file's header comment).
const crypto = require("crypto");
const { PBKDF2_ITERATIONS } = require("@media-vault/core/cryptoSync");

function randomBytesBase64(n) {
  return Promise.resolve(crypto.randomBytes(n).toString("base64"));
}

function deriveKeyHex(passphrase, saltBase64) {
  return new Promise((resolve, reject) => {
    const salt = Buffer.from(saltBase64, "base64");
    crypto.pbkdf2(passphrase, salt, PBKDF2_ITERATIONS, 32, "sha256", (err, key) => {
      if (err) reject(err); else resolve(key.toString("hex"));
    });
  });
}

// Combined wire format: iv(12) || ciphertext || tag(16), base64 — matches
// expo-crypto's AESSealedData.combined()/fromCombined() exactly, so a
// secret encrypted on one platform decrypts cleanly on the other.
function encrypt(keyHex, plaintextUtf8) {
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextUtf8, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Promise.resolve(Buffer.concat([iv, ciphertext, tag]).toString("base64"));
}

function decrypt(keyHex, combinedBase64) {
  const key = Buffer.from(keyHex, "hex");
  const combined = Buffer.from(combinedBase64, "base64");
  const iv = combined.subarray(0, 12);
  const tag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(12, combined.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return Promise.resolve(plaintext.toString("utf8"));
}

module.exports = { randomBytesBase64, deriveKeyHex, encrypt, decrypt };
