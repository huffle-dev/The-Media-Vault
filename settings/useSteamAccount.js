// Steam account/credentials/sync state — shared by the API Keys tab's Games section
// (the credentials form) and the Resync tab (resync button + auto-sync
// toggle). Called once in SettingsModal and passed down as a single object,
// so there's one source of truth rather than two copies that could drift apart.
import { useState, useEffect } from "react";
import { cleanIpcError } from "../tokens.js";
import { runSteamSync } from "../sync/steamSync.js";
import { checkSteamId, checkSteamKey } from "./steamValidation.js";

export function useSteamAccount(onLibraryUpdate) {
  const [steamId, setSteamId]         = useState("");
  const [steamKey, setSteamKey]       = useState("");
  const [steamSaved, setSteamSaved]   = useState(false);
  const [steamErrors, setSteamErrors] = useState({ id: null, key: null });
  const [steamSyncing, setSteamSyncing] = useState(false);
  const [steamResult, setSteamResult] = useState(null); // null | { imported, skipped } | { error }
  const [autoSteamSyncOnLaunch, setAutoSteamSyncOnLaunch] = useState(false);

  useEffect(() => {
    window.vault.settings.get("steam_id").then(v => { if (v) setSteamId(v); });
    window.vault.settings.get("steam_api_key").then(v => { if (v) setSteamKey(v); });
    window.vault.settings.get("auto_steam_sync_on_launch").then(v => {
      setAutoSteamSyncOnLaunch(v === "1");
    });
  }, []);

  const handleToggleAutoSteamSyncOnLaunch = (checked) => {
    setAutoSteamSyncOnLaunch(checked);
    window.vault.settings.set("auto_steam_sync_on_launch", checked ? "1" : "0");
  };

  // Validates before writing; returns the normalized { id, key } that was
  // saved (a pasted /profiles/ URL becomes the bare ID), or null if a field
  // failed its format check — the inline errors say which.
  const handleSteamSave = async () => {
    const id = checkSteamId(steamId);
    const key = checkSteamKey(steamKey);
    setSteamErrors({ id: id.error, key: key.error });
    if (id.error || key.error) return null;
    await Promise.all([
      window.vault.settings.set("steam_id", id.value),
      window.vault.settings.set("steam_api_key", key.value),
    ]);
    setSteamId(id.value);
    setSteamKey(key.value);
    setSteamSaved(true);
    setTimeout(() => setSteamSaved(false), 2000);
    return { id: id.value, key: key.value };
  };

  const handleSteamResync = async () => {
    if (!steamId.trim() || !steamKey.trim()) {
      setSteamResult({ error: "Steam ID and API key are required — add them in API Keys → Games first." });
      return;
    }
    setSteamSyncing(true);
    setSteamResult(null);
    try {
      const saved = await handleSteamSave();
      if (!saved) {
        setSteamResult({ error: "Steam ID or API key looks wrong — fix it in API Keys → Games first." });
        return;
      }
      const res = await runSteamSync({ steamId: saved.id, apiKey: saved.key });
      setSteamResult(res);
      if (onLibraryUpdate) onLibraryUpdate();
    } catch (err) {
      setSteamResult({ error: cleanIpcError(err) || "Sync failed." });
    } finally {
      setSteamSyncing(false);
    }
  };

  return {
    steamId, setSteamId, steamKey, setSteamKey, steamSaved, setSteamSaved,
    steamErrors, setSteamErrors, steamSyncing, steamResult, handleSteamSave, handleSteamResync,
    autoSteamSyncOnLaunch, handleToggleAutoSteamSyncOnLaunch,
  };
}
