# Cloud Sync — schema and sync design (V3 step 2)

Design record for step 2 of the the project backlog V3 plan: "Supabase schema and
two-way sync, including the device-specific split." It was written before the build and
replaced the throwaway `items_skeleton` table from the walking skeleton. **It has since been
built — start with the status section below**, which says where the build departed from it.

Grounded in the decisions already made in BACKLOG.md's V3 table (single
user, Supabase, local-first two-way sync, newest-edit-wins per row via
`updated_at`, a `deleted_at` marker for deletes, a device id, device-specific
fields split into their own table) and in reading the real schema in
[`database.js`](../database.js) (v44, `media_items` has ~110 columns).

## Status (2026-10-05): built, and what changed since this was written

Everything below was implemented and is in daily use; the document is kept as the
design record. Where the build departed from it, or went beyond it:

- **More tables sync.** Beyond items, lists, list memberships and custom types:
  Discover dismissals (`discovery_dismissed`, keyed by media type + external id so two
  devices dismissing the same title land on one row), encrypted API keys
  (`secret_vault`, `encrypted_secrets`), and a per-device `item_locations` table.
- **Deletes are tombstoned locally.** A deleted item, list or list membership is
  recorded in a local tombstone table (`item_tombstones`, `list_tombstones`,
  `list_item_tombstones`) so the next push can tell the cloud — the cloud side then
  carries `deleted_at`. Without this a delete on one device never reached the other.
- **Pull before push.** A push re-sends every current list membership, so another
  device's removal has to be applied locally first or the push would quietly re-add
  it. The whole pull is applied in one transaction.
- **Cover art.** The original decision was "cover art is never synced". It still isn't
  as a file, but the **source link** is: `items.cover_art_url` is the address the
  picture was downloaded from, and every device downloads its own copy from it. Covers
  with no public source (hand-uploaded or cropped, or whose source is gone) get a small
  thumbnail in a `covers` Storage bucket on the user's own project, recorded as the same
  link.
