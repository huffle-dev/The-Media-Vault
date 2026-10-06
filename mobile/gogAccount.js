// This phone's own GOG sign-in: whether the person turned GOG import on (it is off by default,
// behind a warning), and the refresh token GOG hands back. The token stays on this phone in
// the Keystore-backed secure store; it is never synced (GOG rotates it on every use, so each
// device keeps its own).
import * as SecureStore from "expo-secure-store";

const ENABLED = "mobile_gog_enabled";
const TOKEN = "mobile_gog_refresh_token";

export const gogEnabled = () => { try { return localStorage.getItem(ENABLED) === "1"; } catch { return false; } };

// Turning it off also signs out.
export async function setGogEnabled(on) {
  try { localStorage.setItem(ENABLED, on ? "1" : "0"); } catch { /* shows as off next time */ }
  if (!on) await clearGogToken();
}

export const getGogToken = () => SecureStore.getItemAsync(TOKEN).catch(() => null);
export const saveGogToken = (token) => SecureStore.setItemAsync(TOKEN, token);
export const clearGogToken = () => SecureStore.deleteItemAsync(TOKEN).catch(() => {});
