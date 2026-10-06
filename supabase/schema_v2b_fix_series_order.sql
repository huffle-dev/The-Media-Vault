-- Follow-up to schema_v2_cloud_sync.sql — run once, after that file.
--
-- series_order was wrongly typed as a strict integer. Real library data
-- has fractional series positions (e.g. a novella between book 2 and 3,
-- stored locally as 2.6) — caught live when scripts/sync-push.js's first
-- real run hit "invalid input syntax for type integer: 2.6" partway
-- through pushing items. Matches the local SQLite column, which has no
-- such restriction (SQLite's type affinity is advisory, not enforced).
alter table items alter column series_order type double precision using series_order::double precision;