- **Sync runs by itself.** `lib/autoSync.js` syncs about a minute after an edit, when the
  window regains focus, and every few minutes (mode "Automatic"; the older "when the
  app opens" and "off" remain). All syncs share one lock, a failure retries with backoff,
  and an expired login stops the retries and shows a banner.
- **The phone refreshes incrementally.** It asks only for rows changed since the newest
  `updated_at` it holds (including soft-deleted ones), merges them, and checks the live
  count against the cloud before trusting the result.
- **The server is the user's own.** No project is built in: the URL and publishable key
  are entered in Settings (desktop) or on the sign-in screen (phone) and checked with a
  staged connection test (`packages/core/supabaseSetup.js`). Switching servers signs out of
  the old one and clears the sync checkpoints so the new server receives the whole library.
- **The schema is one file.** `supabase/schema_current.sql` supersedes the numbered
  `schema_v2`…`v5` files (kept as history); a test fails if the sync pushes an item column
  the file doesn't create. See [Setting up your own server](setup-your-server.md).
- **Not built:** live (Realtime) updates on either app — decided against; see
  "Deliberately Skipped" in the backlog.

## Design principles

1. **The local SQLite database stays the source of truth for reads.** The
   app never queries Supabase directly for something to show on screen — it
   queries local SQLite (fast, offline-capable) and a background sync
   process keeps that copy converged with the cloud, same as the plan's
   original "recommended architecture" for Cloud Sync.
2. **Rows are identified by a stable UUID (`sync_id`), never the local
   integer id.** Two devices both auto-increment from 1 — the same integer
   means two different real items on two devices. Every table that syncs
   gets its own `sync_id`, generated once (at creation) and never changed;
   all cross-table references in the synced schema point at `sync_id`s, not
   local integer ids.
3. **Deletes are soft, not real, until they've synced.** A `deleted_at`
   timestamp (NULL = alive) turns a delete into an ordinary field update,
   so "newest edit wins" also naturally decides delete-vs-delete-something-
   else conflicts — no separate tombstone mechanism needed. A background
   sweep can hard-delete rows whose `deleted_at` is old enough that every
   device has certainly seen it (see Open question 2).
4. **Conflict resolution is last-write-wins per row, not per field.**
   Simpler and matches the decision in BACKLOG.md — the two devices are the
   same person's, so field-level merging inside one row is not needed.
5. **Device-specific data never goes in the item's synced row.** Split into
   a separate per-device table (Decision table: "Device-specific fields").

## What syncs vs. what stays local

Read against the actual columns in `database.js`'s `media_items` table:

| Category | Columns | Where it lives |
|---|---|---|
| Core item data | title, media_type, status, rating, date_consumed, date_added, notes, all shared/type-specific metadata (creator, genre, year, network, platform, cast_list, tracklist, custom_fields, etc. — the great majority of the ~110 columns), all per-source rating fields (imdb_rating, tmdb_rating, bgg_rating, etc.), the watch_*/`*_checked_date` cache fields | Synced as regular fields on the cloud `items` row. |
| Device-specific | `local_path`, `install_path`, `is_local` | **Not** on the synced item row — moved to a per-device table (`item_locations`, see below). Confirmed by reading `processScanResults()`: `is_local`/`local_path` are set together whenever a folder scan finds files on **this machine** — a Movie can be local on the desktop and not on the phone, so a single `is_local` column on the shared row would be wrong on whichever device didn't do the scan. |
| Device-local, never synced | `cover_art_path` | Already decided (Decision table: "Cover art") — absolute local path, meaningless on another device. Each device resolves and downloads its own cover art the way desktop already does. |
| Sync bookkeeping (new) | `sync_id`, `updated_at` (already exists), `deleted_at` (new) | Added to every synced table. |

**`watch_checked_country`** is worth a specific note: it's genuinely
region-dependent (a US device's "available on Netflix" cache is wrong for a
device in the UK), but it's still just a cache the app already knows how to
refresh (`watch_checked_date` gates re-fetching) — simplest to sync it as a
normal field and let a device whose region differs naturally re-check and
overwrite it, rather than adding a second device-specific-fields path for
one cache value.

**`metadata_fetched`** is a one-way "has this ever been enriched" flag, safe
to sync as a normal field — whichever device set it first, having it stay
set is the correct outcome everywhere.

## Schema

### Supabase (Postgres)

```
items
  sync_id           uuid primary key
  user_id           uuid not null references auth.users(id)
  local_id          integer            -- convenience only, see Open question 1
  title             text not null
  media_type        text not null
  status            text not null
  rating            integer
  ... every other synced media_items column, same names/types ...
  updated_at        timestamptz not null
  deleted_at        timestamptz
  unique (user_id, sync_id)

item_locations
  sync_id           uuid references items(sync_id) on delete cascade
  device_id         uuid references devices(device_id) on delete cascade
  local_path        text
  install_path      text
  is_local          boolean not null default false
  updated_at        timestamptz not null
  primary key (sync_id, device_id)

lists
  sync_id           uuid primary key
  user_id           uuid not null references auth.users(id)
  name              text not null
  is_default        boolean not null default false
  updated_at        timestamptz not null
  deleted_at        timestamptz

list_items
  list_sync_id      uuid references lists(sync_id) on delete cascade
  item_sync_id      uuid references items(sync_id) on delete cascade
  updated_at        timestamptz not null
  deleted_at        timestamptz
  primary key (list_sync_id, item_sync_id)

devices
  device_id         uuid primary key
  user_id           uuid not null references auth.users(id)
  name              text not null        -- e.g. "Desktop — My PC", "Pixel 8"
  platform          text not null        -- 'desktop' | 'android'
  last_synced_at    timestamptz
  created_at        timestamptz not null default now()
```

Row-level security on every table above: `user_id = (select auth.uid())` for
`items`/`lists`/`devices`; `item_locations`/`list_items` gate through a join
back to their parent's `user_id` (same pattern used for `list_items` today
being scoped through `lists`/`media_items`).

```
custom_types
  sync_id           uuid primary key
  user_id           uuid not null references auth.users(id)
  label             text not null
  icon              text not null
  color             text not null
  updated_at        timestamptz not null
  deleted_at        timestamptz

custom_type_fields
  sync_id           uuid primary key
  custom_type_sync_id uuid references custom_types(sync_id) on delete cascade
  key               text not null
  label             text not null
  field_type        text not null
  sort_order        integer not null default 0
  updated_at        timestamptz not null
  deleted_at        timestamptz
```

