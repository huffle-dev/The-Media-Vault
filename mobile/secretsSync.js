// Mobile side of Encrypted Key Sync (V3 suggested-order step 5) — unlocking
// an already-set-up vault (desktop is where a vault actually gets created;
// see settings/EncryptedKeySyncSection.jsx) and pulling/decrypting synced
// secrets. The master key, once unlocked, is cached in the device's secure
// storage (Android Keystore-backed) so this only needs doing once per phone,
// not once per app launch.
import * as SecureStore from "expo-secure-store";
import cryptoSyncModule from "@media-vault/core/cryptoSync";
import cryptoAdapterExpo from "./cryptoAdapterExpo";
import { supabase } from "./supabase";

const { unlockWithPassphrase, unlockWithRecoveryKey, decryptSecret } = cryptoSyncModule;
const MASTER_KEY_STORE_KEY = "secret_vault_master_key";

export async function getCachedMasterKey() {
  return SecureStore.getItemAsync(MASTER_KEY_STORE_KEY);
}

export async function forgetMasterKey() {
  await SecureStore.deleteItemAsync(MASTER_KEY_STORE_KEY);
}

export async function vaultExists() {
  const { data } = await supabase.from("secret_vault").select("user_id").maybeSingle();
  return !!data;
}

async function fetchVaultRow() {
  const { data, error } = await supabase.from("secret_vault").select("*").single();
  if (error || !data) throw new Error("No key vault found for this account yet — set it up on desktop first (Settings → Cloud Sync).");
  return data;
}

export async function unlockVaultWithPassphrase(passphrase) {
  const row = await fetchVaultRow();
  const masterKeyHex = await unlockWithPassphrase(cryptoAdapterExpo, passphrase, row.salt, row.wrapped_master_key_passphrase)
    .catch(() => { throw new Error("Wrong passphrase, or it doesn't match what's set up on desktop."); });
  await SecureStore.setItemAsync(MASTER_KEY_STORE_KEY, masterKeyHex);
  return masterKeyHex;
}

export async function unlockVaultWithRecoveryKey(recoveryKeyDisplay) {
  const row = await fetchVaultRow();
  const masterKeyHex = await unlockWithRecoveryKey(cryptoAdapterExpo, recoveryKeyDisplay.trim(), row.wrapped_master_key_recovery)
    .catch(() => { throw new Error("That recovery key doesn't match what's set up on desktop."); });
  await SecureStore.setItemAsync(MASTER_KEY_STORE_KEY, masterKeyHex);
  return masterKeyHex;
}

// Pulls and decrypts one synced secret (e.g. "tmdb_api_key") using an
// already-unlocked master key. Returns null if that secret hasn't been
// synced yet (e.g. desktop hasn't run Sync since setting a key).
export async function pullSecret(masterKeyHex, keyName) {
  const { data, error } = await supabase.from("encrypted_secrets").select("ciphertext").eq("key_name", keyName).maybeSingle();
  if (error) throw new Error(error.message); // couldn't ask (offline?): different from "no such key"
  if (!data) return null;
  return decryptSecret(cryptoAdapterExpo, masterKeyHex, data.ciphertext);
}
