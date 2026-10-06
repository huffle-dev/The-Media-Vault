// Welcome modal — shown once, before "welcomed" is set (and on demand via
// Help → Show Welcome Screen). A beginner-facing tour of every optional
// connection. The cards themselves live in settings/ServiceConnections.jsx,
// shared with Settings → API Keys & Accounts, so both screens always offer
// the same things and save them the same way.
import { T } from "../tokens.js";
import ServiceConnections from "../settings/ServiceConnections.jsx";
import { useSteamAccount } from "../settings/useSteamAccount.js";
import { useGogAccount } from "../settings/useGogAccount.js";
import { useCloudSyncAccount } from "../settings/useCloudSyncAccount.js";

export default function WelcomeModal({ onClose, onLibraryUpdate }) {
  // Independent hook instances from SettingsModal's — safe because the two
  // are never open at once.
  const steam = useSteamAccount(onLibraryUpdate);
  const gog = useGogAccount(onLibraryUpdate);
  const cloudSync = useCloudSyncAccount(onLibraryUpdate);

  const handleDismiss = async () => {
    await window.vault.settings.set("welcomed", "1");
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(5,5,10,0.92)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200,
    }}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 12, width: 560, maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 40px 100px rgba(0,0,0,0.8)",
      }}>

        {/* Header */}
        <div style={{ padding: "26px 28px 18px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{
            fontFamily: T.fontSerif, fontSize: 26, color: T.accent,
            letterSpacing: "-0.02em", marginBottom: 6,
          }}>Welcome to The Media Vault</div>
          <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.6 }}>
            Your library works on its own. Connect any of these to fill in
            cover art and details for you — all optional, all free, and all
            changeable later in Settings.
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 28px", flex: 1, overflowY: "auto" }}>
          <ServiceConnections steam={steam} gog={gog} cloudSync={cloudSync} />
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 28px", borderTop: `1px solid ${T.border}`, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          <div style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>
            Books &amp; audiobooks need nothing — they work out of the box. Nothing leaves your computer except the lookups you ask for (Help → About &amp; Credits).
          </div>
          <button
            onClick={handleDismiss}
            style={{
              padding: "9px 24px", background: T.accent,
              border: "none", borderRadius: 5,
              color: T.bg, fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >Get started</button>
        </div>
      </div>
    </div>
  );
}
