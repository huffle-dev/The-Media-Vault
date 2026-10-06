-- The Media Vault — Supabase schema, current state, in ONE re-runnable file.
--
-- For a NEW Supabase project: paste this whole file into the SQL editor and
-- run it once. Safe to run again (tables use "if not exists", policies are
-- dropped and recreated, columns use "add column if not exists").
--
-- It is the five earlier files in the order they were applied, unchanged in
-- meaning: schema_v2_cloud_sync.sql, schema_v2b_fix_series_order.sql,
-- schema_v3_encrypted_secrets.sql, schema_v4_cover_art_url.sql and
-- schema_v5_discovery_dismissed.sql. Those stay in this folder as history.
--
-- Keeping it current: any new cloud column or table goes in the matching
-- section below (and gets a line in the same commit as the code that uses
-- it). test/supabaseSchema.test.js fails if a column Cloud Sync pushes is
-- missing from the items table here. There is no migration framework on the
-- cloud side: an existing project needs the new statement run by hand once.
--
-- Local-only things that are NOT here: the tombstone tables
-- (list_item_tombstones, list_tombstones, item_tombstones) live in the local
-- SQLite database only; the cloud learns about deletions through deleted_at.

-- ═══════════════════ 1. core sync tables (was schema_v2) ═══════════════════
create extension if not exists pgcrypto;

-- ── devices ──────────────────────────────────────────────────────────────
-- One row per device that has ever synced. Not referenced by item_locations
-- with a foreign key that would block deleting a device mid-history —
-- device_id on item_locations is just a plain uuid column instead (a device
-- can be wiped/removed independently of the rows it once wrote).
create table if not exists devices (
  device_id       uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  platform        text not null check (platform in ('desktop', 'android')),
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now()
);

alter table devices enable row level security;

drop policy if exists "devices_select_own" on devices;
create policy "devices_select_own" on devices
  for select using (user_id = (select auth.uid()));
drop policy if exists "devices_insert_own" on devices;
create policy "devices_insert_own" on devices
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "devices_update_own" on devices;
create policy "devices_update_own" on devices
  for update using (user_id = (select auth.uid()));
drop policy if exists "devices_delete_own" on devices;
create policy "devices_delete_own" on devices
  for delete using (user_id = (select auth.uid()));

