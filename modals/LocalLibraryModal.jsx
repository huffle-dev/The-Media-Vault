import { useState, useEffect } from "react";
import { T, cleanIpcError } from "../tokens.js";

const MEDIA_TYPES = ["Movie", "TV", "Book", "Audiobook", "Game", "Music"];

const formatDate = (dt) => {
  if (!dt) return "Never";
  return new Date(dt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export default function LocalLibraryModal({ onScanComplete, onClose }) {
  const [folders, setFolders]         = useState([]);
  const [scanState, setScanState]     = useState("manage"); // manage | scanning | done | error
  const [scanResult, setScanResult]   = useState(null);
  const [scanError, setScanError]     = useState(null);
  const [scanningFolder, setScanningFolder] = useState(null);

  // Pending new folder state
  const [pendingPath, setPendingPath]     = useState(null);
  const [pendingType, setPendingType]     = useState("");
  const [pendingError, setPendingError]   = useState(null);

  useEffect(() => {
    window.vault.folders.getAll().then(setFolders);
  }, []);

  const handleAddFolder = async () => {
    const folderPath = await window.vault.dialog.openFolder();
    if (!folderPath) return;
    setPendingPath(folderPath);
    setPendingType("");
    setPendingError(null);
  };

  const handleScan = async (folderPath, mediaType, folderId = null) => {
    if (!mediaType) { setPendingError("Select a media type before scanning."); return; }
    setPendingError(null);
    setScanningFolder({ path: folderPath, mediaType, folderId });
    setScanState("scanning");

    try {
      const { recognised, unrecognised } = await window.vault.folders.scan(folderPath, mediaType);
      const { added, linked } = await window.vault.folders.processScan(recognised);

      if (folderId) {
        await window.vault.folders.updateScan(folderId, recognised.length);
      } else {
        const saved = await window.vault.folders.add(folderPath, mediaType);
        await window.vault.folders.updateScan(saved.id, recognised.length);
      }

      // Refresh folder list
      const updated = await window.vault.folders.getAll();
      setFolders(updated);

      setScanResult({ added, linked, unrecognised, folderPath });
      setScanState("done");
      onScanComplete(recognised);
    } catch (err) {
      setScanError(cleanIpcError(err));
      setScanState("error");
    }
  };

  const handleRemove = async (id) => {
    await window.vault.folders.remove(id);
    setFolders(prev => prev.filter(f => f.id !== id));
  };

  const resetToManage = () => {
    setScanState("manage");
    setScanResult(null);
    setScanError(null);
    setScanningFolder(null);
    setPendingPath(null);
    setPendingType("");
    setPendingError(null);
  };

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
          <div style={{ fontFamily: T.fontSerif, fontSize: 17, color: T.text }}>
            Local Library
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", flex: 1, overflowY: "auto" }}>

          {/* ── Scanning ── */}
          {scanState === "scanning" && (
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.5 }}>◎</div>
              <div style={{ fontSize: 13, color: T.muted, fontFamily: T.fontMono }}>
                Scanning {scanningFolder?.path}…
              </div>
            </div>
          )}

          {/* ── Done ── */}
          {scanState === "done" && scanResult && (
            <div>
              <div style={{
                fontSize: 11, color: T.seen, fontFamily: T.fontMono,
                marginBottom: 16,
              }}>✓ Scan complete — {scanResult.folderPath}</div>

              <div style={{
                background: T.surface2, border: `1px solid ${T.border}`,
                borderRadius: 7, padding: "14px 16px", marginBottom: 16,
              }}>
                {[
                  [scanResult.added,                    "New items added to library",              T.seen],
                  [scanResult.linked,                   "Existing items marked as owned locally",  T.purple],
                  [scanResult.unrecognised.length,      "Folders skipped — unrecognised format",   T.muted],
                ].map(([count, label, color]) => (
                  <div key={label} style={{
                    display: "flex", gap: 12, alignItems: "baseline", marginBottom: 6,
                  }}>
                    <span style={{
                      fontFamily: T.fontSerif, fontSize: 22,
                      color, minWidth: 32, textAlign: "right",
                    }}>{count}</span>
                    <span style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>{label}</span>
                  </div>
                ))}
              </div>

              {scanResult.unrecognised.length > 0 && (
                <div>
                  <div style={{
                    fontSize: 9, color: T.muted, fontFamily: T.fontMono,
                    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
                  }}>Unrecognised folders</div>
                  <div style={{
                    background: T.surface2, border: `1px solid ${T.border}`,
                    borderRadius: 5, padding: "10px 14px", maxHeight: 120, overflowY: "auto",
                  }}>
                    {scanResult.unrecognised.map(name => (
                      <div key={name} style={{
                        fontSize: 11, color: T.dim, fontFamily: T.fontMono,
                        padding: "2px 0",
                      }}>· {name}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {scanState === "error" && (
            <div style={{ padding: "20px 0", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#e84b6e", fontFamily: T.fontMono, marginBottom: 8 }}>
                Scan failed
              </div>
              <div style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>{scanError}</div>
            </div>
          )}

          {/* ── Manage ── */}
          {scanState === "manage" && (
            <div>
              {/* Saved folders */}
              {folders.length === 0 && !pendingPath && (
                <div style={{
                  fontSize: 12, color: T.muted, fontFamily: T.fontMono,
                  textAlign: "center", padding: "20px 0",
                }}>
                  No folders connected yet. Add a folder to get started.
                </div>
              )}

              {folders.map(folder => (
                <div key={folder.id} style={{
                  padding: "12px 14px", marginBottom: 8,
                  background: T.surface2, border: `1px solid ${T.border}`,
                  borderRadius: 7,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ flex: 1, fontSize: 12, color: T.text, fontFamily: T.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {folder.folder_path}
                    </span>
                    <span style={{
                      fontSize: 9, color: T.accent, fontFamily: T.fontMono,
                      border: `1px solid ${T.accent}44`, borderRadius: 3, padding: "1px 6px",
                      flexShrink: 0,
                    }}>{folder.media_type}</span>
                    <button
                      onClick={() => handleScan(folder.folder_path, folder.media_type, folder.id)}
                      style={{
                        padding: "3px 10px", background: "transparent",
                        border: `1px solid ${T.border}`, borderRadius: 4,
                        color: T.muted, fontSize: 10, cursor: "pointer",
                        fontFamily: T.fontMono, flexShrink: 0,
                      }}
                    >Re-scan</button>
                    <button
                      onClick={() => handleRemove(folder.id)}
                      style={{
                        padding: "3px 8px", background: "transparent",
                        border: "1px solid rgba(232,75,110,0.3)", borderRadius: 4,
                        color: "#e84b6e", fontSize: 10, cursor: "pointer", flexShrink: 0,
                      }}
                    >✕</button>
                  </div>
                  <div style={{ fontSize: 9, color: T.muted, fontFamily: T.fontMono }}>
                    {folder.item_count || 0} items · Last scanned {formatDate(folder.last_scanned_at)}
                  </div>
                </div>
              ))}

              {/* Pending new folder row */}
              {pendingPath && (
                <div style={{
                  padding: "12px 14px", marginBottom: 8,
                  background: T.surface2, border: `1px solid ${T.accent}44`,
                  borderRadius: 7,
                }}>
                  <div style={{
                    fontSize: 12, color: T.text, fontFamily: T.fontMono,
                    marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{pendingPath}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                      value={pendingType}
                      onChange={e => { setPendingType(e.target.value); setPendingError(null); }}
                      style={{
                        flex: 1, padding: "6px 10px", background: T.bg,
                        border: `1px solid ${pendingError ? "#e84b6e" : T.border}`,
                        borderRadius: 4, color: pendingType ? T.text : T.muted,
                        fontSize: 11, cursor: "pointer", fontFamily: T.fontSans,
                      }}
                    >
                      <option value="">Select media type…</option>
                      {MEDIA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button
                      onClick={() => handleScan(pendingPath, pendingType)}
                      style={{
                        padding: "6px 16px", background: T.accent, color: T.bg,
                        border: "none", borderRadius: 4, fontSize: 11, fontWeight: 700,
                        cursor: "pointer", fontFamily: T.fontSans, flexShrink: 0,
                      }}
                    >Scan</button>
                    <button
                      onClick={() => { setPendingPath(null); setPendingError(null); }}
                      style={{
                        padding: "6px 10px", background: "transparent",
                        border: `1px solid ${T.border}`, borderRadius: 4,
                        color: T.muted, fontSize: 11, cursor: "pointer", flexShrink: 0,
                      }}
                    >Cancel</button>
                  </div>
                  {pendingError && (
                    <div style={{ fontSize: 10, color: "#e84b6e", fontFamily: T.fontMono, marginTop: 6 }}>
                      {pendingError}
                    </div>
                  )}
                </div>
              )}

              {/* Add folder button */}
              {!pendingPath && (
                <button
                  onClick={handleAddFolder}
                  style={{
                    width: "100%", padding: "10px",
                    background: "transparent", border: `1px dashed ${T.border}`,
                    borderRadius: 7, color: T.muted, fontSize: 12,
                    cursor: "pointer", fontFamily: T.fontSans,
                    marginTop: folders.length > 0 ? 4 : 0,
                  }}
                >+ Add Folder</button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 20px", borderTop: `1px solid ${T.border}`, flexShrink: 0,
          display: "flex", justifyContent: "flex-end",
        }}>
          {(scanState === "done" || scanState === "error") ? (
            <button
              onClick={resetToManage}
              style={{
                padding: "9px 24px", background: T.accent, color: T.bg,
                border: "none", borderRadius: 5, fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: T.fontSans,
              }}
            >Done</button>
          ) : (
            <button
              onClick={onClose}
              style={{
                padding: "9px 24px", background: "transparent",
                border: `1px solid ${T.border}`, borderRadius: 5,
                color: T.muted, fontSize: 13, cursor: "pointer",
              }}
            >Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
