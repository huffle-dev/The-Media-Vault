-- Retires the walking skeleton's throwaway table (V3 step 2, build step 6)
-- now that real push/pull (scripts/sync-push.js, scripts/sync-pull.js, and
-- the Settings → Account Access / Resync UI) have fully superseded it.
drop table if exists items_skeleton;
