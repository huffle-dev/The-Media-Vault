import { useState, useEffect } from "react";
import { T, cleanIpcError } from "../tokens.js";
import { STATUS_COLOR_MAP, STATUS_LABEL_MAP } from "../components/PosterCard.jsx";
import { isYoutubeSubscriptions, mapYoutubeSubscriptionRow } from "@media-vault/core/youtubeSubscriptions";

const CloseBtn = ({ onClick }) => {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: h ? T.hoverWashStrong : "none", border: "none",
        color: h ? T.text : T.muted, cursor: "pointer", fontSize: 18,
        width: 28, height: 28, borderRadius: 4, display: "flex",
        alignItems: "center", justifyContent: "center",
        transition: "all 0.12s",
      }}
    >✕</button>
  );
};

const GhostBtn = ({ onClick, children, flex }) => {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        flex: flex || undefined, padding: "9px 16px",
        background: h ? T.hoverWash : "transparent",
        border: `1px solid ${h ? T.dim : T.border}`,
        color: h ? T.text : T.muted,
        borderRadius: 5, fontSize: 13, cursor: "pointer",
        fontFamily: T.fontSans, transition: "all 0.12s",
      }}
    >{children}</button>
  );
};

const PrimaryBtn = ({ onClick, children }) => {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        flex: 1, padding: "9px",
        background: T.accent, filter: h ? "brightness(0.88)" : "none",
        color: T.bg, border: "none", borderRadius: 5,
        fontSize: 13, fontWeight: 700, cursor: "pointer",
        fontFamily: T.fontSans, transition: "filter 0.12s",
      }}
    >{children}</button>
  );
};

const TileBtn = ({ onClick, icon, label, sub }) => {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        flex: 1, padding: "14px",
        background: h ? T.hoverSurface : T.surface2,
        border: `1px solid ${h ? T.dim : T.border}`,
        borderRadius: 7, color: T.text, cursor: "pointer",
        textAlign: "center", transition: "all 0.12s",
        transform: h ? "translateY(-1px)" : "none",
      }}
    >
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: T.fontSans, color: h ? T.text : T.dim }}>{label}</div>
      <div style={{ fontSize: 10, color: T.muted, fontFamily: T.fontMono, marginTop: 3 }}>{sub}</div>
    </button>
  );
};

const VALID_TYPES = ["Movie", "TV", "Book", "Audiobook", "Game", "Music"];

// Old exports/backups (pre-2026-09-17) still say the old internal values —
// translated on import so old files keep working without the user needing
// to touch them.
const LEGACY_MEDIA_TYPE_MAP = { Film: "Movie", "Trading Card Game": "MTG" };
const normalizeMediaType = (value) => LEGACY_MEDIA_TYPE_MAP[value] || value;

const HEADER_LABELS = {
  title: "Title", media_type: "Media Type", status: "Status",
  is_local: "Owned Locally", rating: "Rating", date_consumed: "Date Consumed",
  date_added: "Date Added", creator: "Creator", genre: "Genre", year: "Year",
  runtime: "Runtime", imdb_url: "IMDB URL", video_quality: "Video Quality",
  series_name: "Series Name", series_order: "Series Order", network: "Network",
  season_count: "Season Count", narrator: "Narrator", platform: "Platform",
  label: "Label", notes: "Notes",
};

const VAULT_FIELDS = [
  { label: "Ignore",          value: null },
  { label: "Title",           value: "title" },
  { label: "Media Type",      value: "media_type" },
  { label: "Status",          value: "status" },
  { label: "Rating",          value: "rating" },
  { label: "Year",            value: "year" },
  { label: "Creator",         value: "creator" },
  { label: "Genre",           value: "genre" },
  { label: "Notes",           value: "notes" },
  { label: "Runtime",         value: "runtime" },
  { label: "IMDB URL",        value: "imdb_url" },
  { label: "Video Quality",   value: "video_quality" },
  { label: "Series Name",     value: "series_name" },
  { label: "Series Order",    value: "series_order" },
  { label: "Network",         value: "network" },
  { label: "Season Count",    value: "season_count" },
  { label: "Narrator",        value: "narrator" },
  { label: "Platform",        value: "platform" },
  { label: "Label",           value: "label" },
  { label: "Date Consumed",   value: "date_consumed" },
  { label: "Owned Locally",   value: "is_local" },
  { label: "Date Added",      value: "date_added" },
  { label: "Platform ID",     value: "platform_id" },
  { label: "Steam URL",       value: "steam_url" },
  { label: "Player Count",    value: "player_count" },
  { label: "Play Time",       value: "play_time" },
  { label: "Complexity",      value: "complexity" },
  { label: "BGG URL",         value: "bgg_url" },
  { label: "Country",         value: "country" },
  { label: "Language",        value: "language" },
  { label: "Cast",            value: "cast_list" },
  { label: "Critic Rating",   value: "critic_rating" },
  { label: "Content Rating",  value: "content_rating" },
  { label: "Trailer URL",     value: "trailer_url" },
  { label: "Writer",          value: "writer" },
  { label: "Composer",        value: "composer" },
  { label: "Studio",          value: "studio" },
  { label: "Budget",          value: "budget" },
  { label: "Box Office",      value: "box_office" },
  { label: "Publisher",       value: "publisher" },
  { label: "Themes",          value: "themes" },
  { label: "Game Modes",      value: "game_modes" },
  { label: "Player Perspective", value: "player_perspective" },
  { label: "Game Engine",     value: "game_engine" },
  { label: "Tags",            value: "tags" },
  { label: "Edition Format",  value: "edition_format" },
  { label: "Abridged",        value: "abridged" },
  { label: "Style",           value: "style" },
  { label: "Album Type",      value: "album_type" },
  { label: "Copyright",       value: "copyright" },
  { label: "Artist",          value: "artist" },
  { label: "Mechanics",       value: "mechanics" },
  { label: "Min Age",         value: "min_age" },
  { label: "Personal Notes",  value: "personal_notes" },
  { label: "Set",              value: "set_name" },
  { label: "Collector Number", value: "collector_number" },
  { label: "Rarity",           value: "rarity" },
  { label: "Type Line",        value: "type_line" },
  { label: "Power/Toughness",  value: "power_toughness" },
  { label: "Format Legality",  value: "format_legality" },
  { label: "Subscribers",      value: "subscribers" },
  { label: "Video Count",      value: "video_count" },
  { label: "System",           value: "system" },
  { label: "Recommended Level", value: "recommended_level" },
  { label: "Site Name",        value: "site_name" },
  { label: "URL",              value: "url" },
  { label: "Episode Count",    value: "episode_count" },
  { label: "Lists",           value: "lists" },
];

