-- Schema of a database at user_version 25: what database.js's _createSchema() produced
-- just before the v26 migration was added (commit 1c5f693^, 2026-08-06). Used by
-- test/schemaParity.test.js to prove the migration chain from here lands on exactly
-- the same schema as a fresh install.
CREATE TABLE custom_type_fields (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        custom_type_id  INTEGER NOT NULL REFERENCES custom_types(id) ON DELETE CASCADE,
        key             TEXT NOT NULL,
        label           TEXT NOT NULL,
        field_type      TEXT NOT NULL DEFAULT 'text'
                        CHECK (field_type IN ('text','number','url','checkbox','date')),
        sort_order      INTEGER NOT NULL DEFAULT 0
      );
CREATE TABLE custom_types (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        label       TEXT NOT NULL UNIQUE COLLATE NOCASE,
        icon        TEXT NOT NULL,
        color       TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
CREATE TABLE documents (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        title                 TEXT NOT NULL,
        doc_type              TEXT NOT NULL,
        category              TEXT NOT NULL DEFAULT 'Other',
        issuer                TEXT,
        reference_number_enc  BLOB,
        issue_date            TEXT,
        expiry_date           TEXT,
        amount                REAL,
        currency              TEXT,
        file_path             TEXT,
        thumbnail_path        TEXT,
        tags                  TEXT,
        notes                 TEXT,
        date_added            TEXT NOT NULL DEFAULT (date('now')),
        created_at            TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
      );
CREATE TABLE list_items (
        list_id     INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        item_id     INTEGER NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
        PRIMARY KEY (list_id, item_id)
      );
CREATE TABLE lists (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
        is_default  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
CREATE TABLE local_folders (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_path     TEXT NOT NULL UNIQUE,
        media_type      TEXT NOT NULL
                        CHECK (media_type IN ('Film','TV','Book','Audiobook','Game','Music','Board Game','Trading Card Game','Graphic Novel','Web Video','Tabletop Game','Website','Podcast')),
        last_scanned_at TEXT,
        item_count      INTEGER DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
CREATE TABLE media_items (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        title           TEXT NOT NULL,
        media_type      TEXT NOT NULL
                        CHECK (media_type IN ('Film','TV','Book','Audiobook','Game','Music','Board Game','Trading Card Game','Graphic Novel','Web Video','Tabletop Game','Website','Podcast','Custom')),
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

        -- Board Game fields (added via migration if upgrading) — previously
        -- missing here entirely (see BACKLOG.md "Fresh-Install Schema
        -- Missing 4 Columns"), confirmed by a test that runs the full
        -- migration chain against a genuinely fresh database: the v16
        -- recreate's INSERT...SELECT reads these columns from the prior
        -- table, which never had them on a install that only ever ran
        -- _createSchema().
        player_count    TEXT,
        play_time       INTEGER,
        complexity      REAL,
        bgg_url         TEXT,

        -- Search-enrichment fields (Film/TV, added via migration if upgrading)
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
        -- it by whichever source actually has them. Film/TV via OMDB:
        imdb_rating             REAL,
        imdb_votes               INTEGER,
        rotten_tomatoes_rating   INTEGER,
        metacritic_rating        INTEGER,
        -- Film/TV via TMDB (no OMDB key, or a TMDB-sourced platform id):
        tmdb_rating              REAL,
        tmdb_votes               INTEGER,
        -- Board Game / Tabletop Game, from BGG's stats endpoint (bgg_rank is
        -- only ever shown for Board Game — Tabletop/RPG items aren't ranked
        -- in the same "Board Game Rank" category on BGG):
        bgg_rating               REAL,
        bgg_rating_count         INTEGER,
        bgg_rank                 INTEGER,
        -- Graphic Novel, from AniList:
        anilist_score            INTEGER,

        -- HowLongToBeat completion-time estimates (Game only, hours) — kept
        -- separate from runtime, which already means "hours you've actually
        -- played" (Steam-sourced). hltb_checked_date gates re-fetching, same
        -- pattern as metadata_checked_date/cover_art_checked_date above.
        hltb_main            REAL,
        hltb_main_extra      REAL,
        hltb_completionist   REAL,
        hltb_checked_date    TEXT,

        -- Item Profile fields (added via migration if upgrading) — mostly
        -- shared across whichever types actually use them (e.g. publisher
        -- spans Game/Book/Audiobook/Board Game) rather than one column per type.
        writer              TEXT, -- Film/TV
        composer            TEXT, -- Film/TV
        studio              TEXT, -- Film/TV
        budget              TEXT, -- Film — display string (e.g. OMDB's BoxOffice-style format), not a raw number
        box_office          TEXT, -- Film
        publisher           TEXT, -- Game/Book/Audiobook/Board Game
        themes              TEXT, -- Game
        game_modes          TEXT, -- Game
        player_perspective  TEXT, -- Game
        game_engine         TEXT, -- Game
        tags                TEXT, -- any type — comma-separated, same pattern as genre
        edition_format      TEXT, -- Audiobook
        abridged            INTEGER, -- Audiobook — 0/1, NULL = unknown
        style               TEXT, -- Music
        album_type          TEXT, -- Music
        copyright           TEXT, -- Music
        artist              TEXT, -- Board Game — distinct from creator (Designer)
        mechanics           TEXT, -- Board Game
        min_age             INTEGER, -- Board Game
        personal_notes      TEXT, -- distinct from notes (fetched synopsis/plot) — the Item Profile's own personal-notes panel

        -- New media types (Trading Card Game, Graphic Novel, Web Video,
        -- Tabletop Game, Website) — added via migration if upgrading.
        set_name            TEXT, -- Trading Card Game
        collector_number    TEXT, -- Trading Card Game
        rarity               TEXT, -- Trading Card Game
        type_line            TEXT, -- Trading Card Game
        power_toughness      TEXT, -- Trading Card Game
        format_legality      TEXT, -- Trading Card Game
        chapter_count        INTEGER, -- Graphic Novel — chapters in this volume
        total_volumes        INTEGER, -- Graphic Novel
        subscribers          TEXT, -- Web Video — display string (e.g. "560K"), not a raw number
        video_count          INTEGER, -- Web Video
        system               TEXT, -- Tabletop Game — e.g. "D&D 5e"
        recommended_level    TEXT, -- Tabletop Game
        site_name            TEXT, -- Website
        url                  TEXT, -- Website — the site's own URL, distinct from imdb_url/steam_url/bgg_url
        episode_count        INTEGER, -- Podcast (Host/Network/Category/Language/Avg Episode Length/Started
                                       -- all reuse creator/network/genre/language/runtime/year — no new columns needed for those)

        -- Custom media types — media_type is the literal string 'Custom' for
        -- every one of these (not the user's chosen name); custom_type_id
        -- disambiguates which one, and custom_fields (JSON) holds whatever
        -- fields that type's own definition calls for. This is the one part
        -- of the schema designed to never need another migration when a user
        -- defines a new type — see custom_types/custom_type_fields below.
        custom_type_id       INTEGER REFERENCES custom_types(id),
        custom_fields        TEXT, -- JSON object, e.g. {"pressing":"180g","vinyl_color":"Red"}

        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
CREATE TABLE settings (
        key             TEXT PRIMARY KEY,
        value           TEXT NOT NULL
      );
CREATE INDEX idx_custom_type_fields_type ON custom_type_fields(custom_type_id);
CREATE INDEX idx_custom_type_id ON media_items(custom_type_id);
CREATE INDEX idx_date_added  ON media_items(date_added);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_expiry   ON documents(expiry_date);
CREATE INDEX idx_documents_title    ON documents(title COLLATE NOCASE);
CREATE INDEX idx_is_local    ON media_items(is_local);
CREATE INDEX idx_list_items_item ON list_items(item_id);
CREATE INDEX idx_media_type  ON media_items(media_type);
CREATE INDEX idx_rating      ON media_items(rating);
CREATE INDEX idx_status      ON media_items(status);
CREATE INDEX idx_title       ON media_items(title COLLATE NOCASE);
PRAGMA user_version = 25;
