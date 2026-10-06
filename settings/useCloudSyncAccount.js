// Cloud Sync connection/sync state — shared by the Cloud Sync tab
// (login form / disconnect) and the Resync tab (sync button + auto-sync
// toggle), same pattern as useGogAccount.js. Called once
// in SettingsModal and passed down as a single object, so there's exactly
// one source of truth.
import { useState, useEffect } from "react";
import { cleanIpcError } from "../tokens.js";
import { runCloudSync } from "../sync/cloudSync.js";
import { validateSignUp, SIGN_UP_MESSAGES } from "@media-vault/core/authForm.js";

export function useCloudSyncAccount(onLibraryUpdate) {
  const [cloudSyncConnected, setCloudSyncConnected] = useState(false);
  const [cloudSyncEmail, setCloudSyncEmail]         = useState(null);
  const [cloudSyncLoggingIn, setCloudSyncLoggingIn] = useState(false);
  const [cloudSyncSyncing, setCloudSyncSyncing]     = useState(false);
  const [cloudSyncResult, setCloudSyncResult]       = useState(null); // null | { summary } | { error }
  const [autoCloudSyncOnLaunch, setAutoCloudSyncOnLaunch] = useState(false);
  // "off" | "launch" | "auto" — see lib/autoSync.js. Unset means whatever the old
  // "sync when the app opens" checkbox said.
  const [cloudSyncMode, setCloudSyncMode] = useState("off");
  // Whether a server (the user's own Supabase project) has been set up; the
  // sign-in form only shows once it has.
  const [serverConfigured, setServerConfigured] = useState(true);

  useEffect(() => {
    window.vault.cloudSync.isConnected().then(setCloudSyncConnected);
    window.vault.cloudSync.getConfig().then((c) => setServerConfigured(!!c.configured)).catch(() => {});
    window.vault.settings.get("cloud_sync_email").then(setCloudSyncEmail);
    Promise.all([
      window.vault.settings.get("cloud_sync_mode"),
      window.vault.settings.get("auto_cloud_sync_on_launch"),
    ]).then(([mode, legacy]) => {
      setAutoCloudSyncOnLaunch(legacy === "1");
      setCloudSyncMode(mode || (legacy === "1" ? "launch" : "off"));
    });
  }, []);

  const handleToggleAutoCloudSyncOnLaunch = (checked) => {
    setAutoCloudSyncOnLaunch(checked);
    window.vault.settings.set("auto_cloud_sync_on_launch", checked ? "1" : "0");
  };

  // The old checkbox's setting is kept in step so the launch sync (which reads
  // it) keeps working for both "launch" and "auto".
  const handleCloudSyncModeChange = (mode) => {
    setCloudSyncMode(mode);
    setAutoCloudSyncOnLaunch(mode !== "off");
    window.vault.settings.set("cloud_sync_mode", mode);
    window.vault.settings.set("auto_cloud_sync_on_launch", mode !== "off" ? "1" : "0");
  };

  // Saved a different server: the main process has already signed this install out
  // of the old one, so mirror that here and show the sign-in for the new one.
  const handleServerChanged = () => {
    setCloudSyncConnected(false);
    setCloudSyncEmail(null);
    setCloudSyncResult(null);
    setServerConfigured(true);
  };

  const handleCloudSyncLogin = async (email, password) => {
    setCloudSyncLoggingIn(true);
    setCloudSyncResult(null);
    try {
      const { email: confirmedEmail } = await window.vault.cloudSync.login(email, password);
      setCloudSyncConnected(true);
      setCloudSyncEmail(confirmedEmail);
      window.vault.settings.set("cloud_sync_email", confirmedEmail);
    } catch (err) {
      setCloudSyncResult({ error: cleanIpcError(err) || "Login failed — check your email and password." });
    } finally {
      setCloudSyncLoggingIn(false);
    }
  };

  // Make an account on the server and sign in with it. `form` = { email, password, confirm }.
  const handleCloudSyncSignUp = async ({ email, password, confirm }) => {
    const problem = validateSignUp({ email, password, confirm });
    if (problem) { setCloudSyncResult({ error: problem }); return; }
    setCloudSyncLoggingIn(true);
    setCloudSyncResult(null);
    try {
      const out = await window.vault.cloudSync.signUp(email.trim(), password);
      if (out.kind === "signedIn") {
        setCloudSyncConnected(true);
        setCloudSyncEmail(out.email);
        window.vault.settings.set("cloud_sync_email", out.email);
        setCloudSyncResult({ tip: SIGN_UP_MESSAGES.afterSignIn });
      } else if (out.kind === "confirm") setCloudSyncResult({ summary: SIGN_UP_MESSAGES.confirm });
      else if (out.kind === "exists") setCloudSyncResult({ error: SIGN_UP_MESSAGES.exists });
      else setCloudSyncResult({ error: out.message });
    } catch (err) {
      setCloudSyncResult({ error: cleanIpcError(err) || "Couldn't create the account." });
    } finally {
      setCloudSyncLoggingIn(false);
    }
  };

  const handleCloudSyncDisconnect = async () => {
    await window.vault.cloudSync.disconnect();
    setCloudSyncConnected(false);
    setCloudSyncEmail(null);
    setCloudSyncResult(null);
  };

  const handleCloudSyncSync = async () => {
    if (!cloudSyncConnected) {
      setCloudSyncResult({ error: "Log in to Cloud Sync in the Cloud Sync tab first." });
      return;
    }
    setCloudSyncSyncing(true);
    setCloudSyncResult(null);
    try {
      const { pushed, pulled } = await runCloudSync();
      const pushedTotal = Object.values(pushed).reduce((a, b) => a + b, 0);
      const summary = pushedTotal === 0 && pulled.inserted === 0 && pulled.updated === 0 && pulled.deleted === 0
        ? "✓ Already up to date"
        : `✓ Sent ${pushedTotal} change${pushedTotal === 1 ? "" : "s"} · received ${pulled.inserted} new, ${pulled.updated} updated${pulled.deleted ? `, ${pulled.deleted} removed` : ""}`;
      setCloudSyncResult({ summary });
      if (onLibraryUpdate && (pulled.inserted || pulled.updated || pulled.deleted || pulled.coverArtFetched)) onLibraryUpdate();
    } catch (err) {
      setCloudSyncResult({ error: cleanIpcError(err) || "Sync failed." });
    } finally {
      setCloudSyncSyncing(false);
    }
  };

  return {
    cloudSyncConnected, cloudSyncEmail, cloudSyncLoggingIn, cloudSyncSyncing, cloudSyncResult,
    handleCloudSyncLogin, handleCloudSyncSignUp, handleCloudSyncDisconnect, handleCloudSyncSync,
    autoCloudSyncOnLaunch, handleToggleAutoCloudSyncOnLaunch,
    cloudSyncMode, handleCloudSyncModeChange,
    serverConfigured, handleServerChanged,
  };
}
