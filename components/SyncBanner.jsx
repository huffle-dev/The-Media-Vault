import { useEffect, useState } from "react";
import { T } from "../tokens.js";

// A bar across the top of the app when Cloud Sync fails while it is switched
// on: what went wrong, whether it will retry, and the one thing to do about it.
// Hidden by dismissing it (until the next, different failure) or by the next
// successful sync.
export default function SyncBanner({ status, onRetry, onOpenSettings }) {
  const [dismissedAt, setDismissedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const failed = status && status.state === "error" && status.mode && status.mode !== "off";
  useEffect(() => {
    if (!failed || !status.retryAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [failed, status && status.retryAt]);

  if (!failed || dismissedAt === status.failedAt) return null;

  const secs = status.retryAt ? Math.max(0, Math.round((status.retryAt - now) / 1000)) : null;
  const when = secs === null ? null : secs < 5 ? "any moment" : secs < 90 ? `${secs}s` : `${Math.round(secs / 60)} min`;
  const btn = {
    padding: "4px 12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.28)",
    borderRadius: 5, color: "#fff", fontSize: 11, fontFamily: T.fontMono, cursor: "pointer",
  };

  return (
    <div role="alert" style={{
      display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      padding: "8px 16px", background: "#7a1f35", color: "#fff",
      borderBottom: "1px solid #e84b6e", fontFamily: T.fontSans, fontSize: 12,
    }}>
      <span style={{ fontSize: 14 }}>⚠</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <strong>Cloud Sync isn't working.</strong>{" "}
        {status.needsLogin ? "Your login has expired — log in again to resume." : status.error}
        {!status.needsLogin && when ? ` Trying again in ${when}.` : ""}
      </span>
      {status.needsLogin
        ? <button style={btn} onClick={onOpenSettings}>Log in</button>
        : <button style={btn} onClick={onRetry}>Retry now</button>}
      <button style={btn} onClick={() => setDismissedAt(status.failedAt)} title="Hide until it fails again">Dismiss</button>
    </div>
  );
}
