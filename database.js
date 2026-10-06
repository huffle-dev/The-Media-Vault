const Database = require("better-sqlite3");
const crypto = require("crypto");

// Bump alongside each new migration's `PRAGMA user_version = N` — kept in
// sync with initialise()'s fresh-install fast path below.
const LATEST_SCHEMA_VERSION = 52;

class VaultDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  // Used by backup:restore — closes the (WAL-locked) file so it can be moved.
  close() {
    if (this.db) { this.db.close(); this.db = null; }
  }

  initialise() {
    this.db = new Database(this.dbPath);

    // Enable WAL mode for better performance
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    // A genuinely fresh install gets the current schema directly, skipping
    // the historical migration chain — replaying it assumes each step's
    // narrower table shape, which breaks on a fresh install (confirmed by
    // test/database.test.js). An existing database still migrates normally.
    const isFreshInstall = !this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'media_items'`
    ).get();

    if (!isFreshInstall) this._backupBeforeMigration();
    this._createSchema();

    if (isFreshInstall) {
      this.db.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION};`);
    } else {
      this._migrate();
    }
    this._seedDefaults();
  }

  // Before a database that's behind LATEST_SCHEMA_VERSION is changed in any
  // way, keep a copy of it next to the live file: `vault.db.pre-v<N>.bak`
  // (N = the version it was at). A migration that goes wrong, or one that
  // removes data on purpose, can then be undone by putting that file back.
  // VACUUM INTO writes a consistent snapshot synchronously, WAL included. The
  // three newest are kept. Never blocks start-up: a failed backup is logged,
  // not thrown (a library that can't launch is worse than one without a copy).
  _backupBeforeMigration() {
    try {
      if (this.dbPath === ":memory:") return;
      const version = this.db.pragma("user_version", { simple: true });
      if (version >= LATEST_SCHEMA_VERSION) return;
      const fs = require("fs");
      const path = require("path");
      const target = `${this.dbPath}.pre-v${version}.bak`;
      fs.rmSync(target, { force: true });
      this.db.prepare(`VACUUM INTO ?`).run(target);
      const dir = path.dirname(this.dbPath);
      const prefix = `${path.basename(this.dbPath)}.pre-v`;
      const backups = fs.readdirSync(dir)
        .filter((f) => f.startsWith(prefix) && f.endsWith(".bak"))
        .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      for (const old of backups.slice(3)) fs.rmSync(path.join(dir, old.f), { force: true });
    } catch (err) {
      console.error("[database] pre-migration backup failed:", err.message);
    }
  }

  // Items that have a cover picture on disk but no recorded source link (nothing
  // another device could download from): hand-uploaded or cropped art, or art whose
  // original source could not be found again. Their thumbnails are uploaded to the
  // user's own server so the phone can show them.
  itemsWithoutArtSource() {
    return this.db.prepare(`
      SELECT id, sync_id, cover_art_path
      FROM media_items
      WHERE deleted_at IS NULL AND sync_id IS NOT NULL
        AND cover_art_path IS NOT NULL AND cover_art_path != ''
        AND cover_art_path NOT IN (SELECT path FROM cover_art_sources)
    `).all();
  }

  // A number that changes whenever anything is written through this
  // connection. Auto-sync compares it before and after to tell "something was
  // edited" from "nothing happened" without scanning any table.
  changeMarker() {
    return this.db.prepare(`SELECT total_changes() AS n`).get().n;
  }

  _hasColumn(table, column) {
    return this.db.prepare(`PRAGMA table_info("${table}")`).all().some((c) => c.name === column);
  }

  // Favourites always exists — idempotent (INSERT OR IGNORE) on every launch.
  _seedDefaults() {
    this.db.prepare(`INSERT OR IGNORE INTO lists (name, is_default, sync_id, updated_at) VALUES ('Favourites', 1, ?, datetime('now'))`).run(crypto.randomUUID());
  }

  // Online backup via .backup() — safe while running, unlike a raw file
  // copy which can miss WAL-mode data. Used by the Full Backup feature.
  backup(destPath) {
    return this.db.backup(destPath);
  }

  _createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS media_items (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        title           TEXT NOT NULL,
        media_type      TEXT NOT NULL
                        CHECK (media_type IN ('Movie','TV','Book','Audiobook','Game','Music','Board Game','MTG','Graphic Novel','Web Video','Tabletop Game','Website','Podcast','Custom')),
        status          TEXT NOT NULL
                        CHECK (status IN ('wishlist','not-started','in-progress','consumed','dropped'))
                        DEFAULT 'wishlist',
        is_local        INTEGER NOT NULL DEFAULT 0
                        CHECK (is_local IN (0,1)),
        rating          INTEGER
                        CHECK (rating IS NULL OR rating BETWEEN 1 AND 21),
        date_consumed   TEXT,
        date_added      TEXT NOT NULL DEFAULT (date('now')),
        notes           TEXT,
        cover_art_path  TEXT,

        -- Shared optional metadata
        creator         TEXT,
        genre           TEXT,
        year            INTEGER,

        -- Type-specific optional metadata
        network         TEXT,
        season_count    INTEGER,
        narrator        TEXT,
        platform        TEXT,
        label           TEXT,

        -- V2 fields (added via migration if upgrading, included here for fresh installs)
        runtime         INTEGER,
        imdb_url        TEXT,
        video_quality   TEXT,
        series_name     TEXT,
        series_order    INTEGER,
        local_path      TEXT,
        platform_id     TEXT,
        steam_url       TEXT,
        metadata_fetched INTEGER NOT NULL DEFAULT 0,

        -- Board Game fields (added via migration if upgrading) — see
        -- BACKLOG.md "Fresh-Install Schema Missing 4 Columns".
        player_count    TEXT,
        play_time       INTEGER,
        complexity      REAL,
        bgg_url         TEXT,

        -- Search-enrichment fields (Movie/TV, added via migration if upgrading)
        country         TEXT,
        language        TEXT,
        cast_list       TEXT,
        critic_rating   TEXT,
        content_rating  TEXT,
        trailer_url     TEXT,
        watch_providers        TEXT,
        watch_checked_date     TEXT,
        watch_checked_country  TEXT,
        watch_flatrate  TEXT,
        watch_rent      TEXT,
        watch_buy       TEXT,
        metadata_checked_date TEXT,
        cover_art_checked_date TEXT,

        -- Per-source rating breakdown (Item Profile hero row) — critic_rating
        -- above stays as the existing combined display string (unchanged,
        -- used elsewhere already); these are additive, populated alongside
        -- it by whichever source actually has them. Movie/TV via OMDB:
        imdb_rating             REAL,
        imdb_votes               INTEGER,
        rotten_tomatoes_rating   INTEGER,
        metacritic_rating        INTEGER,
        -- Movie/TV via TMDB (no OMDB key, or a TMDB-sourced platform id):
        tmdb_rating              REAL,
        tmdb_votes               INTEGER,
        -- Board Game, from BGG's stats endpoint:
        bgg_rating               REAL,
        bgg_rating_count         INTEGER,
        bgg_rank                 INTEGER,
        anilist_score            INTEGER, -- unused — was Graphic Novel-only (AniList-sourced), that type was removed
        -- unused — was Hardcover.app's rating (needed an API token), replaced
        -- 2026-08-20 by openlibrary_rating; kept per schema convention.
        hardcover_rating         REAL,
        hardcover_ratings_count  INTEGER,
        hardcover_url            TEXT,
        -- Book/Audiobook, keyless, looked up by platform_id directly.
        openlibrary_rating         REAL,
        openlibrary_ratings_count  INTEGER,
        -- Book/Audiobook, from Open Library's Internet Archive scan data:
        ebook_url                TEXT,
        -- Music, from Discogs' own community rating (release.community.rating):
        discogs_rating           REAL,
        discogs_ratings_count    INTEGER,
        discogs_url              TEXT,
        -- Podcast, from Apple's Lookup API (Apple exposes no public rating
        -- for podcasts at all, unlike Discogs/Hardcover — no rating column):
        podcast_url               TEXT,
        -- Game, from IGDB — a general games database (not Steam-locked),
        -- optional, requires the user's own Twitch app Client ID/Secret:
        igdb_url                  TEXT,
        -- IGDB's blended user+critic score (0-100). Separate from
        -- metacritic_rating — a Game can carry both at once.
        igdb_rating                REAL,
        igdb_rating_count          INTEGER,

        -- HowLongToBeat estimates (Game, hours) — separate from runtime
        -- (actual played hours). hltb_checked_date gates re-fetching.
        hltb_main            REAL,
        hltb_main_extra      REAL,
        hltb_completionist   REAL,
        hltb_checked_date    TEXT,

        -- Item Profile fields (added via migration if upgrading) — mostly
        -- shared across whichever types actually use them (e.g. publisher
        -- spans Game/Book/Audiobook/Board Game) rather than one column per type.
        writer              TEXT, -- Movie/TV
        composer            TEXT, -- Movie/TV
        studio              TEXT, -- Movie/TV
        budget              TEXT, -- Movie — display string (e.g. OMDB's BoxOffice-style format), not a raw number
        box_office          TEXT, -- Movie
        publisher           TEXT, -- Game/Book/Audiobook/Board Game
        themes              TEXT, -- Game
        game_modes          TEXT, -- Game
        player_perspective  TEXT, -- Game
        game_engine         TEXT, -- Game
        owned_platform      TEXT, -- Game — manual tag (PlayStation/Xbox/Nintendo/Other) for a store this app can't sync; Steam/GOG/Epic are derived from platform_id instead (see tokens.js's effectivePlatform)
        tags                TEXT, -- any type — comma-separated, same pattern as genre
        edition_format      TEXT, -- Audiobook
        abridged            INTEGER, -- Audiobook — 0/1, NULL = unknown
        style               TEXT, -- Music
        album_type          TEXT, -- Music
        copyright           TEXT, -- Music
        tracklist           TEXT, -- Music — JSON array of {position, title, duration}, same storage pattern as cast_list
        artist              TEXT, -- Board Game — distinct from creator (Designer)
        mechanics           TEXT, -- Board Game
        min_age             INTEGER, -- Board Game
        condition           TEXT, -- MTG/Board Game/Music — physical condition (Mint/Near Mint/etc.), always manual (no source reports this)
        personal_notes      TEXT, -- distinct from notes (fetched synopsis/plot) — the Item Profile's own personal-notes panel

        -- New media types (MTG, Web Video, Website) — added
        -- via migration if upgrading.
        set_name            TEXT, -- MTG
        collector_number    TEXT, -- MTG
        rarity               TEXT, -- MTG
        type_line            TEXT, -- MTG
        power_toughness      TEXT, -- MTG
        format_legality      TEXT, -- MTG
        mana_cost            TEXT, -- MTG
        chapter_count        INTEGER, -- unused — was Graphic Novel-only, that type was removed (Open Library's Book type covers the same ground with better search)
        total_volumes        INTEGER, -- unused — see chapter_count
        subscribers          TEXT, -- Web Video — display string (e.g. "560K"), not a raw number
        video_count          INTEGER, -- Web Video
        system               TEXT, -- unused — was Tabletop Game-only, that type was removed 2026-08-15 (merged into Board Game, which has no equivalent field)
        recommended_level    TEXT, -- unused — see system; Board Game uses min_age instead
        site_name            TEXT, -- Website
        url                  TEXT, -- Website — the site's own URL, distinct from imdb_url/steam_url/bgg_url
        episode_count        INTEGER, -- Podcast (Host/Network/Category/Language/Avg Episode Length/Started
                                       -- all reuse creator/network/genre/language/runtime/year — no new columns needed for those)

        -- Custom media types — media_type is literally 'Custom'; custom_type_id
        -- disambiguates which one, custom_fields (JSON) holds its own fields.
        -- Never needs another migration for a new user-defined type.
        custom_type_id       INTEGER REFERENCES custom_types(id),
        custom_fields        TEXT, -- JSON object, e.g. {"pressing":"180g","vinyl_color":"Red"}

        -- Mirrors Steam's "Hidden" flag. NOT in updateItem()'s whitelist
        -- (no form field) — always written via updateFields() instead.
        is_hidden       INTEGER NOT NULL DEFAULT 0
                        CHECK (is_hidden IN (0,1)),

        -- 1 when ANOTHER of the user's devices (the phone) has this marked owned. Local
        -- only, never synced: it is rebuilt from the cloud's item_locations after each
        -- sync (see setOwnedElsewhere). is_local stays "owned on this computer".
        owned_elsewhere INTEGER NOT NULL DEFAULT 0
                        CHECK (owned_elsewhere IN (0,1)),

        -- GOG-installed executable path (services/gog.js's resolveGogInstall).
        -- Separate from local_path (the Folder button). Cleared if a rescan
        -- no longer finds the game installed.
        install_path    TEXT,

        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),

        -- Cloud Sync (V3, not yet built — see docs/cloud-sync-design.md).
        -- sync_id is this row's stable cross-device identity, assigned once
        -- at creation and never changed (the local integer id above collides
        -- across devices, both auto-increment from 1). deleted_at is unused
        -- until the sync engine exists to consume it — deleteItem() still
        -- does a real delete for now, deliberately (see deleteItem's own
        -- comment) — the column exists now so every row already has one by
        -- the time that changes, rather than needing a second migration.
        sync_id         TEXT UNIQUE,
        deleted_at      TEXT
      );

      CREATE TABLE IF NOT EXISTS local_folders (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_path     TEXT NOT NULL UNIQUE,
        media_type      TEXT NOT NULL
                        CHECK (media_type IN ('Movie','TV','Book','Audiobook','Game','Music','Board Game','MTG','Graphic Novel','Web Video','Tabletop Game','Website','Podcast')),
        last_scanned_at TEXT,
        item_count      INTEGER DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS settings (
        key             TEXT PRIMARY KEY,
        value           TEXT NOT NULL
      );

      -- Where each downloaded cover-art file came from (local file path ->
      -- remote image URL). Recorded centrally at download time
      -- (lib/downloadImage.js's listener + the core services' ensureImage)
      -- rather than threaded through every item write path; Cloud Sync's
      -- push joins it on cover_art_path to send items.cover_art_url, so
      -- other devices can download their own copy straight from the link.
      CREATE TABLE IF NOT EXISTS cover_art_sources (
        path            TEXT PRIMARY KEY,
        url             TEXT NOT NULL
      );

      -- User-created cross-media lists (e.g. "Favourites") — a many-to-many
      -- relationship via list_items, unlike genre/cast/etc. which are single
      -- comma-separated fields on the item itself. is_default marks Favourites,
      -- which ships pre-seeded and can't be deleted (see _seedDefaults / deleteList).
      CREATE TABLE IF NOT EXISTS lists (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
        is_default  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        sync_id     TEXT UNIQUE, -- Cloud Sync (V3) — see media_items.sync_id's comment
        deleted_at  TEXT
      );

      CREATE TABLE IF NOT EXISTS list_items (
        list_id     INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        item_id     INTEGER NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
        PRIMARY KEY (list_id, item_id)
      );

      -- Removals that Cloud Sync still has to tell other devices about.
      -- list_items rows are hard-deleted locally, so without these a removal
      -- never reaches the cloud (and the next push would re-add it there).
      -- Keyed by sync_id, not local ids, since that's all other devices know.
      CREATE TABLE IF NOT EXISTS list_item_tombstones (
        list_sync_id TEXT NOT NULL,
        item_sync_id TEXT NOT NULL,
        deleted_at   TEXT NOT NULL,
        PRIMARY KEY (list_sync_id, item_sync_id)
      );
      -- Same idea for a deleted list (name kept only because the cloud row
      -- it updates requires one).
      CREATE TABLE IF NOT EXISTS list_tombstones (
        sync_id    TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        deleted_at TEXT NOT NULL
      );
      -- ...and for a deleted item: media_items rows are hard-deleted, so this
      -- is what tells Cloud Sync (and through it the phone) the item is gone.
      CREATE TABLE IF NOT EXISTS item_tombstones (
        sync_id    TEXT PRIMARY KEY,
        deleted_at TEXT NOT NULL
      );

      -- Custom media types. Deletion is blocked at the app layer while any
      -- media_items row references it; custom_type_fields cascades though.
      CREATE TABLE IF NOT EXISTS custom_types (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        label       TEXT NOT NULL UNIQUE COLLATE NOCASE,
        icon        TEXT NOT NULL,
        color       TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        sync_id     TEXT UNIQUE, -- Cloud Sync (V3) — see media_items.sync_id's comment
        deleted_at  TEXT
      );

      CREATE TABLE IF NOT EXISTS custom_type_fields (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        custom_type_id  INTEGER NOT NULL REFERENCES custom_types(id) ON DELETE CASCADE,
        key             TEXT NOT NULL,
        label           TEXT NOT NULL,
        field_type      TEXT NOT NULL DEFAULT 'text'
                        CHECK (field_type IN ('text','number','url','checkbox','date')),
        sort_order      INTEGER NOT NULL DEFAULT 0,
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        sync_id         TEXT UNIQUE, -- Cloud Sync (V3) — see media_items.sync_id's comment
        deleted_at      TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_custom_type_fields_type ON custom_type_fields(custom_type_id);

      -- Discovery — titles marked "not interested" on the Discover page
      -- (not Item Profile's Similar/Series rows). title is stored alongside
      -- the id so a future "manage hidden" list needs no fresh lookup.
      -- Synced (Cloud Sync) by its natural key (media_type, tmdb_id) rather
      -- than a sync_id: two devices dismissing the same title independently
      -- must converge on ONE row, not create a conflicting pair.
      -- undismiss is a soft delete (deleted_at) so it can sync too.
      CREATE TABLE IF NOT EXISTS discovery_dismissed (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        media_type    TEXT NOT NULL,
        tmdb_id       TEXT NOT NULL,
        title         TEXT,
        dismissed_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at    TEXT,
        UNIQUE (media_type, tmdb_id)
      );

      CREATE INDEX IF NOT EXISTS idx_media_type  ON media_items(media_type);
      CREATE INDEX IF NOT EXISTS idx_status      ON media_items(status);
      CREATE INDEX IF NOT EXISTS idx_is_local    ON media_items(is_local);
      CREATE INDEX IF NOT EXISTS idx_rating      ON media_items(rating);
      CREATE INDEX IF NOT EXISTS idx_date_added  ON media_items(date_added);
      CREATE INDEX IF NOT EXISTS idx_title       ON media_items(title COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_list_items_item ON list_items(item_id);
    `);

    // custom_type_id only exists post-v18 (added via table recreate, not
    // ALTER) — fails harmlessly pre-migration; _migrate() creates it then.
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_custom_type_id ON media_items(custom_type_id);`);
    } catch {}
  }

  _migrate() {
    const version = this.db.pragma("user_version", { simple: true });

    // _migrate() only ever walks forward (`if (version < N)` below) — with
    // no guard, a `user_version` higher than this app understands (e.g.
    // Backup Restore loading a database saved by a newer version of The
    // Vault) would pass through silently and the app would run against a
    // schema it doesn't know, rather than refusing with a clear message.
    if (version > LATEST_SCHEMA_VERSION) {
      throw new Error(
        `This database was created by a newer version of The Media Vault (schema v${version}, this version supports up to v${LATEST_SCHEMA_VERSION}). Please update The Media Vault before opening it.`
      );
    }

    // Historical chain (v1-v25) collapsed 2026-08-06 — this app never
    // shipped to anyone but its own developer, so those steps only ever
    // walked this one already-current database (see
    // docs/database-migrations.md). Once shipped externally, migrations
    // resume in full with the same `if (version < N) {...}` shape.

    // v26 (2026-08-06): Music tracklist support (Discogs integration).
    if (version < 26) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN tracklist TEXT`); } catch {}
      this.db.exec(`PRAGMA user_version = 26;`);
    }

    // v27 (2026-08-08): Discovery "not interested" dismissals.
    if (version < 27) {
      try {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS discovery_dismissed (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            media_type    TEXT NOT NULL,
            tmdb_id       TEXT NOT NULL,
            title         TEXT,
            dismissed_at  TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (media_type, tmdb_id)
          );
        `);
      } catch {}
      this.db.exec(`PRAGMA user_version = 27;`);
    }

    // v28 (2026-08-11): list_items' foreign key pointed at a stale
    // "media_items_v22" table name, silently breaking Favourite/Add to List
    // once foreign_keys=ON started enforcing it. Rebuilt via copy rather
    // than drop/recreate, safe even if not actually empty.
    if (version < 28) {
      try {
        const listItemsSchema = this.db.prepare(
          `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'list_items'`
        ).get();
        if (listItemsSchema?.sql.includes("media_items_v22")) {
          this.db.exec(`
            ALTER TABLE list_items RENAME TO list_items_v22_broken;
            CREATE TABLE list_items (
              list_id     INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
              item_id     INTEGER NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
              PRIMARY KEY (list_id, item_id)
            );
            INSERT INTO list_items (list_id, item_id)
              SELECT list_id, item_id FROM list_items_v22_broken;
            DROP TABLE list_items_v22_broken;
            CREATE INDEX IF NOT EXISTS idx_list_items_item ON list_items(item_id);
          `);
        }
      } catch {}
      this.db.exec(`PRAGMA user_version = 28;`);
    }

    // v29 (2026-08-11): "Hidden" library flag, mirroring Steam's own.
    if (version < 29) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0`); } catch {}
      this.db.exec(`PRAGMA user_version = 29;`);
    }

    // v30 (2026-08-11): GOG-installed executable path, for the Launch button.
    if (version < 30) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN install_path TEXT`); } catch {}
      this.db.exec(`PRAGMA user_version = 30;`);
    }

    // v31 (2026-08-13): Hardcover.app rating for Book/Audiobook — same
    // per-source-rating shape as imdb_rating/bgg_rating above, populated by
    // main.js's Hardcover GraphQL lookup when a user API token is set.
    if (version < 31) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN hardcover_rating REAL`); } catch {}
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN hardcover_ratings_count INTEGER`); } catch {}
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN hardcover_url TEXT`); } catch {}
      this.db.exec(`PRAGMA user_version = 31;`);
    }

    // v32 (2026-08-13): Read/Borrow link for Book/Audiobook, from Open
    // Library's own Internet Archive ebook availability data.
    if (version < 32) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN ebook_url TEXT`); } catch {}
      this.db.exec(`PRAGMA user_version = 32;`);
    }

    // v33 (2026-08-15): Discogs community rating for Music — same per-source-
    // rating shape as hardcover_rating/hardcover_ratings_count above.
    if (version < 33) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN discogs_rating REAL`); } catch {}
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN discogs_ratings_count INTEGER`); } catch {}
      this.db.exec(`PRAGMA user_version = 33;`);
    }

    // v34 (2026-08-15): Discogs release link for Music's Item Profile —
    // same per-source-URL shape as hardcover_url/bgg_url/steam_url above.
    if (version < 34) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN discogs_url TEXT`); } catch {}
      this.db.exec(`PRAGMA user_version = 34;`);
    }

    // v35 (2026-08-15): Apple Podcasts link for Podcast's Item Profile —
    // same per-source-URL shape as discogs_url/hardcover_url above.
    if (version < 35) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN podcast_url TEXT`); } catch {}
      this.db.exec(`PRAGMA user_version = 35;`);
    }

    // v36 (2026-08-18): Condition field for physical collectibles (Trading
    // Card Game, Board Game, Music) — always manual, no source reports this.
    if (version < 36) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN condition TEXT`); } catch {}
      this.db.exec(`PRAGMA user_version = 36;`);
    }

    // v37 (2026-08-18): Mana Cost for Trading Card Game, from Scryfall.
    if (version < 37) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN mana_cost TEXT`); } catch {}
      this.db.exec(`PRAGMA user_version = 37;`);
    }

    // v38 (2026-08-18): IGDB game page link — same per-source-URL shape as
    // discogs_url/podcast_url above.
    if (version < 38) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN igdb_url TEXT`); } catch {}
      this.db.exec(`PRAGMA user_version = 38;`);
    }

    // v39 (2026-08-19): IGDB Rating for Games — total_rating/total_rating_count.
    if (version < 39) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN igdb_rating REAL`); } catch {}
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN igdb_rating_count INTEGER`); } catch {}
      this.db.exec(`PRAGMA user_version = 39;`);
    }

    // v40 (2026-08-20): Platform Filter — manual owned_platform tag for
    // Games on a store this app can't sync (PlayStation/Xbox/Nintendo/Other).
    if (version < 40) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN owned_platform TEXT`); } catch {}
      this.db.exec(`PRAGMA user_version = 40;`);
    }

    // v41 (2026-08-20): Book/Audiobook rating switched from Hardcover.app
    // (required a key) to Open Library's own keyless ratings.json endpoint.
    if (version < 41) {
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN openlibrary_rating REAL`); } catch {}
      try { this.db.exec(`ALTER TABLE media_items ADD COLUMN openlibrary_ratings_count INTEGER`); } catch {}
      this.db.exec(`PRAGMA user_version = 41;`);
    }

    // v42 (2026-09-17): Document Vault removed — Media is the only vault now.
    if (version < 42) {
      this.db.exec(`DROP TABLE IF EXISTS documents`);
      this.db.exec(`DELETE FROM settings WHERE key = 'vault_name'`);
      this.db.exec(`PRAGMA user_version = 42;`);
    }

    // v43 (2026-09-17): Film→Movie, Trading Card Game→MTG — internal
    // media_type value unified with the display name (previously only the
    // display text was renamed, in 2026-08-10/08-11, deliberately leaving
    // the stored value untouched to avoid touching real data). SQLite can't
    // ALTER a CHECK constraint, so media_items/local_folders both need the
    // same full-recreate this project used for v18/v28 — rename old, create
    // new with the updated CHECK list, explicit-column copy translating the
    // value, drop old, rebuild every index. discovery_dismissed has no CHECK
    // on media_type, so it's just a plain UPDATE.
    //
    // foreign_keys is OFF for the whole block: with it ON, DROP TABLE on
    // media_items_v42 while list_items.item_id still references it (SQLite
    // auto-rewrites that reference when the table is renamed away) fires
    // ON DELETE CASCADE as if every row had been deleted — silently wiping
    // list_items. Confirmed by direct testing before touching real data.
    // Almost certainly the actual root cause of the pre-v28 "list_items had
    // exactly 0 rows despite daily use" bug from an earlier rebuild. Fixed
    // here two ways: FK enforcement off during the rebuild, and list_items
    // itself explicitly rebuilt to reference the final "media_items" name
    // directly (same treatment v28 already gave it), not left dangling.
    if (version < 43) {
      this.db.exec(`PRAGMA foreign_keys = OFF;`);
      this.db.exec(`
        ALTER TABLE media_items RENAME TO media_items_v42;

        CREATE TABLE media_items (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          title           TEXT NOT NULL,
          media_type      TEXT NOT NULL
                          CHECK (media_type IN ('Movie','TV','Book','Audiobook','Game','Music','Board Game','MTG','Graphic Novel','Web Video','Tabletop Game','Website','Podcast','Custom')),
          status          TEXT NOT NULL
                          CHECK (status IN ('wishlist','not-started','in-progress','consumed','dropped'))
                          DEFAULT 'wishlist',
          is_local        INTEGER NOT NULL DEFAULT 0
                          CHECK (is_local IN (0,1)),
          rating          INTEGER
                          CHECK (rating IS NULL OR rating BETWEEN 1 AND 21),
          date_consumed   TEXT,
          date_added      TEXT NOT NULL DEFAULT (date('now')),
          notes           TEXT,
          cover_art_path  TEXT,
          creator         TEXT,
          genre           TEXT,
          year            INTEGER,
          network         TEXT,
          season_count    INTEGER,
          narrator        TEXT,
          platform        TEXT,
          label           TEXT,
          runtime         INTEGER,
          imdb_url        TEXT,
          video_quality   TEXT,
          series_name     TEXT,
          series_order    INTEGER,
          local_path      TEXT,
          platform_id     TEXT,
          steam_url       TEXT,
          metadata_fetched INTEGER NOT NULL DEFAULT 0,
          player_count    TEXT,
          play_time       INTEGER,
          complexity      REAL,
          bgg_url         TEXT,
          country         TEXT,
          language        TEXT,
          cast_list       TEXT,
          critic_rating   TEXT,
          content_rating  TEXT,
          trailer_url     TEXT,
          watch_providers        TEXT,
          watch_checked_date     TEXT,
          watch_checked_country  TEXT,
          watch_flatrate  TEXT,
          watch_rent      TEXT,
          watch_buy       TEXT,
          metadata_checked_date TEXT,
          cover_art_checked_date TEXT,
          imdb_rating             REAL,
          imdb_votes               INTEGER,
          rotten_tomatoes_rating   INTEGER,
          metacritic_rating        INTEGER,
          tmdb_rating              REAL,
          tmdb_votes               INTEGER,
          bgg_rating               REAL,
          bgg_rating_count         INTEGER,
          bgg_rank                 INTEGER,
          anilist_score            INTEGER,
          hardcover_rating         REAL,
          hardcover_ratings_count  INTEGER,
          hardcover_url            TEXT,
          openlibrary_rating         REAL,
          openlibrary_ratings_count  INTEGER,
          ebook_url                TEXT,
          discogs_rating           REAL,
          discogs_ratings_count    INTEGER,
          discogs_url              TEXT,
          podcast_url               TEXT,
          igdb_url                  TEXT,
          igdb_rating                REAL,
          igdb_rating_count          INTEGER,
          hltb_main            REAL,
          hltb_main_extra      REAL,
          hltb_completionist   REAL,
          hltb_checked_date    TEXT,
          writer              TEXT,
          composer            TEXT,
          studio              TEXT,
          budget              TEXT,
          box_office          TEXT,
          publisher           TEXT,
          themes              TEXT,
          game_modes          TEXT,
          player_perspective  TEXT,
          game_engine         TEXT,
          owned_platform      TEXT,
          tags                TEXT,
          edition_format      TEXT,
          abridged            INTEGER,
          style               TEXT,
          album_type          TEXT,
          copyright           TEXT,
          tracklist           TEXT,
          artist              TEXT,
          mechanics           TEXT,
          min_age             INTEGER,
          condition           TEXT,
          personal_notes      TEXT,
          set_name            TEXT,
          collector_number    TEXT,
          rarity               TEXT,
          type_line            TEXT,
          power_toughness      TEXT,
          format_legality      TEXT,
          mana_cost            TEXT,
          chapter_count        INTEGER,
          total_volumes        INTEGER,
          subscribers          TEXT,
          video_count          INTEGER,
          system               TEXT,
          recommended_level    TEXT,
          site_name            TEXT,
          url                  TEXT,
          episode_count        INTEGER,
          custom_type_id       INTEGER REFERENCES custom_types(id),
          custom_fields        TEXT,
          is_hidden       INTEGER NOT NULL DEFAULT 0
                          CHECK (is_hidden IN (0,1)),
          install_path    TEXT,
          created_at      TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO media_items (
          id, title, media_type, status, is_local, rating, date_consumed, date_added, notes, cover_art_path,
          creator, genre, year,
          network, season_count, narrator, platform, label,
          runtime, imdb_url, video_quality, series_name, series_order, local_path, platform_id, steam_url, metadata_fetched,
          player_count, play_time, complexity, bgg_url,
          country, language, cast_list, critic_rating, content_rating, trailer_url, watch_providers, watch_checked_date, watch_checked_country, watch_flatrate, watch_rent, watch_buy, metadata_checked_date, cover_art_checked_date,
          imdb_rating, imdb_votes, rotten_tomatoes_rating, metacritic_rating, tmdb_rating, tmdb_votes, bgg_rating, bgg_rating_count, bgg_rank, anilist_score, hardcover_rating, hardcover_ratings_count, hardcover_url, openlibrary_rating, openlibrary_ratings_count, ebook_url, discogs_rating, discogs_ratings_count, discogs_url, podcast_url, igdb_url, igdb_rating, igdb_rating_count,
          hltb_main, hltb_main_extra, hltb_completionist, hltb_checked_date,
          writer, composer, studio, budget, box_office, publisher, themes, game_modes, player_perspective, game_engine, owned_platform, tags, edition_format, abridged, style, album_type, copyright, tracklist, artist, mechanics, min_age, condition, personal_notes,
          set_name, collector_number, rarity, type_line, power_toughness, format_legality, mana_cost, chapter_count, total_volumes, subscribers, video_count, system, recommended_level, site_name, url, episode_count,
          custom_type_id, custom_fields,
          is_hidden,
          install_path,
          created_at, updated_at
        )
        SELECT
          id, title,
          CASE media_type WHEN 'Film' THEN 'Movie' WHEN 'Trading Card Game' THEN 'MTG' ELSE media_type END,
          status, is_local, rating, date_consumed, date_added, notes, cover_art_path,
          creator, genre, year,
          network, season_count, narrator, platform, label,
          runtime, imdb_url, video_quality, series_name, series_order, local_path, platform_id, steam_url, metadata_fetched,
          player_count, play_time, complexity, bgg_url,
          country, language, cast_list, critic_rating, content_rating, trailer_url, watch_providers, watch_checked_date, watch_checked_country, watch_flatrate, watch_rent, watch_buy, metadata_checked_date, cover_art_checked_date,
          imdb_rating, imdb_votes, rotten_tomatoes_rating, metacritic_rating, tmdb_rating, tmdb_votes, bgg_rating, bgg_rating_count, bgg_rank, anilist_score, hardcover_rating, hardcover_ratings_count, hardcover_url, openlibrary_rating, openlibrary_ratings_count, ebook_url, discogs_rating, discogs_ratings_count, discogs_url, podcast_url, igdb_url, igdb_rating, igdb_rating_count,
          hltb_main, hltb_main_extra, hltb_completionist, hltb_checked_date,
          writer, composer, studio, budget, box_office, publisher, themes, game_modes, player_perspective, game_engine, owned_platform, tags, edition_format, abridged, style, album_type, copyright, tracklist, artist, mechanics, min_age, condition, personal_notes,
          set_name, collector_number, rarity, type_line, power_toughness, format_legality, mana_cost, chapter_count, total_volumes, subscribers, video_count, system, recommended_level, site_name, url, episode_count,
          custom_type_id, custom_fields,
          is_hidden,
          install_path,
          created_at, updated_at
        FROM media_items_v42;

        DROP TABLE media_items_v42;

        CREATE INDEX IF NOT EXISTS idx_media_type  ON media_items(media_type);
        CREATE INDEX IF NOT EXISTS idx_status      ON media_items(status);
        CREATE INDEX IF NOT EXISTS idx_is_local    ON media_items(is_local);
        CREATE INDEX IF NOT EXISTS idx_rating      ON media_items(rating);
        CREATE INDEX IF NOT EXISTS idx_date_added  ON media_items(date_added);
        CREATE INDEX IF NOT EXISTS idx_title       ON media_items(title COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_custom_type_id ON media_items(custom_type_id);

        ALTER TABLE list_items RENAME TO list_items_v43_stale;

        CREATE TABLE list_items (
          list_id     INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
          item_id     INTEGER NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
          PRIMARY KEY (list_id, item_id)
        );

        INSERT INTO list_items (list_id, item_id)
        SELECT list_id, item_id FROM list_items_v43_stale;

        DROP TABLE list_items_v43_stale;

        CREATE INDEX IF NOT EXISTS idx_list_items_item ON list_items(item_id);

        ALTER TABLE local_folders RENAME TO local_folders_v42;

        CREATE TABLE local_folders (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          folder_path     TEXT NOT NULL UNIQUE,
          media_type      TEXT NOT NULL
                          CHECK (media_type IN ('Movie','TV','Book','Audiobook','Game','Music','Board Game','MTG','Graphic Novel','Web Video','Tabletop Game','Website','Podcast')),
          last_scanned_at TEXT,
          item_count      INTEGER DEFAULT 0,
          created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO local_folders (id, folder_path, media_type, last_scanned_at, item_count, created_at)
        SELECT id, folder_path,
          CASE media_type WHEN 'Film' THEN 'Movie' WHEN 'Trading Card Game' THEN 'MTG' ELSE media_type END,
          last_scanned_at, item_count, created_at
        FROM local_folders_v42;

        DROP TABLE local_folders_v42;

        UPDATE discovery_dismissed SET media_type = 'Movie' WHERE media_type = 'Film';
        UPDATE discovery_dismissed SET media_type = 'MTG'   WHERE media_type = 'Trading Card Game';

        PRAGMA user_version = 43;
      `);
      this.db.exec(`PRAGMA foreign_keys = ON;`);
    }

    // v44 (2026-09-17): v43 missed that the old type names also live inside
    // JSON-array settings values (hidden_media_types, media_type_order), not
    // just the media_items/local_folders tables — found live: the saved tab
    // order still listed "Film" first, which no longer matches any tab's key
    // (now "Movie"), so it silently sorted to the very end instead of first.
    // A plain string REPLACE on the raw JSON text is safe here since neither
    // old name is a substring of any other type name.
    if (version < 44) {
      this.db.exec(`
        UPDATE settings SET value = REPLACE(REPLACE(value, '"Film"', '"Movie"'), '"Trading Card Game"', '"MTG"')
        WHERE value LIKE '%"Film"%' OR value LIKE '%"Trading Card Game"%';
        PRAGMA user_version = 44;
      `);
    }

    // v45 (2026-09-22): Cloud Sync groundwork (V3 step 1 — see
    // docs/cloud-sync-design.md). No cloud code runs yet; this just gives
    // every row a stable cross-device identity ahead of the sync engine
    // that will actually use it. sync_id is a UUID, generated once here for
    // every existing row and from now on by every insert path
    // (addItem/importItems/processScanResults/createList/
    // _findOrCreateListId/addCustomType/updateCustomType); ADD COLUMN can't
    // declare UNIQUE directly in SQLite, so the constraint is a separate
    // index, added after backfill. deleted_at is unused until the sync
    // engine exists to consume it (deleteItem/deleteList/deleteCustomType
    // still do a real delete for now, deliberately — see deleteItem's own
    // comment); added now so every row already has the column by the time
    // that changes. lists/custom_types/custom_type_fields also gain
    // updated_at, which they never had — needed for the same
    // newest-edit-wins comparison media_items already supports.
    if (version < 45) {
      // SQLite's ADD COLUMN refuses a non-constant DEFAULT (e.g.
      // datetime('now')), unlike CREATE TABLE — so updated_at is added
      // nullable here and backfilled by UPDATE just below, which has no
      // such restriction. Fresh installs (_createSchema, CREATE TABLE) keep
      // the NOT NULL DEFAULT version directly since that path is unaffected.
      this.db.exec(`
        ALTER TABLE media_items       ADD COLUMN sync_id    TEXT;
        ALTER TABLE media_items       ADD COLUMN deleted_at TEXT;
        ALTER TABLE lists             ADD COLUMN sync_id    TEXT;
        ALTER TABLE lists             ADD COLUMN deleted_at TEXT;
        ALTER TABLE lists             ADD COLUMN updated_at TEXT;
        ALTER TABLE custom_types      ADD COLUMN sync_id    TEXT;
        ALTER TABLE custom_types      ADD COLUMN deleted_at TEXT;
        ALTER TABLE custom_types      ADD COLUMN updated_at TEXT;
        ALTER TABLE custom_type_fields ADD COLUMN sync_id    TEXT;
        ALTER TABLE custom_type_fields ADD COLUMN deleted_at TEXT;
        ALTER TABLE custom_type_fields ADD COLUMN updated_at TEXT;

        UPDATE lists             SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL;
        UPDATE custom_types      SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL;
        UPDATE custom_type_fields SET updated_at = datetime('now') WHERE updated_at IS NULL;
      `);

      const backfillTable = (table) => {
        const rows = this.db.prepare(`SELECT id FROM ${table} WHERE sync_id IS NULL`).all();
        if (!rows.length) return;
        const setSyncId = this.db.prepare(`UPDATE ${table} SET sync_id = ? WHERE id = ?`);
        this.db.transaction((rows) => {
          for (const row of rows) setSyncId.run(crypto.randomUUID(), row.id);
        })(rows);
      };
      backfillTable("media_items");
      backfillTable("lists");
      backfillTable("custom_types");
      backfillTable("custom_type_fields");

      this.db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_media_items_sync_id       ON media_items(sync_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_lists_sync_id             ON lists(sync_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_types_sync_id      ON custom_types(sync_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_type_fields_sync_id ON custom_type_fields(sync_id);
        PRAGMA user_version = 45;
      `);
    }

    if (version < 46) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cover_art_sources (
          path TEXT PRIMARY KEY,
          url  TEXT NOT NULL
        );
        PRAGMA user_version = 46;
      `);
    }

    if (version < 47) {
      // Discovery dismissals become syncable: updated_at (last-write-wins)
      // and deleted_at (undismiss becomes a soft delete). ADD COLUMN can't
      // take a non-constant DEFAULT, so updated_at is added nullable and
      // backfilled from the original dismissal time.
      //
      // Each ADD COLUMN is conditional: _createSchema() runs before _migrate()
      // and already creates this table in its current shape when an old
      // database never had it, so an unconditional ALTER failed with
      // "duplicate column name" (found by test/schemaParity.test.js, upgrading
      // from v25).
      if (!this._hasColumn("discovery_dismissed", "updated_at")) this.db.exec(`ALTER TABLE discovery_dismissed ADD COLUMN updated_at TEXT;`);
      if (!this._hasColumn("discovery_dismissed", "deleted_at")) this.db.exec(`ALTER TABLE discovery_dismissed ADD COLUMN deleted_at TEXT;`);
      this.db.exec(`
        UPDATE discovery_dismissed SET updated_at = COALESCE(dismissed_at, datetime('now')) WHERE updated_at IS NULL;
        PRAGMA user_version = 47;
      `);
    }

    if (version < 48) {
      // v47 backfilled updated_at with each dismissal's ORIGINAL date, which
      // is older than the last Cloud Sync checkpoint — and push only sends
      // rows changed since that checkpoint, so every dismissal made before
      // v47 was silently never uploaded (found live: only a title dismissed
      // on the phone showed up there). Stamp the live ones as changed now so
      // the next sync uploads them.
      this.db.exec(`
        UPDATE discovery_dismissed SET updated_at = datetime('now') WHERE deleted_at IS NULL;
        PRAGMA user_version = 48;
      `);
    }

    if (version < 49) {
      // Removing an item from a list (or deleting a list) hard-deletes the
      // local row and never told the cloud — see the tombstone tables' notes
      // in _createSchema.
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS list_item_tombstones (
          list_sync_id TEXT NOT NULL,
          item_sync_id TEXT NOT NULL,
          deleted_at   TEXT NOT NULL,
          PRIMARY KEY (list_sync_id, item_sync_id)
        );
        CREATE TABLE IF NOT EXISTS list_tombstones (
          sync_id    TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          deleted_at TEXT NOT NULL
        );
        PRAGMA user_version = 49;
      `);
    }

    if (version < 50) {
      // Deleting an item hard-deleted the row and never told the cloud, so
      // the phone kept showing it (and the next pull could bring it back).
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS item_tombstones (
          sync_id    TEXT PRIMARY KEY,
          deleted_at TEXT NOT NULL
        );
        PRAGMA user_version = 50;
      `);
    }

    if (version < 51) {
      // Magic: The Gathering was removed from the app (2026-10-03): no type
      // tab, search, or editor remains, so any MTG row left in a library would
      // be invisible under every tab yet still counted, synced and exported.
      // Remove them the same way an in-app delete does — tombstone first, so
      // the next Cloud Sync tells the cloud and the phone to drop them too. The
      // pre-migration backup (see _backupBeforeMigration) holds the old rows.
      // The media_type CHECK lists still allow 'MTG' on purpose: dropping a
      // value needs a rebuild of the 119-column table for no behavioural gain.
      this.db.exec(`
        INSERT OR REPLACE INTO item_tombstones (sync_id, deleted_at)
          SELECT sync_id, datetime('now') FROM media_items WHERE media_type = 'MTG' AND sync_id IS NOT NULL;
        DELETE FROM media_items WHERE media_type = 'MTG';
        PRAGMA user_version = 51;
      `);
    }

    if (version < 52) {
      // The phone can mark things owned (a physical copy, say). Desktop reads those
      // marks from the cloud after each sync and keeps the result here so the Owned
      // filter, chips and counts include them. Not synced itself.
      if (!this._hasColumn("media_items", "owned_elsewhere")) {
        this.db.exec(`ALTER TABLE media_items ADD COLUMN owned_elsewhere INTEGER NOT NULL DEFAULT 0 CHECK (owned_elsewhere IN (0,1));`);
      }
      this.db.exec(`PRAGMA user_version = 52;`);
    }
  }

  // Replaces which items another device owns. Only rows whose value actually changes
  // are written, so a sync that learns nothing new does not look like an edit.
  // Returns how many rows changed.
  setOwnedElsewhere(syncIds) {
    const want = new Set(syncIds);
    const have = new Set(this.db.prepare(`SELECT sync_id FROM media_items WHERE owned_elsewhere = 1 AND sync_id IS NOT NULL`).all().map((r) => r.sync_id));
    const clear = [...have].filter((id) => !want.has(id));
    const set = [...want].filter((id) => !have.has(id));
    const off = this.db.prepare(`UPDATE media_items SET owned_elsewhere = 0 WHERE sync_id = ?`);
    const on = this.db.prepare(`UPDATE media_items SET owned_elsewhere = 1 WHERE sync_id = ?`);
    let changed = 0;
    this.db.transaction(() => {
      for (const id of clear) changed += off.run(id).changes;
      for (const id of set) changed += on.run(id).changes;
    })();
    return changed;
  }

  // Records that `path` holds the image downloaded from `url`. When the
  // mapping is new or changed, bumps updated_at on every item using that
  // file so the next Cloud Sync push carries the (new) cover_art_url —
  // push only sends rows changed since the last checkpoint.
  recordCoverArtSource(path, url) {
    if (!path || !url) return;
    const existing = this.db.prepare(`SELECT url FROM cover_art_sources WHERE path = ?`).get(path);
    if (existing && existing.url === url) return;
    this.db.prepare(`INSERT INTO cover_art_sources (path, url) VALUES (?, ?)
      ON CONFLICT(path) DO UPDATE SET url = excluded.url`).run(path, url);
    this.db.prepare(`UPDATE media_items SET updated_at = datetime('now') WHERE cover_art_path = ?`).run(path);
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  getSetting(key) {
    const row = this.db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .get(key);
    return row ? row.value : null;
  }

  // null/undefined means "clear this setting" (the convention every
  // disconnect/forget handler uses: gog:disconnect, epic:disconnect,
  // cloudSync:disconnect, cloudSync:secretsForget) — settings.value is
  // NOT NULL, so that has to be a real DELETE, not an insert/update
  // carrying a SQL NULL, which would violate the column constraint.
  setSetting(key, value) {
    if (value == null) {
      this.db.prepare(`DELETE FROM settings WHERE key = ?`).run(key);
      return;
    }
    this.db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  getDistinctGenres() {
    return this.db
      .prepare(`
        SELECT DISTINCT genre FROM media_items
        WHERE genre IS NOT NULL AND genre != ''
        ORDER BY genre ASC
      `)
      .all()
      .map(row => row.genre);
  }

  // ── Items ────────────────────────────────────────────────────────────────

  // custom_fields is stored as a JSON string (arbitrary key/value shape per
  // custom type) — every read path parses it back into an object so callers
  // never have to think about the storage encoding.
  _parseCustomFields(row) {
    if (!row.custom_fields) return row;
    try {
      return { ...row, custom_fields: JSON.parse(row.custom_fields) };
    } catch {
      return { ...row, custom_fields: {} };
    }
  }

  getAllItems() {
    const rows = this.db.prepare(`
      SELECT m.*, GROUP_CONCAT(li.list_id) AS list_ids
      FROM media_items m
      LEFT JOIN list_items li ON li.item_id = m.id
      GROUP BY m.id
      ORDER BY m.date_added DESC
    `).all();
    return rows.map(r => this._parseCustomFields({
      ...r,
      list_ids: r.list_ids ? r.list_ids.split(",").map(Number) : [],
    }));
  }

  addItem(data) {
    const stmt = this.db.prepare(`
      INSERT INTO media_items (
        title, media_type, status, is_local, rating,
        date_consumed, notes, cover_art_path, metadata_checked_date,
        creator, genre, year,
        network, season_count, narrator, platform, label,
        runtime, imdb_url, video_quality, series_name, series_order, local_path,
        platform_id, steam_url,
        player_count, play_time, complexity, bgg_url,
        country, language, cast_list, critic_rating,
        imdb_rating, imdb_votes, rotten_tomatoes_rating, metacritic_rating,
        tmdb_rating, tmdb_votes, bgg_rating, bgg_rating_count, bgg_rank, anilist_score,
        hardcover_rating, hardcover_ratings_count, hardcover_url, ebook_url,
        openlibrary_rating, openlibrary_ratings_count,
        discogs_rating, discogs_ratings_count, discogs_url, podcast_url, igdb_url,
        igdb_rating, igdb_rating_count,
        content_rating, trailer_url,
        writer, composer, studio, budget, box_office,
        publisher, themes, game_modes, player_perspective, game_engine, owned_platform,
        tags, edition_format, abridged, style, album_type, copyright, tracklist,
        artist, mechanics, min_age, condition, personal_notes,
        set_name, collector_number, rarity, type_line, power_toughness, format_legality, mana_cost,
        chapter_count, total_volumes, subscribers, video_count,
        system, recommended_level, site_name, url, episode_count,
        custom_type_id, custom_fields, sync_id
      ) VALUES (
        @title, @media_type, @status, @is_local, @rating,
        @date_consumed, @notes, @cover_art_path, @metadata_checked_date,
        @creator, @genre, @year,
        @network, @season_count, @narrator, @platform, @label,
        @runtime, @imdb_url, @video_quality, @series_name, @series_order, @local_path,
        @platform_id, @steam_url,
        @player_count, @play_time, @complexity, @bgg_url,
        @country, @language, @cast_list, @critic_rating,
        @imdb_rating, @imdb_votes, @rotten_tomatoes_rating, @metacritic_rating,
        @tmdb_rating, @tmdb_votes, @bgg_rating, @bgg_rating_count, @bgg_rank, @anilist_score,
        @hardcover_rating, @hardcover_ratings_count, @hardcover_url, @ebook_url,
        @openlibrary_rating, @openlibrary_ratings_count,
        @discogs_rating, @discogs_ratings_count, @discogs_url, @podcast_url, @igdb_url,
        @igdb_rating, @igdb_rating_count,
        @content_rating, @trailer_url,
        @writer, @composer, @studio, @budget, @box_office,
        @publisher, @themes, @game_modes, @player_perspective, @game_engine, @owned_platform,
        @tags, @edition_format, @abridged, @style, @album_type, @copyright, @tracklist,
        @artist, @mechanics, @min_age, @condition, @personal_notes,
        @set_name, @collector_number, @rarity, @type_line, @power_toughness, @format_legality, @mana_cost,
        @chapter_count, @total_volumes, @subscribers, @video_count,
        @system, @recommended_level, @site_name, @url, @episode_count,
        @custom_type_id, @custom_fields, @sync_id
      )
    `);

    const result = stmt.run({
      title:          data.title,
      media_type:     data.media_type,
      status:         data.status         || "wishlist",
      is_local:       data.is_local       ? 1 : 0,
      rating:         data.rating         ?? null,
      date_consumed:  data.date_consumed  || null,
      notes:          data.notes          || null,
      cover_art_path: data.cover_art_path || null,
      metadata_checked_date: data.metadata_checked_date || null,
      creator:        data.creator        || null,
      genre:          data.genre          || null,
      year:           data.year           || null,
      network:        data.network        || null,
      season_count:   data.season_count   || null,
      narrator:       data.narrator       || null,
      platform:       data.platform       || null,
      label:          data.label          || null,
      runtime:        data.runtime        || null,
      imdb_url:       data.imdb_url       || null,
      video_quality:  data.video_quality  || null,
      series_name:    data.series_name    || null,
      series_order:   data.series_order   || null,
      local_path:     data.local_path     || null,
      platform_id:    data.platform_id    || null,
      steam_url:      data.steam_url      || null,
      player_count:   data.player_count   || null,
      play_time:      data.play_time      || null,
      complexity:     data.complexity     ?? null,
      bgg_url:        data.bgg_url        || null,
      country:        data.country        || null,
      language:       data.language       || null,
      cast_list:      data.cast_list      || null,
      critic_rating:  data.critic_rating  || null,
      imdb_rating:    data.imdb_rating    ?? null,
      imdb_votes:     data.imdb_votes     ?? null,
      rotten_tomatoes_rating: data.rotten_tomatoes_rating ?? null,
      metacritic_rating: data.metacritic_rating ?? null,
      tmdb_rating:    data.tmdb_rating    ?? null,
      tmdb_votes:     data.tmdb_votes     ?? null,
      bgg_rating:     data.bgg_rating     ?? null,
      bgg_rating_count: data.bgg_rating_count ?? null,
      bgg_rank:       data.bgg_rank       ?? null,
      anilist_score:  data.anilist_score  ?? null,
      hardcover_rating: data.hardcover_rating ?? null,
      hardcover_ratings_count: data.hardcover_ratings_count ?? null,
      hardcover_url:  data.hardcover_url  || null,
      openlibrary_rating:        data.openlibrary_rating        ?? null,
      openlibrary_ratings_count: data.openlibrary_ratings_count ?? null,
      ebook_url:      data.ebook_url      || null,
      discogs_rating: data.discogs_rating ?? null,
      discogs_ratings_count: data.discogs_ratings_count ?? null,
      discogs_url:    data.discogs_url    || null,
      podcast_url:    data.podcast_url    || null,
      igdb_url:       data.igdb_url       || null,
      igdb_rating:       data.igdb_rating       ?? null,
      igdb_rating_count: data.igdb_rating_count ?? null,
      content_rating: data.content_rating || null,
      trailer_url:    data.trailer_url    || null,
      writer:             data.writer             || null,
      composer:           data.composer           || null,
      studio:             data.studio             || null,
      budget:             data.budget             || null,
      box_office:         data.box_office         || null,
      publisher:          data.publisher          || null,
      themes:             data.themes             || null,
      game_modes:         data.game_modes         || null,
      player_perspective: data.player_perspective || null,
      game_engine:        data.game_engine        || null,
      owned_platform:     data.owned_platform     || null,
      tags:               data.tags               || null,
      edition_format:     data.edition_format     || null,
      abridged:           data.abridged != null ? (data.abridged ? 1 : 0) : null,
      style:              data.style              || null,
      album_type:         data.album_type         || null,
      copyright:          data.copyright          || null,
      tracklist:          data.tracklist          || null,
      artist:             data.artist             || null,
      mechanics:          data.mechanics          || null,
      min_age:            data.min_age            || null,
      condition:          data.condition          || null,
      personal_notes:     data.personal_notes     || null,
      set_name:            data.set_name            || null,
      collector_number:    data.collector_number    || null,
      rarity:              data.rarity              || null,
      type_line:           data.type_line           || null,
      power_toughness:     data.power_toughness     || null,
      format_legality:     data.format_legality     || null,
      mana_cost:           data.mana_cost           || null,
      chapter_count:       data.chapter_count       || null,
      total_volumes:       data.total_volumes       || null,
      subscribers:         data.subscribers         || null,
      video_count:         data.video_count         || null,
      system:              data.system              || null,
      recommended_level:   data.recommended_level   || null,
      site_name:           data.site_name           || null,
      url:                 data.url                 || null,
      episode_count:       data.episode_count       || null,
      custom_type_id:      data.custom_type_id      || null,
      custom_fields:       data.custom_fields ? JSON.stringify(data.custom_fields) : null,
      sync_id:             crypto.randomUUID(),
    });

    // Return the newly created item
    return this._parseCustomFields(this.db
      .prepare(`SELECT * FROM media_items WHERE id = ?`)
      .get(result.lastInsertRowid));
  }

  updateItem(id, data) {
    const stmt = this.db.prepare(`
      UPDATE media_items SET
        title          = @title,
        media_type     = @media_type,
        status         = @status,
        is_local       = @is_local,
        rating         = @rating,
        date_consumed  = @date_consumed,
        notes          = @notes,
        cover_art_path = @cover_art_path,
        metadata_checked_date = @metadata_checked_date,
        creator        = @creator,
        genre          = @genre,
        year           = @year,
        network        = @network,
        season_count   = @season_count,
        narrator       = @narrator,
        platform       = @platform,
        label          = @label,
        runtime        = @runtime,
        imdb_url       = @imdb_url,
        video_quality  = @video_quality,
        series_name    = @series_name,
        series_order   = @series_order,
        local_path     = @local_path,
        platform_id    = @platform_id,
        steam_url      = @steam_url,
        player_count   = @player_count,
        play_time      = @play_time,
        complexity     = @complexity,
        bgg_url        = @bgg_url,
        country        = @country,
        language       = @language,
        cast_list      = @cast_list,
        critic_rating  = @critic_rating,
        imdb_rating    = @imdb_rating,
        imdb_votes     = @imdb_votes,
        rotten_tomatoes_rating = @rotten_tomatoes_rating,
        metacritic_rating = @metacritic_rating,
        tmdb_rating    = @tmdb_rating,
        tmdb_votes     = @tmdb_votes,
        bgg_rating     = @bgg_rating,
        bgg_rating_count = @bgg_rating_count,
        bgg_rank       = @bgg_rank,
        anilist_score  = @anilist_score,
        hardcover_rating = @hardcover_rating,
        hardcover_ratings_count = @hardcover_ratings_count,
        hardcover_url  = @hardcover_url,
        openlibrary_rating = @openlibrary_rating,
        openlibrary_ratings_count = @openlibrary_ratings_count,
        ebook_url      = @ebook_url,
        discogs_rating = @discogs_rating,
        discogs_ratings_count = @discogs_ratings_count,
        discogs_url    = @discogs_url,
        podcast_url    = @podcast_url,
        igdb_url       = @igdb_url,
        igdb_rating       = @igdb_rating,
        igdb_rating_count = @igdb_rating_count,
        content_rating = @content_rating,
        trailer_url    = @trailer_url,
        writer = @writer, composer = @composer, studio = @studio,
        budget = @budget, box_office = @box_office,
        publisher = @publisher, themes = @themes, game_modes = @game_modes,
        player_perspective = @player_perspective, game_engine = @game_engine, owned_platform = @owned_platform,
        tags = @tags, edition_format = @edition_format, abridged = @abridged,
        style = @style, album_type = @album_type, copyright = @copyright, tracklist = @tracklist,
        artist = @artist, mechanics = @mechanics, min_age = @min_age, condition = @condition,
        personal_notes = @personal_notes,
        set_name = @set_name, collector_number = @collector_number, rarity = @rarity,
        type_line = @type_line, power_toughness = @power_toughness, format_legality = @format_legality, mana_cost = @mana_cost,
        chapter_count = @chapter_count, total_volumes = @total_volumes,
        subscribers = @subscribers, video_count = @video_count,
        system = @system, recommended_level = @recommended_level,
        site_name = @site_name, url = @url, episode_count = @episode_count,
        custom_type_id = @custom_type_id, custom_fields = @custom_fields,
        updated_at     = datetime('now')
      WHERE id = @id
    `);

    stmt.run({
      id,
      title:          data.title,
      media_type:     data.media_type,
      status:         data.status,
      is_local:       data.is_local ? 1 : 0,
      rating:         data.rating         ?? null,
      date_consumed:  data.date_consumed  || null,
      notes:          data.notes          || null,
      cover_art_path: data.cover_art_path || null,
      metadata_checked_date: data.metadata_checked_date || null,
      creator:        data.creator        || null,
      genre:          data.genre          || null,
      year:           data.year           || null,
      network:        data.network        || null,
      season_count:   data.season_count   || null,
      narrator:       data.narrator       || null,
      platform:       data.platform       || null,
      label:          data.label          || null,
      runtime:        data.runtime        || null,
      imdb_url:       data.imdb_url       || null,
      video_quality:  data.video_quality  || null,
      series_name:    data.series_name    || null,
      series_order:   data.series_order   || null,
      local_path:     data.local_path     || null,
      platform_id:    data.platform_id    || null,
      steam_url:      data.steam_url      || null,
      player_count:   data.player_count   || null,
      play_time:      data.play_time      || null,
      complexity:     data.complexity     ?? null,
      bgg_url:        data.bgg_url        || null,
      country:        data.country        || null,
      language:       data.language       || null,
      cast_list:      data.cast_list      || null,
      critic_rating:  data.critic_rating  || null,
      imdb_rating:    data.imdb_rating    ?? null,
      imdb_votes:     data.imdb_votes     ?? null,
      rotten_tomatoes_rating: data.rotten_tomatoes_rating ?? null,
      metacritic_rating: data.metacritic_rating ?? null,
      tmdb_rating:    data.tmdb_rating    ?? null,
      tmdb_votes:     data.tmdb_votes     ?? null,
      bgg_rating:     data.bgg_rating     ?? null,
      bgg_rating_count: data.bgg_rating_count ?? null,
      bgg_rank:       data.bgg_rank       ?? null,
      anilist_score:  data.anilist_score  ?? null,
      hardcover_rating: data.hardcover_rating ?? null,
      hardcover_ratings_count: data.hardcover_ratings_count ?? null,
      hardcover_url:  data.hardcover_url  || null,
      openlibrary_rating:        data.openlibrary_rating        ?? null,
      openlibrary_ratings_count: data.openlibrary_ratings_count ?? null,
      ebook_url:      data.ebook_url      || null,
      discogs_rating: data.discogs_rating ?? null,
      discogs_ratings_count: data.discogs_ratings_count ?? null,
      discogs_url:    data.discogs_url    || null,
      podcast_url:    data.podcast_url    || null,
      igdb_url:       data.igdb_url       || null,
      igdb_rating:       data.igdb_rating       ?? null,
      igdb_rating_count: data.igdb_rating_count ?? null,
      content_rating: data.content_rating || null,
      trailer_url:    data.trailer_url    || null,
      writer:             data.writer             || null,
      composer:           data.composer           || null,
      studio:             data.studio             || null,
      budget:             data.budget             || null,
      box_office:         data.box_office         || null,
      publisher:          data.publisher          || null,
      themes:             data.themes             || null,
      game_modes:         data.game_modes         || null,
      player_perspective: data.player_perspective || null,
      game_engine:        data.game_engine        || null,
      owned_platform:     data.owned_platform     || null,
      tags:               data.tags               || null,
      edition_format:     data.edition_format     || null,
      abridged:           data.abridged != null ? (data.abridged ? 1 : 0) : null,
      style:              data.style              || null,
      album_type:         data.album_type         || null,
      copyright:          data.copyright          || null,
      tracklist:          data.tracklist          || null,
      artist:             data.artist             || null,
      mechanics:          data.mechanics          || null,
      min_age:            data.min_age            || null,
      condition:          data.condition          || null,
      personal_notes:     data.personal_notes     || null,
      set_name:            data.set_name            || null,
      collector_number:    data.collector_number    || null,
      rarity:              data.rarity              || null,
      type_line:           data.type_line           || null,
      power_toughness:     data.power_toughness     || null,
      format_legality:     data.format_legality     || null,
      mana_cost:           data.mana_cost           || null,
      chapter_count:       data.chapter_count       || null,
      total_volumes:       data.total_volumes       || null,
      subscribers:         data.subscribers         || null,
      video_count:         data.video_count         || null,
      system:              data.system              || null,
      recommended_level:   data.recommended_level   || null,
      site_name:           data.site_name           || null,
      url:                 data.url                 || null,
      episode_count:       data.episode_count       || null,
      custom_type_id:      data.custom_type_id      || null,
      custom_fields:       data.custom_fields ? JSON.stringify(data.custom_fields) : null,
    });

    return this._parseCustomFields(this.db
      .prepare(`SELECT * FROM media_items WHERE id = ?`)
      .get(id));
  }

  // Queues a "this item was deleted" notice for Cloud Sync (rows never
  // synced have no sync_id, so there's nothing to tell the cloud).
  _tombstoneItem(id) {
    this.db.prepare(`
      INSERT OR REPLACE INTO item_tombstones (sync_id, deleted_at)
      SELECT sync_id, datetime('now') FROM media_items WHERE id = ? AND sync_id IS NOT NULL
    `).run(id);
  }

  deleteItem(id) {
    this._tombstoneItem(id);
    this.db
      .prepare(`DELETE FROM media_items WHERE id = ?`)
      .run(id);
    return { success: true, id };
  }

  // Guard against deleting a cover art file still in use by another item
  // (fallback filenames aren't guaranteed unique). Call after removing the
  // owning row(s). Normalizes slashes/case — a real bug once let historical
  // Audible/Libation forward-slash paths bypass a raw `=` match, causing 40
  // in-use covers to be wrongly flagged orphaned and deleted.
  coverArtPathInUse(coverArtPath) {
    const normalized = String(coverArtPath).replace(/\\/g, "/").toLowerCase();
    const { n } = this.db
      .prepare(`SELECT COUNT(*) AS n FROM media_items WHERE LOWER(REPLACE(cover_art_path, '\\', '/')) = ?`)
      .get(normalized);
    return n > 0;
  }

  // Same "in use" check as coverArtPathInUse, but for checking EVERY file in
  // the cover art folder at once (the orphan sweep) — one query up front
  // instead of one `LOWER(REPLACE(...))` table scan per file, which can't
  // use an index since it's a function of the column, not the raw column
  // itself. O(files + items) instead of O(files * items).
  allCoverArtPathsInUse() {
    const rows = this.db.prepare(`SELECT cover_art_path FROM media_items WHERE cover_art_path IS NOT NULL`).all();
    return new Set(rows.map(r => r.cover_art_path.replace(/\\/g, "/").toLowerCase()));
  }

  // ── Discovery dismissals ────────────────────────────────────────────────

  // Dismissing an already-dismissed title (e.g. a stale client re-sending
  // the same click) is a no-op, not a UNIQUE-constraint error — but
  // dismissing one that was previously undismissed (a soft-deleted row)
  // revives it, and stamps updated_at so Cloud Sync carries the change.
  dismissDiscoveryItem(mediaType, tmdbId, title) {
    this.db.prepare(`
      INSERT INTO discovery_dismissed (media_type, tmdb_id, title)
      VALUES (@mediaType, @tmdbId, @title)
      ON CONFLICT (media_type, tmdb_id) DO UPDATE SET
        deleted_at = NULL, title = COALESCE(excluded.title, title),
        dismissed_at = datetime('now'), updated_at = datetime('now')
      WHERE deleted_at IS NOT NULL
    `).run({ mediaType, tmdbId: String(tmdbId), title: title || null });
    return { success: true };
  }

  getDiscoveryDismissals() {
    return this.db
      .prepare(`SELECT id, media_type, tmdb_id, title, dismissed_at FROM discovery_dismissed WHERE deleted_at IS NULL ORDER BY dismissed_at DESC`)
      .all();
  }

  // Soft delete, not DELETE — the tombstone is what tells other devices to
  // un-dismiss too.
  undismissDiscoveryItem(id) {
    this.db.prepare(`UPDATE discovery_dismissed SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(id);
    return { success: true };
  }

  deleteItems(ids) {
    const del = this.db.prepare(`DELETE FROM media_items WHERE id = ?`);
    const run = this.db.transaction((idList) => {
      for (const id of idList) { this._tombstoneItem(id); del.run(id); }
    });
    run(ids);
    return { success: true, count: ids.length };
  }

  searchItems(query) {
    return this.db
      .prepare(`
        SELECT * FROM media_items
        WHERE title LIKE @query OR creator LIKE @query
        ORDER BY date_added DESC
      `)
      .all({ query: `%${query}%` });
  }

  // ── Folders ──────────────────────────────────────────────────────────────

  getFolders() {
    return this.db
      .prepare(`SELECT * FROM local_folders ORDER BY created_at ASC`)
      .all();
  }

  addFolder(folderPath, mediaType) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO local_folders (folder_path, media_type)
      VALUES (?, ?)
    `);
    const result = stmt.run(folderPath, mediaType);
    return this.db
      .prepare(`SELECT * FROM local_folders WHERE id = ?`)
      .get(result.lastInsertRowid);
  }

  updateFolderScan(id, itemCount) {
    this.db.prepare(`
      UPDATE local_folders
      SET last_scanned_at = datetime('now'), item_count = ?
      WHERE id = ?
    `).run(itemCount, id);
  }

  removeFolder(id) {
    this.db.prepare(`DELETE FROM local_folders WHERE id = ?`).run(id);
    return { success: true };
  }

  processScanResults(scannedItems) {
    const insertNew = this.db.prepare(`
      INSERT INTO media_items
        (title, media_type, status, is_local, year, local_path, date_added, sync_id)
      VALUES
        (@title, @media_type, 'wishlist', 1, @year, @local_path, date('now'), @sync_id)
    `);

    const markOwned = this.db.prepare(`
      UPDATE media_items
      SET is_local = 1, updated_at = datetime('now')
      WHERE id = ?
    `);

    const processAll = this.db.transaction((items) => {
      let added  = 0;
      let linked = 0;

      for (const item of items) {
        const existing = this.db.prepare(`
          SELECT id, is_local FROM media_items
          WHERE lower(title) = lower(?) AND media_type = ?
        `).get(item.title, item.media_type);

        if (existing) {
          if (existing.is_local !== 1) {
            markOwned.run(existing.id);
            linked++;
          }
        } else {
          insertNew.run({
            title:      item.title,
            media_type: item.media_type,
            year:       item.year       || null,
            local_path: item.full_path  || null,
            sync_id:    crypto.randomUUID(),
          });
          added++;
        }
      }

      return { added, linked };
    });

    return processAll(scannedItems);
  }

  // list_names is a comma-separated string of every list (Favourites, custom
  // lists) the item belongs to, for the CSV export's Lists column — resolved
  // by name here rather than id, since ids won't mean anything on re-import.
  exportAllItems() {
    return this.db.prepare(`
      SELECT m.*, GROUP_CONCAT(l.name, ', ') AS list_names
      FROM media_items m
      LEFT JOIN list_items li ON li.item_id = m.id
      LEFT JOIN lists l ON l.id = li.list_id
      GROUP BY m.id
      ORDER BY m.media_type, m.title ASC
    `).all();
  }

  // Same shape as exportAllItems, scoped to a specific set of ids — backs
  // "Export Selected" from the multi-select bar.
  exportItemsByIds(ids) {
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(",");
    return this.db.prepare(`
      SELECT m.*, GROUP_CONCAT(l.name, ', ') AS list_names
      FROM media_items m
      LEFT JOIN list_items li ON li.item_id = m.id
      LEFT JOIN lists l ON l.id = li.list_id
      WHERE m.id IN (${placeholders})
      GROUP BY m.id
      ORDER BY m.media_type, m.title ASC
    `).all(...ids);
  }

  // Finds a list by name (case-insensitive, matching the lists table's own
  // UNIQUE COLLATE NOCASE constraint) or creates it — shared by importItems'
  // Lists-column linking so re-running an import doesn't create duplicate lists.
  _findOrCreateListId(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = this.db.prepare(`SELECT id FROM lists WHERE name = ? COLLATE NOCASE`).get(trimmed);
    if (existing) return existing.id;
    const result = this.db.prepare(`INSERT INTO lists (name, sync_id, updated_at) VALUES (?, ?, datetime('now'))`).run(trimmed, crypto.randomUUID());
    return result.lastInsertRowid;
  }

  // ── Custom Types ─────────────────────────────────────────────────────────

  getCustomTypes() {
    const types  = this.db.prepare(`SELECT * FROM custom_types ORDER BY label COLLATE NOCASE`).all();
    const fields = this.db.prepare(`SELECT * FROM custom_type_fields ORDER BY sort_order ASC`).all();
    return types.map(t => ({
      ...t,
      fields: fields
        .filter(f => f.custom_type_id === t.id)
        .map(f => ({ key: f.key, label: f.label, field_type: f.field_type })),
    }));
  }

  getCustomType(id) {
    const t = this.db.prepare(`SELECT * FROM custom_types WHERE id = ?`).get(id);
    if (!t) return null;
    const fields = this.db.prepare(`SELECT key, label, field_type FROM custom_type_fields WHERE custom_type_id = ? ORDER BY sort_order ASC`).all(id);
    return { ...t, fields };
  }

  addCustomType({ label, icon, color, fields }) {
    const run = this.db.transaction(() => {
      const result = this.db.prepare(`INSERT INTO custom_types (label, icon, color, sync_id, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`).run(label, icon, color, crypto.randomUUID());
      const typeId = result.lastInsertRowid;
      const insertField = this.db.prepare(`
        INSERT INTO custom_type_fields (custom_type_id, key, label, field_type, sort_order, sync_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      (fields || []).forEach((f, i) => insertField.run(typeId, f.key, f.label, f.field_type || "text", i, crypto.randomUUID()));
      return typeId;
    });
    return this.getCustomType(run());
  }

  // Replaces the whole field list rather than diffing it — the builder UI
  // always submits its complete current field set, so there's no partial-
  // update case to reconcile.
  updateCustomType(id, { label, icon, color, fields }) {
    const run = this.db.transaction(() => {
      this.db.prepare(`UPDATE custom_types SET label = ?, icon = ?, color = ?, updated_at = datetime('now') WHERE id = ?`).run(label, icon, color, id);
      this.db.prepare(`DELETE FROM custom_type_fields WHERE custom_type_id = ?`).run(id);
      const insertField = this.db.prepare(`
        INSERT INTO custom_type_fields (custom_type_id, key, label, field_type, sort_order, sync_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      (fields || []).forEach((f, i) => insertField.run(id, f.key, f.label, f.field_type || "text", i, crypto.randomUUID()));
    });
    run();
    return this.getCustomType(id);
  }

  // Blocked while any item still uses this type — same "no orphaned/lossy
  // data" stance as Favourites' delete protection, just item-count-based
  // here instead of an is_default flag.
  deleteCustomType(id) {
    const { n } = this.db.prepare(`SELECT COUNT(*) AS n FROM media_items WHERE custom_type_id = ?`).get(id);
    if (n > 0) {
      return { success: false, error: `${n} item${n === 1 ? "" : "s"} still use this type — delete or re-type ${n === 1 ? "it" : "them"} first.` };
    }
    this.db.prepare(`DELETE FROM custom_types WHERE id = ?`).run(id); // custom_type_fields cascades
    return { success: true };
  }

  // ── Import ────────────────────────────────────────────────────────────────

  importItems(items) {
    const insert = this.db.prepare(`
      INSERT INTO media_items (
        title, media_type, status, is_local, rating,
        date_consumed, date_added, creator, genre, year,
        runtime, imdb_url, video_quality, series_name, series_order,
        network, season_count, narrator, platform, label, notes, platform_id, steam_url,
        player_count, play_time, complexity, bgg_url,
        country, language, cast_list, critic_rating, content_rating, trailer_url,
        writer, composer, studio, budget, box_office,
        publisher, themes, game_modes, player_perspective, game_engine, owned_platform,
        tags, edition_format, abridged, style, album_type, copyright, tracklist,
        artist, mechanics, min_age, condition, personal_notes,
        set_name, collector_number, rarity, type_line, power_toughness, format_legality, mana_cost,
        chapter_count, total_volumes, subscribers, video_count,
        system, recommended_level, site_name, url, episode_count, openlibrary_rating,
        cover_art_path, sync_id
      ) VALUES (
        @title, @media_type, @status, @is_local, @rating,
        @date_consumed, @date_added, @creator, @genre, @year,
        @runtime, @imdb_url, @video_quality, @series_name, @series_order,
        @network, @season_count, @narrator, @platform, @label, @notes, @platform_id, @steam_url,
        @player_count, @play_time, @complexity, @bgg_url,
        @country, @language, @cast_list, @critic_rating, @content_rating, @trailer_url,
        @writer, @composer, @studio, @budget, @box_office,
        @publisher, @themes, @game_modes, @player_perspective, @game_engine, @owned_platform,
        @tags, @edition_format, @abridged, @style, @album_type, @copyright, @tracklist,
        @artist, @mechanics, @min_age, @condition, @personal_notes,
        @set_name, @collector_number, @rarity, @type_line, @power_toughness, @format_legality, @mana_cost,
        @chapter_count, @total_volumes, @subscribers, @video_count,
        @system, @recommended_level, @site_name, @url, @episode_count, @openlibrary_rating,
        @cover_art_path, @sync_id
      )
    `);

    const run = this.db.transaction((rows) => {
      let imported = 0;
      let skipped  = 0;
      for (const row of rows) {
        if (!row.title) { skipped++; continue; }
        const existing = this.findDuplicate({
          title: row.title, media_type: row.media_type || "Movie",
          imdb_url: row.imdb_url, platform_id: row.platform_id, year: row.year,
        });
        if (existing) { skipped++; continue; }
        const result = insert.run({
          title:         row.title,
          media_type:    row.media_type    || "Movie",
          status:        row.status        || "wishlist",
          is_local:      row.is_local      ?? 0,
          rating:        row.rating        || null,
          date_consumed: row.date_consumed || null,
          date_added:    row.date_added    || new Date().toISOString().split("T")[0],
          creator:       row.creator       || null,
          genre:         row.genre         || null,
          year:          row.year          || null,
          runtime:       row.runtime       || null,
          imdb_url:      row.imdb_url      || null,
          video_quality: row.video_quality || null,
          series_name:   row.series_name   || null,
          series_order:  row.series_order  || null,
          network:       row.network       || null,
          season_count:  row.season_count  || null,
          narrator:      row.narrator      || null,
          platform:      row.platform      || null,
          label:         row.label         || null,
          notes:         row.notes         || null,
          platform_id:   row.platform_id   || null,
          steam_url:     row.steam_url     || null,
          player_count:  row.player_count  || null,
          play_time:     row.play_time     || null,
          complexity:    row.complexity    ?? null,
          bgg_url:       row.bgg_url       || null,
          country:       row.country       || null,
          language:      row.language      || null,
          cast_list:     row.cast_list     || null,
          critic_rating: row.critic_rating || null,
          content_rating: row.content_rating || null,
          trailer_url:   row.trailer_url   || null,
          writer:             row.writer             || null,
          composer:           row.composer           || null,
          studio:             row.studio             || null,
          budget:             row.budget             || null,
          box_office:         row.box_office         || null,
          publisher:          row.publisher          || null,
          themes:             row.themes             || null,
          game_modes:         row.game_modes         || null,
          player_perspective: row.player_perspective || null,
          game_engine:        row.game_engine        || null,
          owned_platform:     row.owned_platform     || null,
          tags:               row.tags               || null,
          edition_format:     row.edition_format     || null,
          abridged:           row.abridged ?? null,
          style:              row.style              || null,
          album_type:         row.album_type         || null,
          copyright:          row.copyright          || null,
          tracklist:          row.tracklist          || null,
          artist:             row.artist             || null,
          mechanics:          row.mechanics          || null,
          min_age:            row.min_age            || null,
          condition:          row.condition          || null,
          personal_notes:     row.personal_notes     || null,
          set_name:            row.set_name            || null,
          collector_number:    row.collector_number    || null,
          rarity:              row.rarity              || null,
          type_line:           row.type_line           || null,
          power_toughness:     row.power_toughness     || null,
          format_legality:     row.format_legality     || null,
          mana_cost:           row.mana_cost           || null,
          chapter_count:       row.chapter_count       || null,
          total_volumes:       row.total_volumes       || null,
          subscribers:         row.subscribers         || null,
          video_count:         row.video_count         || null,
          system:              row.system              || null,
          recommended_level:   row.recommended_level   || null,
          site_name:           row.site_name           || null,
          url:                 row.url                 || null,
          episode_count:       row.episode_count       || null,
          openlibrary_rating:  row.openlibrary_rating  ?? null,
          cover_art_path:      row.cover_art_path      || null,
          sync_id:             crypto.randomUUID(),
        });

        // Lists column — comma-separated names, find-or-create each and
        // link the newly-imported item. Malformed/empty entries are just
        // skipped rather than failing the whole row's import.
        if (row.lists) {
          const listIds = String(row.lists).split(",").map(n => n.trim()).filter(Boolean)
            .map(name => this._findOrCreateListId(name));
          for (const listId of listIds) {
            if (listId) this.addItemsToList(listId, [result.lastInsertRowid]);
          }
        }

        imported++;
      }
      return { imported, skipped };
    });

    return run(items);
  }

  // Real media_items column names, read from the schema itself so the
  // whitelist below can't drift out of sync with it. `id` is excluded —
  // callers never get to repoint a row's primary key.
  _mediaItemColumns() {
    if (!this._itemColumnSet) {
      const rows = this.db.prepare(`PRAGMA table_info(media_items)`).all();
      this._itemColumnSet = new Set(rows.map((r) => r.name).filter((name) => name !== "id"));
    }
    return this._itemColumnSet;
  }

  // Both patchNullFields and updateFields build their SET clause from
  // caller-supplied object keys. Without this check, a key that isn't a
  // real column (e.g. from an IPC call) gets interpolated straight into
  // the SQL string — field *names* can't be bound as parameters, so the
  // only safe option is rejecting anything not already a known column.
  _assertKnownColumns(fields) {
    const columns = this._mediaItemColumns();
    for (const key of Object.keys(fields)) {
      if (!columns.has(key)) {
        throw new Error(`Unknown media_items column: ${key}`);
      }
    }
  }

  // Patch only null fields — safe to call on freshly imported items without overwriting user edits
  patchNullFields(id, fields) {
    this._assertKnownColumns(fields);
    const entries = Object.entries(fields).filter(([_, v]) => v != null);
    if (!entries.length) return;
    const setClauses = entries.map(([k]) => `${k} = CASE WHEN ${k} IS NULL THEN ? ELSE ${k} END`).join(", ");
    const values = entries.map(([_, v]) => v);
    this.db.prepare(`UPDATE media_items SET ${setClauses} WHERE id = ?`).run(...values, id);
  }

  // Unconditional overwrite for explicitly-provided fields — unlike
  // patchNullFields, used when new data should replace what's there (e.g.
  // upgrading a stale OMDB id to a resolved TMDB one).
  updateFields(id, fields) {
    this._assertKnownColumns(fields);
    const entries = Object.entries(fields).filter(([_, v]) => v !== undefined);
    if (!entries.length) return;
    const setClauses = entries.map(([k]) => `${k} = ?`).join(", ");
    const values = entries.map(([_, v]) => v);
    this.db.prepare(`UPDATE media_items SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
  }

  getByPlatformId(platformId) {
    return this.db.prepare(`SELECT * FROM media_items WHERE platform_id = ?`).get(platformId) || null;
  }

  getItem(id) {
    const row = this.db.prepare(`SELECT * FROM media_items WHERE id = ?`).get(id);
    return row ? this._parseCustomFields(row) : null;
  }

  // Batched form of mapping ids -> cover_art_path, for bulk delete — one
  // query instead of one SELECT per id (exportItemsByIds uses the same
  // WHERE id IN (...) pattern for the same reason).
  getCoverArtPathsByIds(ids) {
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(",");
    return this.db.prepare(`SELECT cover_art_path FROM media_items WHERE id IN (${placeholders}) AND cover_art_path IS NOT NULL`)
      .all(...ids).map(r => r.cover_art_path);
  }

  // Id-based match first (immune to title spelling/formatting differences),
  // falling back to the old title+type match when no id is available —
  // e.g. a manually-typed entry, or a type without this id system.
  findDuplicate({ title, media_type, imdb_url, platform_id, year }) {
    if (imdb_url) {
      const m = String(imdb_url).match(/tt\d+/);
      if (m) {
        const row = this.db.prepare(`SELECT * FROM media_items WHERE imdb_url LIKE ?`).get(`%${m[0]}%`);
        if (row) return row;
      }
    }
    if (platform_id && media_type) {
      const row = this.db.prepare(`SELECT * FROM media_items WHERE platform_id = ? AND media_type = ?`).get(String(platform_id), media_type);
      if (row) return row;
    }
    // Bare-title fallback for manually-typed items. Requires a year match
    // too — a title alone collides on remakes/reboots (verified live: 2021
    // "Dune" matched an unrelated 1984 "Dune" on title alone).
    if (title && media_type) {
      // .all() + .find(), not .get() — a title+type collision can have more
      // than one row, and the first one SQLite returns might not match year.
      const rows = this.db.prepare(`SELECT * FROM media_items WHERE lower(title) = lower(?) AND media_type = ?`).all(title, media_type);
      const row = rows.find(r => year == null || r.year == null || r.year === year);
      if (row) return row;
    }
    return null;
  }

  markMetadataFetched(id) {
    this.db.prepare(`UPDATE media_items SET metadata_fetched = 1 WHERE id = ?`).run(id);
  }

  // ── Lists ────────────────────────────────────────────────────────────────

  getLists() {
    return this.db.prepare(`
      SELECT l.id, l.name, l.is_default, l.created_at,
             COUNT(li.item_id) AS item_count
      FROM lists l
      LEFT JOIN list_items li ON li.list_id = l.id
      GROUP BY l.id
      ORDER BY l.is_default DESC, l.name COLLATE NOCASE ASC
    `).all();
  }

  // Name uniqueness is enforced both here (a clean error before hitting the
  // DB) and by the UNIQUE COLLATE NOCASE column constraint as a backstop.
  createList(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) throw new Error("List name can't be empty.");
    const existing = this.db.prepare(`SELECT id FROM lists WHERE name = ? COLLATE NOCASE`).get(trimmed);
    if (existing) throw new Error(`A list named "${trimmed}" already exists.`);
    const result = this.db.prepare(`INSERT INTO lists (name, sync_id, updated_at) VALUES (?, ?, datetime('now'))`).run(trimmed, crypto.randomUUID());
    return this.db.prepare(`
      SELECT id, name, is_default, created_at, 0 AS item_count FROM lists WHERE id = ?
    `).get(result.lastInsertRowid);
  }

  deleteList(id) {
    const list = this.db.prepare(`SELECT * FROM lists WHERE id = ?`).get(id);
    if (!list) return { success: false, error: "List not found." };
    if (list.is_default) return { success: false, error: "Favourites can't be deleted." };
    // Tell the cloud too (a list that never synced has no sync_id to tell it).
    if (list.sync_id) {
      this.db.prepare(`INSERT OR REPLACE INTO list_tombstones (sync_id, name, deleted_at) VALUES (?, ?, datetime('now'))`).run(list.sync_id, list.name);
    }
    this.db.prepare(`DELETE FROM lists WHERE id = ?`).run(id);
    return { success: true };
  }

  // Cloud Sync bookkeeping for a list membership: adding it cancels a pending
  // removal notice, removing it queues one. A no-op for a row that never
  // synced (no sync_id on either side).
  _listItemSyncIds(listId, itemId) {
    return this.db.prepare(`
      SELECT l.sync_id AS list_sync_id, m.sync_id AS item_sync_id
      FROM lists l, media_items m WHERE l.id = ? AND m.id = ?
    `).get(listId, itemId);
  }

  _clearListItemTombstone(listId, itemId) {
    const ids = this._listItemSyncIds(listId, itemId);
    if (ids?.list_sync_id && ids?.item_sync_id) {
      this.db.prepare(`DELETE FROM list_item_tombstones WHERE list_sync_id = ? AND item_sync_id = ?`).run(ids.list_sync_id, ids.item_sync_id);
    }
  }

  _addListItemTombstone(listId, itemId) {
    const ids = this._listItemSyncIds(listId, itemId);
    if (ids?.list_sync_id && ids?.item_sync_id) {
      this.db.prepare(`INSERT OR REPLACE INTO list_item_tombstones (list_sync_id, item_sync_id, deleted_at) VALUES (?, ?, datetime('now'))`)
        .run(ids.list_sync_id, ids.item_sync_id);
    }
  }

  addItemsToList(listId, itemIds) {
    const stmt = this.db.prepare(`INSERT OR IGNORE INTO list_items (list_id, item_id) VALUES (?, ?)`);
    const run = this.db.transaction((ids) => {
      for (const itemId of ids) { stmt.run(listId, itemId); this._clearListItemTombstone(listId, itemId); }
    });
    run(itemIds);
    return { success: true };
  }

  removeItemFromList(listId, itemId) {
    const result = this.db.prepare(`DELETE FROM list_items WHERE list_id = ? AND item_id = ?`).run(listId, itemId);
    if (result.changes > 0) this._addListItemTombstone(listId, itemId);
    return { success: true };
  }

  // Toggles the item's membership in the Favourites list specifically —
  // the renderer never needs to know Favourites' id for the tile star button.
  toggleFavourite(itemId) {
    const fav = this.db.prepare(`SELECT id FROM lists WHERE is_default = 1`).get();
    if (!fav) return { success: false, error: "Favourites list is missing." };
    const existing = this.db.prepare(`SELECT 1 FROM list_items WHERE list_id = ? AND item_id = ?`).get(fav.id, itemId);
    if (existing) {
      this.db.prepare(`DELETE FROM list_items WHERE list_id = ? AND item_id = ?`).run(fav.id, itemId);
      this._addListItemTombstone(fav.id, itemId);
      return { success: true, favourited: false };
    }
    this.db.prepare(`INSERT INTO list_items (list_id, item_id) VALUES (?, ?)`).run(fav.id, itemId);
    this._clearListItemTombstone(fav.id, itemId);
    return { success: true, favourited: true };
  }
}

module.exports = VaultDatabase;
