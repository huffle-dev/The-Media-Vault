import { describe, it, expect } from "vitest";
import { mockSupabase as db } from "../mobile/demo/mockServer.js";

// The browser demo runs the real phone screens against this in-memory stand-in for Supabase, so it has to
// answer the same queries the app really makes.
describe("phone demo: stand-in server", () => {
  it("pages through the library with an exact count, like the app's first load", async () => {
    const first = await db.from("items").select("sync_id, title", { count: "exact" }).is("deleted_at", null).order("title", { ascending: true }).range(0, 9);
    expect(first.error).toBeNull();
    expect(first.data).toHaveLength(10);
    expect(first.count).toBeGreaterThan(60);
    const titles = first.data.map((r) => r.title);
    expect(titles).toEqual([...titles].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0)));
    const head = await db.from("items").select("sync_id", { count: "exact", head: true }).is("deleted_at", null);
    expect(head.count).toBe(first.count);
    expect(head.data).toBeNull();
  });
  it("reads one item, updates it, and sees the change", async () => {
    const { data: row } = await db.from("items").select("*").eq("title", "Metropolis").single();
    const { error } = await db.from("items").update({ status: "dropped" }).eq("sync_id", row.sync_id);
    expect(error).toBeNull();
    const again = await db.from("items").select("status").eq("sync_id", row.sync_id).single();
    expect(again.data.status).toBe("dropped");
  });
  it("hides soft-deleted rows from the library and reports a missing row the way Supabase does", async () => {
    const { data: row } = await db.from("items").select("sync_id").eq("title", "Sintel").single();
    await db.from("items").update({ deleted_at: new Date().toISOString() }).eq("sync_id", row.sync_id);
    const live = await db.from("items").select("sync_id").is("deleted_at", null);
    expect(live.data.some((r) => r.sync_id === row.sync_id)).toBe(false);
    const missing = await db.from("items").select("*").eq("sync_id", "nope").single();
    expect(missing.error.code).toBe("PGRST116");
    expect((await db.from("items").select("*").eq("sync_id", "nope").maybeSingle()).data).toBeNull();
  });
  it("upserts on the conflict key instead of adding a duplicate", async () => {
    const row = { item_sync_id: "x", device_id: "phone", is_local: true };
    await db.from("item_locations").upsert(row, { onConflict: "item_sync_id,device_id" });
    await db.from("item_locations").upsert({ ...row, is_local: false }, { onConflict: "item_sync_id,device_id" });
    const { data } = await db.from("item_locations").select("device_id, is_local").eq("item_sync_id", "x");
    expect(data).toEqual([{ device_id: "phone", is_local: false }]);
  });
  it("is signed in as the demo user", async () => {
    expect((await db.auth.getSession()).data.session.user.email).toBe("demo@example.com");
    expect((await db.auth.getUser()).data.user.id).toBeTruthy();
  });
});
