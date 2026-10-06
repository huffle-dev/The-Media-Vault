// "just now" / "3 min ago" / "2 h ago" / "4 days ago" for a timestamp in ms.
// Shared by the phone's Settings and the desktop's Cloud Sync status line.
export function timeAgo(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return null;
  const secs = Math.max(0, Math.round((now - ms) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
