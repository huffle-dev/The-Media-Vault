// Replacing an item's cover with a picture from the phone. The picture is cropped
// and shrunk on the phone, uploaded to the `covers` bucket on the user's OWN
// Supabase project (the same bucket desktop uses for covers it has no link for), and
// the item's cover_art_url is pointed at it, so desktop and every other device pick
// it up through the normal sync. Pure — the Supabase client is passed in — so
// test/mobileCoverUpload.test.js runs without Expo.

export const COVER_BUCKET = "covers";

// The crop shape to offer: wide for videos, square for art that is square (music,
// podcasts, audiobooks, board games), tall (2:3) for posters and book covers.
export function coverAspectFor({ squareArt, wideArt }) {
  if (wideArt) return [16, 9];
  if (squareArt) return [1, 1];
  return [2, 3];
}

// <user id>/<item id>-<time>.jpg. The time makes every replacement a NEW address, so a
// device that already holds the old picture sees the link change and fetches the new one.
export const coverObjectPath = (userId, syncId, now = Date.now()) => `${userId}/${syncId}-${now}.jpg`;

// Uploads `bytes` (a JPEG) and makes it the item's cover. Resolves to
// { url, undo } — undo restores the previous link and removes the new picture.
// Throws (leaving nothing half-done) if the upload or the update fails.
export async function replaceCover({ client, userId, item, bytes, now = Date.now() }) {
  const path = coverObjectPath(userId, item.sync_id, now);
  const bucket = client.storage.from(COVER_BUCKET);
  const { error: upErr } = await bucket.upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw new Error(storageMessage(upErr));
  const url = bucket.getPublicUrl(path).data.publicUrl;
  const previous = item.cover_art_url ?? null;
  const { error } = await client.from("items")
    .update({ cover_art_url: url, updated_at: new Date().toISOString() })
    .eq("sync_id", item.sync_id);
  if (error) {
    await bucket.remove([path]).catch(() => {});
    throw new Error(error.message);
  }
  // The previous picture is left in the bucket so Undo can bring it back (about 30 KB each).
  return {
    url,
    undo: async () => {
      const { error: e } = await client.from("items")
        .update({ cover_art_url: previous, updated_at: new Date().toISOString() })
        .eq("sync_id", item.sync_id);
      if (e) throw e;
      await bucket.remove([path]).catch(() => {});
    },
  };
}

// The storage rules answer in database-speak; say what to do.
function storageMessage(err) {
  const m = String(err.message || err);
  if (/row-level security|policy/i.test(m)) return "Your server's storage rules don't allow this upload. Run the setup SQL again (Settings → Cloud Sync → Your server on desktop).";
  if (/bucket.*not found/i.test(m)) return "Your server has no covers storage yet. Run the setup SQL again on desktop.";
  return m;
}
