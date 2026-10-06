// The phone's Supabase client, for the server the USER chose (their own
// Supabase project — see ServerSetupForm.js). The URL and publishable key are
// kept on the phone (they are public by design: row-level security limits what
// they can reach) and the client is built from them, so every screen keeps
// importing `supabase` while the thing behind it can change.
//
// LEGACY is the project this app used before the server was configurable. It
// applies only to a phone that is ALREADY signed in to it (so updating doesn't
// log anyone out); a fresh install starts with no server and asks for one.
// Release step: empty both strings before publishing a build.
import "react-native-url-polyfill/auto";
import "expo-sqlite/localStorage/install";
import { useSyncExternalStore } from "react";
import { createClient } from "@supabase/supabase-js";
import { secureSessionStorage } from "./secureSessionStorage";
import setup from "@media-vault/core/supabaseSetup";

const { resolveSupabaseConfig, normalizeSupabaseUrl, validateSupabaseKey } = setup;

const LEGACY = {
  url: "",
  key: "",
};
const URL_KEY = "mobile_server_url";
const KEY_KEY = "mobile_server_key";

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* best-effort */ } };

// supabase-js stores a session under sb-<project ref>-auth-token.
const sessionKeyFor = (url) => `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;

const buildClient = ({ url, key }) => createClient(url, key, {
  auth: {
    // The session (access + refresh JWT) is encrypted at rest — see
    // secureSessionStorage.js for why this isn't plain SecureStore or
    // plain localStorage on its own.
    storage: secureSessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

let config = resolveSupabaseConfig({
  savedUrl: safeGet(URL_KEY),
  savedKey: safeGet(KEY_KEY),
  legacy: LEGACY,
  hasExistingLogin: !!LEGACY.url && safeGet(sessionKeyFor(LEGACY.url)) != null,
});
// An install that was already signed in to the old server keeps it, written down so it
// survives a later sign-out (like the desktop app does).
if (config && config.source === "legacy") { safeSet(URL_KEY, config.url); safeSet(KEY_KEY, config.key); }
let client = config ? buildClient(config) : null;
let version = 0;
const listeners = new Set();
const notify = () => { version += 1; listeners.forEach((l) => l()); };

// { url, key, source } or null when no server has been set up yet.
export const getServerConfig = () => config;
export const serverHost = () => (config ? new URL(config.url).host : null);

// React hook: re-renders when the server is set or changed. Returns the config.
export function useServerConfig() {
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => version,
  );
  return config;
}

// Saves a server (already tested by the caller). A DIFFERENT server first signs
// this phone out of the old one — local only, no network — and the library and
// key caches drop with it because the app treats "no session" as sign-out.
export async function saveServerConfig(rawUrl, rawKey) {
  const u = normalizeSupabaseUrl(rawUrl);
  if (!u.ok) throw new Error(u.error);
  const k = validateSupabaseKey(rawKey);
  if (!k.ok) throw new Error(k.error);
  const changed = !config || config.url !== u.url || config.key !== k.key;
  if (changed && client) { try { await client.auth.signOut({ scope: "local" }); } catch { /* nothing to sign out of */ } }
  safeSet(URL_KEY, u.url);
  safeSet(KEY_KEY, k.key);
  config = { url: u.url, key: k.key, source: "saved" };
  client = buildClient(config);
  notify();
  return { changed };
}

// Every screen uses this exactly like a normal client.
export const supabase = new Proxy({}, {
  get(_target, prop) {
    if (!client) throw new Error("No server set up yet — enter your Supabase project on the sign-in screen.");
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
