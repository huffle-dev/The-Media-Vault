import { useEffect, useState } from "react";
import { T } from "../tokens.js";
import ExportTab from "../settings/ExportTab.jsx";
import HiddenItemsTab from "../settings/HiddenItemsTab.jsx";
import ApiKeysTab from "../settings/ApiKeysTab.jsx";
import AppearanceTab from "../settings/AppearanceTab.jsx";
import ResyncTab from "../settings/ResyncTab.jsx";
import { CloudSyncCard } from "../settings/ServiceConnections.jsx";
import { Group } from "../settings/SettingsShared.jsx";
import { useSteamAccount } from "../settings/useSteamAccount.js";
import { useGogAccount } from "../settings/useGogAccount.js";
import { useCloudSyncAccount } from "../settings/useCloudSyncAccount.js";

const SETTINGS_TABS = ["API Keys & Accounts", "Cloud Sync", "Appearance", "Resync", "Export", "Hidden Items"];

// Two-word tab labels get a manual line break rendered as two short lines
// rather than one long pill — this is what keeps the whole row fitting on
// one line without a horizontal scrollbar. Single-word labels (Appearance,
// Resync, Export) render as-is, straight from SETTINGS_TABS.
const TAB_LABELS = {
  "API Keys & Accounts": <>API Keys &amp;<br />Accounts</>,
  "Cloud Sync": <>Cloud<br />Sync</>,
  "Hidden Items": <>Hidden<br />Items</>,
};

// Account Access used to be its own top-level tab, then its own pill inside
// API Keys — now its content (Steam/GOG) lives under ApiKeysTab's
// Games section instead, since all three are game logins. Cloud Sync isn't
// tied to any one media type, so it got its own tab rather than joining
// Games. The app menu's "Account Access" item still passes "Accounts" as
// initialTab, so it's translated here into API Keys + the Games pill.
export default function SettingsModal({ onClose, onLibraryUpdate, onSetAccent, onSetStatusColor, onSetTextColor, onSetFontPair, onSetThemeMode, onResetAppearance, onWatchRegionTouched, onSetTypeStyle, customTypes, onCustomTypesChanged, items = [], initialTab = "API Keys & Accounts" }) {
  const isAccountsShortcut = initialTab === "Accounts";
  const [settingsTab, setSettingsTab] = useState(isAccountsShortcut ? "API Keys & Accounts" : initialTab);
  // The app's version, shown beside the title so it is easy to say which build you are on.
  const [version, setVersion] = useState(null);
  useEffect(() => { window.vault.app.getInfo().then((i) => setVersion(i && i.version)).catch(() => {}); }, []);

  // Steam/GOG connection state is shared between ApiKeysTab's Games
  // section (credentials form / login-disconnect) and the Resync tab (resync
  // button + auto-sync toggle) — called once here, passed to both, so
  // there's one source of truth rather than two copies that could drift apart.
  const steam = useSteamAccount(onLibraryUpdate);
  const gog = useGogAccount(onLibraryUpdate);
  const cloudSync = useCloudSyncAccount(onLibraryUpdate);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(5,5,10,0.88)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, width: 560, maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px", borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: T.fontSerif, fontSize: 17, color: T.text }}>Settings</span>
            {version && <span data-testid="app-version" style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted }}>v{version}</span>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {/* Tabs — every two-word label (see TAB_LABELS) renders on two short
            lines rather than one long pill, specifically so the whole row
            fits without needing a horizontal scrollbar. */}
        <div style={{
          display: "flex", gap: 6, padding: "14px 20px 0", flexShrink: 0,
          borderBottom: `1px solid ${T.border}`, paddingBottom: 14,
        }}>
          {SETTINGS_TABS.map(t => (
            <button key={t} onClick={() => setSettingsTab(t)} style={{
              padding: "6px 13px",
              whiteSpace: "nowrap",
              border: `1px solid ${settingsTab === t ? T.accent : T.border}`,
              borderRadius: 100, cursor: "pointer",
              background: settingsTab === t ? T.accent + "22" : "transparent",
              color: settingsTab === t ? T.accent : T.muted,
              fontSize: 11, fontFamily: T.fontMono,
              fontWeight: settingsTab === t ? 600 : 400,
              transition: "all 0.1s",
            }}>{TAB_LABELS[t] || t}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: "20px", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 28 }}>

          {settingsTab === "API Keys & Accounts" && (
            <ApiKeysTab
              onWatchRegionTouched={onWatchRegionTouched}
              steam={steam} gog={gog}
              initialSection={isAccountsShortcut ? "Games" : undefined}
            />
          )}

          {settingsTab === "Cloud Sync" && (
            <Group title="Across devices">
              <CloudSyncCard cloudSync={cloudSync} />
            </Group>
          )}

          {settingsTab === "Appearance" && (
            <AppearanceTab
              onSetAccent={onSetAccent} onSetStatusColor={onSetStatusColor} onSetTextColor={onSetTextColor}
              onSetFontPair={onSetFontPair} onSetThemeMode={onSetThemeMode} onResetAppearance={onResetAppearance}
              onSetTypeStyle={onSetTypeStyle} customTypes={customTypes} onCustomTypesChanged={onCustomTypesChanged}
            />
          )}

          {settingsTab === "Resync" && <ResyncTab steam={steam} gog={gog} cloudSync={cloudSync} onLibraryUpdate={onLibraryUpdate} />}

          {settingsTab === "Export" && <ExportTab />}

          {settingsTab === "Hidden Items" && <HiddenItemsTab items={items} onLibraryUpdate={onLibraryUpdate} />}

        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 20px", borderTop: `1px solid ${T.border}`,
          flexShrink: 0, display: "flex", justifyContent: "flex-end",
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 24px", background: "transparent",
              border: `1px solid ${T.border}`, borderRadius: 5,
              color: T.muted, fontSize: 13, cursor: "pointer",
            }}
          >Close</button>
        </div>
      </div>
    </div>
  );
}
