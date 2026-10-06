// Shared Cloud Sync orchestration — used by both the manual "Sync Now"
// button (ResyncTab.jsx) and the auto-sync-on-launch flow (App.jsx), same
// pattern as steamSync.js/gogSync.js. Pure orchestration over the existing
// window.vault.cloudSync IPC call — no React state here, callers own their
// own loading/result UI. All the real push/pull logic lives in
// lib/cloudSync.js on the main-process side; this just calls it.
export async function runCloudSync() {
  return await window.vault.cloudSync.sync();
}
