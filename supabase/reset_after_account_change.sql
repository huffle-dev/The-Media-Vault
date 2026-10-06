-- One-off cleanup: the account used to run scripts/sync-push.js's first
-- real test was later rotated, orphaning everything it pushed under the
-- old user_id (invisible under RLS to the current account). Since these
-- tables are purely a mirror of the local library, clearing them and
-- re-pushing from the desktop is simpler and safer than trying to
-- reassign ownership of rows that are, from the current account's own
-- point of view, already invisible.
--
-- Deleted in child-before-parent order so foreign keys never block a delete.
delete from list_items;
delete from item_locations;
delete from items;
delete from lists;
delete from custom_type_fields;
delete from custom_types;
delete from devices;
