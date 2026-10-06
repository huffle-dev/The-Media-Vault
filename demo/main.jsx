// Entry for the online demo: put the stand-in `window.vault` in place BEFORE the real app loads, then start
// the real app, plus a slim banner so nobody mistakes it for their own library.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { installDemoVault } from "./vaultStub.js";
import { coverCredits } from "./sampleData.js";

installDemoVault();

const stripHtml = (s) => String(s || "").replace(/<[^>]+>/g, "");

function Credits({ onClose }) {
  const rows = coverCredits();
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100001, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#14141c", color: "#ddddf0", maxWidth: 760, width: "100%", maxHeight: "85vh", overflow: "auto", borderRadius: 8, padding: 20, fontFamily: "system-ui, sans-serif", fontSize: 13, lineHeight: 1.5, userSelect: "text" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Credits &amp; licences for the demo's pictures</strong>
          <button onClick={onClose} style={{ cursor: "pointer" }}>Close</button>
        </div>
        <p style={{ opacity: 0.8, marginBottom: 12 }}>
          Every cover in this demo is a public-domain, Creative Commons or open-source picture from Wikimedia Commons.
          The titles and cover pictures belong to their makers; the ratings and notes are made up.
        </p>
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {rows.map((r) => (
            <li key={r.title}>
              <strong>{r.title}</strong> — {stripHtml(r.author).slice(0, 90)} · {r.licence} ·{" "}
              <a href={r.source} target="_blank" rel="noreferrer" style={{ color: "#c99a2e" }}>source</a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Banner() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100000, display: "flex", gap: 12,
        alignItems: "center", justifyContent: "center", padding: "6px 12px", fontSize: 12.5,
        background: "#c99a2e", color: "#1a1408", fontFamily: "system-ui, sans-serif", textAlign: "center", flexWrap: "wrap",
      }}>
        <strong>Online demo</strong>
        <span>Changes are not saved; online search, sync and game-store sign-in are switched off.</span>
        <button onClick={() => setOpen(true)} style={{ cursor: "pointer", background: "transparent", border: "1px solid #1a1408", borderRadius: 4, padding: "1px 8px", color: "inherit" }}>Picture credits</button>
      </div>
      {open && <Credits onClose={() => setOpen(false)} />}
    </>
  );
}

import("../App.jsx").then(({ default: App }) => {
  // Remember the roots so the dev server's hot reload re-renders into them instead of creating them again.
  const roots = (window.__demoRoots = window.__demoRoots || {
    app: createRoot(document.getElementById("root")),
    banner: createRoot(document.getElementById("demo-banner")),
  });
  roots.app.render(<App />);
  roots.banner.render(<Banner />);
});
