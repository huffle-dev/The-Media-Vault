import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import autoSyncModule from "../lib/autoSync.js";
import VaultDatabase from "../database.js";

const { createAutoSync, QUIET_MS, MAX_WAIT_MS, PULL_INTERVAL_MS, FOCUS_MIN_GAP_MS, RETRY_DELAYS_MS, TICK_MS } = autoSyncModule;

// A fake clock, a data marker we bump to "edit", and a sync we can make fail.
function harness({ mode = "auto", connected = true } = {}) {
  const h = {
    clock: 1_000_000,
    marker: 100,
    mode,
    connected,
    syncs: 0,
    failWith: null,
    syncGate: null,
    statuses: [],
  };
  h.sync = createAutoSync({
    getMode: () => h.mode,
    isConnected: () => h.connected,
    getChangeMarker: () => h.marker,
    runSync: async () => {
      h.syncs += 1;
      if (h.syncGate) await h.syncGate;
      if (h.failWith) throw new Error(h.failWith);
      h.marker += 3; // the sync's own writes — must not count as an edit
      return { pushed: { items: 2 }, pulled: { inserted: 1, updated: 0, deleted: 0, coverArtFetched: 0 } };
    },
    onStatus: (s) => h.statuses.push(s.state),
    now: () => h.clock,
    setInterval: () => 0,
    clearInterval: () => {},
  });
  h.advance = async (ms) => {
    const end = h.clock + ms;
    while (h.clock < end) {
      h.clock = Math.min(h.clock + TICK_MS, end);
      h.sync.tick();
      await Promise.resolve();
      await Promise.resolve();
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  h.edit = () => { h.marker += 1; };
  return h;
}

describe("auto sync scheduler", () => {
  let h;
  beforeEach(() => { h = harness(); });

  it("does nothing when the mode is off or only 'launch', or when signed out", async () => {
    for (const cfg of [{ mode: "off" }, { mode: "launch" }, { connected: false }]) {
      const x = harness(cfg);
      x.sync.tick();
      x.edit();
      await x.advance(PULL_INTERVAL_MS + QUIET_MS);
      expect(x.syncs).toBe(0);
    }
  });

  it("syncs about a minute after an edit, not before", async () => {
    h.sync.tick();
    h.edit();
    await h.advance(QUIET_MS - TICK_MS);
    expect(h.syncs).toBe(0);
    await h.advance(2 * TICK_MS);
    expect(h.syncs).toBe(1);
  });

  it("a burst of edits is one sync, and keeps waiting while edits keep coming", async () => {
    h.sync.tick();
    for (let i = 0; i < 4; i++) { h.edit(); await h.advance(30_000); }
    expect(h.syncs).toBe(0); // never quiet for a full minute yet
    await h.advance(QUIET_MS + TICK_MS);
    expect(h.syncs).toBe(1);
  });

  it("an endless stream of edits still syncs after the maximum wait", async () => {
    h.sync.tick();
    for (let t = 0; t < MAX_WAIT_MS + 3 * TICK_MS; t += 30_000) { h.edit(); await h.advance(30_000); }
    expect(h.syncs).toBeGreaterThanOrEqual(1);
  });

  it("the sync's own writes do not count as an edit (no sync loop)", async () => {
    h.sync.tick();
    h.edit();
    await h.advance(QUIET_MS + 2 * TICK_MS);
    expect(h.syncs).toBe(1);
    await h.advance(4 * QUIET_MS); // nothing edited since, and the pull timer is not due yet
    expect(h.syncs).toBe(1);
  });

  it("pulls what other devices changed every few minutes even with no local edits", async () => {
    h.sync.tick();
    await h.advance(PULL_INTERVAL_MS - TICK_MS);
    expect(h.syncs).toBe(0);
    await h.advance(2 * TICK_MS);
    expect(h.syncs).toBe(1);
  });

  it("syncs when the window regains focus, but not more than once a minute", async () => {
    h.sync.tick();
    h.clock += FOCUS_MIN_GAP_MS - 1000;
    h.sync.notifyFocus();
    expect(h.syncs).toBe(0);
    h.clock += 2000;
    h.sync.notifyFocus();
    await new Promise((r) => setTimeout(r, 0));
    expect(h.syncs).toBe(1);
    h.sync.notifyFocus(); // just synced
    await new Promise((r) => setTimeout(r, 0));
    expect(h.syncs).toBe(1);
  });

  it("two requests at once share one sync (Sync Now during a background sync)", async () => {
    let open;
    h.syncGate = new Promise((r) => { open = r; });
    const a = h.sync.syncNow({ auto: true });
    const b = h.sync.syncNow();
    expect(a).toBe(b);
    open();
    await a;
    expect(h.syncs).toBe(1);
  });

  it("a manual sync resets the baseline so an edit made before it does not trigger another", async () => {
    h.sync.tick();
    h.edit();
    await h.sync.syncNow();
    await h.advance(QUIET_MS * 2);
    expect(h.syncs).toBe(1);
  });

  it("retries a failure after 1, then 2, then 5 minutes", async () => {
    h.failWith = "network down";
    h.sync.tick();
    h.edit();
    await h.advance(QUIET_MS + TICK_MS);
    expect(h.syncs).toBe(1);
    expect(h.sync.getStatus()).toMatchObject({ state: "error", error: "network down", needsLogin: false });
    await h.advance(RETRY_DELAYS_MS[0] - 2 * TICK_MS);
    expect(h.syncs).toBe(1);
    await h.advance(3 * TICK_MS);
    expect(h.syncs).toBe(2);
    await h.advance(RETRY_DELAYS_MS[1] + 2 * TICK_MS);
    expect(h.syncs).toBe(3);
    await h.advance(RETRY_DELAYS_MS[2] + 2 * TICK_MS);
    expect(h.syncs).toBe(4);
  });

  it("recovers: the next success clears the error", async () => {
    h.failWith = "network down";
    h.sync.tick();
    h.edit();
    await h.advance(QUIET_MS + TICK_MS);
    expect(h.sync.getStatus().state).toBe("error");
    h.failWith = null;
    await h.advance(RETRY_DELAYS_MS[0] + 2 * TICK_MS);
    expect(h.sync.getStatus()).toMatchObject({ state: "ok", error: null });
  });

  it("stops retrying when the login no longer works, until retryNow", async () => {
    h.failWith = "Cloud Sync session expired — log in again. (Invalid Refresh Token: Already Used)";
    h.sync.tick();
    h.edit();
    await h.advance(QUIET_MS + TICK_MS);
    expect(h.sync.getStatus()).toMatchObject({ state: "error", needsLogin: true, retryAt: null });
    await h.advance(PULL_INTERVAL_MS * 3);
    expect(h.syncs).toBe(1);
    h.failWith = null;
    await h.sync.retryNow();
    expect(h.syncs).toBe(2);
    expect(h.sync.getStatus().state).toBe("ok");
  });

  it("a manual sync failure is thrown to the caller and reported", async () => {
    h.failWith = "boom";
    await expect(h.sync.syncNow()).rejects.toThrow("boom");
    expect(h.statuses).toEqual(["syncing", "error"]);
  });

  it("reports counts only in the status", async () => {
    await h.sync.syncNow();
    expect(h.sync.getStatus().result).toEqual({ pushed: 2, inserted: 1, updated: 0, deleted: 0, coverArtFetched: 0 });
  });
});

describe("status and the change marker", () => {
  it("tells the banner which mode a failure belongs to", async () => {
    const h = harness({ mode: "auto" });
    h.failWith = "offline";
    await expect(h.sync.syncNow({ auto: true })).rejects.toThrow();
    expect(h.sync.getStatus()).toMatchObject({ state: "error", mode: "auto", auto: true });
    h.mode = "off";
    await expect(h.sync.syncNow()).rejects.toThrow();
    expect(h.sync.getStatus().mode).toBe("off");
  });

  it("the database's change marker moves on a write and holds still otherwise", () => {
    const file = path.join(os.tmpdir(), `vault-marker-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    const db = new VaultDatabase(file);
    db.initialise();
    const a = db.changeMarker();
    expect(db.changeMarker()).toBe(a);
    db.setSetting("anything", "x");
    expect(db.changeMarker()).toBeGreaterThan(a);
    db.close();
    for (const suffix of ["", "-wal", "-shm"]) { try { fs.rmSync(file + suffix, { force: true }); } catch { /* still open on Windows */ } }
  });
});
