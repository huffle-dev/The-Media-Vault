// Encrypted Key Sync (V3 suggested-order step 5) — shown inside Cloud
// Sync's section once logged in. Three states: not set up anywhere yet
// (offer Set Up), set up on another device but not unlocked here (offer
// Unlock via passphrase or recovery key), or already unlocked on this
// device (show status + Forget). See docs' packages/core/cryptoSync.js
// and lib/cryptoAdapterNode.js for the actual crypto.
//
// Every sensitive field here is read from its DOM ref at submit time
// instead of React state, deliberately: Chromium's autofill/password-
// manager can set an input's value directly, bypassing the synthetic
// onChange event React's controlled `value={state}` relies on — state then
// silently disagrees with what's on screen, and a controlled input can
// even fight the autofill back to the stale state on the next render. A
// real symptom of exactly this hit live: a passphrase that was definitely
// correct was rejected as "invalid", and switching input mode revealed a
// password in a plain-text field neither the user nor this code put there.
// Reading el.value directly at submit time is unaffected either way — it's
// always whatever is actually visible. autoComplete/data-*-ignore hints
// below reduce how often a manager tries to intervene in the first place.
import { useEffect, useRef, useState } from "react";
import { T } from "../tokens.js";
import { Label, inputStyle, actionBtnStyle } from "./SettingsShared.jsx";

const noAutofillProps = {
  autoComplete: "off",
  autoCorrect: "off",
  spellCheck: false,
  "data-lpignore": "true",   // LastPass
  "data-1p-ignore": "true",  // 1Password
  "data-bwignore": "true",   // Bitwarden
};

