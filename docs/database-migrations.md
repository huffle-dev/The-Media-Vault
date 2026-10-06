# How database migrations work in The Media Vault

Notes from a real bug (fresh installs were missing 4 Board Game columns —
see `database.js`) that turned into a useful lesson about why migrations
exist at all, and how they relate to git.

## Current status (2026-10-06): baseline at schema v52, no upgrade steps yet

The upgrade chain (v26 to v52) was **collapsed into `_createSchema()` on 2026-10-06**, right after v1.0.0 was
published and before anyone but the developer had a database. Schema **v52 is the baseline**:

- `_createSchema()` is the only source of truth for what a fresh install gets (it sets `user_version` straight to
  `LATEST_SCHEMA_VERSION`, 52).
- `_migrate()` now holds only guards: a database **newer** than the code is refused ("update The Media Vault"), and one
  **older than `BASELINE_SCHEMA_VERSION`** (52) is refused too, because its upgrade steps no longer exist. There are no
  `if (version < N)` steps at the moment.
- The first schema change from here on is a **new permanent step** (`if (version < 53) { ...; PRAGMA user_version = 53 }`
  with `LATEST_SCHEMA_VERSION` raised to 53), written once and never edited or deleted. `BASELINE_SCHEMA_VERSION` stays 52.
- `'MTG'` was dropped from the `media_type` CHECK lists in `_createSchema()` (Magic was removed from the app; v51 had
  already deleted leftover rows). A database created before the collapse still carries `'MTG'` in its CHECK; harmless.

### Safety nets

- **`test/schemaParity.test.js`**: builds a fresh install and a database loaded from `test/fixtures/schema_v52.sql`
  (the baseline, written by `scripts/make-schema-baseline.js`; **never regenerate it** or the test stops checking
  anything), runs the app's upgrade steps on it, and compares tables, columns, types, defaults, indexes, foreign keys and
  `CHECK` lists. Today it is trivially satisfied; the moment a v53 step exists it catches a column added to only one of
  the two paths. **Any new migration must keep it green.** Two known, intended differences are normalised: a migrated
  `updated_at` is plain nullable (SQLite can't `ADD COLUMN` with a non-constant default), and unique constraints are
  compared by column, not name.
- **Automatic backup**: before a database that's behind `LATEST_SCHEMA_VERSION` is touched (or refused), `initialise()`
  writes `vault.db.pre-v<N>.bak` next to it (`VACUUM INTO`, a consistent snapshot) and keeps the three newest. To undo a
  migration, close the app and put that file back as `vault.db`. A failed backup is logged, never blocks start-up.
  (`test/migrationSafety.test.js`)
- **`supabase/schema_current.sql`**: the cloud schema in one re-runnable file. `test/supabaseSchema.test.js` fails if Cloud
  Sync pushes an item column the file doesn't create. The cloud has no migration framework: a new column means adding it
  to this file *and* running it once in the SQL editor.

### Deliberately not done

- **Dropping unused columns.** `media_items` has ~119 columns and about 25 hold no data. Removing them is a large, risky
  diff for no behavioural gain (each is threaded through `database.js`, `lib/cloudSync.js`, `csv.js`, the editors and the
  phone's selects); a nullable empty column costs nothing. Candidates, if ever: `hardcover_*`, `anilist_score`,
  `chapter_count`, `total_volumes`.

## Git tracks code. Migrations track data.

Git version-controls `database.js` — the *source file*. It has no idea
`vault.db` exists. That file lives outside the repo entirely, on disk at
`%APPDATA%/the-vault/vault.db`, full of a real person's real library, and it
carries its own version marker (`PRAGMA user_version`) baked into the file
itself.

So even though git remembers every past version of `database.js`, that
doesn't help the *app* know how to upgrade someone's *already-existing*
database — because that database isn't in git, and never will be.

## Why you can't delete old migrations

Different installs can be stuck at different versions. Someone who hasn't
opened the app in eight months might still be sitting at schema v14. When
they update, `_migrate()` has to walk that database forward through v15,
v16, v17 ... all the way to whatever the current version is — one step at a
time, in order — because each migration assumes the exact shape the
previous one left behind.

Delete the v15→v16 migration because "git remembers what it did," and that
user's database has no path forward: the current code tries to run a much
later migration directly against a v14-shaped table and fails (or worse,
corrupts data).

**Old migrations aren't there for developer reference.** Git already covers
that. They're there because they're the only thing that knows how to bring
someone else's already-existing database up to date from wherever it's
stuck.

## Old migrations are frozen snapshots — don't unify them

(Applies from the baseline, schema v52, on.) A full-table-recreate
migration has its own complete, hand-typed `CREATE TABLE`. That looks like
duplication, and in a sense it is — but it's duplication that has to stay:

- A recreate migration's `CREATE TABLE` is a historical snapshot: "this is
  what the table looked like at that version." If it pulled its columns
  from a shared, currently-live source, updating that source later would
  silently rewrite what it *used to* produce — breaking the whole point of
  a migration chain (replaying old migrations must always produce the same
  result, forever).
- This is the same principle Rails/Django/Prisma migrations follow: once
  shipped, a migration file is immutable. You don't edit history, you add a
  new migration on top of it.

## The part that *should* be shared

Two things — and only two — both represent "the schema as of right now,"
so they should be structurally incapable of drifting apart:

1. `_createSchema()` (what a genuinely fresh install gets)
2. Whichever migration is currently the *latest* full-recreate

This is exactly where the real bug happened: 4 Board Game columns
(`player_count`, `play_time`, `complexity`, `bgg_url`) got added to the
migration chain but never made it into `_createSchema()`, so a brand-new
install would silently get a table those columns can't save to. **This
specific instance is fixed** (the columns are in `_createSchema()` now) —
patched directly rather than via the shared-template refactor below, since
the historical chain got collapsed in the same pass and there's currently
no "latest full-recreate" migration left to share a template with anyway.

The refactor below is still the right move once migrations resume
post-ship and a new full-recreate migration exists again — worth doing
*then*, not as a standing TODO against an empty chain:

**Fix**: pull the column list into one shared SQL template constant, and
have both `_createSchema()` and the latest migration reference the same
string:

```js
const MEDIA_ITEMS_COLUMNS_SQL = `
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT NOT NULL,
  ...
`;
```

Both places do `CREATE TABLE media_items (${MEDIA_ITEMS_COLUMNS_SQL})`.
Only one copy to edit going forward. Old migrations keep their own frozen
inline copies, untouched.

Not a column-array-with-generated-SQL system — that's a mini SQL generator
for not much benefit, and still has to handle `CHECK` constraints,
`DEFAULT`s, and foreign keys as first-class concerns. A shared literal SQL
string sidesteps all of that for free.

## The one legitimate reason to ever delete an old migration

Some projects do eventually drop their *oldest* migrations — but as a
deliberate support-window policy ("we no longer support upgrading from
before v10; if your database predates that, reinstall or re-import"), not
because version control makes it safe. That's a product decision about how
far back you're willing to support, completely separate from "git has the
history somewhere."
