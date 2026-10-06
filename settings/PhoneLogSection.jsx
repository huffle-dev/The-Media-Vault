import { useState } from "react";
import { T, cleanIpcError } from "../tokens.js";
import { actionBtnStyle } from "./SettingsShared.jsx";

// "The phone's log": when the phone app has a problem (or won't open) it can send its problems log to your own
// server; this fetches it here so it can be read, copied, or opened as a file. Shown once signed in to Cloud Sync.
export default function PhoneLogSection() {
  const [state, setState] = useState({ busy: false, text: null, file: null, empty: false, error: null });
  const [copied, setCopied] = useState(false);
  const small = { ...actionBtnStyle(false), padding: "4px 12px", fontSize: 11 };

  const fetchLog = async () => {
    setState((s) => ({ ...s, busy: true, error: null, empty: false }));
    try {
      const out = await window.vault.cloudSync.getPhoneLog();
      setState({ busy: false, text: out.found ? out.text : null, file: out.found ? out.file : null, empty: !out.found, error: null });
    } catch (err) {
      setState({ busy: false, text: null, file: null, empty: false, error: cleanIpcError(err) || "Couldn't fetch the phone's log." });
    }
  };
  const copy = async () => {
    try { await window.vault.cloudSync.copyPhoneLog(); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch (err) { setState((s) => ({ ...s, error: cleanIpcError(err) })); }
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 9, color: T.accent, fontFamily: T.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>The phone's log</div>
      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.55, marginBottom: 8 }}>
        If the phone app has a problem, or won't open, use <strong>Send log to my computer</strong> on its Problems & logs screen
        (or on the screen it shows after a crash). It goes to your own server, and appears here.
      </div>
      <button onClick={fetchLog} disabled={state.busy} style={small}>{state.busy ? "Fetching…" : "Show the phone's log"}</button>
      {state.empty && <div style={{ marginTop: 8, fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>The phone hasn't sent a log yet.</div>}
      {state.error && <div style={{ marginTop: 8, fontSize: 11, color: "#e84b6e", fontFamily: T.fontMono, lineHeight: 1.5 }}>{state.error}</div>}
      {state.text && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <button onClick={copy} style={small}>{copied ? "✓ Copied" : "Copy"}</button>
            <button onClick={() => window.vault.cloudSync.showPhoneLogFile()} style={small} title={state.file}>Show the file</button>
          </div>
          <textarea
            readOnly value={state.text} aria-label="The phone's log"
            style={{ width: "100%", height: 180, boxSizing: "border-box", background: T.surface2, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, padding: 8, fontFamily: T.fontMono, fontSize: 10.5, lineHeight: 1.45, resize: "vertical" }}
          />
        </div>
      )}
    </div>
  );
}