`media_items.custom_type_id` (a local integer FK today) becomes
`custom_type_sync_id` (uuid) in the synced `items` row, mirroring every
other cross-table reference in this schema.

**Pull ordering consequence:** `custom_types`/`custom_type_fields` must
pull and be inserted locally *before* any `items` row referencing one — an
item whose custom type hasn't arrived yet on a fresh device would otherwise
have a dangling `custom_type_id`. Concretely: pull custom_types →
custom_type_fields → lists → items → list_items, in that order, each pass
fully applied before the next starts.

### Local SQLite (new migration, v45)

- `media_items` gains `sync_id` (TEXT, UUID, unique, backfilled for all 1919
  existing rows on migration) and `deleted_at` (TEXT, nullable). `is_local`
  and `local_path`/`install_path` stay exactly where they are — the local
  database still needs them for this device's own UI (the List view's owned
  dot, the Folder/Launch buttons); only the *cloud* copy excludes them from
  the shared row and carries them in `item_locations` instead.
- `lists` gains `sync_id`/`deleted_at`, same shape.
- `custom_types` gains `sync_id`/`deleted_at`, same shape. `custom_type_fields`
  gains `sync_id`/`deleted_at` too, though it has no local device-specific
  data of its own — it just needs the same identity treatment as everything
  else that's referenced across devices.
- No new `devices` or `sync_state` table, and no migration needed for
  either: this device's `device_id` and the `last_synced_at` checkpoint are
  each a single value, so they're just two keys in the existing generic
  `settings` table (same pattern as every other singleton setting today) —
  `getSetting`/`setSetting` already exist, and nothing needs to read or
  write these two keys until the sync engine itself does (step 3), so
  they're deliberately not created by the v45 migration. Simpler than a
  per-row dirty flag: a push scans local rows with `updated_at` newer than
  the `last_synced_at` setting.

## The sync algorithm

Runs on an interval (app-idle timer, matching how Steam/GOG/Epic resync
already works today) and once explicitly on demand from a Settings action,
same UX shape as the existing Resync tab.

1. **Push.** Select every local `media_items`/`lists`/`list_items`/
   `custom_types`/`custom_type_fields` row whose `updated_at` is newer than
   this device's `last_synced_at`. Upsert each into the matching Supabase
   table by `sync_id` (`onConflict: sync_id`, same pattern
   `push-skeleton.js` already proved out on `(user_id, local_id)`).
   `item_locations` rows for this device push unconditionally (small table,
   cheap) rather than needing their own dirty-tracking.
2. **Pull.** Select every Supabase row (`custom_types`, `custom_type_fields`,
   `lists`, `items`, `list_items`, in that order — see below) whose
   `updated_at` is newer than this device's `last_synced_at`. For each:
   - New `sync_id` (not in local SQLite) → insert locally, allocating a new
     local integer id.
   - Known `sync_id` → **compare `updated_at`**: cloud newer than local's
     own copy → overwrite the local row (except the device-specific
     columns, which are never touched by a pull); local newer (this
     device's own not-yet-pushed edit, or a push that raced the pull) →
     keep local, it'll win on the next push.
   - `deleted_at` set on the cloud row and newer than local → mark the
     local row deleted / actually delete it locally.
3. **Advance `last_synced_at`** to "now" only after both halves succeed —
   a failed sync (offline, Supabase project paused) leaves the checkpoint
   where it was, so the next attempt naturally retries everything since the
   last real success.
4. **First sync on a fresh device** is the same pull as step 2, just with
   `last_synced_at` at the epoch — pulls the entire library in one pass.
   **First sync on the original desktop**, which already has 1919 items
   with no `sync_id`s yet, is a one-time local migration step: generate a
   `sync_id` for every existing row, then push all of them — effectively a
   full, real version of what `push-skeleton.js` faked for the walking
   skeleton.

### Ordering within a sync pass

Push order doesn't matter for Postgres (foreign keys checked at commit
inside one transaction covers it), but **pull order matters locally**:
`custom_types` → `custom_type_fields` → `lists` → `items` → `list_items`,
each fully applied before the next starts — an item can reference a custom
type or appear in a list, so those parents must already exist locally with
their real local ids before the child row is inserted. See the Schema
section's custom-types note for why this specifically matters there.

## Known hard edges