export default function EncryptedKeySyncSection() {
  const [status, setStatus] = useState(null); // null (loading) | { vaultExists, unlockedLocally }
  const [mode, setMode] = useState("passphrase"); // "passphrase" | "recovery" (unlock only)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [justSetUpRecoveryKey, setJustSetUpRecoveryKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const setupPassRef = useRef(null);
  const setupConfirmRef = useRef(null);
  const unlockPassRef = useRef(null);
  const unlockRecoveryRef = useRef(null);

  const copyRecoveryKey = () => {
    window.vault.clipboard.writeText(justSetUpRecoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [statusError, setStatusError] = useState(null);
  const refreshStatus = () => window.vault.cloudSync.secretsStatus()
    .then(s => { setStatus(s); setStatusError(null); })
    .catch(e => setStatusError(e.message));
  useEffect(() => { refreshStatus(); }, []);

  async function handleSetup() {
    const passphrase = setupPassRef.current.value;
    const confirmPassphrase = setupConfirmRef.current.value;
    if (passphrase.length < 8) { setError("Use at least 8 characters."); return; }
    if (passphrase !== confirmPassphrase) { setError("Passphrases don't match."); return; }
    setBusy(true);
    setError(null);
    try {
      const { recoveryKeyDisplay } = await window.vault.cloudSync.secretsSetup(passphrase);
      setJustSetUpRecoveryKey(recoveryKeyDisplay);
      setupPassRef.current.value = ""; setupConfirmRef.current.value = "";
      refreshStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "passphrase") {
        const passphrase = unlockPassRef.current.value;
        if (!passphrase) { setError("Enter your passphrase."); return; }
        await window.vault.cloudSync.secretsUnlock(passphrase);
      } else {
        const recoveryKey = unlockRecoveryRef.current.value.trim();
        if (!recoveryKey) { setError("Enter your recovery key."); return; }
        await window.vault.cloudSync.secretsUnlockWithRecovery(recoveryKey);
      }
      refreshStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleForget() {
    if (!confirm("Forget the encrypted key vault on this device? Your TMDB key stays set locally until changed — this only stops this device syncing it.")) return;
    await window.vault.cloudSync.secretsForget();
    refreshStatus();
  }

  if (statusError) {
    return (
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
        <Label>Encrypted Key Sync</Label>
        <div style={{ fontSize: 11, color: "#e84b6e", fontFamily: T.fontMono, lineHeight: 1.5, marginBottom: 8 }}>
          {statusError}
        </div>
        <span onClick={refreshStatus} style={{ fontSize: 11, color: T.muted, cursor: "pointer", fontFamily: T.fontMono, textDecoration: "underline" }}>
          Retry
        </span>
      </div>
    );
  }
  if (!status) return null;

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
      <Label>Encrypted Key Sync</Label>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 1.6 }}>
        Syncs your TMDB API key to other devices (like the Android companion
        app) end-to-end encrypted — the cloud only ever holds ciphertext,
        never the key itself.
      </div>

      {justSetUpRecoveryKey ? (
        <div style={{
          padding: 14, background: "#e8944b18", border: "1px solid #e8944b", borderRadius: 6,
        }}>
          <div style={{ fontSize: 12, color: "#e8944b", fontWeight: 700, marginBottom: 8 }}>
            ⚠ Save this recovery key now — it's shown only once
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontFamily: T.fontMono, color: T.text, letterSpacing: 1, userSelect: "text" }}>
              {justSetUpRecoveryKey}
            </div>
            <button
              onClick={copyRecoveryKey}
              style={{
                padding: "4px 10px", background: "transparent", border: `1px solid ${T.border}`,
                borderRadius: 5, color: copied ? T.seen : T.muted, fontSize: 11, cursor: "pointer",
                fontFamily: T.fontSans, flexShrink: 0,
              }}
            >{copied ? "✓ Copied" : "Copy"}</button>
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
            If you forget your passphrase, this is the only other way to
            recover your synced keys. Write it down or save it somewhere safe.
          </div>
          <button onClick={() => setJustSetUpRecoveryKey(null)} style={actionBtnStyle(false)}>
            I've saved it
          </button>
        </div>
      ) : status.unlockedLocally ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: T.seen, fontFamily: T.fontMono }}>✓ Active on this device</span>
          <span onClick={handleForget} style={{ fontSize: 11, color: T.muted, cursor: "pointer", fontFamily: T.fontMono, textDecoration: "underline" }}>
            Forget on this device
          </span>
        </div>
      ) : status.vaultExists ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setMode("passphrase")} style={{ ...actionBtnStyle(false), ...(mode === "passphrase" && { borderColor: T.accent, color: T.accent }) }}>Passphrase</button>
            <button onClick={() => setMode("recovery")} style={{ ...actionBtnStyle(false), ...(mode === "recovery" && { borderColor: T.accent, color: T.accent }) }}>Recovery Key</button>
          </div>
          {/* Both fields always mounted (just hidden), not swapped in/out by
              the mode toggle — remounting a fresh <input> is exactly the
              moment a password manager is most likely to attach its own
              autofill/icon to it again. */}
          <input
            ref={unlockPassRef} type="password" placeholder="Passphrase" style={{ ...inputStyle, display: mode === "passphrase" ? "block" : "none" }}
            name="vault-unlock-passphrase" {...noAutofillProps}
          />
          <input
            ref={unlockRecoveryRef} type="text" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            style={{ ...inputStyle, fontFamily: T.fontMono, display: mode === "recovery" ? "block" : "none" }}
            name="vault-unlock-recovery" {...noAutofillProps}
          />
          <button onClick={handleUnlock} disabled={busy} style={actionBtnStyle(busy)}>
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            ref={setupPassRef} type="password" placeholder="Choose a passphrase (8+ characters)" style={inputStyle}
            name="vault-setup-passphrase" {...noAutofillProps}
          />
          <input
            ref={setupConfirmRef} type="password" placeholder="Confirm passphrase" style={inputStyle}
            name="vault-setup-passphrase-confirm" {...noAutofillProps}
          />
          <button onClick={handleSetup} disabled={busy} style={actionBtnStyle(busy)}>
            {busy ? "Setting up…" : "Set Up Encrypted Key Sync"}
          </button>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#e84b6e", fontFamily: T.fontMono, lineHeight: 1.5 }}>{error}</div>
      )}
    </div>
  );
}
