import { T } from "../tokens.js";

// The three "Automatic sync" choices for Cloud Sync (see lib/autoSync.js),
// shown as cards so the selected one is obvious. Used on both Settings → Cloud
// Sync and Settings → Resync, driven by the same cloudSync account hook.
const OPTIONS = [
  { id: "off", label: "Off", hint: "Only when you click Sync Now." },
  { id: "launch", label: "When the app opens", hint: "One sync each time you start the app." },
  { id: "auto", label: "Automatic", hint: "About a minute after you edit something, when you come back to the app, and every few minutes to pick up changes from your phone." },
];

export default function AutoSyncModePicker({ mode, onChange, name = "cloud-sync-mode" }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Automatic sync</div>
      {OPTIONS.map((o) => {
        const on = mode === o.id;
        return (
          <label key={o.id} style={{
            display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", marginBottom: 6, cursor: "pointer",
            border: `1px solid ${on ? T.accent : T.border}`, background: on ? T.accent + "14" : "transparent", borderRadius: 6,
          }}>
            <input type="radio" name={name} checked={on} onChange={() => onChange(o.id)} style={{ marginTop: 2, accentColor: T.accent }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12.5, color: T.text, fontFamily: T.fontSans, fontWeight: on ? 600 : 400 }}>{o.label}</span>
              <span style={{ display: "block", fontSize: 11, color: T.muted, fontFamily: T.fontSans, lineHeight: 1.4, marginTop: 2 }}>{o.hint}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
