// The welcome screen's "have they seen it" memory, and a way for About to open it
// again. Kept in the phone's own storage; a failure just means it shows again.
const KEY = "mobile_welcome_seen";
const listeners = new Set();

export function hasSeenWelcome() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function markWelcomeSeen() {
  try { localStorage.setItem(KEY, "1"); } catch { /* shows again next time; harmless */ }
}
export const showWelcome = () => listeners.forEach((fn) => fn());
export function onShowWelcome(fn) { listeners.add(fn); return () => listeners.delete(fn); }