// Full single-pass parse (not line-split-first) — splitting on raw "\n"
// before quote-handling, as a previous version of this did, breaks row
// alignment on any quoted field containing an embedded newline (real-world
// case: Libation's audiobook "Description" field carries actual paragraph
// markup). This also honors the standard ""-inside-quotes escape, which the
// old toggle-only approach silently dropped instead of keeping a literal ".
const parseCSVRows = (text) => {
  const input = text.trim();
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === ",") { row.push(field.trim()); field = ""; continue; }
    if (char === "\r") continue; // normalize CRLF
    if (char === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; continue; }
    field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field.trim()); rows.push(row); }
  return rows;
};

const parseCSV = (text) => {
  const rows = parseCSVRows(text);
  if (rows.length < 2) return { headers: [], rows: [] };
  const headers = rows[0];
  const dataRows = rows.slice(1).map(values =>
    Object.fromEntries(headers.map((h, i) => [h, values[i] || ""]))
  );
  return { headers, rows: dataRows };
};

const isIMDB = (headers) =>
  headers.includes("Const") && headers.includes("Title Type");

const isVaultExport = (headers) =>
  ["title", "media_type", "status", "is_local", "rating"].every(h =>
    headers.map(x => x.toLowerCase()).includes(h)
  );

const mapVaultRow = (row) => ({
  title:         row.title         || null,
  media_type:    normalizeMediaType(row.media_type) || "Movie",
  status:        row.status        || "wishlist",
  is_local:      row.is_local === "1" ? 1 : 0,
  rating:        row.rating        ? parseInt(row.rating, 10)        : null,
  date_consumed: row.date_consumed || null,
  date_added:    row.date_added    || null,
  creator:       row.creator       || null,
  genre:         row.genre         || null,
  year:          row.year          ? parseInt(row.year, 10)          : null,
  runtime:       row.runtime       ? parseInt(row.runtime, 10)       : null,
  imdb_url:      row.imdb_url      || null,
  video_quality: row.video_quality || null,
  series_name:   row.series_name   || null,
  series_order:  row.series_order  ? parseInt(row.series_order, 10) : null,
  network:       row.network       || null,
  season_count:  row.season_count  ? parseInt(row.season_count, 10) : null,
  narrator:      row.narrator      || null,
  platform:      row.platform      || null,
  label:         row.label         || null,
  notes:         row.notes         || null,
  // Relative "cover_art/<filename>" reference the app's own export writes —
  // resolved back to a real, copied-in file by items:import's handler.
  cover_art_path: row.cover_art_path || null,
});

const imdbRatingToStored = (imdbRating) => {
  // IMDB 1-10 → stored 1-21 (display -10 to +10)
  // IMDB 5 = neutral (0), IMDB 10 = +10, IMDB 1 = -8
  // Formula: stored = imdb * 2 + 1
  return imdbRating * 2 + 1;
};

const mapIMDBRow = (row) => {
  const rawType = (row["Title Type"] || "").trim().toLowerCase().replace(/\s+/g, "");
  const typeMap = {
    movie:            "Movie",
    tvmovie:          "Movie",
    short:            "Movie",
    video:            "Movie",
    tvseries:         "TV",
    tvminiseries:     "TV",
    tvshort:          "TV",
    tvepisode:        "TV",
    tvspecial:        "TV",
    "tv series":      "TV",
    "tv mini series": "TV",
    videogame:        "Game",
  };
  const mediaType = typeMap[rawType] || "Movie";
  const imdbRating = row["Your Rating"] ? parseInt(row["Your Rating"], 10) : null;
  const rating = imdbRating ? imdbRatingToStored(imdbRating) : null;
  // IMDB exports genre as "Genres" (plural), comma-separated — take the first
  const rawGenres = row["Genres"] || row["Genre"] || "";
  const genre = rawGenres.split(",")[0].trim() || null;
  // Build IMDB URL from Const column (e.g. tt1234567)
  const imdbId = row["Const"]?.trim();
  const imdb_url = imdbId ? `https://www.imdb.com/title/${imdbId}/` : null;
  // Runtime — IMDB exports as "103 min", strip non-numeric
  const runtimeRaw = row["Runtime (mins)"] || row["Runtime"] || "";
  const runtime = runtimeRaw ? parseInt(runtimeRaw, 10) || null : null;
  return {
    title:         row["Title"] || row["Original Title"],
    media_type:    mediaType,
    status:        rating ? "consumed" : "wishlist",
    rating,
    date_consumed: rating && row["Date Rated"] ? row["Date Rated"] : null,
    creator:       row["Directors"] || null,
    year:          row["Year"] ? parseInt(row["Year"], 10) : null,
    genre:         genre || null,
    imdb_url,
    runtime,
  };
};

// Libation's Description field carries real HTML markup (<p>, <i>, <b>) —
// duplicated here in plain JS since CSV parsing runs entirely in the
// renderer, not the main process.
const stripHtml = (str) =>
  str.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

// Libation (open-source Audible library manager) exports a "Library" sheet
// as .xlsx, so the user converts it to .csv first — this importer only reads
// .csv. Detected off a combination of columns unique to Libation's format.
const isLibation = (headers) =>
  headers.includes("Audible Product Id") && headers.includes("Authors") && headers.includes("Narrators");