- **Editing the same field on two offline devices between syncs** — the
  older edit is silently lost (by design, per the "newest edit wins"
  decision) — worth a quiet "last synced Tuesday 3pm" timestamp somewhere
  in Settings so a real conflict isn't a total mystery, but no merge UI.
- **Clock skew** — `updated_at` comparison across devices assumes clocks
  are roughly right. Not a real risk for two personal devices with normal
  NTP sync; not worth solving for now (a vector clock or per-row edit
  counter would be the real fix, overkill here).
- **A device offline for a long time, then it edits a field another device
  already changed and deleted the item** — the edit is now against a
  `deleted_at`'d row. Simplest correct behavior: a push whose target row
  is already soft-deleted on the cloud is a no-op (deletion wins) — the
  local device sees it vanish on its next pull, same UX as "I deleted that
  on my phone."
- **First sync assigning 1919 UUIDs is a real, one-time write to the live
  database** — needs a Full Backup taken immediately before, same
  discipline already used for the media-type-rename plan.

## Suggested build order for step 2

1. Local migration v45 (`sync_id`/`updated_at`/`deleted_at` on
   `media_items`, `lists`, `custom_types` and `custom_type_fields`; every
   insert path populates `sync_id` going forward) — no cloud calls yet,
   just the local shape and the one-time UUID backfill for existing rows.
   `device_id`/`last_synced_at` need no migration at all — see the Local
   SQLite section above. Verified purely with the existing test suite plus
   a live migration against a copy of the real database.
