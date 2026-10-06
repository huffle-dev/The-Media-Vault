// Settings → Export tab: library export, full backup/restore, and orphaned
// cover-art cleanup. Fully self-contained — no state shared with any other tab.
import { useState } from "react";
import { T, cleanIpcError } from "../tokens.js";
import { Group, Card, StatusMsg, actionBtnStyle } from "./SettingsShared.jsx";

export default function ExportTab() {
  const [exportMsg, setExportMsg] = useState(null);
  const [csvOnlyMsg, setCsvOnlyMsg] = useState(null);
  const [backupMsg, setBackupMsg] = useState(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreConfirmPending, setRestoreConfirmPending] = useState(false);

  const [orphanScan, setOrphanScan] = useState(null); // null | array of {path, size}
  const [orphanScanning, setOrphanScanning] = useState(false);
  const [orphanDeleting, setOrphanDeleting] = useState(false);
  const [orphanMsg, setOrphanMsg] = useState(null);

  const handleExport = async () => {
    setExportMsg(null);
    try {
      const result = await window.vault.export.csv();
      if (result.canceled) return;
      if (result.success) setExportMsg(`✓ Exported to ${result.path}`);
    } catch (err) {
      setExportMsg({ error: cleanIpcError(err) || "Export failed." });
    }
  };

  const handleExportCsvOnly = async () => {
    setCsvOnlyMsg(null);
    try {
      const result = await window.vault.export.csvOnly();
      if (result.canceled) return;
      if (result.success) setCsvOnlyMsg(`✓ Exported to ${result.path}`);
    } catch (err) {
      setCsvOnlyMsg({ error: cleanIpcError(err) || "Export failed." });
    }
  };

  const handleBackup = async () => {
    setBackupMsg(null);
    setBackingUp(true);
    try {
      const result = await window.vault.backup.create();
      if (result.canceled) return;
      if (result.success) setBackupMsg(`✓ Backed up to ${result.path}`);
    } catch (err) {
      setBackupMsg({ error: cleanIpcError(err) || "Backup failed." });
    } finally {
      setBackingUp(false);
    }
  };

  // The confirm dialog fires before the file picker, not after — picking
  // the .zip and performing the swap are one combined backend call. On
  // success the app relaunches itself, so there's nothing further to do here.
  const handleRestoreConfirm = async () => {
    setRestoreConfirmPending(false);
    setRestoreMsg(null);
    setRestoring(true);
    try {
      const result = await window.vault.backup.restore();
      if (result.canceled) setRestoring(false);
    } catch (err) {
      setRestoreMsg({ error: cleanIpcError(err) || "Restore failed." });
      setRestoring(false);
    }
  };

  const handleScanOrphaned = async () => {
    setOrphanMsg(null);
    setOrphanScanning(true);
    try {
      setOrphanScan(await window.vault.coverArt.scanOrphaned());
    } catch (err) {
      setOrphanMsg({ error: cleanIpcError(err) || "Scan failed." });
    } finally {
      setOrphanScanning(false);
    }
  };

  const handleDeleteOrphaned = async () => {
    if (!orphanScan?.length) return;
    setOrphanDeleting(true);
    try {
      const deleted = await window.vault.coverArt.deleteOrphaned(orphanScan.map(f => f.path));
      setOrphanMsg(`✓ Deleted ${deleted} file${deleted === 1 ? "" : "s"}.`);
      setOrphanScan(null);
    } catch (err) {
      setOrphanMsg({ error: cleanIpcError(err) || "Delete failed." });
    } finally {
      setOrphanDeleting(false);
    }
  };

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Group title="Export">
        <Card title="Export your library" blurb="Save a spreadsheet of everything you've added — with your cover art bundled in, or on its own.">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleExport} style={actionBtnStyle(false)}>↓ Spreadsheet + Cover Art (.zip)</button>
            <button onClick={handleExportCsvOnly} style={actionBtnStyle(false)}>↓ Spreadsheet Only (.csv)</button>
          </div>
          <StatusMsg msg={exportMsg} />
          <StatusMsg msg={csvOnlyMsg} />
        </Card>
      </Group>

      <Group title="Backup">
        <Card title="Full backup" blurb="An exact copy of your whole library, for safekeeping or moving to a new computer.">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleBackup} disabled={backingUp} style={actionBtnStyle(backingUp)}>
              {backingUp ? "Backing up…" : "↓ Create Backup"}
            </button>
            <button
              onClick={() => { setRestoreMsg(null); setRestoreConfirmPending(true); }}
              disabled={restoring}
              style={{
                padding: "8px 16px", background: "transparent",
                border: "1px solid rgba(232,75,110,0.4)", borderRadius: 5,
                color: restoring ? T.muted : "#e84b6e", fontSize: 12, fontWeight: 600,
                cursor: restoring ? "not-allowed" : "pointer", fontFamily: T.fontSans,
              }}
            >{restoring ? "Restoring…" : "↑ Restore from Backup"}</button>
          </div>
          <StatusMsg msg={backupMsg} />
          <StatusMsg msg={restoreMsg} />
        </Card>
      </Group>

      <Group title="Tidy up">
        <Card title="Unused cover art" blurb="Find and delete image files left behind by items you've removed.">
          <button onClick={handleScanOrphaned} disabled={orphanScanning} style={actionBtnStyle(orphanScanning)}>
            {orphanScanning ? "Scanning…" : "⌕ Scan for Unused Files"}
          </button>
          {orphanScan && (
            <div style={{ marginTop: 10 }}>
              {orphanScan.length === 0 ? (
                <div style={{ fontSize: 12, color: T.muted, fontFamily: T.fontMono }}>Nothing to clean up.</div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: T.text, marginBottom: 8, fontFamily: T.fontMono }}>
                    {orphanScan.length} file{orphanScan.length === 1 ? "" : "s"} found — {(orphanScan.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(1)} MB to free up.
                  </div>
                  <button
                    onClick={handleDeleteOrphaned}
                    disabled={orphanDeleting}
                    style={{
                      padding: "8px 18px", background: orphanDeleting ? T.surface2 : "rgba(232,75,110,0.15)",
                      border: `1px solid ${orphanDeleting ? T.border : "rgba(232,75,110,0.4)"}`, borderRadius: 5,
                      color: orphanDeleting ? T.muted : "#e84b6e", fontSize: 12, fontWeight: 700,
                      cursor: orphanDeleting ? "default" : "pointer", fontFamily: T.fontSans,
                    }}
                  >{orphanDeleting ? "Deleting…" : `🗑 Delete ${orphanScan.length} File${orphanScan.length === 1 ? "" : "s"}`}</button>
                </>
              )}
            </div>
          )}
          <StatusMsg msg={orphanMsg} />
        </Card>
      </Group>
    </div>

    {/* Restore confirmation — replaces the entire live library, not just a
        selection. Current data is moved aside, not deleted, before the
        backup's contents take their place, so a wrong/failed restore is
        still recoverable by hand. */}
    {restoreConfirmPending && (
      <div style={{
        position: "fixed", inset: 0,
        background: "rgba(5,5,10,0.88)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200,
      }}>
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 10, padding: 24, width: 380,
          boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
        }}>
          <div style={{ fontFamily: T.fontSerif, fontSize: 17, color: T.text, marginBottom: 8 }}>
            Restore from backup?
          </div>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 20, lineHeight: 1.5 }}>
            Your entire library — every item, cover art, and document — will be replaced with whatever's in the backup file you pick next. The app will restart when it's done.
            <br /><br />
            Your current data isn't deleted first — it's moved aside on disk in case anything goes wrong — but this isn't reversible from within the app itself.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleRestoreConfirm}
              style={{
                flex: 1, padding: "9px", background: "#e84b6e",
                color: "#fff", border: "none", borderRadius: 5,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >Choose Backup File…</button>
            <button
              onClick={() => setRestoreConfirmPending(false)}
              style={{
                padding: "9px 16px", background: "transparent",
                border: `1px solid ${T.border}`, borderRadius: 5,
                color: T.muted, fontSize: 13, cursor: "pointer",
              }}
            >Cancel</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