// Every row in a Libation export is something the user owns — it's their
// actual Audible library, not a wishlist — so media_type/is_local are
// constants rather than mapped from any column.
const mapLibationRow = (row) => {
  // Categories are ";"-separated, but an individual category can itself
  // contain a comma — this app's genre field only understands comma-
  // separated lists, so taking every category could wrongly split one.
  // Taking just the first avoids that, at the cost of the others.
  const genre = (row["Categories"] || "").split(";")[0].trim() || null;
  const runtimeRaw = row["Length In Minutes"];
  const runtime = runtimeRaw ? parseInt(runtimeRaw, 10) || null : null;
  const seriesOrderRaw = row["Series Order"];
  const series_order = seriesOrderRaw ? parseInt(seriesOrderRaw, 10) || null : null;
  // Excel's own date formatting on CSV export is regional ("2020-04-07" vs
  // "4/7/2020") — a bare 4-digit-year regex reads correctly regardless of
  // format. date_added isn't extracted at all for the same reason, one
  // level worse: day and month are ambiguous with no way to tell which the
  // exporting spreadsheet app used, so a fixed-position guess could
  // silently swap them. Left unmapped; the item gets today's date instead.
  const yearMatch = (row["Date Published"] || "").match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
  const isAbridged = (row["Is Abridged?"] || "").trim().toLowerCase() === "true";
  const isFinished = (row["Is Finished?"] || "").trim().toLowerCase() === "true";
  // Audible Product Id (ASIN) becomes this item's platform_id, prefixed like
  // gog- ids so it can't collide with a bare-numeric Steam appid —
  // gives future re-imports a real id to de-duplicate against.
  const platform_id = row["Audible Product Id"] ? `audible-${row["Audible Product Id"]}` : null;
  // Audible's own aggregate community score — distinct from "My Rating:
  // Overall" (deliberately not mapped): already a clean 0-5 float, the
  // exact scale `openlibrary_rating` expects for Book/Audiobook.
  const communityRatingRaw = row["Community Rating: Overall"];
  const openlibrary_rating = communityRatingRaw !== "" && communityRatingRaw != null
    ? (parseFloat(communityRatingRaw) || null) : null;
  return {
    title:        row["Title"] || null,
    media_type:   "Audiobook",
    status:       isFinished ? "consumed" : "not-started",
    is_local:     1,
    platform_id,
    creator:      row["Authors"] || null,
    narrator:     row["Narrators"] || null,
    publisher:    row["Publisher"] || null,
    runtime,
    notes:        row["Description"] ? stripHtml(row["Description"]) : null,
    series_name:  row["Series Names"] || null,
    series_order,
    abridged:     isAbridged ? 1 : 0,
    language:     row["Language"] || null,
    tags:         row["My Libation Tags"] || null,
    genre,
    year,
    openlibrary_rating,
    // Not a real column — carried through to handleConfirm below, which
    // uses it to kick off cover-art enrichment after import. importItems()
    // only reads the columns it explicitly names, so this extra key is
    // simply ignored by the DB insert.
    _coverId: row["Cover Id"] || null,
  };
};

const TypeBadge = ({ type }) => {
  const colors = { Movie: "#e8b84b", TV: "#e8b84b", Book: "#e87a4b", Audiobook: "#a78bfa", Game: "#4be8c8", Music: "#f472b6" };
  const color = colors[type] || T.muted;
  return (
    <span style={{
      fontSize: 9, color, fontFamily: T.fontMono,
      letterSpacing: "0.04em", textTransform: "uppercase",
      border: `1px solid ${color}44`, borderRadius: 3, padding: "1px 5px",
    }}>{type}</span>
  );
};

const CONFIDENCE_COLORS = { high: T.seen, medium: "#e8b84b", low: "#e84b6e" };

// Title/type editing and the per-row include checkbox only make sense for
// sources that aren't already a trusted, exact match — CSV rows can have
// typos or guessed types; a Steam/GOG row's title and type came straight
// from that platform's data. Owned + status apply everywhere.
const PREVIEW_CAPS = {
  csv:   { editable: true,  selectable: true  },
  photo: { editable: true,  selectable: true  },
  steam: { editable: false, selectable: false },
  gog:   { editable: false, selectable: false },
};

const SmallChipBtn = ({ onClick, children }) => (
  <button onClick={onClick} style={{
    padding: "4px 10px", background: "transparent",
    border: `1px solid ${T.border}`, borderRadius: 4,
    color: T.muted, fontSize: 10, cursor: "pointer",
    fontFamily: T.fontMono, flexShrink: 0,
  }}>{children}</button>
);

// Bulk "set all rows to…" selectors — always controlled back to the empty
// placeholder value, so picking an option applies it once and the select
// resets rather than sticking (it's an action trigger, not a filter).
const SMALL_SELECT_STYLE = {
  padding: "4px 8px", background: "transparent",
  border: `1px solid ${T.border}`, borderRadius: 4,
  color: T.muted, fontSize: 10, cursor: "pointer",
  fontFamily: T.fontMono, flexShrink: 0,
};

// Chromium respects background-color/color set directly on <option> — used
// here so the dropdown matches the app's dark theme, with each status shown
// in its own status color.
const StatusOptions = () => (
  <>
    {Object.keys(STATUS_LABEL_MAP).map(s => (
      <option key={s} value={s} style={{ backgroundColor: T.bg, color: STATUS_COLOR_MAP[s] }}>
        {STATUS_LABEL_MAP[s]}
      </option>
    ))}
  </>
);

