// What you own, as the phone sees it. Desktop's "Owned" flag lives per computer
// (item_locations: one row per item and device, is_local = marked owned there),
// so an item counts as owned when ANY of your devices has it marked. Marking
// something owned by hand on desktop (a physical copy, say) is therefore seen
// here too. The phone can mark things owned itself (a physical copy, say): that writes
// its own item_locations row, with no file path, and desktop reads it after its next sync.
// Pure — the Supabase client is passed in —
// so test/mobileOwnership.test.js runs without Expo.

const PAGE = 1000;

// Set of item sync_ids marked owned on at least one device.
// `deviceId` limits it to that device; `exceptDeviceId` leaves that device out.
export async function fetchOwnedIds(client, { deviceId, exceptDeviceId } = {}) {
  const owned = new Set();
  for (let from = 0; ; from += PAGE) {
    let query = client.from("item_locations").select("item_sync_id").eq("is_local", true);
    if (deviceId) query = query.eq("device_id", deviceId);
    if (exceptDeviceId) query = query.neq("device_id", exceptDeviceId);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data) owned.add(r.item_sync_id);
    if (data.length < PAGE) break;
  }
  return owned;
}

// Who has this one marked owned (for the profile): `mine` = this phone, `others` =
// the names of the other devices.
export async function fetchOwnership(client, itemSyncId, deviceId) {
  const { data, error } = await client
    .from("item_locations")
    .select("device_id, is_local, devices(name)")
    .eq("item_sync_id", itemSyncId)
    .eq("is_local", true);
  if (error) throw error;
  const rows = data || [];
  return {
    mine: rows.some((r) => r.device_id === deviceId),
    others: rows.filter((r) => r.device_id !== deviceId).map((r) => (r.devices && r.devices.name) || "another device"),
  };
}

// The profile's one-line answer.
export function ownedText({ mine, others }) {
  const where = [...(mine ? ["this phone"] : []), ...[...new Set(others)]];
  return where.length ? `Owned — marked on ${where.join(", ")}` : "Not marked as owned";
}

// The device row item_locations points at. Made once per app session; harmless to repeat.
let deviceEnsured = null;
export async function ensureDevice(client, deviceId) {
  if (deviceEnsured === deviceId) return;
  const { data } = await client.auth.getUser();
  const { error } = await client.from("devices").upsert(
    { device_id: deviceId, user_id: data.user.id, name: "Phone", platform: "android", last_synced_at: new Date().toISOString() },
    { onConflict: "device_id" },
  );
  if (error) throw error;
  deviceEnsured = deviceId;
}

// Marks ids owned (or not) on THIS phone. Returns the ids that did not save.
export async function writeOwned(client, { deviceId, ids, owned }) {
  const failed = [];
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    const { error } = await client.from("item_locations").upsert(
      part.map((id) => ({ item_sync_id: id, device_id: deviceId, is_local: owned, updated_at: now })),
      { onConflict: "item_sync_id,device_id" },
    );
    if (error) failed.push(...part);
  }
  return failed;
}

// Desktop's rule: owning a Wishlist title makes it Not Started; un-owning a Not Started
// one (that nobody else owns) sends it back to Wishlist. null = leave the status alone.
export function ownedStatusPatch(item, owned, othersOwn) {
  if (owned && item.status === "wishlist") return { status: "not-started" };
  if (!owned && !othersOwn && item.status === "not-started") return { status: "wishlist" };
  return null;
}

// Items with `is_local` (1/0) filled in from the owned set, ready for the shared
// Owned filter. With no set yet (not loaded, or offline) the items come back
// unchanged, so nothing is wrongly called "not owned".
export function withOwned(items, ownedIds) {
  if (!items || !ownedIds) return items;
  return items.map((i) => {
    const flag = ownedIds.has(i.sync_id) ? 1 : 0;
    return i.is_local === flag ? i : { ...i, is_local: flag };
  });
}