2. ~~Supabase schema (the tables above, RLS policies)~~ — **Done.**
   `supabase/schema_v2_cloud_sync.sql` creates all 7 tables with RLS.
   Verified both directions: anonymous curl checks confirmed every table
   returns empty to a read and refuses a write (`42501`, "new row violates
   row-level security policy") including through the join-scoped policies
   (`custom_type_fields`, `item_locations`, `list_items`) and past a
   fabricated `user_id`; `scripts/verify-cloud-sync-schema.js` (run by the
   user, since it needs a real login) confirmed the authenticated positive
   path — the signed-in account can insert/read its own row on every table,
   the join-scoped policies allow a real child row under a real parent, and
   the `rating` CHECK constraint genuinely rejects an out-of-range value
   (999) rather than RLS masking the question entirely. 9/9 checks passed.
3. ~~Push half only, one-way, manual trigger~~ — **Done.**
   `scripts/sync-push.js` reads every local row changed since the last
   push (a `last_synced_at` checkpoint in `settings`) and upserts it by
   `sync_id`, in parent-before-child order (`devices` → `custom_types` →
   `custom_type_fields` → `lists` → `items` → `item_locations` →
   `list_items`) so a foreign key is never pushed ahead of the row it
   references. Row-building copies every local column except an explicit
   exclude list (device-specific/local-only fields, the old integer FK)
   rather than a hand-typed allow-list, verified before ever touching the
   network by dry-running it against a scratch copy of the real database
   and diffing the resulting keys against the actual Postgres columns —
   0 mismatches on all 4 tables with real+synthetic data.
   **Real bug caught on the first live run, not a design mistake**: `items`
   failed 1500 rows in with `invalid input syntax for type integer: "2.6"`
   — a real book's `series_order` (a novella between books 2 and 3) is
   genuinely fractional, and the Postgres column was wrongly typed as a
   strict `integer` where SQLite's own typing is advisory, not enforced.
   Fixed with `supabase/schema_v2b_fix_series_order.sql` (widened to
   `double precision`) after confirming, column by column, that none of
   the other 23 integer-typed columns in the real library have the same
   problem. Re-run after the fix: all 1922 items, 1 list, and 613
   device-specific locations pushed with zero errors.
4. ~~Pull half, tested against a second device~~ — **Done.**
   `scripts/sync-pull.js` fetches every cloud row changed since this
   device's own `cloud_sync_last_pulled_at` checkpoint and applies it in
   parent-before-child order (`custom_types` → `custom_type_fields` →
   `lists` → `items` → `list_items`): a new `sync_id` is inserted
   (allocating a fresh local integer id), a known `sync_id` compares
   `updated_at` and the newer copy wins, a `deleted_at` newer than the
   local row removes it. Device-specific columns
   (`local_path`/`install_path`/`is_local`) are never touched by a pull.
   **Real bug caught on the first live test, a genuine design gap, not a
   typo**: every device seeds its own `Favourites` list independently on
   first install (`_seedDefaults`, before that device has ever synced),
   each with its *own* locally-generated `sync_id` — so a fresh second
   device's pre-existing `Favourites` row and the cloud's `Favourites` row
   never shared a `sync_id`, and the first pull attempt tried to insert a
   second row, hitting the `name` `UNIQUE` constraint. Fixed by relinking
   a local `is_default` row onto the incoming `sync_id` whenever one exists
   locally by that name, regardless of whether it already carries some
   other (never-pushed) `sync_id` of its own.
   **Second bug, unrelated to the schema or algorithm**: the very first
   pull attempt returned 0 rows for `items`/`lists` with no error at all —
   traced (via a small diagnostic script comparing session user ids) to
   the Supabase account having been rotated between test runs, so the
   pull was correctly authenticated as a *different* user than the one
   `sync-push.js` had pushed under — RLS was correctly isolating two
   different accounts, not malfunctioning. Fixed by clearing the
   orphaned rows (`supabase/reset_after_account_change.sql`) and
   re-pushing under the current account — a reminder that this project's
   two-way sync assumes one person, one Supabase account, throughout.
   **Verified end to end**: a completely fresh, empty second database
   pulled all 1922 items (zero `NULL`/duplicate `sync_id`s), correctly
   relinked its own pre-existing `Favourites` list onto the cloud's
   `sync_id` instead of duplicating it, correctly mapped all 3 list
   memberships by title across the `sync_id` remapping, and left every
   device-specific column at its default (confirmed by a direct query) —
   this device has never scanned anything locally, so it shouldn't
   claim to have.
5. ~~Wire into the existing Resync-tab UX pattern~~ — **Done.** Real
   IPC in `main.js` (`cloudSync:login`/`isConnected`/`disconnect`/`sync`,
   calling `lib/cloudSync.js`'s already-verified `pushChanges`/
   `pullChanges` directly — no second implementation), an email/password
   login form in Account Access (`settings/CloudSyncSection.jsx` — direct
   credential entry, since Supabase has no OAuth window the way GOG/Epic
   do), and a `LibraryResyncSection` block in the Resync tab with a
   "Sync Now" button and its own auto-sync-on-launch checkbox, wired
   into `hooks/useAutoUpdateOnLaunch.js`/`App.jsx` exactly like
   Steam/GOG/Epic's own launch syncs. Only the session's `refresh_token`
   is ever stored (encrypted, same as GOG/Epic's OAuth tokens) — never
   the password. **Verified through the real running app**: signed in,
   ran a real Sync Now (789 changes sent — correctly explained by
   `item_locations`/`list_items` always re-pushing in full plus a Steam
   resync that had just touched many items), the auto-sync checkbox
   saved, and — the real test of the encrypted-session design — closing
   and reopening the app stayed connected with no re-login needed.
6. ~~Drop `items_skeleton` and the walking-skeleton script~~ — **Done.**
   `scripts/push-skeleton.js` removed; `supabase/drop_items_skeleton.sql`
   retires the table.

**Step 2 is complete** — all 6 build steps done and verified, most of
them against the real 1922-item library and a real second device.

Steps 1–4 are worth doing entirely with the desktop app talking to itself
(two local SQLite files, one cloud project) before mobile touches any of
this — mobile's read-only shell (step 3) becomes "point it at the same
pull logic," not a second design.

## Open questions

1. **Does `items.local_id` (the convenience column in the Postgres schema
   above) actually earn its place**, or is it dead weight now that
   `sync_id` is the real key? It has no purpose once every consumer uses
   `sync_id` — recommend dropping it and deciding this only if a debugging
   need for it shows up later.
2. **Hard-deleting old soft-deleted rows** — a periodic sweep (e.g. cloud
   rows with `deleted_at` older than 90 days get actually deleted) keeps
   the table from growing forever, but isn't needed for a first working
   version at ~2,000 items. Fine to defer entirely; noted so it doesn't get
   forgotten once the library is much larger.
3. ~~Scope for the first working sync~~ — **Decided:** items, lists, and
   custom media types all sync together from the first working version —
   see the Schema section above, which now includes `custom_types`/
   `custom_type_fields` and the resulting pull-ordering rule.
