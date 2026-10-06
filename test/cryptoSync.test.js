import { describe, it, expect } from "vitest";
import cryptoSyncModule from "../packages/core/cryptoSync.js";
import nodeAdapter from "../lib/cryptoAdapterNode.js";

const {
  setupNewVault, unlockWithPassphrase, unlockWithRecoveryKey,
  encryptSecret, decryptSecret, bytesToRecoveryKey, recoveryKeyToHex,
} = cryptoSyncModule;

describe("setupNewVault + unlockWithPassphrase", () => {
  it("unlocks to the same master key with the correct passphrase", async () => {
    const { masterKeyHex, saltBase64, wrappedByPassphrase } = await setupNewVault(nodeAdapter, "correct horse battery staple");
    const unlocked = await unlockWithPassphrase(nodeAdapter, "correct horse battery staple", saltBase64, wrappedByPassphrase);
    expect(unlocked).toBe(masterKeyHex);
  });

  it("rejects a wrong passphrase rather than silently returning garbage", async () => {
    const { saltBase64, wrappedByPassphrase } = await setupNewVault(nodeAdapter, "correct horse battery staple");
    await expect(
      unlockWithPassphrase(nodeAdapter, "wrong passphrase entirely", saltBase64, wrappedByPassphrase)
    ).rejects.toThrow();
  });

  it("rejects the right passphrase against the wrong salt (GCM auth tag catches tampering/mismatch)", async () => {
    const a = await setupNewVault(nodeAdapter, "same passphrase");
    const b = await setupNewVault(nodeAdapter, "same passphrase");
    await expect(
      unlockWithPassphrase(nodeAdapter, "same passphrase", a.saltBase64, b.wrappedByPassphrase)
    ).rejects.toThrow();
  });
});

describe("setupNewVault + unlockWithRecoveryKey", () => {
  it("unlocks to the same master key with the real recovery key", async () => {
    const { masterKeyHex, wrappedByRecovery, recoveryKeyDisplay } = await setupNewVault(nodeAdapter, "a passphrase");
    const unlocked = await unlockWithRecoveryKey(nodeAdapter, recoveryKeyDisplay, wrappedByRecovery);
    expect(unlocked).toBe(masterKeyHex);
  });

  it("rejects a wrong recovery key", async () => {
    const { wrappedByRecovery } = await setupNewVault(nodeAdapter, "a passphrase");
    const other = await setupNewVault(nodeAdapter, "a passphrase");
    await expect(
      unlockWithRecoveryKey(nodeAdapter, other.recoveryKeyDisplay, wrappedByRecovery)
    ).rejects.toThrow();
  });

  it("recovery key and passphrase both unlock the SAME master key independently", async () => {
    const { masterKeyHex, saltBase64, wrappedByPassphrase, wrappedByRecovery, recoveryKeyDisplay } =
      await setupNewVault(nodeAdapter, "a real passphrase");
    const viaPassphrase = await unlockWithPassphrase(nodeAdapter, "a real passphrase", saltBase64, wrappedByPassphrase);
    const viaRecovery = await unlockWithRecoveryKey(nodeAdapter, recoveryKeyDisplay, wrappedByRecovery);
    expect(viaPassphrase).toBe(masterKeyHex);
    expect(viaRecovery).toBe(masterKeyHex);
  });
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a real API-key-shaped string", async () => {
    const { masterKeyHex } = await setupNewVault(nodeAdapter, "passphrase");
    const ciphertext = await encryptSecret(nodeAdapter, masterKeyHex, "abcdef0123456789abcdef0123456789");
    expect(ciphertext).not.toContain("abcdef0123456789abcdef0123456789"); // never store plaintext-shaped data
    const plaintext = await decryptSecret(nodeAdapter, masterKeyHex, ciphertext);
    expect(plaintext).toBe("abcdef0123456789abcdef0123456789");
  });

  it("two encryptions of the same plaintext produce different ciphertext (random IV per call)", async () => {
    const { masterKeyHex } = await setupNewVault(nodeAdapter, "passphrase");
    const a = await encryptSecret(nodeAdapter, masterKeyHex, "same-secret");
    const b = await encryptSecret(nodeAdapter, masterKeyHex, "same-secret");
    expect(a).not.toBe(b);
  });

  it("rejects decryption with the wrong master key", async () => {
    const vaultA = await setupNewVault(nodeAdapter, "passphrase");
    const vaultB = await setupNewVault(nodeAdapter, "passphrase");
    const ciphertext = await encryptSecret(nodeAdapter, vaultA.masterKeyHex, "secret");
    await expect(decryptSecret(nodeAdapter, vaultB.masterKeyHex, ciphertext)).rejects.toThrow();
  });
});

describe("recovery key display encoding", () => {
  it("round-trips through display format back to the same hex", () => {
    const bytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) bytes[i] = (i * 37 + 11) % 256;
    const display = bytesToRecoveryKey(bytes);
    expect(display).toMatch(/^[0-9A-Z-]+$/);
    expect(display.split("-").every(g => g.length === 4)).toBe(true);
    const hex = recoveryKeyToHex(display);
    const expectedHex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    expect(hex).toBe(expectedHex);
  });

  it("excludes visually-confusing characters (no I, L, O, U)", () => {
    const bytes = new Uint8Array(20).fill(255);
    const display = bytesToRecoveryKey(bytes);
    expect(display).not.toMatch(/[ILOU]/);
  });

  it("is case-insensitive on the way back in", () => {
    const bytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) bytes[i] = i * 13;
    const display = bytesToRecoveryKey(bytes);
    expect(recoveryKeyToHex(display.toLowerCase())).toBe(recoveryKeyToHex(display));
  });

  it("rejects an invalid character clearly rather than silently producing wrong bytes", () => {
    expect(() => recoveryKeyToHex("!!!!-!!!!-!!!!-!!!!-!!!!")).toThrow(/Invalid recovery key/);
  });
});
