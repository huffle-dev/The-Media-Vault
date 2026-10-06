-- Schema of a database at user_version 52: what database.js's _createSchema() produces for a fresh install,
-- written by scripts/make-schema-baseline.js when the upgrade chain was collapsed into this baseline.
-- Used by test/schemaParity.test.js to prove that this baseline plus every later upgrade step lands on exactly
-- the same schema as a fresh install. Do not regenerate it unless the chain is collapsed again.
CREATE TABLE cover_art_sources (
        path            TEXT PRIMARY KEY,
        url             TEXT NOT NULL
      );
CREATE TABLE custom_type_fields (
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
CREATE TABLE custom_types (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        label       TEXT NOT NULL UNIQUE COLLATE NOCASE,
        icon        TEXT NOT NULL,
        color       TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        sync_id     TEXT UNIQUE, -- Cloud Sync (V3) — see media_items.sync_id's comment
        deleted_at  TEXT
      );
CREATE TABLE discovery_dismissed (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        media_type    TEXT NOT NULL,
        tmdb_id       TEXT NOT NULL,
        title         TEXT,
        dismissed_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at    TEXT,
        UNIQUE (media_type, tmdb_id)
      );
CREATE TABLE item_tombstones (
        sync_id    TEXT PRIMARY KEY,
        deleted_at TEXT NOT NULL
      );
CREATE TABLE list_item_tombstones (
        list_sync_id TEXT NOT NULL,
        item_sync_id TEXT NOT NULL,
        deleted_at   TEXT NOT NULL,
        PRIMARY KEY (list_sync_id, item_sync_id)
      );
CREATE TABLE list_items (
        list_id     INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        item_id     INTEGER NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
        PRIMARY KEY (list_id, item_id)
      );
CREATE TABLE list_tombstones (
        sync_id    TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        deleted_at TEXT NOT NULL
      );
CREATE TABLE lists (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
        is_default  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        sync_id     TEXT UNIQUE, -- Cloud Sync (V3) — see media_items.sync_id's comment
        deleted_at  TEXT
      );
CREATE TABLE local_folders (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_path     TEXT NOT NULL UNIQUE,
        media_type      TEXT NOT NULL
                        CHECK (media_type IN ('Movie','TV','Book','Audiobook','Game','Music','Board Game','Graphic Novel','Web Video','Tabletop Game','Website','Podcast')),
        last_scanned_at TEXT,
        item_count      INTEGER DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
CREATE TABLE media_items (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        title           TEXT NOT NULL,
        media_type      TEXT NOT NULL
                        CHECK (media_type IN ('Movie','TV','Book','Audiobook','Game','Music','Board Game','Graphic Novel','Web Video','Tabletop Game','Website','Podcast','Custom')),
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
CREATE TABLE settings (
        key             TEXT PRIMARY KEY,
        value           TEXT NOT NULL
      );
CREATE INDEX idx_custom_type_fields_type ON custom_type_fields(custom_type_id);
CREATE INDEX idx_custom_type_id ON media_items(custom_type_id);
CREATE INDEX idx_date_added  ON media_items(date_added);
CREATE INDEX idx_is_local    ON media_items(is_local);
CREATE INDEX idx_list_items_item ON list_items(item_id);
CREATE INDEX idx_media_type  ON media_items(media_type);
CREATE INDEX idx_rating      ON media_items(rating);
CREATE INDEX idx_status      ON media_items(status);
CREATE INDEX idx_title       ON media_items(title COLLATE NOCASE);
PRAGMA user_version = 52;
