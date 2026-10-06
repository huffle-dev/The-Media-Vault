// Cover thumbnails for items that have no source link.
//
// Most covers sync as just a link (items.cover_art_url), which costs nothing.
// A few have none: art the user uploaded or cropped by hand, or art whose
// original source could not be found again. For those, a small (~300 px) JPEG
// is uploaded to the covers bucket on the user's OWN Supabase project, and its
// public address is recorded as that picture's source link — so the normal
// Cloud Sync then carries it to the phone and other computers like any other.
//
// Everything outside this file's reach is injected (the Supabase client, the
// image resizer, the file system, the database), so test/coverThumbnails.test.js
// runs it with fakes.

const BUCKET = "covers";

// Two random UUIDs: your user id, then the item's id. Not guessable or listable,
// and the bucket policy only lets you write inside your own folder.
const objectPath = (userId, syncId) => `${userId}/${syncId}.jpg`;

// -> { uploaded, skipped, failed, cleared, firstProblem?, error? }. `cleared` counts empty (zero-byte) cover files removed.
// `firstProblem` is the reason the first
// skipped or failed item gave, so a run that uploaded nothing can say why. Never throws: it runs in the
// background after a sync, and a problem here must not look like a sync failure.
async function uploadUnlinkedCoverThumbnails({ db, supabase, userId, makeThumbnail, fs, limit = 500 }) {
  const result = { uploaded: 0, skipped: 0, failed: 0, cleared: 0 };
  let candidates;
  try { candidates = db.itemsWithoutArtSource().slice(0, limit); } catch (err) { return { ...result, error: err.message }; }

  for (const item of candidates) {
    try {
      if (!fs.existsSync(item.cover_art_path)) { result.skipped++; result.firstProblem ||= `file not found: ${item.cover_art_path}`; continue; }
      // A zero-byte file is a download that never finished — not a picture at all.
      // Clear it so the item reads as "no cover" (and Fetch Missing Art can try again)
      // instead of looking covered forever; anything else unreadable is only reported.
      if (fs.statSync(item.cover_art_path).size === 0) {
        try { fs.unlinkSync(item.cover_art_path); } catch { /* leave the file; clearing the path is what matters */ }
        db.updateFields(item.id, { cover_art_path: null, cover_art_checked_date: null });
        result.cleared++;
        continue;
      }
      const jpeg = await makeThumbnail(item.cover_art_path);
      if (!jpeg || !jpeg.length) { result.skipped++; result.firstProblem ||= `couldn't read as an image: ${item.cover_art_path}`; continue; } // not a readable image
      const path = objectPath(userId, item.sync_id);
      const { error } = await supabase.storage.from(BUCKET).upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
      if (error) {
        result.failed++;
        result.firstProblem ||= error.message || "upload failed";
        // A missing bucket (the setup SQL's last section wasn't run) fails every
        // item the same way: say so once and stop rather than trying hundreds.
        if (/bucket not found/i.test(error.message || "")) {
          return { ...result, error: "The covers storage isn't set up on your server — run the setup SQL again (Settings → Cloud Sync → Your server → Copy setup SQL)." };
        }
        // Same for a storage rule that's missing or out of date: every item fails identically.
        if (/row-level security|not authorized|unauthorized|permission/i.test(error.message || "")) {
          return { ...result, error: `Your server's storage rules don't allow the upload (${error.message}). Run the setup SQL again — it adds the missing rule (Settings → Cloud Sync → Your server → Copy setup SQL).` };
        }
        continue;
      }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      // Recording the address marks the item changed, so the next sync uploads it as cover_art_url.
      db.recordCoverArtSource(item.cover_art_path, data.publicUrl);
      result.uploaded++;
    } catch (err) {
      result.failed++;
      result.firstProblem ||= (err && err.message) || "unexpected error";
    }
  }
  return result;
}

module.exports = { uploadUnlinkedCoverThumbnails, objectPath, BUCKET };
