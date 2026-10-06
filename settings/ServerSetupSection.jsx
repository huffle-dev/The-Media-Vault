import { useEffect, useState } from "react";
import { T } from "../tokens.js";
import { Label, inputStyle, actionBtnStyle } from "./SettingsShared.jsx";
import { cleanIpcError } from "../tokens.js";
import QrCode from "../components/QrCode.jsx";

// "Your server": Cloud Sync needs a Supabase project of the user's own (a free
// one is plenty). Three steps — create the project, run the setup SQL, paste
// its address and public key here — with a Test button that says which step is
// missing. Shown at the top of Settings → Cloud Sync and on the Welcome screen;
// the sign-in below it only appears once a server is saved.
//
// `onServerChanged` runs after a different server is saved: the app has been
// signed out of the old one, and the parent resets its own view of that.
export default function ServerSetupSection({ onServerChanged }) {
  const [config, setConfig] = useState(undefined); // undefined = loading, { configured, host, url, keyHint }
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(null); // "test" | "save" | null
  const [result, setResult] = useState(null); // { ok, message }
  const [copied, setCopied] = useState(false);
  // "Set up my phone": the setup code as a QR code (null = hidden).
  const [phoneCode, setPhoneCode] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const load = () => window.vault.cloudSync.getConfig().then(setConfig).catch(() => setConfig({ configured: false }));
  useEffect(() => { load(); }, []);

  const showForm = config && (!config.configured || editing);

  const handleTest = async () => {
    setBusy("test");
    setResult(null);
    try { setResult(await window.vault.cloudSync.testConfig(url, key)); }
    catch (err) { setResult({ ok: false, message: cleanIpcError(err) || "Test failed." }); }
    finally { setBusy(null); }
  };

  const handleSave = async () => {
    setBusy("save");
    setResult(null);
    try {
      const saved = await window.vault.cloudSync.setConfig(url, key);
      if (saved.changed && onServerChanged) onServerChanged();
      setKey("");
      setUrl("");
      setEditing(false);
      await load();
    } catch (err) {
      setResult({ ok: false, message: cleanIpcError(err) || "Couldn't save." });
    } finally { setBusy(null); }
  };

  const handleCopySql = async () => {
    try {
      await window.vault.cloudSync.copySetupSql();
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      setResult({ ok: false, message: "Couldn't copy the setup SQL: " + (cleanIpcError(err) || "unknown error") });
    }
  };

  const handleShowPhoneCode = async () => {
    setResult(null);
    try { setPhoneCode(await window.vault.cloudSync.getSetupCode()); }
    catch (err) { setResult({ ok: false, message: cleanIpcError(err) || "Couldn't make the setup code." }); }
  };

  const handleCopyPhoneCode = async () => {
    try {
      await window.vault.cloudSync.copySetupCode();
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    } catch (err) {
      setResult({ ok: false, message: cleanIpcError(err) || "Couldn't copy the setup code." });
    }
  };

  if (config === undefined) return null;

  const smallBtn = { ...actionBtnStyle(false), padding: "4px 12px", fontSize: 11 };
  const stepStyle = { fontSize: 12, color: T.text, lineHeight: 1.55, marginBottom: 6 };
  const link = (href, text) => (
    <span onClick={() => window.vault.shell.openExternal(href)} style={{ color: T.blue, cursor: "pointer", textDecoration: "underline" }}>{text}</span>
  );

  return (
    <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 9, color: T.accent, fontFamily: T.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Your server</div>

      {config.configured && !editing && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: T.seen, fontFamily: T.fontMono }}>✓ {config.host}</span>
            <span style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>key …{config.keyHint}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button onClick={() => { setEditing(true); setResult(null); }} style={smallBtn} title="Use a different Supabase project">Change server</button>
            <button onClick={handleCopySql} style={smallBtn} title="Copies the setup SQL to run in your Supabase project's SQL Editor (safe to run again)">{copied ? "✓ Copied" : "Copy setup SQL"}</button>
            <button onClick={() => window.vault.shell.openExternal("https://supabase.com/dashboard/project/_/sql/new")} style={smallBtn} title="Opens your Supabase project's SQL Editor">Open SQL Editor ↗</button>
            <button onClick={phoneCode ? () => setPhoneCode(null) : handleShowPhoneCode} style={smallBtn} title="Shows a QR code the phone app can scan, so you don't have to type the address and key">{phoneCode ? "Hide phone code" : "Set up my phone"}</button>
          </div>
          {phoneCode && (
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
              <QrCode text={phoneCode} label="Setup code for the phone app" />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={stepStyle}>In the phone app, on the sign-in screen, tap <strong>Scan setup code</strong> and point the camera at this.</div>
                <div style={{ ...stepStyle, color: T.muted }}>It holds your project's address and its public key (nothing secret), but it points at your project, so don't post it online. Prefer to paste it? <span onClick={handleCopyPhoneCode} style={{ color: T.blue, cursor: "pointer", textDecoration: "underline" }}>{codeCopied ? "✓ Copied" : "Copy the code"}</span> and paste it into the phone app's first box.</div>
              </div>
            </div>
          )}
        </div>
      )}
      {config.configured && !editing && result && !result.ok && (
        <div style={{ marginTop: 8, fontSize: 11, fontFamily: T.fontMono, color: "#e84b6e" }}>{result.message}</div>
      )}

      {showForm && (
        <div>
          <div style={{ ...stepStyle, color: T.muted }}>
            Your library syncs through a Supabase project that belongs to you — nobody else can see it, and the free plan is plenty.
          </div>
          <ol style={{ margin: "0 0 12px", paddingLeft: 18 }}>
            <li style={stepStyle}>Create a free project at {link("https://supabase.com/dashboard", "supabase.com")}.</li>
            <li style={stepStyle}>
              Open the project's <strong>SQL Editor</strong>, paste the setup SQL and press Run.{" "}
              <button onClick={handleCopySql} style={{ ...actionBtnStyle(false), padding: "3px 10px", fontSize: 11, marginLeft: 4 }}>
                {copied ? "✓ Copied" : "Copy setup SQL"}
              </button>
            </li>
            <li style={stepStyle}>
              In <strong>Project Settings → API Keys</strong>, copy the <strong>project URL</strong> and the <strong>publishable</strong> key (never the secret one) into the boxes below.
            </li>
          </ol>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            <div>
              <Label>Project URL</Label>
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://abcdefgh.supabase.co" style={inputStyle} spellCheck={false} />
            </div>
            <div>
              <Label>Publishable key</Label>
              <input value={key} onChange={e => setKey(e.target.value)} placeholder="sb_publishable_…" style={inputStyle} spellCheck={false} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={handleTest} disabled={busy !== null || !url || !key} style={actionBtnStyle(busy !== null || !url || !key)}>
              {busy === "test" ? "Testing…" : "Test connection"}
            </button>
            <button onClick={handleSave} disabled={busy !== null || !url || !key} style={actionBtnStyle(busy !== null || !url || !key)}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            {editing && <span onClick={() => { setEditing(false); setResult(null); }} style={{ fontSize: 11, color: T.muted, cursor: "pointer", fontFamily: T.fontMono, textDecoration: "underline" }}>Cancel</span>}
          </div>
          {editing && (
            <div style={{ marginTop: 8, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
              Saving a different server signs you out of the current one. Your library stays on this computer and is sent to the new server on its first sync.
            </div>
          )}
          {result && (
            <div style={{ marginTop: 10, fontSize: 11, fontFamily: T.fontMono, lineHeight: 1.5, color: result.ok ? T.seen : "#e84b6e" }}>
              {result.ok ? "✓ " : ""}{result.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