export default function ImportModal({ onComplete, onClose, onLocalLibrary, onAddManually, onOnlineSearch }) {
  const [step, setStep]         = useState("upload"); // upload | steam | gog | map | photo | preview
  const [origin, setOrigin]     = useState(null); // csv | steam | gog | photo — decides where "Back" from preview goes
  const [error, setError]       = useState(null);
  const [headers, setHeaders]   = useState([]);
  const [rawRows, setRawRows]   = useState([]);
  const [mapping, setMapping]   = useState({});
  const [mappedRows, setMappedRows] = useState([]);
  const [result, setResult]     = useState(null); // { imported, skipped }
  // Only set for the csv origin — lets handleConfirm resolve a row's
  // cover_art_path (a relative cover_art/<filename> reference) back to a
  // real file sitting next to this CSV, when re-importing the app's own
  // export zip.
  const [csvFilePath, setCsvFilePath] = useState(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const updatePreviewRow = (i, patch) => {
    setMappedRows(prev => prev.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  };

  // Photo scan state — scan results go straight into mappedRows/the preview
  // step (below) rather than their own separate editing screen.
  const [photoScanning, setPhotoScanning] = useState(false);

  // Map step's "Auto-map with AI". suggestedCols marks dropdowns the AI
  // filled, so they read as suggestions until the user changes them.
  const [mapSuggesting, setMapSuggesting] = useState(false);
  const [suggestedCols, setSuggestedCols] = useState(() => new Set());
  const [mapNote, setMapNote]             = useState(null);

  // Steam state
  const [steamId, setSteamId]           = useState("");
  const [steamKey, setSteamKey]         = useState("");
  const [steamCredSaved, setSteamCredSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      window.vault.settings.get("steam_id"),
      window.vault.settings.get("steam_api_key"),
    ]).then(([id, key]) => {
      if (id)  setSteamId(id);
      if (key) setSteamKey(key);
    });
  }, [step === "steam"]);
  const [steamFetching, setSteamFetching] = useState(false);
  const [steamImportMode, setSteamImportMode] = useState("both"); // owned | wishlist | both

  // GOG state
  const [gogConnected, setGogConnected]     = useState(false);
  const [gogUsername, setGogUsername]       = useState(null);
  const [gogLoggingIn, setGogLoggingIn]     = useState(false);
  const [gogFetching, setGogFetching]       = useState(false);
  const [gogImportMode, setGogImportMode]   = useState("both"); // owned | wishlist | both

  useEffect(() => {
    if (step !== "gog") return;
    window.vault.gog.isConnected().then(setGogConnected);
  }, [step]);

  const handleFileSelect = async (isIMDBMode) => {
    setError(null);
    const filePath = await window.vault.dialog.openCSV();
    if (!filePath) return;

    let text;
    try {
      text = await window.vault.files.readCSV(filePath);
    } catch (err) {
      setError("Could not read file.");
      return;
    }

    const { headers: h, rows: r } = parseCSV(text);
    if (h.length === 0 || r.length === 0) {
      setError("File is empty or could not be parsed.");
      return;
    }

    setHeaders(h);
    setRawRows(r);
    setCsvFilePath(filePath);

    if (isIMDB(h)) {
      const mapped = r.map(mapIMDBRow).filter(row => row.title && row.title.trim());
      setMappedRows(mapped);
      setOrigin("csv");
      setStep("preview");
      return;
    }

    if (isVaultExport(h)) {
      const mapped = r.map(mapVaultRow).filter(row => row.title);
      setMappedRows(mapped);
      setOrigin("csv");
      setStep("preview");
      return;
    }

    if (isYoutubeSubscriptions(h)) {
      const mapped = r.map(mapYoutubeSubscriptionRow).filter(row => row.title);
      setMappedRows(mapped);
      setOrigin("csv");
      setStep("preview");
      return;
    }

    if (isLibation(h)) {
      const mapped = r.map(mapLibationRow).filter(row => row.title);
      setMappedRows(mapped);
      setOrigin("csv");
      setStep("preview");
      return;
    }

    const initial = {};
    h.forEach(header => { initial[header] = null; });
    setMapping(initial);
    setSuggestedCols(new Set());
    setMapNote(null);
    setStep("map");
  };

  const handleSteamCredSave = async () => {
    await Promise.all([
      window.vault.settings.set("steam_id", steamId.trim()),
      window.vault.settings.set("steam_api_key", steamKey.trim()),
    ]);
    setSteamCredSaved(true);
    setTimeout(() => setSteamCredSaved(false), 2000);
  };

  const handleSteamFetch = async () => {
    if (!steamId.trim() || !steamKey.trim()) {
      setError("Both Steam ID and API key are required.");
      return;
    }
    setError(null);
    setSteamFetching(true);

    // Save credentials immediately regardless of fetch outcome
    await Promise.all([
      window.vault.settings.set("steam_id", steamId.trim()),
      window.vault.settings.set("steam_api_key", steamKey.trim()),
    ]);

    try {
      const { owned, wishlist, wishlistError } = await window.vault.steam.fetch({
        steamId:  steamId.trim(),
        apiKey:   steamKey.trim(),
      });

      let games = [];
      if (steamImportMode === "owned" || steamImportMode === "both") {
        games = games.concat(owned.map(g => ({
          title:       g.title,
          media_type:  "Game",
          status:      "in-progress",
          runtime:     g.playtime > 0 ? Math.round(g.playtime / 60) : null,
          is_local:    1,
          platform_id: String(g.appId),
          steam_url:   `https://store.steampowered.com/app/${g.appId}/`,
        })));
      }
      if (steamImportMode === "wishlist" || steamImportMode === "both") {
        if (wishlistError) {
          setError(wishlistError);
          if (steamImportMode === "wishlist") return;
        } else {
          // Avoid duplicates if game is in both owned and wishlist
          const ownedTitles = new Set(owned.map(g => g.title.toLowerCase()));
          const wishlistOnly = wishlist.filter(g => !ownedTitles.has(g.title.toLowerCase()));
          games = games.concat(wishlistOnly.map(g => ({
            title:       g.title,
            media_type:  "Game",
            status:      "wishlist",
            is_local:    0,
            platform_id: String(g.appId),
            steam_url:   `https://store.steampowered.com/app/${g.appId}/`,
          })));
        }
      }

      setMappedRows(games.filter(g => g.title));
      setOrigin("steam");
      setStep("preview");
    } catch (err) {
      setError(cleanIpcError(err) || "Failed to fetch Steam library.");
    } finally {
      setSteamFetching(false);
    }
  };

  const handleGogLogin = async () => {
    setError(null);
    setGogLoggingIn(true);
    try {
      const { username } = await window.vault.gog.login();
      setGogConnected(true);
      setGogUsername(username);
    } catch (err) {
      setError(cleanIpcError(err) || "GOG login didn't complete — try again.");
    } finally {
      setGogLoggingIn(false);
    }
  };

  const handleGogDisconnect = async () => {
    await window.vault.gog.disconnect();
    setGogConnected(false);
    setGogUsername(null);
  };

  const handleGogFetch = async () => {
    setError(null);
    setGogFetching(true);
    try {
      const { owned, wishlist, wishlistError } = await window.vault.gog.fetch();

      let games = [];
      if (gogImportMode === "owned" || gogImportMode === "both") {
        games = games.concat(owned.map(g => ({
          title:       g.title,
          media_type:  "Game",
          status:      "in-progress",
          is_local:    1,
          year:        g.year || null,
          // "gog-" prefix keeps these out of the Steam appid enrich pass.
          platform_id: `gog-${g.productId}`,
        })));
      }
      if (gogImportMode === "wishlist" || gogImportMode === "both") {
        if (wishlistError) {
          setError(wishlistError);
          if (gogImportMode === "wishlist") return;
        } else {
          const ownedTitles = new Set(owned.map(g => g.title.toLowerCase()));
          const wishlistOnly = wishlist.filter(g => !ownedTitles.has(g.title.toLowerCase()));
          games = games.concat(wishlistOnly.map(g => ({
            title:       g.title,
            media_type:  "Game",
            status:      "wishlist",
            is_local:    0,
            year:        g.year || null,
            platform_id: `gog-${g.productId}`,
          })));
        }
      }

      setMappedRows(games.filter(g => g.title));
      setOrigin("gog");
      setStep("preview");
    } catch (err) {
      setError(cleanIpcError(err) || "Failed to fetch GOG library.");
    } finally {
      setGogFetching(false);
    }
  };

  const handlePhotoSelect = async () => {
    setError(null);
    const filePath = await window.vault.dialog.openImage();
    if (!filePath) return;

    setPhotoScanning(true);
    setStep("photo");
    try {
      const found = await window.vault.photo.scanImage(filePath);
      const rows = (found || [])
        .filter(it => it.title && it.title.trim())
        .map(it => ({
          title:      it.title.trim(),
          media_type: VALID_TYPES.includes(normalizeMediaType(it.media_type)) ? normalizeMediaType(it.media_type) : "Movie",
          status:     "wishlist",
          is_local:   1, // a photo of your own shelf/collection — default to owned
          confidence: ["high", "medium", "low"].includes(it.confidence) ? it.confidence : "medium",
          selected:   true,
        }));
      if (rows.length === 0) {
        setError("No items were identified in that photo. Try a clearer or closer shot.");
        setStep("upload");
      } else {
        setMappedRows(rows);
        setOrigin("photo");
        setStep("preview");
      }
    } catch (err) {
      setError(cleanIpcError(err) || "Photo scan failed.");
      setStep("upload");
    } finally {
      setPhotoScanning(false);
    }
  };

  // Only sends header names + 3 sample rows (clamped again main-side), and
  // only fills columns still on Ignore — it never overrides a choice the user
  // already made, nor reuses a field they've already assigned.
  const handleAutoMap = async () => {
    setMapSuggesting(true);
    setError(null);
    setMapNote(null);
    try {
      const fields = VAULT_FIELDS.filter(f => f.value).map(f => ({ value: f.value, label: f.label }));
      const suggestion = await window.vault.csv.suggestMapping({ headers, rows: rawRows.slice(0, 3), fields });
      const takenFields = new Set(Object.values(mapping).filter(Boolean));
      const applied = {};
      for (const [col, field] of Object.entries(suggestion)) {
        if (!mapping[col] && !takenFields.has(field)) { applied[col] = field; takenFields.add(field); }
      }
      const count = Object.keys(applied).length;
      if (count === 0) {
        setMapNote("The AI couldn't match any more columns — map them by hand below.");
        return;
      }
      setMapping(prev => ({ ...prev, ...applied }));
      setSuggestedCols(new Set(Object.keys(applied)));
      setMapNote(`Suggested ${count} of ${headers.length} columns — review them before continuing.`);
    } catch (err) {
      setError(cleanIpcError(err) || "Auto-mapping failed.");
    } finally {
      setMapSuggesting(false);
    }
  };

  const handleMap = () => {
    if (!Object.values(mapping).includes("title")) {
      setError("You must map a column to Title before continuing.");
      return;
    }
    setError(null);

    const mapped = rawRows.map(row => {
      const out = {};
      for (const [csvCol, vaultField] of Object.entries(mapping)) {
        if (!vaultField) continue;
        const raw = row[csvCol];
        if (["rating", "year", "runtime", "season_count", "series_order", "play_time", "min_age", "video_count", "episode_count"].includes(vaultField)) {
          out[vaultField] = raw ? parseInt(raw, 10) || null : null;
        } else if (vaultField === "complexity") {
          out[vaultField] = raw ? parseFloat(raw) || null : null;
        } else if (vaultField === "is_local" || vaultField === "abridged") {
          out[vaultField] = raw === "1" || raw === "true" || raw === "yes" ? 1 : 0;
        } else {
          out[vaultField] = raw || null;
        }
      }
      return {
        title:         out.title        || null,
        media_type:    VALID_TYPES.find(t => t.toLowerCase() === normalizeMediaType(out.media_type || "").toLowerCase()) || "Movie",
        status:        out.status       || "wishlist",
        is_local:      out.is_local     ?? 0,
        rating:        out.rating       || null,
        date_consumed: out.date_consumed || null,
        date_added:    out.date_added   || null,
        creator:       out.creator      || null,
        genre:         out.genre        || null,
        year:          out.year         || null,
        runtime:       out.runtime      || null,
        imdb_url:      out.imdb_url     || null,
        video_quality: out.video_quality || null,
        series_name:   out.series_name  || null,
        series_order:  out.series_order || null,
        network:       out.network      || null,
        season_count:  out.season_count || null,
        narrator:      out.narrator     || null,
        platform:      out.platform     || null,
        label:         out.label        || null,
        notes:         out.notes        || null,
        platform_id:   out.platform_id  || null,
        steam_url:     out.steam_url    || null,
        player_count:  out.player_count || null,
        play_time:     out.play_time    || null,
        complexity:    out.complexity   ?? null,
        bgg_url:       out.bgg_url      || null,
        country:       out.country      || null,
        language:      out.language     || null,
        cast_list:     out.cast_list    || null,
        critic_rating: out.critic_rating || null,
        content_rating: out.content_rating || null,
        trailer_url:   out.trailer_url  || null,
        writer:             out.writer             || null,
        composer:           out.composer           || null,
        studio:             out.studio             || null,
        budget:             out.budget             || null,
        box_office:         out.box_office         || null,
        publisher:          out.publisher          || null,
        themes:             out.themes             || null,
        game_modes:         out.game_modes         || null,
        player_perspective: out.player_perspective || null,
        game_engine:        out.game_engine        || null,
        tags:               out.tags               || null,
        edition_format:     out.edition_format     || null,
        abridged:           out.abridged           ?? null,
        style:              out.style              || null,
        album_type:         out.album_type         || null,
        copyright:          out.copyright          || null,
        artist:             out.artist             || null,
        mechanics:          out.mechanics          || null,
        min_age:            out.min_age            || null,
        personal_notes:     out.personal_notes     || null,
        set_name:            out.set_name            || null,
        collector_number:    out.collector_number    || null,
        rarity:              out.rarity              || null,
        type_line:           out.type_line           || null,
        power_toughness:     out.power_toughness     || null,
        format_legality:     out.format_legality     || null,
        subscribers:         out.subscribers         || null,
        video_count:         out.video_count         || null,
        system:              out.system              || null,
        recommended_level:   out.recommended_level   || null,
        site_name:           out.site_name           || null,
        url:                 out.url                 || null,
        episode_count:       out.episode_count       || null,
        lists:         out.lists        || null,
        // Read directly off the raw CSV row, bypassing the column-mapping
        // system — only matters when the CSV has a column literally named
        // cover_art_path, which only the app's own export writes.
        cover_art_path: row.cover_art_path || null,
      };
    }).filter(row => row.title);

    setMappedRows(mapped);
    setOrigin("csv");
    setStep("preview");
  };

  const handleConfirm = async () => {
    try {
      // selected is only ever explicitly false for origins with the
      // checkbox (csv/photo) — rows without one (steam/gog) pass straight
      // through.
      const rowsToImport = mappedRows.filter(r => r.selected !== false);
      const res = await window.vault.items.import(rowsToImport, origin === "csv" ? csvFilePath : null);
      setResult({ ...res, rows: rowsToImport });

      // Kick off background enrichment for any Steam games — excludes
      // "gog-"-prefixed ids, which share media_type "Game" but
      // aren't Steam appids. (An "epic-" prefix is still skipped too: games
      // imported before the Epic integration was removed carry that id.)
      const steamIds = rowsToImport
        .filter(r => r.media_type === "Game" && r.platform_id && !String(r.platform_id).startsWith("gog-") && !String(r.platform_id).startsWith("epic-"))
        .map(r => r.platform_id);
      if (steamIds.length) window.vault.steam.enrich(steamIds);

      // Same idea for a Libation (Audible) CSV import — mapLibationRow
      // carries a real cover image id per row the bulk import step can't
      // use, so this fetches it in the background instead.
      const audibleCovers = rowsToImport
        .filter(r => r._coverId && r.platform_id)
        .map(r => ({ platform_id: r.platform_id, coverId: r._coverId }));
      if (audibleCovers.length) window.vault.audible.enrichCovers(audibleCovers);
    } catch (err) {
      setError("Import failed. Please try again.");
    }
  };

  const unrecognised = rawRows.length - mappedRows.length;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(5,5,10,0.88)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, width: 520, maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px", borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        }}>
          <div style={{ fontFamily: T.fontSerif, fontSize: 17, color: T.text }}>
            Import Media
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        {/* Body */}
        <div style={{ padding: "20px", flex: 1, overflowY: "auto" }}>

          {/* ── Upload step ── */}
          {step === "upload" && (
            <div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 20, lineHeight: 1.6 }}>
                Choose a CSV file to import. IMDB, Audible (via Libation) and YouTube subscriptions (Google Takeout) exports are auto-detected and mapped. For other CSVs you'll map columns manually.
              </div>
              <div style={{ display: "flex", marginBottom: 10 }}>
                <TileBtn onClick={onOnlineSearch} icon="⌕" label="Online Search" sub="Search TMDB, Steam & more" />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {/* IMDB/Audible(Libation)/Vault-export detection all funnel
                    through the same handleFileSelect — one entry point. */}
                <TileBtn onClick={() => handleFileSelect(false)} icon="📄" label="CSV Import" sub="IMDB, Audible & more" />
                <TileBtn onClick={() => { setError(null); setStep("steam"); }} icon="🎮" label="Steam" sub="Owned & wishlist" />
                <TileBtn onClick={() => { setError(null); setStep("gog"); }}   icon="🟣" label="GOG"   sub="Owned & wishlist" />
                <TileBtn onClick={onLocalLibrary}                icon="📁" label="Local Folder"  sub="Scan local files" />
                <TileBtn onClick={handlePhotoSelect}             icon="📷" label="Scan Photo"    sub="Identify items in an image" />
                <TileBtn onClick={onAddManually}                 icon="+"  label="Add Manually"  sub="Add a single item" />
              </div>
              {error && <div style={{ marginTop: 14, fontSize: 11, color: "#e84b6e", fontFamily: T.fontMono }}>{error}</div>}
            </div>
          )}

          {/* ── Photo step — just the scan-in-progress state; results land
              directly in the shared preview step below ── */}
          {step === "photo" && (
            <div style={{ textAlign: "center", padding: "30px 0", color: T.muted, fontSize: 12, fontFamily: T.fontMono }}>
              Scanning photo for items…
            </div>
          )}

          {/* ── Steam step ── */}
          {step === "steam" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                Enter your Steam ID and a free API key to import your library.
              </div>

              {/* Import mode */}
              <div style={{ display: "flex", gap: 8 }}>
                {[["both", "Owned + Wishlist"], ["owned", "Owned only"], ["wishlist", "Wishlist only"]].map(([val, label]) => (
                  <button key={val} onClick={() => setSteamImportMode(val)} style={{
                    flex: 1, padding: "7px 0",
                    background: steamImportMode === val ? T.accent + "22" : T.surface2,
                    border: `1px solid ${steamImportMode === val ? T.accent : T.border}`,
                    borderRadius: 5, color: steamImportMode === val ? T.accent : T.muted,
                    fontSize: 11, cursor: "pointer", fontFamily: T.fontSans,
                  }}>{label}</button>
                ))}
              </div>

              {/* Steam ID */}
              <div>
                <label style={{ fontSize: 9, color: T.muted, display: "block", marginBottom: 5, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Steam ID
                </label>
                <input
                  value={steamId}
                  onChange={e => setSteamId(e.target.value)}
                  placeholder="e.g. 76561198012345678"
                  style={{
                    width: "100%", padding: "7px 11px", boxSizing: "border-box",
                    background: T.surface2, border: `1px solid ${T.border}`,
                    borderRadius: 5, color: T.text, fontSize: 12, outline: "none",
                    fontFamily: T.fontSans,
                  }}
                />
                <div style={{ fontSize: 10, color: T.muted, marginTop: 6, lineHeight: 1.7, fontFamily: T.fontMono }}>
                  <div style={{ marginBottom: 2, color: T.dim }}>How to find your Steam ID:</div>
                  <div>1. Open Steam → click your name (top right) → <em>Account Details</em></div>
                  <div>2. Your SteamID64 is the 17-digit number shown on that page</div>
                </div>
              </div>

              {/* API Key */}
              <div>
                <label style={{ fontSize: 9, color: T.muted, display: "block", marginBottom: 5, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Steam API Key
                </label>
                <input
                  type="password"
                  value={steamKey}
                  onChange={e => setSteamKey(e.target.value)}
                  placeholder="Enter your Steam API key…"
                  style={{
                    width: "100%", padding: "7px 11px", boxSizing: "border-box",
                    background: T.surface2, border: `1px solid ${T.border}`,
                    borderRadius: 5, color: T.text, fontSize: 12, outline: "none",
                    fontFamily: T.fontSans,
                  }}
                />
                <div style={{ fontSize: 10, color: T.muted, marginTop: 4, fontFamily: T.fontMono }}>
                  Free key at{" "}
                  <span onClick={() => window.vault.shell.openExternal("https://steamcommunity.com/dev/apikey")}
                    style={{ color: T.accent, cursor: "pointer", textDecoration: "underline" }}>steamcommunity.com/dev/apikey ↗</span>
                  {" "}· Your Steam profile must be set to Public
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={handleSteamCredSave}
                  style={{
                    padding: "7px 16px",
                    background: steamCredSaved ? T.seen : T.hoverWashStrong,
                    border: `1px solid ${steamCredSaved ? T.seen : T.border}`,
                    borderRadius: 5, color: steamCredSaved ? T.bg : T.text,
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    fontFamily: T.fontSans, transition: "all 0.2s",
                  }}
                >{steamCredSaved ? "✓ Saved" : "Save credentials"}</button>
              </div>

              {error && (
                <div style={{ fontSize: 11, fontFamily: T.fontMono }}>
                  <div style={{ color: "#e84b6e", marginBottom: 6 }}>{error}</div>
                  {(error.toLowerCase().includes("public") || error.toLowerCase().includes("private") || error.toLowerCase().includes("no games")) && (
                    <div style={{
                      padding: "10px 12px", background: T.surface2,
                      border: `1px solid ${T.border}`, borderRadius: 6,
                      color: T.muted, lineHeight: 1.8, fontSize: 10,
                    }}>
                      <div style={{ color: T.dim, marginBottom: 4 }}>To make your profile public:</div>
                      <div>1. Open Steam → click your name → <em>View my profile</em></div>
                      <div>2. Click <em>Edit Profile</em> → <em>Privacy Settings</em></div>
                      <div>3. Set <em>My Profile</em> to <strong style={{ color: T.text }}>Public</strong></div>
                      <div>4. Set <em>Game details</em> to <strong style={{ color: T.text }}>Public</strong></div>
                      <div>5. Set <em>Wishlist</em> to <strong style={{ color: T.text }}>Public</strong></div>
                      <div style={{ marginTop: 4 }}>Then try fetching again.</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === "gog" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {!gogConnected ? (
                <>
                  <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                    Opens a login window showing GOG's real sign-in page — the app doesn't render or see anything you type, it just watches for you to finish logging in and picks up from there automatically.
                  </div>
                  <button
                    onClick={handleGogLogin}
                    disabled={gogLoggingIn}
                    style={{
                      padding: "9px", background: T.hoverWashStrong,
                      border: `1px solid ${T.border}`, borderRadius: 5,
                      color: T.text, fontSize: 12, fontWeight: 700,
                      cursor: gogLoggingIn ? "default" : "pointer",
                      fontFamily: T.fontSans,
                    }}
                  >{gogLoggingIn ? "Waiting for login…" : "↗ Log in with GOG"}</button>
                </>
              ) : (
                <>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: T.surface2, borderRadius: 6,
                    border: `1px solid ${T.border}`,
                  }}>
                    <span style={{ fontSize: 12, color: T.seen, fontFamily: T.fontMono }}>
                      ✓ Connected{gogUsername ? ` as ${gogUsername}` : ""}
                    </span>
                    <span onClick={handleGogDisconnect} style={{ fontSize: 11, color: T.muted, cursor: "pointer", fontFamily: T.fontMono, textDecoration: "underline" }}>
                      Disconnect
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    {[["both", "Owned + Wishlist"], ["owned", "Owned only"], ["wishlist", "Wishlist only"]].map(([val, label]) => (
                      <button key={val} onClick={() => setGogImportMode(val)} style={{
                        flex: 1, padding: "7px 0",
                        background: gogImportMode === val ? T.accent + "22" : T.surface2,
                        border: `1px solid ${gogImportMode === val ? T.accent : T.border}`,
                        borderRadius: 5, color: gogImportMode === val ? T.accent : T.muted,
                        fontSize: 11, cursor: "pointer", fontFamily: T.fontSans,
                      }}>{label}</button>
                    ))}
                  </div>
                </>
              )}
              {error && <div style={{ fontSize: 11, color: "#e84b6e", fontFamily: T.fontMono }}>{error}</div>}
            </div>
          )}

          {/* ── Map step ── */}
          {step === "map" && (
            <div>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 12, fontFamily: T.fontMono }}>
                {headers.length} columns detected · {rawRows.length} rows · Map each column below
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <button
                  onClick={handleAutoMap}
                  disabled={mapSuggesting}
                  style={{
                    padding: "6px 12px", background: T.accent + "22",
                    border: `1px solid ${T.accent}66`, borderRadius: 5,
                    color: T.accent, fontSize: 12, fontFamily: T.fontSans,
                    cursor: mapSuggesting ? "default" : "pointer", opacity: mapSuggesting ? 0.6 : 1,
                  }}
                >{mapSuggesting ? "Mapping…" : "Auto-map with AI"}</button>
                <span style={{ fontSize: 10, color: T.muted, fontFamily: T.fontMono, lineHeight: 1.5, flex: 1, minWidth: 180 }}>
                  Sends the column names and 3 sample rows to Google Gemini (needs a Gemini key in Settings). Nothing is imported until you review.
                </span>
              </div>
              {mapNote && <div style={{ marginBottom: 12, fontSize: 11, color: T.accent, fontFamily: T.fontMono }}>{mapNote}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {headers.map(h => (
                  <div key={h} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      flex: 1, fontSize: 11, color: T.text,
                      fontFamily: T.fontMono,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{HEADER_LABELS[h] || h}</span>
                    <select
                      value={mapping[h] ?? ""}
                      onChange={e => {
                        setMapping(prev => ({ ...prev, [h]: e.target.value || null }));
                        setSuggestedCols(prev => { const next = new Set(prev); next.delete(h); return next; });
                      }}
                      style={{
                        padding: "5px 8px", background: T.surface2,
                        border: `1px solid ${suggestedCols.has(h) ? T.accent + "88" : T.border}`, borderRadius: 4,
                        color: T.text, fontSize: 11, cursor: "pointer",
                        fontFamily: T.fontSans,
                      }}
                    >
                      {VAULT_FIELDS.map(f => (
                        <option key={f.label} value={f.value ?? ""}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {error && <div style={{ marginTop: 12, fontSize: 11, color: "#e84b6e", fontFamily: T.fontMono }}>{error}</div>}
            </div>
          )}

          {/* ── Preview step — shared by every import source; PREVIEW_CAPS
              controls which controls a given origin gets ── */}
          {step === "preview" && !result && (() => {
            const caps = PREVIEW_CAPS[origin] || { editable: false, selectable: false };
            const selectedCount = mappedRows.filter(r => r.selected !== false).length;
            return (
              <div>
                <div style={{
                  display: "flex", flexDirection: "column", gap: 8, marginBottom: 12,
                  padding: "10px 14px", background: T.surface2, borderRadius: 6,
                  border: `1px solid ${T.border}`, fontSize: 11, fontFamily: T.fontMono,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: T.seen }}>
                      {caps.selectable ? `${selectedCount} of ${mappedRows.length} selected` : `${mappedRows.length} to import`}
                    </span>
                    {unrecognised > 0 && <span style={{ color: T.muted }}>{unrecognised} unrecognised</span>}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {caps.selectable && (
                      <>
                        <SmallChipBtn onClick={() => setMappedRows(prev => prev.map(r => ({ ...r, selected: true })))}>Select all</SmallChipBtn>
                        <SmallChipBtn onClick={() => setMappedRows(prev => prev.map(r => ({ ...r, selected: false })))}>Deselect all</SmallChipBtn>
                      </>
                    )}
                    <SmallChipBtn onClick={() => setMappedRows(prev => prev.map(r => ({ ...r, is_local: 1 })))}>Mark all owned</SmallChipBtn>
                    <SmallChipBtn onClick={() => setMappedRows(prev => prev.map(r => ({ ...r, is_local: 0 })))}>Mark none owned</SmallChipBtn>
                    {caps.editable && (
                      <select
                        value=""
                        onChange={e => { if (e.target.value) setMappedRows(prev => prev.map(r => ({ ...r, media_type: e.target.value }))); }}
                        style={SMALL_SELECT_STYLE}
                      >
                        <option value="">Set type…</option>
                        {VALID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                    <select
                      value=""
                      onChange={e => { if (e.target.value) setMappedRows(prev => prev.map(r => ({ ...r, status: e.target.value }))); }}
                      style={SMALL_SELECT_STYLE}
                    >
                      <option value="" style={{ backgroundColor: T.bg, color: T.muted }}>Set status…</option>
                      <StatusOptions />
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>
                  {mappedRows.slice(0, previewExpanded ? mappedRows.length : 5).map((row, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 10px", background: T.surface2,
                      borderRadius: 5, border: `1px solid ${T.border}`,
                    }}>
                      {caps.selectable && (
                        <input
                          type="checkbox"
                          checked={row.selected !== false}
                          onChange={e => updatePreviewRow(i, { selected: e.target.checked })}
                        />
                      )}
                      {caps.editable ? (
                        <input
                          value={row.title}
                          onChange={e => updatePreviewRow(i, { title: e.target.value })}
                          style={{
                            flex: 1, padding: "5px 8px", background: T.surface,
                            border: `1px solid ${T.border}`, borderRadius: 4,
                            color: T.text, fontSize: 12, outline: "none",
                            fontFamily: T.fontSerif,
                          }}
                        />
                      ) : (
                        <span style={{ flex: 1, fontSize: 12, color: T.text, fontFamily: T.fontSerif, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.title}
                        </span>
                      )}
                      {caps.editable ? (
                        <select
                          value={row.media_type}
                          onChange={e => updatePreviewRow(i, { media_type: e.target.value })}
                          style={{
                            padding: "5px 6px", background: T.surface,
                            border: `1px solid ${T.border}`, borderRadius: 4,
                            color: T.text, fontSize: 11, cursor: "pointer",
                            fontFamily: T.fontSans, flexShrink: 0,
                          }}
                        >
                          {VALID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : (
                        <TypeBadge type={row.media_type} />
                      )}
                      <button
                        onClick={() => updatePreviewRow(i, { is_local: row.is_local ? 0 : 1 })}
                        title="Toggle whether you own this"
                        style={{
                          padding: "4px 9px", flexShrink: 0,
                          background: row.is_local ? T.accent + "22" : "transparent",
                          border: `1px solid ${row.is_local ? T.accent : T.border}`,
                          borderRadius: 4, cursor: "pointer",
                          color: row.is_local ? T.accent : T.muted,
                          fontSize: 10, fontWeight: row.is_local ? 600 : 400,
                          fontFamily: T.fontMono,
                        }}
                      >{row.is_local ? "✓ Owned" : "Owned?"}</button>
                      <select
                        value={row.status}
                        onChange={e => updatePreviewRow(i, { status: e.target.value })}
                        style={{
                          fontSize: 10, fontFamily: T.fontMono, cursor: "pointer",
                          background: "transparent", border: `1px solid ${T.border}`,
                          borderRadius: 4, padding: "2px 4px", flexShrink: 0,
                          color: STATUS_COLOR_MAP[row.status] || T.blue,
                        }}
                      >
                        <StatusOptions />
                      </select>
                      {row.confidence && (
                        <span style={{
                          fontSize: 9, color: CONFIDENCE_COLORS[row.confidence] || T.muted,
                          fontFamily: T.fontMono, letterSpacing: "0.04em",
                          textTransform: "uppercase", border: `1px solid ${(CONFIDENCE_COLORS[row.confidence] || T.muted)}44`,
                          borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                        }}>{row.confidence}</span>
                      )}
                    </div>
                  ))}
                  {mappedRows.length > 5 && (
                    <div
                      onClick={() => setPreviewExpanded(e => !e)}
                      style={{
                        fontSize: 10, color: T.accent, fontFamily: T.fontMono,
                        padding: "4px 10px", cursor: "pointer",
                      }}
                    >
                      {previewExpanded ? "Show less" : `+ ${mappedRows.length - 5} more…`}
                    </div>
                  )}
                </div>
                {error && <div style={{ marginTop: 12, fontSize: 11, color: "#e84b6e", fontFamily: T.fontMono }}>{error}</div>}
              </div>
            );
          })()}

          {/* ── Done ── */}
          {result && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <div style={{ fontFamily: T.fontSerif, fontSize: 18, color: T.text, marginBottom: 8 }}>
                Import complete
              </div>
              <div style={{ fontSize: 12, color: T.muted, fontFamily: T.fontMono, lineHeight: 1.8 }}>
                <span style={{ color: T.seen }}>{result.imported} items imported</span>
                {result.skipped > 0 && <> · <span style={{ color: T.muted }}>{result.skipped} duplicates skipped</span></>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 8, padding: "14px 20px",
          borderTop: `1px solid ${T.border}`, flexShrink: 0,
        }}>
          {step === "steam" && (
            <>
              <PrimaryBtn onClick={handleSteamFetch}>{steamFetching ? "Fetching…" : "Fetch Library"}</PrimaryBtn>
              <GhostBtn onClick={() => { setStep("upload"); setError(null); }}>Back</GhostBtn>
            </>
          )}
          {step === "gog" && gogConnected && (
            <>
              <PrimaryBtn onClick={handleGogFetch}>{gogFetching ? "Fetching…" : "Fetch Library"}</PrimaryBtn>
              <GhostBtn onClick={() => { setStep("upload"); setError(null); }}>Back</GhostBtn>
            </>
          )}
          {step === "gog" && !gogConnected && (
            <GhostBtn onClick={() => { setStep("upload"); setError(null); }} flex={1}>Back</GhostBtn>
          )}
          {step === "map" && (
            <>
              <PrimaryBtn onClick={handleMap}>Preview Import</PrimaryBtn>
              <GhostBtn onClick={() => { setStep("upload"); setError(null); }}>Back</GhostBtn>
            </>
          )}
          {step === "preview" && !result && (
            <>
              <PrimaryBtn onClick={handleConfirm}>Confirm Import</PrimaryBtn>
              <GhostBtn onClick={() => {
                setError(null);
                setPreviewExpanded(false);
                // photo has no re-enterable intermediate screen — back from
                // it goes to upload.
                if (origin === "steam") { setStep("steam"); return; }
                if (origin === "gog") { setStep("gog"); return; }
                if (origin === "csv" && rawRows.length > 0 && headers.length > 0 && !isVaultExport(headers)) { setStep("map"); return; }
                setStep("upload");
              }}>Back</GhostBtn>
            </>
          )}
          {(step === "upload" || result) && (
            result
              ? <PrimaryBtn onClick={() => onComplete(result?.rows)}>Done</PrimaryBtn>
              : <GhostBtn onClick={onClose} flex={1}>Cancel</GhostBtn>
          )}
        </div>
      </div>
    </div>
  );
}
