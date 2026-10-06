// Cloud Sync's sign-in body: an email/password form when signed out, a
// "connected as" line + Disconnect (and Encrypted Key Sync) when signed in.
// Rendered inside CloudSyncCard (ServiceConnections.jsx), which supplies
// the title and one-line description — used by both the Welcome screen and
// Settings → Cloud Sync. Unlike GOG (an OAuth window this app never
// sees credentials for), Cloud Sync's login is a direct email/password
// field — the password is only ever held in this form's own state on its
// way to cloudSync:login's one signInWithPassword call, never written
// anywhere; only the resulting session's refresh token is stored
// (encrypted), same as GOG's own OAuth token.
import { useState } from "react";
import { T } from "../tokens.js";
import { Label, KeyInput, inputStyle, actionBtnStyle } from "./SettingsShared.jsx";
import EncryptedKeySyncSection from "./EncryptedKeySyncSection.jsx";
import AutoSyncModePicker from "./AutoSyncModePicker.jsx";
import ServerSetupSection from "./ServerSetupSection.jsx";
import PhoneLogSection from "./PhoneLogSection.jsx";

export default function CloudSyncSection({ cloudSync }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // New here? The same form can make the account on your server instead of signing in.
  const [creating, setCreating] = useState(false);

  const handleLogin = () => {
    if (!email || !password) return;
    if (creating) cloudSync.handleCloudSyncSignUp({ email, password, confirm });
    else cloudSync.handleCloudSyncLogin(email, password);
    setPassword("");
    setConfirm("");
  };

  return (
    <div>

      <ServerSetupSection onServerChanged={cloudSync.handleServerChanged} />

      {cloudSync.cloudSyncConnected ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: T.seen, fontFamily: T.fontMono }}>
            ✓ Connected as {cloudSync.cloudSyncEmail}
          </span>
          <span
            onClick={cloudSync.handleCloudSyncDisconnect}
            style={{ fontSize: 11, color: T.muted, cursor: "pointer", fontFamily: T.fontMono, textDecoration: "underline" }}
          >Disconnect</span>
        </div>
      ) : null}

      {cloudSync.cloudSyncConnected && cloudSync.cloudSyncResult?.tip && (
        <div style={{ marginTop: 8, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{cloudSync.cloudSyncResult.tip}</div>
      )}

      {cloudSync.cloudSyncConnected && <AutoSyncModePicker mode={cloudSync.cloudSyncMode} onChange={cloudSync.handleCloudSyncModeChange} name="cloud-sync-mode-account" />}

      {cloudSync.cloudSyncConnected && <EncryptedKeySyncSection />}

      {cloudSync.cloudSyncConnected && <PhoneLogSection />}

      {!cloudSync.cloudSyncConnected && cloudSync.serverConfigured && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            <div>
              <Label>Email</Label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>
            <div>
              <Label>Password</Label>
              <KeyInput
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={creating ? "Choose a password (8 or more characters)…" : "Enter your password…"}
                inputStyle={inputStyle}
              />
            </div>
            {creating && (
              <div>
                <Label>Confirm password</Label>
                <KeyInput
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Type it again…"
                  inputStyle={inputStyle}
                />
              </div>
            )}
          </div>
          <button
            onClick={handleLogin}
            disabled={cloudSync.cloudSyncLoggingIn || !email || !password}
            style={actionBtnStyle(cloudSync.cloudSyncLoggingIn)}
          >{cloudSync.cloudSyncLoggingIn ? (creating ? "Creating…" : "Signing in…") : (creating ? "Create account" : "Sign in")}</button>
          <span
            onClick={() => setCreating(c => !c)}
            style={{ marginLeft: 12, fontSize: 11, color: T.muted, cursor: "pointer", fontFamily: T.fontMono, textDecoration: "underline" }}
          >{creating ? "I already have an account" : "New here? Create an account"}</span>
          {cloudSync.cloudSyncResult?.summary && (
            <div style={{ marginTop: 8, fontSize: 11, color: T.seen, fontFamily: T.fontMono, lineHeight: 1.5 }}>
              {cloudSync.cloudSyncResult.summary}
            </div>
          )}
          {cloudSync.cloudSyncResult?.error && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#e84b6e", fontFamily: T.fontMono, lineHeight: 1.5 }}>
              {cloudSync.cloudSyncResult.error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
