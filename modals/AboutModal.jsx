import { useEffect, useState } from "react";
import { T } from "../tokens.js";
import { CREDITS } from "@media-vault/core/credits.js";
import tmdbLogo from "../assets/tmdb-logo.svg";

// Help → About & credits: the version, where the library lives, who supplies
// the data (with the wording each provider asks for), and the open-source
// licences. Opened from the Help menu.
export default function AboutModal({ onClose }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    window.vault.app.getInfo().then(setInfo).catch(() => setInfo({}));
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const open = (url) => window.vault.shell.openExternal(url);
  const link = (url, text) => (
    <span onClick={() => open(url)} style={{ color: T.blue, cursor: "pointer", textDecoration: "underline" }}>{text}</span>
  );
  const btn = {
    padding: "6px 14px", background: T.hoverWashStrong, border: `1px solid ${T.border}`, borderRadius: 5,
    color: T.text, fontSize: 12, fontFamily: T.fontSans, cursor: "pointer",
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,5,10,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div role="dialog" aria-label="About The Media Vault" onClick={(e) => e.stopPropagation()} style={{
        width: 560, maxHeight: "88vh", display: "flex", flexDirection: "column",
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
      }}>
        <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: T.fontSerif, fontSize: 20, color: T.text }}>The Media Vault</div>
          <div style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono, marginTop: 4 }}>
            {info && info.version ? `Version ${info.version}` : " "}
          </div>
        </div>

        <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
          <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6, marginBottom: 16 }}>
            Your library is stored on this computer{info && info.dataPath ? <> in <span style={{ fontFamily: T.fontMono }}>{info.dataPath}</span></> : null}.
            If you set up sync, a copy also lives in the Supabase project you own — nothing is sent to anyone else.
          </div>

          <div style={{ fontSize: 9, color: T.accent, fontFamily: T.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
            Where the information comes from
          </div>
          {CREDITS.map((c) => (
            <div key={c.name} style={{ marginBottom: 12 }}>
              {c.name === "TMDB" && (
                // TMDB's own logo (assets/tmdb-logo.svg, from their brand page), shown with the
                // attribution statement as their terms require, and kept small — less prominent than this app's own name.
                <img src={tmdbLogo} alt="TMDB" onClick={() => open(c.url)} style={{ height: 14, display: "block", cursor: "pointer", marginBottom: 6 }} />
              )}
              <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>{link(c.url, c.name)}</div>
              <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55, marginTop: 2 }}>{c.text}</div>
              {c.links && (
                <div style={{ fontSize: 11, marginTop: 2, display: "flex", gap: 12 }}>
                  {c.links.map((l) => <span key={l.url}>{link(l.url, l.label)}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: "12px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn} onClick={() => window.vault.app.openLicences()}>Open-source licences</button>
            <button style={btn} onClick={() => window.vault.app.openPrivacy()}>Privacy notice</button>
          </div>
          <button style={btn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
