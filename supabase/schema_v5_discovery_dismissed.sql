-- Follow-up to schema_v2_cloud_sync.sql - run once, after the earlier files.
--
-- Discover's "Not interested" list, synced so a title dismissed on the
-- desktop or the phone stays dismissed on both. Keyed by (user_id,
-- media_type, tmdb_id) instead of a sync_id: two devices dismissing the same
-- title independently must land on ONE row, not a conflicting pair.
-- tmdb_id is really "external source id" (a TMDB id for Movie/TV, an Open
-- Library work key for Book). deleted_at is a soft delete - "Undo" on either
-- device sets it, which is how the other device learns to un-dismiss too.
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

create policy "discovery_dismissed_select_own" on discovery_dismissed
  for select using (user_id = (select auth.uid()));
create policy "discovery_dismissed_insert_own" on discovery_dismissed
  for insert with check (user_id = (select auth.uid()));
create policy "discovery_dismissed_update_own" on discovery_dismissed
  for update using (user_id = (select auth.uid()));
create policy "discovery_dismissed_delete_own" on discovery_dismissed
  for delete using (user_id = (select auth.uid()));
