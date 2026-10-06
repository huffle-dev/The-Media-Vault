import { useState } from "react";
import { T } from "../tokens.js";
import { Card } from "./SettingsShared.jsx";
import { GOG_WARNING } from "@media-vault/core/gogWarning.js";

// The warning text is shared with the phone (packages/core/gogWarning.js). `gog` is the
// useGogAccount() hook result; `LoginRow` is the shared sign-in row from ServiceConnections.
export { GOG_WARNING };

export default function GogCard({ gog, LoginRow }) {
  const [understood, setUnderstood] = useState(false);

  if (!gog.gogEnabled) {
    return (
      <Card title="GOG (unofficial)" done={false} blurb="Import the games you own on GOG. Off by default — please read this first.">
        <div role="note" style={{ border: "1px solid #e8b84b66", background: "#e8b84b12", borderRadius: 6, padding: "10px 12px", marginBottom: 10 }}>
          {GOG_WARNING.map((line) => (
            <p key={line} style={{ margin: "0 0 6px", fontSize: 11.5, lineHeight: 1.55, color: T.text }}>{line}</p>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.text, cursor: "pointer", marginBottom: 10 }}>
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          I understand, and I want to use GOG import
        </label>
        <button
          onClick={() => gog.handleGogEnabledChange(true)}
          disabled={!understood}
          style={{
            padding: "8px 18px", borderRadius: 5, border: `1px solid ${T.border}`, fontSize: 12, fontFamily: T.fontSans,
            background: understood ? T.hoverWashStrong : T.surface2, color: understood ? T.text : T.muted,
            cursor: understood ? "pointer" : "not-allowed",
          }}
        >Turn on GOG import</button>
      </Card>
    );
  }

  return (
    <Card title="GOG (unofficial)" done={gog.gogConnected} blurb="Import the games you own on GOG. You sign in on GOG's own page.">
      <LoginRow
        connected={gog.gogConnected} loggingIn={gog.gogLoggingIn} error={gog.gogResult?.error}
        onLogin={gog.handleGogLogin} onDisconnect={gog.handleGogDisconnect} label="↗ Log in with GOG"
      />
      <div style={{ marginTop: 10 }}>
        <span
          onClick={() => gog.handleGogEnabledChange(false)}
          style={{ fontSize: 11, color: T.muted, cursor: "pointer", fontFamily: T.fontMono, textDecoration: "underline" }}
        >Turn off GOG import (signs you out of GOG)</span>
      </div>
    </Card>
  );
}