-- ── custom_types / custom_type_fields ───────────────────────────────────
-- Pulled before items (see docs/cloud-sync-design.md's pull-ordering rule)
-- since items.custom_type_sync_id can reference one.
create table if not exists custom_types (
  sync_id     uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null,
  icon        text not null,
  color       text not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

alter table custom_types enable row level security;

drop policy if exists "custom_types_select_own" on custom_types;
create policy "custom_types_select_own" on custom_types
  for select using (user_id = (select auth.uid()));
drop policy if exists "custom_types_insert_own" on custom_types;
create policy "custom_types_insert_own" on custom_types
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "custom_types_update_own" on custom_types;
create policy "custom_types_update_own" on custom_types
  for update using (user_id = (select auth.uid()));
drop policy if exists "custom_types_delete_own" on custom_types;
create policy "custom_types_delete_own" on custom_types
  for delete using (user_id = (select auth.uid()));

create table if not exists custom_type_fields (
  sync_id              uuid primary key default gen_random_uuid(),
  custom_type_sync_id  uuid not null references custom_types(sync_id) on delete cascade,
  key                  text not null,
  label                text not null,
  field_type           text not null check (field_type in ('text', 'number', 'url', 'checkbox', 'date')),
  sort_order           integer not null default 0,
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

alter table custom_type_fields enable row level security;

-- No user_id of its own — scoped through the parent custom_types row via
-- custom_type_sync_id, same relationship the local database already has
-- (custom_type_fields has no user column locally either, just a foreign key).
drop policy if exists "custom_type_fields_select_own" on custom_type_fields;
create policy "custom_type_fields_select_own" on custom_type_fields
  for select using (exists (
    select 1 from custom_types t
    where t.sync_id = custom_type_fields.custom_type_sync_id
      and t.user_id = (select auth.uid())
  ));
drop policy if exists "custom_type_fields_insert_own" on custom_type_fields;
create policy "custom_type_fields_insert_own" on custom_type_fields
  for insert with check (exists (
    select 1 from custom_types t
    where t.sync_id = custom_type_fields.custom_type_sync_id
      and t.user_id = (select auth.uid())
  ));
drop policy if exists "custom_type_fields_update_own" on custom_type_fields;
create policy "custom_type_fields_update_own" on custom_type_fields
  for update using (exists (
    select 1 from custom_types t
    where t.sync_id = custom_type_fields.custom_type_sync_id
      and t.user_id = (select auth.uid())
  ));
drop policy if exists "custom_type_fields_delete_own" on custom_type_fields;
create policy "custom_type_fields_delete_own" on custom_type_fields
  for delete using (exists (
    select 1 from custom_types t
    where t.sync_id = custom_type_fields.custom_type_sync_id
      and t.user_id = (select auth.uid())
  ));

-- ── lists ────────────────────────────────────────────────────────────────
create table if not exists lists (
  sync_id     uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

alter table lists enable row level security;

drop policy if exists "lists_select_own" on lists;
create policy "lists_select_own" on lists
  for select using (user_id = (select auth.uid()));
drop policy if exists "lists_insert_own" on lists;
create policy "lists_insert_own" on lists
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "lists_update_own" on lists;
create policy "lists_update_own" on lists
  for update using (user_id = (select auth.uid()));
drop policy if exists "lists_delete_own" on lists;
create policy "lists_delete_own" on lists
  for delete using (user_id = (select auth.uid()));

-- ── items ────────────────────────────────────────────────────────────────
-- Every media_items column that isn't device-specific (local_path,
-- install_path, is_local — see item_locations below) or device-local-only
-- (cover_art_path — never synced, each device downloads its own). Names
-- and shapes mirror database.js's media_items exactly except:
--   - custom_type_id (a local integer FK) becomes custom_type_sync_id (uuid)
--   - no local integer "id" column — sync_id is the only identity
--   - custom_fields stays a JSON *string* column (text, not jsonb) so the
--     sync engine can push/pull it byte-for-byte with no parse step, same
--     as every other TEXT column here — matches SQLite's own storage.
create table if not exists items (
  sync_id     uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  title            text not null,
  media_type       text not null,
  status           text not null default 'wishlist',
  rating           integer check (rating is null or rating between 1 and 21),
  date_consumed    text,
  date_added       text not null default (current_date)::text,
  notes            text,

  creator          text,
  genre            text,
  year             integer,

  network          text,
  season_count     integer,
  narrator         text,
  platform         text,
  label            text,

  runtime          integer,
  imdb_url         text,
  video_quality    text,
  series_name      text,
  series_order     double precision, -- fractional positions are real data (e.g. 2.6 for a novella between books 2 and 3) — see schema_v2b_fix_series_order.sql
  platform_id      text,
  steam_url        text,
  metadata_fetched integer not null default 0,

  player_count     text,
  play_time        integer,
  complexity       double precision,
  bgg_url          text,

  country                text,
  language               text,
  cast_list              text,
  critic_rating          text,
  content_rating         text,
  trailer_url            text,
  watch_providers        text,
  watch_checked_date     text,
  watch_checked_country  text,
  watch_flatrate         text,
  watch_rent             text,
  watch_buy              text,
  metadata_checked_date  text,
  cover_art_checked_date text,

  imdb_rating              double precision,
  imdb_votes               integer,
  rotten_tomatoes_rating   integer,
  metacritic_rating        integer,
  tmdb_rating              double precision,
  tmdb_votes               integer,
  bgg_rating               double precision,
  bgg_rating_count         integer,
  bgg_rank                 integer,
  anilist_score            integer,
  hardcover_rating         double precision,
  hardcover_ratings_count  integer,
  hardcover_url            text,
  openlibrary_rating         double precision,
  openlibrary_ratings_count  integer,
  ebook_url                text,
  discogs_rating           double precision,
  discogs_ratings_count    integer,
  discogs_url              text,
  podcast_url               text,
  igdb_url                  text,
  igdb_rating                double precision,
  igdb_rating_count          integer,

  hltb_main            double precision,
  hltb_main_extra      double precision,
  hltb_completionist   double precision,
  hltb_checked_date    text,

  writer              text,
  composer            text,
  studio              text,
  budget              text,
  box_office          text,
  publisher           text,
  themes              text,
  game_modes          text,
  player_perspective  text,
  game_engine         text,
  owned_platform      text,
  tags                text,
  edition_format      text,
  abridged            integer,
  style               text,
  album_type          text,
  copyright           text,
  tracklist           text,
  artist              text,
  mechanics           text,
  min_age             integer,
  condition           text,
  personal_notes      text,

  set_name            text,
  collector_number    text,
  rarity              text,
  type_line           text,
  power_toughness     text,
  format_legality     text,
  mana_cost           text,
  chapter_count       integer,
  total_volumes       integer,
  subscribers         text,
  video_count         integer,
  system              text,
  recommended_level   text,
  site_name           text,
  url                 text,
  episode_count       integer,

  custom_type_sync_id  uuid references custom_types(sync_id),
  custom_fields        text,

  is_hidden       integer not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

alter table items enable row level security;

drop policy if exists "items_select_own" on items;
create policy "items_select_own" on items
  for select using (user_id = (select auth.uid()));
drop policy if exists "items_insert_own" on items;
create policy "items_insert_own" on items
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "items_update_own" on items;
create policy "items_update_own" on items
  for update using (user_id = (select auth.uid()));
drop policy if exists "items_delete_own" on items;
create policy "items_delete_own" on items
  for delete using (user_id = (select auth.uid()));

-- ── item_locations ───────────────────────────────────────────────────────
-- The device-specific split: local_path, install_path and is_local live
-- here instead of on items, one row per (item, device) pair.
create table if not exists item_locations (
  item_sync_id  uuid not null references items(sync_id) on delete cascade,
  device_id     uuid not null references devices(device_id) on delete cascade,
  local_path    text,
  install_path  text,
  is_local      boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (item_sync_id, device_id)
);

alter table item_locations enable row level security;

-- Scoped through the parent item's user_id, same pattern as
-- custom_type_fields above.
drop policy if exists "item_locations_select_own" on item_locations;
create policy "item_locations_select_own" on item_locations
  for select using (exists (
    select 1 from items i
    where i.sync_id = item_locations.item_sync_id
      and i.user_id = (select auth.uid())
  ));
drop policy if exists "item_locations_insert_own" on item_locations;
create policy "item_locations_insert_own" on item_locations
  for insert with check (exists (
    select 1 from items i
    where i.sync_id = item_locations.item_sync_id
      and i.user_id = (select auth.uid())
  ));
drop policy if exists "item_locations_update_own" on item_locations;
create policy "item_locations_update_own" on item_locations
  for update using (exists (
    select 1 from items i
    where i.sync_id = item_locations.item_sync_id
      and i.user_id = (select auth.uid())
  ));
drop policy if exists "item_locations_delete_own" on item_locations;
create policy "item_locations_delete_own" on item_locations
  for delete using (exists (
    select 1 from items i
    where i.sync_id = item_locations.item_sync_id
      and i.user_id = (select auth.uid())
  ));

-- ── list_items ───────────────────────────────────────────────────────────
create table if not exists list_items (
  list_sync_id  uuid not null references lists(sync_id) on delete cascade,
  item_sync_id  uuid not null references items(sync_id) on delete cascade,
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  primary key (list_sync_id, item_sync_id)
);

alter table list_items enable row level security;

-- Scoped through the parent list's user_id (mirrors how the local database
-- scopes list_items through lists/media_items already).
drop policy if exists "list_items_select_own" on list_items;
create policy "list_items_select_own" on list_items
  for select using (exists (
    select 1 from lists l
    where l.sync_id = list_items.list_sync_id
      and l.user_id = (select auth.uid())
  ));
drop policy if exists "list_items_insert_own" on list_items;
create policy "list_items_insert_own" on list_items
  for insert with check (exists (
    select 1 from lists l
    where l.sync_id = list_items.list_sync_id
      and l.user_id = (select auth.uid())
  ));
drop policy if exists "list_items_update_own" on list_items;
create policy "list_items_update_own" on list_items
  for update using (exists (
    select 1 from lists l
    where l.sync_id = list_items.list_sync_id
      and l.user_id = (select auth.uid())
  ));
drop policy if exists "list_items_delete_own" on list_items;
create policy "list_items_delete_own" on list_items
  for delete using (exists (
    select 1 from lists l
    where l.sync_id = list_items.list_sync_id
      and l.user_id = (select auth.uid())
  ));

-- ── indexes for the pull half of sync (step 4) ──────────────────────────
-- Every pull scans "updated_at newer than my last checkpoint" per user.
create index if not exists idx_items_user_updated on items(user_id, updated_at);
create index if not exists idx_lists_user_updated on lists(user_id, updated_at);
create index if not exists idx_custom_types_user_updated on custom_types(user_id, updated_at);

-- ═══════════════ 2. series_order is fractional (was schema_v2b) ═══════════════
alter table items alter column series_order type double precision using series_order::double precision;

-- ═══════════════ 3. encrypted key sync (was schema_v3) ═══════════════
create table if not exists secret_vault (
  user_id                       uuid primary key references auth.users(id) on delete cascade,
  salt                          text not null, -- base64, PBKDF2 salt (not secret)
  wrapped_master_key_passphrase text not null, -- base64: iv(12) + ciphertext + tag(16)
  wrapped_master_key_recovery   text not null, -- base64: iv(12) + ciphertext + tag(16)
  updated_at                    timestamptz not null default now()
);

alter table secret_vault enable row level security;

drop policy if exists "secret_vault_select_own" on secret_vault;
create policy "secret_vault_select_own" on secret_vault
  for select using (user_id = (select auth.uid()));
drop policy if exists "secret_vault_insert_own" on secret_vault;
create policy "secret_vault_insert_own" on secret_vault
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "secret_vault_update_own" on secret_vault;
create policy "secret_vault_update_own" on secret_vault
  for update using (user_id = (select auth.uid()));
drop policy if exists "secret_vault_delete_own" on secret_vault;
create policy "secret_vault_delete_own" on secret_vault
  for delete using (user_id = (select auth.uid()));

-- ── encrypted_secrets ────────────────────────────────────────────────────
-- One row per (account, key name) — e.g. tmdb_api_key.
-- ciphertext is encrypted with the master key from secret_vault, never the
-- passphrase or recovery key directly.
create table if not exists encrypted_secrets (
  user_id     uuid not null references auth.users(id) on delete cascade,
  key_name    text not null,
  ciphertext  text not null, -- base64: iv(12) + ciphertext + tag(16)
  updated_at  timestamptz not null default now(),
  primary key (user_id, key_name)
);

alter table encrypted_secrets enable row level security;

drop policy if exists "encrypted_secrets_select_own" on encrypted_secrets;
create policy "encrypted_secrets_select_own" on encrypted_secrets
  for select using (user_id = (select auth.uid()));
drop policy if exists "encrypted_secrets_insert_own" on encrypted_secrets;
create policy "encrypted_secrets_insert_own" on encrypted_secrets
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "encrypted_secrets_update_own" on encrypted_secrets;
create policy "encrypted_secrets_update_own" on encrypted_secrets
  for update using (user_id = (select auth.uid()));
drop policy if exists "encrypted_secrets_delete_own" on encrypted_secrets;
create policy "encrypted_secrets_delete_own" on encrypted_secrets
  for delete using (user_id = (select auth.uid()));

-- ═══════════════ 4. cover art source link (was schema_v4) ═══════════════
alter table items add column if not exists cover_art_url text;

-- ═══════════════ 5. discovery dismissals (was schema_v5) ═══════════════
create table if not exists discovery_dismissed (
  user_id     uuid not null references auth.users(id) on delete cascade,
  media_type  text not null,
  tmdb_id     text not null,
  title       text,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (user_id, media_type, tmdb_id)
);

alter table discovery_dismissed enable row level security;

drop policy if exists "discovery_dismissed_select_own" on discovery_dismissed;
create policy "discovery_dismissed_select_own" on discovery_dismissed
  for select using (user_id = (select auth.uid()));
drop policy if exists "discovery_dismissed_insert_own" on discovery_dismissed;
create policy "discovery_dismissed_insert_own" on discovery_dismissed
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "discovery_dismissed_update_own" on discovery_dismissed;
create policy "discovery_dismissed_update_own" on discovery_dismissed
  for update using (user_id = (select auth.uid()));
drop policy if exists "discovery_dismissed_delete_own" on discovery_dismissed;
create policy "discovery_dismissed_delete_own" on discovery_dismissed
  for delete using (user_id = (select auth.uid()));

-- ═══════════════ 6. cover thumbnails (Storage bucket) ═══════════════
-- Small (about 300 px) cover pictures for items that have no public source
-- link — hand-uploaded or cropped art, or art whose original source is gone —
-- so the phone and other computers can still show them. Everything else syncs
-- as just a link (items.cover_art_url) and costs no storage.
--
-- The bucket is public-read: anyone holding a picture's address can view it,
-- but the address is <your user id>/<item id>.jpg — two random UUIDs, not
-- something that can be guessed or listed. Only you can write, and only into
-- your own folder.
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

-- Uploading with "replace if it exists" (upsert) needs permission to SEE the existing
-- object as well as to write it, so each user may list/read their own folder too.
-- (The public address works for anyone regardless: that is the bucket being public.)
drop policy if exists "covers_select_own" on storage.objects;
create policy "covers_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "covers_insert_own" on storage.objects;
create policy "covers_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "covers_update_own" on storage.objects;
create policy "covers_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "covers_delete_own" on storage.objects;
create policy "covers_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ═══════════════ 7. app settings (Appearance sent to the phone) ═══════════════
-- One row per setting. Today only key = 'appearance': the desktop writes its
-- accent, status colours and per-type colours/icons here after each sync so the
-- phone can use them. Optional: if this table is missing, sync still works and
-- the phone just keeps the default colours.
create table if not exists app_settings (
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

alter table app_settings enable row level security;

drop policy if exists "app_settings_select_own" on app_settings;
create policy "app_settings_select_own" on app_settings
  for select using (user_id = (select auth.uid()));
drop policy if exists "app_settings_insert_own" on app_settings;
create policy "app_settings_insert_own" on app_settings
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "app_settings_update_own" on app_settings;
create policy "app_settings_update_own" on app_settings
  for update using (user_id = (select auth.uid()));
drop policy if exists "app_settings_delete_own" on app_settings;
create policy "app_settings_delete_own" on app_settings
  for delete using (user_id = (select auth.uid()));
