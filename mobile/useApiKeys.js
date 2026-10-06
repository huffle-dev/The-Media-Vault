// Resolves every API key mobile can use: synced from the encrypted vault
// first (a vault already unlocked on this phone — Encrypted Key Sync, V3
// step 5), with a manually-pasted local fallback for the single-string
// keys. Shared by AddItemScreen.js (search), the tile grid (cover art) and
// Settings → API keys & sync, so they can't drift on which key ends up used.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { forgetMasterKey, getCachedMasterKey, pullSecret } from "./secretsSync";

// keys-object field -> the name desktop syncs it under (SYNCED_SECRET_KEYS
// in main.js).
export const SECRET_NAMES = {
  tmdb: "tmdb_api_key",
  discogs: "discogs_api_key",
  youtube: "youtube_api_key",
  igdbId: "igdb_client_id",
  igdbSecret: "igdb_client_secret",
  gemini: "gemini_api_key",
  steam: "steam_api_key",
  steamId: "steam_id",
};

// Only single-string keys have a manual-paste fallback (IGDB needs two
// values, so it's sync-only). tmdb keeps its original storage key so a key
// pasted before this hook existed still resolves.
const LOCAL_KEYS = {
  tmdb: "mobile_tmdb_api_key",
  discogs: "mobile_discogs_api_key",
  youtube: "mobile_youtube_api_key",
  gemini: "mobile_gemini_api_key",
  steam: "mobile_steam_api_key",
  steamId: "mobile_steam_id",
};

// Pasted keys are secrets same as the synced ones, so they belong in the
// Keystore-backed SecureStore, not the unencrypted localStorage shim.
async function readLocal(name) {
  if (!LOCAL_KEYS[name]) return null;
  try {
    const stored = await SecureStore.getItemAsync(LOCAL_KEYS[name]);
    if (stored) return stored;
    // A key pasted before keys moved to SecureStore lives in the old
    // localStorage shim: move it across once so updating doesn't lose it.
    const legacy = localStorage.getItem(LOCAL_KEYS[name]);
    if (legacy) {
      await SecureStore.setItemAsync(LOCAL_KEYS[name], legacy);
      localStorage.removeItem(LOCAL_KEYS[name]);
      return legacy;
    }
    return null;
  } catch { return null; }
}

// A synced key is kept on the phone (Keystore-backed SecureStore, like the pasted ones) after each
// successful pull, so with no connection the keys are still there. Cleared on sign-out / forgetting the vault.
const SYNCED_CACHE = (name) => `synced_${name}`;
const clearSyncedCache = () => Promise.all(Object.keys(SECRET_NAMES).map((n) => SecureStore.deleteItemAsync(SYNCED_CACHE(n)).catch(() => {})));

// Returns { keys, sources }: sources[name] is "synced", "manual" or null.
export async function loadApiKeys(masterKeyHex) {
  const keys = {};
  const sources = {};
  await Promise.all(Object.keys(SECRET_NAMES).map(async (name) => {
    let value = null;
    if (masterKeyHex) {
      try {
        value = await pullSecret(masterKeyHex, SECRET_NAMES[name]);
        // Reached the server: remember the answer (or forget a key removed on the desktop).
        if (value) await SecureStore.setItemAsync(SYNCED_CACHE(name), value).catch(() => {});
        else await SecureStore.deleteItemAsync(SYNCED_CACHE(name)).catch(() => {});
      } catch {
        // Couldn't reach the server: use the copy kept from last time.
        value = await SecureStore.getItemAsync(SYNCED_CACHE(name)).catch(() => null);
      }
    } else {
      SecureStore.deleteItemAsync(SYNCED_CACHE(name)).catch(() => {});
    }
    if (value) { keys[name] = value; sources[name] = "synced"; return; }
    const local = await readLocal(name);
    keys[name] = local;
    sources[name] = local ? "manual" : null;
  }));
  return { keys, sources };
}

const ApiKeysContext = createContext(null);

// One shared copy of the keys for every screen — loaded once (instead of
// each screen re-pulling every secret from Supabase on mount), and updated
// everywhere at once when Settings unlocks the vault or pastes a key.
// `enabled` is false while signed out: nothing loads, and the phone forgets
// the unlocked vault key and any pasted keys, so the next person to sign in
// starts clean (same idea as the library cache being wiped on sign-out).
export function ApiKeysProvider({ enabled, children }) {
  const [state, setState] = useState({ keys: undefined, sources: {} });

  // Resolves to the loaded keys object.
  const reload = useCallback(async (masterKeyHex) => {
    const loaded = await loadApiKeys(masterKeyHex !== undefined ? masterKeyHex : await getCachedMasterKey());
    setState(loaded);
    return loaded.keys;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState({ keys: undefined, sources: {} });
      forgetMasterKey().catch(() => {});
      for (const k of Object.values(LOCAL_KEYS)) { SecureStore.deleteItemAsync(k).catch(() => {}); }
      clearSyncedCache();
      return;
    }
    reload();
  }, [enabled, reload]);

  const saveLocalKey = useCallback(async (name, value) => {
    await SecureStore.setItemAsync(LOCAL_KEYS[name], value);
    setState((prev) => prev.sources[name] === "synced"
      ? prev
      : { keys: { ...prev.keys, [name]: value }, sources: { ...prev.sources, [name]: "manual" } });
  }, []);

  // Removes the phone's own pasted copy (a synced key is untouched).
  const removeLocalKey = useCallback(async (name) => {
    try { await SecureStore.deleteItemAsync(LOCAL_KEYS[name]); } catch { /* nothing to remove */ }
    return reload();
  }, [reload]);

  // Forgets the unlocked vault on this phone (synced keys go until unlocked again).
  const forgetVault = useCallback(async () => {
    await forgetMasterKey();
    return reload(null);
  }, [reload]);

  const value = {
    keys: state.keys, sources: state.sources, reload, saveLocalKey, removeLocalKey, forgetVault,
    canPasteManually: (name) => !!LOCAL_KEYS[name],
  };
  return <ApiKeysContext.Provider value={value}>{children}</ApiKeysContext.Provider>;
}

// keys is undefined while still loading.
export const useApiKeys = () => useContext(ApiKeysContext);
