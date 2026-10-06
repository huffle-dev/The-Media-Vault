// GOG connection/sync state — shared by the API Keys tab's Games section (login/
// disconnect) and the Resync tab (resync button + auto-sync toggle). Called
// once in SettingsModal and passed down as a single object, so there's
// exactly one source of truth.
import { useState, useEffect } from "react";
import { cleanIpcError } from "../tokens.js";
import { runGogSync } from "../sync/gogSync.js";

export function useGogAccount(onLibraryUpdate) {
  const [gogConnected, setGogConnected] = useState(false);
  const [gogLoggingIn, setGogLoggingIn] = useState(false);
  const [gogSyncing, setGogSyncing]     = useState(false);
  const [gogResult, setGogResult]       = useState(null); // null | { imported, skipped } | { error }
  const [autoGogSyncOnLaunch, setAutoGogSyncOnLaunch] = useState(false);
  // GOG import is unofficial and OFF until the user turns it on (settings/GogCard.jsx).
  // An install that is already signed in to GOG counts as having turned it on.
  const [gogEnabled, setGogEnabled] = useState(false);

  useEffect(() => {
    window.vault.gog.isConnected().then((c) => { setGogConnected(c); if (c) setGogEnabled(true); });
    window.vault.settings.get("gog_enabled").then((v) => { if (v === "1") setGogEnabled(true); });
    window.vault.settings.get("auto_gog_sync_on_launch").then(v => {
      setAutoGogSyncOnLaunch(v === "1");
    });
  }, []);

  const handleToggleAutoGogSyncOnLaunch = (checked) => {
    setAutoGogSyncOnLaunch(checked);
    window.vault.settings.set("auto_gog_sync_on_launch", checked ? "1" : "0");
  };

  const handleGogLogin = async () => {
    setGogLoggingIn(true);
    setGogResult(null);
    try {
      await window.vault.gog.login();
      setGogConnected(true);
    } catch (err) {
      setGogResult({ error: cleanIpcError(err) || "GOG login didn't complete — try again." });
    } finally {
      setGogLoggingIn(false);
    }
  };

  // Turning it off also signs out, so nothing keeps working in the background.
  const handleGogEnabledChange = async (on) => {
    if (!on && gogConnected) await handleGogDisconnect();
    setGogEnabled(on);
    setAutoGogSyncOnLaunch(on ? autoGogSyncOnLaunch : false);
    await window.vault.settings.set("gog_enabled", on ? "1" : "0");
    if (!on) await window.vault.settings.set("auto_gog_sync_on_launch", "0");
  };

  const handleGogDisconnect = async () => {
    await window.vault.gog.disconnect();
    setGogConnected(false);
    setGogResult(null);
  };

  const handleGogResync = async () => {
    if (!gogConnected) {
      setGogResult({ error: "Log in with GOG in API Keys → Games first." });
      return;
    }
    setGogSyncing(true);
    setGogResult(null);
    try {
      const res = await runGogSync();
      setGogResult(res);
      if (onLibraryUpdate) onLibraryUpdate();
    } catch (err) {
      setGogResult({ error: cleanIpcError(err) || "Sync failed." });
    } finally {
      setGogSyncing(false);
    }
  };

  return {
    gogConnected, gogLoggingIn, gogSyncing, gogResult,
    handleGogLogin, handleGogDisconnect, handleGogResync,
    autoGogSyncOnLaunch, handleToggleAutoGogSyncOnLaunch,
    gogEnabled, handleGogEnabledChange,
  };
}
