import { useState, useEffect, useRef, Fragment } from "react";
import { T, getEffectiveTypeConfig, TYPE_FIELDS, formatRating, ratingColor, ratingToDisplay, ratingToStored, parseCastList, parseTracklist, watchProvidersForRegion, watchLinkForRegion, STATUS_WHEEL_ORDER, cleanIpcError, applyFetchedPatch, launchAction, isSquareArt, isWideArt, webVideoKind, buildOwnedChangePatch, buildStatusChangePatch, isOwned } from "../tokens.js";
import { STATUS_COLOR_MAP, STATUS_LABEL_MAP } from "../components/PosterCard.jsx";
import AddToListMenu from "../components/AddToListMenu.jsx";
import { timeAgo } from "@media-vault/core/tokens/timeAgo.js";
import ArtImage from "../components/ArtImage.jsx";
import Description from "../components/Description.jsx";
import { bggSearch, bggDetails } from "../sync/bggApi.js";

// Real items are identified by their DB id; a previewed item (fetched
// details for something not yet saved) has none, so platform_id stands in —
// stable per source result, unlike comparing two undefined ids as equal.
const itemKey = (i) => i.id != null ? `db-${i.id}` : `preview-${i.platform_id || i.title}`;

const Chip = ({ children, color, style }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", lineHeight: 1,
    padding: "3px 9px", borderRadius: 100, fontSize: 10, fontWeight: 700,
    fontFamily: T.fontMono, letterSpacing: "0.04em", textTransform: "uppercase",
    background: color + "22", color, border: `1px solid ${color}44`,
    ...style,
  }}>{children}</span>
);

const GhostLink = ({ href, onClick, color, children }) => (
  <span
    onClick={onClick || (() => window.vault.shell.openExternal(href))}
    style={{
      padding: "5px 12px", border: `1px solid ${color ? color + "44" : T.border}`,
      color: color || T.muted, borderRadius: 5, fontSize: 11, cursor: "pointer",
      fontFamily: T.fontSans, whiteSpace: "nowrap",
    }}
  >{children}</span>
);

const Label = ({ children }) => (
  <span style={{ color: T.muted, fontFamily: T.fontMono, fontSize: 11 }}>{children}</span>
);

// Photo is hotlinked straight from TMDB's CDN rather than downloaded — it's
// supplementary metadata about an item already in the library, not the
// item's own art. Falls back to an initials circle on any failure.
const CastAvatar = ({ person, onSelect }) => {
  const [photoFailed, setPhotoFailed] = useState(false);
  const initials = person.name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const showPhoto = person.profile_path && !photoFailed;
  return (
    <div onClick={() => onSelect(person.name)} style={{ flexShrink: 0, width: 78, textAlign: "center", cursor: "pointer" }}>
      <div style={{
        width: 62, height: 62, margin: "0 auto 7px", borderRadius: "50%",
        background: T.surface2, border: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {showPhoto ? (
          <img
            src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
            alt=""
            onError={() => setPhotoFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontFamily: T.fontSerif, fontSize: 17, color: T.accent }}>{initials}</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: T.text, lineHeight: 1.3 }}>{person.name}</div>
      {person.character && (
        <div style={{ fontSize: 10, color: T.muted, fontFamily: T.fontMono }}>{person.character}</div>
      )}
    </div>
  );
};

const CastRow = ({ cast, onSelectPerson }) => {
  if (!cast.length) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 12, color: T.accent, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Cast</div>
      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
        {cast.map((p, i) => <CastAvatar key={i} person={p} onSelect={onSelectPerson} />)}
      </div>
    </div>
  );
};

// One tile for "More From Creator" — either an in-library item (real cover
// art, personal rating, clickable to that item's profile) or an external
// not-yet-added TMDB result (hotlinked poster, TMDB's own 0–10 rating shown
// distinctly from the app's −10..+10 personal scale, dimmed). External
// tiles have two independent actions: clicking the tile saves it and jumps
// to its new profile; the "+" overlay saves it and stays on this page.
// square: Music album art (1:1) — everything else stays the default
// portrait 2:3 poster box.
const CreatorWorkTile = ({ title, year, role, posterUrl, icon, ratingLabel, ratingColor: ratingColorValue, genre, dimmed, loading, onClick, onQuickAdd, square }) => (
  <div style={{ flexShrink: 0, width: 110, cursor: loading ? "default" : onClick ? "pointer" : "default" }} onClick={loading ? undefined : onClick}>
    <div style={{
      position: "relative", width: 110, height: square ? 110 : 165, borderRadius: 6, overflow: "hidden",
      background: T.surface2, border: `1px solid ${loading ? T.accent : T.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      opacity: loading ? 0.85 : dimmed ? 0.55 : 1,
      transition: "border-color 0.15s",
    }}>
      {posterUrl
        ? <img src={posterUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: 30, opacity: 0.35 }}>{icon}</span>
      }
      {loading ? (
        <span style={{
          position: "absolute", bottom: 5, right: 5, width: 20, height: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: T.accent,
          background: "rgba(0,0,0,0.65)", border: `1px solid ${T.accent}66`, borderRadius: 4,
        }}>···</span>
      ) : onQuickAdd && (
        <span
          onClick={e => { e.stopPropagation(); onQuickAdd(); }}
          title="Add to your library"
          style={{
            position: "absolute", bottom: 5, right: 5, width: 20, height: 20,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: T.accent, cursor: "pointer",
            background: "rgba(0,0,0,0.65)", border: `1px solid ${T.accent}66`, borderRadius: 4,
          }}
        >+</span>
      )}
    </div>
    <div style={{ marginTop: 6, opacity: dimmed ? 0.75 : 1 }}>
      <div style={{
        fontSize: 11.5, color: T.text, lineHeight: 1.3, fontFamily: T.fontSans,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{title}</div>
      <div style={{ fontSize: 10, color: T.muted, fontFamily: T.fontMono, marginTop: 2 }}>
        {[year, role].filter(Boolean).join(" · ")}
      </div>
      {(ratingLabel || genre) && (
        <div style={{ fontSize: 10, color: T.dim, fontFamily: T.fontMono, marginTop: 1 }}>
          {ratingLabel && <span style={{ color: ratingColorValue }}>{ratingLabel}</span>}
          {ratingLabel && genre && " · "}
          {genre}
        </div>
      )}
    </div>
  </div>
);

// Placeholder shown in the "Similar To" / "More from ..." strips while their
// external lookups are still running (IGDB is throttled; TMDB/Open Library/
// Discogs are all remote). Matches CreatorWorkTile's exact dimensions so
// the strip doesn't jump when real tiles replace it.
const SkeletonWorkTile = ({ square }) => (
  <div style={{ flexShrink: 0, width: 110 }} aria-hidden="true">
    <div className="skel-pulse" style={{
      width: 110, height: square ? 110 : 165, borderRadius: 6,
      background: T.surface2, border: `1px solid ${T.border}`,
    }} />
    <div className="skel-pulse" style={{ height: 9, width: "85%", borderRadius: 3, marginTop: 10, background: T.surface2 }} />
    <div className="skel-pulse" style={{ height: 8, width: "50%", borderRadius: 3, marginTop: 6, background: T.surface2 }} />
  </div>
);

// Sums a Music tracklist's per-track "M:SS" durations into a single
// "M:SS"/"H:MM:SS" total — the exact seconds-precision figure the key-facts
// line wants, distinct from the Details grid's Total Duration field, which
// stores whole minutes. Null (not "0:00") if no track has a parseable
// duration.
const sumTrackDuration = (tracks) => {
  let totalSeconds = 0;
  let any = false;
  for (const t of tracks) {
    const m = /^(\d+):(\d{2})$/.exec(String(t?.duration || "").trim());
    if (!m) continue;
    totalSeconds += Number(m[1]) * 60 + Number(m[2]);
    any = true;
  }
  if (!any) return null;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};

// Type-specific "key facts" line under the title — the one place worth
// hand-picking fields rather than dumping the whole Details grid, since
// what's most identifying differs by type.
const keyFacts = (item) => {
  const parts = [];
  switch (item.media_type) {
    case "Movie":
      if (item.year) parts.push(item.year);
      if (item.creator) parts.push(item.creator);
      if (item.runtime) parts.push(`${item.runtime} min`);
      break;
    case "TV":
      if (item.year) parts.push(item.year);
      if (item.creator) parts.push(item.creator);
      if (item.season_count) parts.push(`${item.season_count} season${item.season_count === 1 ? "" : "s"}`);
      break;
    case "Game":
      if (item.creator) parts.push(item.creator);
      if (item.year) parts.push(item.year);
      if (item.runtime) parts.push(`~${item.runtime}h avg`);
      break;
    case "Book":
      if (item.creator) parts.push(item.creator);
      if (item.year) parts.push(item.year);
      if (item.runtime) parts.push(`${item.runtime} pages`);
      break;
    case "Audiobook":
      if (item.creator) parts.push(item.creator);
      if (item.narrator) parts.push(`narr. ${item.narrator}`);
      if (item.runtime) parts.push(`${item.runtime} min`);
      break;
    case "Music": {
      if (item.year) parts.push(item.year);
      if (item.creator) parts.push(item.creator);
      const musicTracks = parseTracklist(item.tracklist);
      if (musicTracks.length) parts.push(`${musicTracks.length} track${musicTracks.length === 1 ? "" : "s"}`);
      const totalDuration = sumTrackDuration(musicTracks);
      if (totalDuration) parts.push(totalDuration);
      break;
    }
    case "Board Game":
      if (item.creator) parts.push(item.creator);
      if (item.player_count) parts.push(`${item.player_count} players`);
      if (item.play_time) parts.push(`${item.play_time} min`);
      break;
    default:
      if (item.creator) parts.push(item.creator);
      if (item.year) parts.push(item.year);
  }
  return parts.join(" · ");
};

// No "source" column is stored anywhere — most types have exactly one
// metadata source, so it's derivable from media_type alone; Film/TV needs
// the tt\d+ id-shape check to tell a TMDB-sourced item from an OMDB-sourced
// one, and Book/Audiobook needs the audible- prefix check to tell a
// Libation import from a plain Open-Library-sourced one. Null for a
// manually-typed item with no platform_id.
const sourceLabel = (item) => {
  if (!item.platform_id) return null;
  switch (item.media_type) {
    case "Movie": case "TV": return /^tt\d+$/.test(item.platform_id) ? "OMDB" : "TMDB";
    case "Book": case "Audiobook": return item.platform_id.startsWith("audible-") ? "Audible (via Libation)" : "Open Library";
    case "Music": return "Discogs";
    case "Board Game": return "BoardGameGeek";
    case "Web Video": return "YouTube";
    case "Podcast": return "Apple Podcasts";
    case "Game": return "Steam";
    case "Website": return "Open Graph";
    default: return null;
  }
};

// External links vary by type — only render the ones that actually apply
// and that the item actually has a value for.
const ExternalLinks = ({ item }) => {
  const links = [];
  if ((item.media_type === "Movie" || item.media_type === "TV") && item.imdb_url) {
    links.push({ key: "imdb", label: "↗ IMDB", href: item.imdb_url, color: T.accent });
  }
  if ((item.media_type === "Movie" || item.media_type === "TV") && item.trailer_url) {
    links.push({ key: "trailer", label: "▶ Trailer", href: item.trailer_url, color: "#f472b6" });
  }
  if (item.media_type === "Game" && item.steam_url) {
    links.push({ key: "steam", label: "↗ Steam", href: item.steam_url, color: "#4be8c8" });
  }
  if (item.media_type === "Game" && item.igdb_url) {
    links.push({ key: "igdb", label: "↗ IGDB", href: item.igdb_url, color: "#9147ff" });
  }
  // launchAction() picks Steam vs GOG — onClick here (not href) so it goes
  // through the dedicated steam:launch/gog:launch IPC handlers rather than
  // shell:openExternal, which only allows http/https.
  const launch = launchAction(item);
  if (launch) {
    links.push({ key: "launch", label: "▶ Launch", onClick: launch, color: "#4be8c8" });
  }
  // Web Video: the stored URL (channel, video or playlist page); older
  // channel items saved before URLs were stored only have the channel id.
  if (item.media_type === "Web Video") {
    const href = item.url || (item.platform_id && !/^(video|playlist)-/.test(item.platform_id) ? `https://www.youtube.com/channel/${item.platform_id}` : null);
    if (href) links.push({ key: "youtube", label: "▶ YouTube", href, color: "#f87171" });
  }
  if (item.media_type === "Board Game" && item.bgg_url) {
    links.push({ key: "bgg", label: "↗ BGG", href: item.bgg_url, color: "#e84b4b" });
  }
  // platform_id is an Open Library work id (OL<digits>W) for a plain Open-
  // Library-sourced Book/Audiobook, but the Audible ASIN (audible-<id>) for
  // one imported via Libation — branch on the id's actual shape.
  if ((item.media_type === "Book" || item.media_type === "Audiobook") && item.platform_id) {
    if (item.platform_id.startsWith("audible-")) {
      links.push({ key: "audible", label: "↗ Audible", href: `https://www.audible.com/pd/${item.platform_id.slice("audible-".length)}`, color: "#f59e0b" });
    } else {
      links.push({ key: "openlibrary", label: "↗ Open Library", href: `https://openlibrary.org/works/${item.platform_id}`, color: T.accent });
    }
  }
  // Real (not just linked-out) Internet Archive availability. Archive.org's
  // own page shows either a "Borrow" or "Read" button, so the label here
  // stays generic rather than guessing which.
  if ((item.media_type === "Book" || item.media_type === "Audiobook") && item.ebook_url) {
    links.push({ key: "ebook", label: "↗ Read on Archive.org", href: item.ebook_url, color: "#4be8c8" });
  }
  if (item.media_type === "Website" && item.url) {
    links.push({ key: "visit", label: "↗ Visit Site", href: item.url, color: T.accent });
  }
  if (item.media_type === "Music") {
    // Spotify has no stored link — this is a plain catalog search, not a
    // verified exact match (Spotify would need its own API credentials).
    // Always shown for Music since it needs no data beyond title/creator.
    if (item.title) {
      const query = encodeURIComponent(item.creator ? `${item.creator} ${item.title}` : item.title);
      links.push({ key: "spotify", label: "↗ Spotify", href: `https://open.spotify.com/search/${query}`, color: "#1ed760" });
    }
    if (item.discogs_url) {
      links.push({ key: "discogs", label: "↗ Discogs", href: item.discogs_url, color: "#f472b6" });
    }
  }
  if (item.media_type === "Podcast") {
    if (item.podcast_url) {
      links.push({ key: "podcast", label: "↗ Apple Podcasts", href: item.podcast_url, color: "#fda4af" });
    }
    // Same plain-search-link approach as Music's Spotify button — no stored
    // field, no API key, just opens a real search since Spotify also hosts
    // most major podcasts.
    if (item.title) {
      const query = encodeURIComponent(item.creator ? `${item.creator} ${item.title}` : item.title);
      links.push({ key: "spotify", label: "↗ Spotify", href: `https://open.spotify.com/search/${query}`, color: "#1ed760" });
    }
  }
  if (!links.length) return null;
  return links.map(l => <GhostLink key={l.key} href={l.href} onClick={l.onClick} color={l.color}>{l.label}</GhostLink>);
};

// Hero stats row — a single external-rating stat block (IMDb, Rotten
// Tomatoes, Metacritic, TMDB, BGG Rating, AniList Score, ...). Smaller and
// mono, distinct from "Your rating"'s big serif number, since these are
// secondary/reference stats.
const RatingStat = ({ label, value, suffix, subLine }) => (
  <div>
    <div style={{ fontSize: 9, color: T.muted, marginBottom: 2, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    <div style={{ fontFamily: T.fontMono, fontSize: 14, color: T.text }}>
      {value}{suffix && <span style={{ color: T.muted, fontSize: 10.5 }}>{suffix}</span>}
    </div>
    {subLine && <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.muted, marginTop: 1 }}>{subLine}</div>}
  </div>
);

const StatDivider = () => <div style={{ width: 1, height: 34, background: T.border, flexShrink: 0 }} />;

// Games only — runtime is repurposed as hours-played for this type
// (minutes elsewhere) and only ever populated by Steam sync; GOG/Epic-
// imported games won't show this card until a value is set.
const PlaytimeCard = ({ item }) => {
  if (item.media_type !== "Game" || !item.runtime) return null;
  return (
    <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ fontSize: 9, color: T.muted, marginBottom: 8, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Playtime</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontSize: 22, color: T.text, fontFamily: T.fontSerif }}>{item.runtime}</span>
        <span style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>hour{item.runtime === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
};

// HowLongToBeat estimates — distinct from Playtime above (hours you've
// actually played); these are crowd-sourced averages of how long other
// people took. Shows only whichever stats HLTB actually returned.
const TimeToBeatCard = ({ item }) => {
  if (item.media_type !== "Game") return null;
  const stats = [
    ["Main Story", item.hltb_main],
    ["Main + Extra", item.hltb_main_extra],
    ["Completionist", item.hltb_completionist],
  ].filter(([, hours]) => hours != null);
  if (!stats.length) return null;

  const fmt = (h) => `${h % 1 === 0 ? h : h.toFixed(1)}h`;

  return (
    <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ fontSize: 9, color: T.muted, marginBottom: 10, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Time to Beat</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12 }}>
        {stats.map(([label, hours]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: T.muted, fontFamily: T.fontSans }}>{label}</span>
            <span style={{ color: T.text, fontFamily: T.fontMono }}>{fmt(hours)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// TMDB-only, Film/TV only — same scope as the TopBar Where to Watch filter.
// Reads live off the cached all-countries watch_providers blob for the
// currently selected region, so it always agrees with that filter rather
// than the item's own watch_flatrate/rent/buy columns.
const WATCH_TYPE_LABELS = { flatrate: "Stream", rent: "Rent", buy: "Buy", free: "Free" };
const WhereToWatchCard = ({ item, region, onRefresh, refreshing }) => {
  if (item.media_type !== "Movie" && item.media_type !== "TV") return null;
  const buckets = ["flatrate", "rent", "buy", "free"]
    .map(type => ({ type, providers: watchProvidersForRegion(item, region, type) }))
    .filter(b => b.providers.length > 0);
  // Rendered even when a title has no streaming/rent/buy options — with an
  // explicit empty state, rather than disappearing (indistinguishable from
  // the check having silently failed).
  const hasChecked = item.watch_checked_date != null;
  // One link for the whole region, not per-provider — TMDB's watch/
  // providers response doesn't return a per-provider deep link, only this
  // single region-level JustWatch-style page. Older items checked before
  // this was cached won't have one yet — the ↻ button forces a fresh check.
  const link = watchLinkForRegion(item, region);
  return (
    <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span
          onClick={link ? () => window.vault.shell.openExternal(link) : undefined}
          title={link ? "View streaming options on TMDB" : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            fontSize: 9, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em",
            color: link ? T.accent : T.muted,
            cursor: link ? "pointer" : "default",
          }}
        >
          Where to Watch{region ? ` · ${region}` : ""}
          {link && <span style={{ fontSize: 10 }}>↗</span>}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            onClick={refreshing ? undefined : onRefresh}
            title="Re-check Where to Watch now"
            style={{
              fontSize: 10, fontFamily: T.fontMono,
              color: refreshing ? T.muted : T.accent,
              cursor: refreshing ? "default" : "pointer",
            }}
          >{refreshing ? "…" : "↻"}</span>
        </div>
      </div>
      {buckets.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {buckets.map(b => (
            <div key={b.type}>
              <div style={{ fontSize: 9, color: T.dim, marginBottom: 4, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {WATCH_TYPE_LABELS[b.type]}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {b.providers.map(p => (
                  <span key={p} style={{ padding: "3px 9px", borderRadius: 100, background: T.surface, color: T.text, border: `1px solid ${T.border}`, fontSize: 11 }}>{p}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>
          {refreshing ? "Checking…" : hasChecked ? `Not available to stream, rent, or buy in ${region || "your region"}.` : "Not checked yet — click ↻."}
        </div>
      )}
    </div>
  );
};

export default function ItemProfile({
  item, items, lists, favouritesListId, watchRegion, editSavedAt,
  onBack, backLabel = "Back to Library", onBackToLibrary, onEdit, onDeleteRequest, onQuickSave,
  onToggleFavourite, onToggleHidden, onSelectItem, onFilterByPerson,
  onAddItemToList, onCreateList, onDeleteList, onQuickAdd, onPreviewItem, onItemSaved, customTypes = [],
}) {
  const [localItem, setLocalItem] = useState(item);
  const [resyncing, setResyncing] = useState(false);
  const [resyncError, setResyncError] = useState(null);
  // Snapshot of whichever fields the most recent Force Resync overwrote,
  // captured just before saveField(patch) — lets a wrong match be reverted
  // in one click. Cleared whenever a new resync starts or the profile
  // navigates to a different item.
  const [resyncUndo, setResyncUndo] = useState(null);
  const lastEditSavedAt = useRef(editSavedAt);
  // This component never remounts between items — navigating via a tile
  // click just swaps localItem in place — so the scroll position from the
  // previous item's page would otherwise carry straight over.
  const scrollContainerRef = useRef(null);
  useEffect(() => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [itemKey(localItem)]);
  // A previewed item's cover art is downloaded eagerly, same as any other
  // fetched metadata, but only actually attached to a saved row once
  // commitToLibrary succeeds. Abandoning a preview without saving would
  // otherwise leave that file on disk forever; deleteIfUnused no-ops if it
  // did get saved in the meantime.
  useEffect(() => {
    return () => {
      if (localItem.id == null && localItem.cover_art_path) {
        window.vault.coverArt.deleteIfUnused(localItem.cover_art_path).catch(() => {});
      }
    };
  }, [itemKey(localItem)]);
  if (itemKey(item) !== itemKey(localItem)) {
    // Navigated to a different item.
    setLocalItem(item);
    setResyncUndo(null);
    setResyncError(null);
  } else if (editSavedAt !== lastEditSavedAt.current) {
    // The Edit modal just saved changes to this same item — a deliberate
    // full refresh, unlike the optimistic quick-actions below (favourite,
    // list-add, watch-refresh, status/rating), which patch localItem
    // directly instead of waiting on this prop.
    lastEditSavedAt.current = editSavedAt;
    setLocalItem(item);
  }

  // No DB row yet — a fetched-but-not-saved preview. Flips off
  // automatically once commitToLibrary succeeds, since it patches localItem
  // to the real, id-bearing saved row.
  const isPreview = localItem.id == null;

  const cfg = getEffectiveTypeConfig(localItem, customTypes);
  const castMembers = parseCastList(localItem.cast_list);
  // Per-track ownership — separate bookkeeping from the item-level is_local
  // toggle, for owning some tracks off an album but not the whole thing.
  // Purely manual; "owned" defaults true when absent so a freshly fetched
  // tracklist starts as "fully owned."
  const musicTracks = localItem.media_type === "Music" ? parseTracklist(localItem.tracklist) : [];
  const musicTracksOwnedCount = musicTracks.filter(t => t.owned !== false).length;
  const matchedCustomType = localItem.media_type === "Custom"
    ? customTypes.find(t => t.id === localItem.custom_type_id)
    : null;
  const statusColor = STATUS_COLOR_MAP[localItem.status] || T.blue;
  const isFavourite = favouritesListId != null && (localItem.list_ids || []).includes(favouritesListId);
  const itemLists = (lists || []).filter(l => (localItem.list_ids || []).includes(l.id) && !l.is_default);
  const currentRating = localItem.rating != null ? ratingToDisplay(localItem.rating) : null;

  // Favouriting/list-adding go straight to the parent handler rather than
  // through saveField, so nothing patches localItem.list_ids locally.
  // Without this, the Lists sidebar card stays stale until navigating away
  // and back, since the resync above only fires on a genuine id change.
  const patchListIds = (listId) => {
    const cur = new Set(localItem.list_ids || []);
    cur.add(listId);
    setLocalItem(prev => ({ ...prev, list_ids: [...cur] }));
  };
  // A preview has no list_ids yet, so favouriting one is always "add",
  // never a toggle-off — the save happens first since favouriting needs a
  // real id to attach to.
  const handleToggleFavourite = async () => {
    if (favouritesListId == null) return;
    if (isPreview) {
      const created = await commitToLibrary();
      if (!created) return; // duplicate redirect or failed save — nothing more to do here
      setLocalItem(prev => ({ ...prev, list_ids: [...(prev.list_ids || []), favouritesListId] }));
      onToggleFavourite(created.id);
      return;
    }
    const cur = new Set(localItem.list_ids || []);
    isFavourite ? cur.delete(favouritesListId) : cur.add(favouritesListId);
    setLocalItem(prev => ({ ...prev, list_ids: [...cur] }));
    onToggleFavourite(localItem.id);
  };
  const handleAddToList = async (listId) => {
    if (isPreview) {
      const created = await commitToLibrary();
      if (!created) return;
      setLocalItem(prev => ({ ...prev, list_ids: [...(prev.list_ids || []), listId] }));
      return onAddItemToList(created.id, listId);
    }
    patchListIds(listId);
    return onAddItemToList(localItem.id, listId);
  };

  // Hide only applies to a real, persisted item — unreachable in preview
  // mode.
  const handleToggleHidden = () => {
    setLocalItem(prev => ({ ...prev, is_hidden: prev.is_hidden ? 0 : 1 }));
    onToggleHidden(localItem);
  };

  // Preview → real: saves the previewed item and hands the page off to the
  // normal owned-item view in place. Re-checks for a duplicate right before
  // saving — browsing a preview for a while makes it more likely something
  // else added the same title in the meantime.
  const [addingToLibrary, setAddingToLibrary] = useState(false);
  const commitToLibrary = async () => {
    if (localItem.id != null) return localItem;
    setAddingToLibrary(true);
    try {
      const dupe = await window.vault.items.findDuplicate({
        title: localItem.title, media_type: localItem.media_type,
        imdb_url: localItem.imdb_url, platform_id: localItem.platform_id, year: localItem.year,
      });
      if (dupe) {
        onSelectItem(dupe);
        return null;
      }
      const created = await window.vault.items.add(localItem);
      onItemSaved(created);
      setLocalItem(created);
      return created;
    } catch (err) {
      alert(cleanIpcError(err) || "Failed to add item.");
      return null;
    } finally {
      setAddingToLibrary(false);
    }
  };

  // Where to Watch refresh — checkWatchProviders() always resolves null;
  // the updated row only arrives via this broadcast once the main process
  // finishes. Same staleness class as Favourites/Lists above: patched
  // directly into localItem rather than waiting on the item prop.
  // Re-subscribes on id change since this component stays mounted across
  // different items.
  const [watchRefreshing, setWatchRefreshing] = useState(false);
  useEffect(() => {
    const unsubscribe = window.vault.movie.onWatchChecked(updated => {
      if (updated.id !== localItem.id) return;
      setLocalItem(prev => ({ ...prev, watch_providers: updated.watch_providers, watch_checked_date: updated.watch_checked_date }));
      setWatchRefreshing(false);
    });
    return unsubscribe;
  }, [localItem.id]);
  const handleRefreshWatch = () => {
    setWatchRefreshing(true);
    if (isPreview) {
      // No id to cache against — film:previewWatchProviders is the same
      // TMDB lookup with no DB write, resolved straight back here instead
      // of via the onWatchChecked broadcast.
      window.vault.movie.previewWatchProviders(localItem.media_type, localItem.platform_id)
        .then(providers => {
          setLocalItem(prev => ({
            ...prev,
            watch_providers: JSON.stringify(providers || {}),
            watch_checked_date: new Date().toISOString().split("T")[0],
          }));
        })
        .finally(() => setWatchRefreshing(false));
      return;
    }
    window.vault.movie.checkWatchProviders([{ ...localItem, watch_checked_date: null }]);
    // Safety net — if checkWatchProviders bails early (no TMDB key, etc.)
    // it never broadcasts watchChecked, leaving the button stuck on "…".
    setTimeout(() => setWatchRefreshing(false), 8000);
  };

  // Where to Watch for a preview (not-yet-owned) item — fetched once as
  // soon as the profile opens rather than waiting for a manual ↻, so a
  // search result shows the same Where to Watch card an owned item does
  // instead of silently omitting it just because there's no DB row yet to
  // cache the check against (see film:previewWatchProviders, main.js).
  useEffect(() => {
    if (!isPreview) return;
    if (localItem.media_type !== "Movie" && localItem.media_type !== "TV") return;
    if (!localItem.platform_id) return;
    if (localItem.watch_providers != null) return; // already have it this session
    let cancelled = false;
    window.vault.movie.previewWatchProviders(localItem.media_type, localItem.platform_id).then(providers => {
      if (cancelled || !providers) return;
      setLocalItem(prev => ({
        ...prev,
        watch_providers: JSON.stringify(providers),
        watch_checked_date: new Date().toISOString().split("T")[0],
      }));
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreview, localItem.media_type, localItem.platform_id]);

  // HowLongToBeat for a preview (not-yet-owned) Game — same reasoning/
  // pattern as the Where to Watch preview fetch above (see
  // hltb:previewTimes, main.js).
  useEffect(() => {
    if (!isPreview) return;
    if (localItem.media_type !== "Game") return;
    if (!localItem.title) return;
    if (localItem.hltb_main != null || localItem.hltb_main_extra != null || localItem.hltb_completionist != null) return;
    let cancelled = false;
    window.vault.hltb.previewTimes(localItem.title).then(stats => {
      if (cancelled || !stats) return;
      setLocalItem(prev => ({ ...prev, ...stats, hltb_checked_date: new Date().toISOString().split("T")[0] }));
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreview, localItem.media_type, localItem.title]);

  const saveField = async (patch) => {
    setLocalItem(prev => ({ ...prev, ...patch }));
    try { await onQuickSave(localItem.id, patch); } catch {}
  };

  const toggleTrackOwned = (index) => {
    const updated = musicTracks.map((t, i) => i === index ? { ...t, owned: t.owned === false } : t);
    saveField({ tracklist: JSON.stringify(updated) });
  };

  // One-click equivalent of Edit → Fetch Info/Fetch Art (force overwrite) →
  // Save, without leaving the profile view. Reuses the exact same lookup
  // functions AddEditModal's handleFetchArt calls per media type, so the
  // data returned is already shaped like real media_items columns — safe to
  // merge straight into a saveField() patch. Board Game and the generic
  // cover-art-only types (Book/Game/etc. — no live per-item metadata source
  // exists for those, same limit Fetch Art already has) are handled the same
  // way handleFetchArt handles them.
  const handleForceResync = async () => {
    setResyncing(true);
    setResyncError(null);
    setResyncUndo(null);
    try {
      const mt = localItem.media_type;
      let details;

      if (mt === "Movie" || mt === "TV") {
        details = await window.vault.movie.lookupDetails(localItem);
      } else if (mt === "Music") {
        details = await window.vault.music.lookupDetails(localItem);
      } else if (mt === "Podcast") {
        details = await window.vault.podcast.lookupDetails(localItem);
      } else if (mt === "Web Video" && localItem.platform_id) {
        // Channel, video or playlist — the same lookup Search Online uses
        // (fresh subscriber/video counts, description, picture, page URL).
        details = await window.vault.search.details({ platformId: String(localItem.platform_id), mediaType: mt });
      } else if (mt === "Website") {
        if (!localItem.url) throw new Error("No URL saved for this item.");
        details = await window.vault.website.fetchInfo(localItem.url);
      } else if (mt === "Board Game") {
        let bggId = localItem.platform_id || null;
        if (!bggId) {
          const results = await bggSearch(localItem.title);
          if (!results.length) throw new Error("No board game found on BGG.");
          bggId = results[0].platformId;
        }
        details = await bggDetails(bggId, mt);
        if (details._thumbnailUrl) {
          details = { ...details, cover_art_path: await window.vault.bgg.downloadArt(details._thumbnailUrl, bggId) };
        }
      } else if (mt === "Game") {
        // Optional — a genuine no-match or no key configured falls through
        // to the same cover-art-only path other types use, rather than
        // surfacing as a resync error.
        try {
          details = await window.vault.game.igdbLookupDetails(localItem);
        } catch {
          const cover_art_path = await window.vault.coverArt.fetch({
            title: localItem.title, year: localItem.year, mediaType: mt,
            imdbUrl: localItem.imdb_url || null, platformId: localItem.platform_id || null,
          });
          details = { cover_art_path };
        }
      } else if (mt === "Book" || mt === "Audiobook") {
        // No key needed (Open Library is keyless) — a genuine no-match
        // still falls through to the cover-art-only path, same as Game above.
        try {
          details = await window.vault.book.lookupDetails(localItem);
        } catch {
          const cover_art_path = await window.vault.coverArt.fetch({
            title: localItem.title, year: localItem.year, mediaType: mt,
            imdbUrl: localItem.imdb_url || null, platformId: localItem.platform_id || null,
          });
          details = { cover_art_path };
        }
      } else {
        const cover_art_path = await window.vault.coverArt.fetch({
          title: localItem.title, year: localItem.year, mediaType: mt,
          imdbUrl: localItem.imdb_url || null, platformId: localItem.platform_id || null,
        });
        details = { cover_art_path };
      }

      // Same merge rules as AddEditModal's Fetch Info/Force Refresh — always
      // overwrite here, since Resync has no "safe merge" tier, but still
      // never let a blank/absent fetched value clear an existing one.
      const patch = applyFetchedPatch(details, localItem, { overwrite: true });
      if (!Object.keys(patch).length) throw new Error("Nothing new found.");
      // Captured before saveField overwrites localItem, so a wrong match can
      // be reverted exactly. ?? null (not ||) preserves a real falsy value
      // (e.g. abridged: false) instead of coercing it away.
      const previousValues = Object.fromEntries(Object.keys(patch).map(k => [k, localItem[k] ?? null]));
      await saveField(patch);
      setResyncUndo(previousValues);
    } catch (err) {
      setResyncError(cleanIpcError(err) || "Resync failed");
    } finally {
      setResyncing(false);
    }
  };

  // Reverts exactly the fields the most recent Force Resync changed — a
  // wrong IGDB/BGG/etc. match is caught more often now, but not impossible.
  const handleUndoResync = async () => {
    if (!resyncUndo) return;
    await saveField(resyncUndo);
    setResyncUndo(null);
  };

  // Owned Locally and status stay independent everywhere else, but the
  // Wishlist/Not Started boundary specifically tracks ownership, same rule
  // as AddEditModal.jsx.
  const handleToggleLocal = () => {
    saveField(buildOwnedChangePatch(localItem, !localItem.is_local));
  };

  const cycleStatus = () => {
    const next = STATUS_WHEEL_ORDER[(STATUS_WHEEL_ORDER.indexOf(localItem.status) + 1) % STATUS_WHEEL_ORDER.length];
    saveField(buildStatusChangePatch(localItem, next));
  };

  const nudgeRating = (delta) => {
    const base = currentRating ?? 0;
    const next = Math.max(-10, Math.min(10, base + delta));
    // Preserve Dropped rather than bumping it back to Consumed — only
    // wishlist/in-progress items get promoted to Consumed by rating them.
    const status = localItem.status === "dropped" ? "dropped" : "consumed";
    saveField({ rating: ratingToStored(next), status });
  };

  const fields = matchedCustomType
    ? matchedCustomType.fields.map(f => ({ key: f.key, label: f.label, field_type: f.field_type }))
    : TYPE_FIELDS[localItem.media_type] || [];
  const fieldValue = (f) => matchedCustomType
    ? (localItem.custom_fields || {})[f.key]
    : localItem[f.key];
  const genres = (localItem.genre || "").split(",").map(g => g.trim()).filter(Boolean);

  // "More from this creator" — same-creator items elsewhere in the library,
  // excluding this one. Case-insensitive since creator is free text. Scoped
  // to the same media type — creator is a plain string with no namespacing,
  // so without this an author name matching a director/artist/developer
  // elsewhere would pull in cross-type results.
  const moreFromCreator = localItem.creator
    ? (items || []).filter(i =>
        i.id !== localItem.id &&
        i.media_type === localItem.media_type &&
        (i.creator || "").toLowerCase() === localItem.creator.toLowerCase()
      )
    : [];

  // Other works by the same creator not yet in the library — Film/TV via a
  // live TMDB person lookup; Book/Audiobook via Open Library's author-name
  // search (no per-author id is stored, so a name search rather than an id
  // lookup). The fetch runs once per creator, but which results still
  // count as "not yet in the library" is re-checked every render against
  // `items`, so a title just quick-added below doesn't keep a stale tile.
  const [rawExternalCreatorWorks, setRawExternalCreatorWorks] = useState([]);
  const [externalCreatorLoading, setExternalCreatorLoading] = useState(false);
  useEffect(() => {
    setRawExternalCreatorWorks([]);
    setExternalCreatorLoading(false);
    if (!localItem.creator) return;
    let cancelled = false;
    // One place that flips the loading flag and unpacks the result, rather
    // than repeating the same then/catch in every media-type branch below.
    const run = (promise) => {
      setExternalCreatorLoading(true);
      promise
        .then(works => { if (!cancelled) setRawExternalCreatorWorks((works || []).filter(w => w.title)); })
        .catch(() => { if (!cancelled) setRawExternalCreatorWorks([]); })
        .finally(() => { if (!cancelled) setExternalCreatorLoading(false); });
    };
    if (localItem.media_type === "Movie" || localItem.media_type === "TV") {
      run(window.vault.movie.moreFromCreator(localItem.creator, localItem.media_type));
    } else if (localItem.media_type === "Book") {
      run(window.vault.book.worksByAuthor(localItem.creator, localItem.platform_id));
    } else if (localItem.media_type === "Audiobook") {
      // Audible's own catalog, not Open Library — audiobooks are Audible-only
      // everywhere now, and an Open Library work can't be added as one.
      run(window.vault.audible.moreFromAuthor(localItem.creator, localItem.platform_id));
    } else if (localItem.media_type === "Music") {
      run(window.vault.music.moreFromArtist(localItem.creator, localItem.title));
    } else if (localItem.media_type === "Podcast") {
      run(window.vault.podcast.moreFromHost(localItem.creator, localItem.platform_id));
    } else if (localItem.media_type === "Game") {
      // IGDB regardless of which store the game came from — none of the
      // three storefronts can do this, so unlike Similar To below there's
      // no store-native path to prefer first. Silently empty when no IGDB
      // key is set, same as every other optional-source row.
      run(window.vault.game.igdbMoreFromDeveloper(localItem.creator, localItem.title));
    } else if (localItem.media_type === "Web Video" && localItem.platform_id && !/^(video|playlist)-/.test(localItem.platform_id)) {
      // A channel's latest uploads (YouTube API, 1 quota unit).
      run(window.vault.youtube.recentUploads(localItem.platform_id));
    } else if (localItem.media_type === "Board Game") {
      // BGG's own per-designer credit list — real, public, keyless. No
      // key/account needed, unlike Game's IGDB equivalent above.
      run(window.vault.bgg.moreFromDesigner(localItem.creator, localItem.title));
    }
    return () => { cancelled = true; };
  }, [localItem.creator, localItem.media_type, localItem.platform_id, localItem.title]);
  // A YouTube channel's row lists its recent uploads, newest first; the newest
  // one's date says how active the channel is.
  const isYoutubeChannel = webVideoKind(localItem) === "channel";
  const latestUpload = isYoutubeChannel
    ? rawExternalCreatorWorks.map(w => w.publishedAt).filter(Boolean).sort().pop() || null
    : null;
  // Matched against every same-media-type item in the library, not just
  // moreFromCreator's same-creator subset — a TMDB "more from this person"
  // result can be credited under a different role than the Director field
  // stored as `creator`, so a title just quick-added here could land with a
  // different `creator` string. Kept as a title→item Map, not just a Set,
  // so Similar To below can render an already-owned match as a real
  // clickable tile instead of just excluding it.
  const inLibraryItemByTitle = new Map(
    (items || [])
      .filter(i => i.id !== localItem.id && i.media_type === localItem.media_type)
      .map(i => [i.title.toLowerCase(), i])
  );
  if (localItem.title) inLibraryItemByTitle.set(localItem.title.toLowerCase(), localItem);
  const inLibraryTitles = new Set(inLibraryItemByTitle.keys());
  // Title text alone isn't reliable — TMDB can rename a title after an item
  // was added, which would let a since-renamed title slip back in as "new"
  // if only compared by title string. TMDB ids are stable, so anything with
  // a genuine TMDB-numeric platform_id (not an OMDB "tt..." id) is matched
  // by id too.
  const inLibraryItemByTmdbId = new Map(
    (items || [])
      .filter(i => i.id !== localItem.id && i.media_type === localItem.media_type && i.platform_id && /^\d+$/.test(i.platform_id))
      .map(i => [i.platform_id, i])
  );
  if (localItem.platform_id && /^\d+$/.test(localItem.platform_id)) inLibraryItemByTmdbId.set(localItem.platform_id, localItem);
  const inLibraryTmdbIds = new Set(inLibraryItemByTmdbId.keys());
  const externalCreatorWorks = rawExternalCreatorWorks.filter(w =>
    !inLibraryTitles.has(w.title.toLowerCase()) && !inLibraryTmdbIds.has(String(w.id))
  );

  // "More in this series" — same shape as "More From Creator" above, but
  // for a TMDB collection instead of a person. Film only — TMDB collections
  // don't exist for TV. In-library members match on the stored
  // `series_name` text; external members come from a live TMDB collection-
  // name search and reuse the same inLibraryTitles set built above.
  const moreFromSeries = localItem.series_name
    ? (items || []).filter(i =>
        i.id !== localItem.id &&
        (i.series_name || "").toLowerCase() === localItem.series_name.toLowerCase()
      )
    : [];
  const [rawExternalSeriesWorks, setRawExternalSeriesWorks] = useState([]);
  useEffect(() => {
    setRawExternalSeriesWorks([]);
    if (!localItem.series_name) return;
    if (localItem.media_type !== "Movie") return;
    let cancelled = false;
    window.vault.movie.moreFromSeries(localItem.series_name).then(works => {
      if (!cancelled) setRawExternalSeriesWorks((works || []).filter(w => w.title));
    }).catch(() => { if (!cancelled) setRawExternalSeriesWorks([]); });
    return () => { cancelled = true; };
  }, [localItem.series_name, localItem.media_type]);
  const externalSeriesWorks = rawExternalSeriesWorks.filter(w =>
    !inLibraryTitles.has(w.title.toLowerCase()) && !inLibraryTmdbIds.has(String(w.id))
  );

  // "Similar To [Title]" — TMDB's own per-title recommendations feed for
  // Film/TV, the broadest of the three "more like this" rows since it isn't
  // scoped to a person or collection. Book/Audiobook get the same row via a
  // different mechanism — Open Library has no per-title recommendation
  // feed, so it's approximated by genre-browse instead. Only once the item
  // has a resolvable platform_id/genre. A result already in the library is
  // detected by id lookup first, title lookup as fallback, and rendered as
  // a real tile instead of being dropped.
  const [rawSimilarTitles, setRawSimilarTitles] = useState([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  useEffect(() => {
    setRawSimilarTitles([]);
    setSimilarLoading(false);
    let cancelled = false;
    // Same single-place loading/unpacking helper as the creator-works
    // effect above.
    const run = (promise) => {
      setSimilarLoading(true);
      promise
        .then(works => { if (!cancelled) setRawSimilarTitles((works || []).filter(w => w.title)); })
        .catch(() => { if (!cancelled) setRawSimilarTitles([]); })
        .finally(() => { if (!cancelled) setSimilarLoading(false); });
    };
    if (localItem.media_type === "Movie" || localItem.media_type === "TV") {
      if (!localItem.platform_id) return;
      run(window.vault.movie.similarTitles(localItem.platform_id, localItem.media_type));
    } else if (localItem.media_type === "Book") {
      // Book only — Open Library genre-browse results can't be added as an
      // Audiobook (Audible-only), and Audible has no equivalent feed.
      if (!localItem.genre) return;
      run(window.vault.book.similarByGenre(localItem.genre, localItem.platform_id));
    } else if (localItem.media_type === "Game") {
      if (!localItem.platform_id) return;
      // Steam's own numeric appid uses the morelike scrape; an igdb-
      // prefixed id (the only source for a title never on Steam) uses
      // IGDB's own similar_games field instead. gog-/epic- prefixed ids
      // have neither available and are skipped. Passing a non-Steam id
      // through to the morelike scrape doesn't error — it silently returns
      // Steam's generic "trending" recommendations for an unrecognized appid.
      if (/^\d+$/.test(localItem.platform_id)) {
        // Steam first (no key needed, good recommendations), falling back
        // to IGDB when it yields nothing. Steam's morelike page is scraped,
        // not an API, and intermittently 403s from Akamai — without this
        // fallback the row would just silently empty. Same Steam-then-IGDB
        // shape SearchModal's store search uses.
        run(window.vault.game.similarGames(localItem.platform_id).then(async works => {
          const steamWorks = (works || []).filter(w => w.title);
          if (steamWorks.length > 0) return steamWorks;
          return await window.vault.game.igdbSimilarGamesByTitle(localItem.title).catch(() => []);
        }));
      } else if (localItem.platform_id.startsWith("igdb-")) {
        run(window.vault.game.igdbSimilarGames(localItem.platform_id.slice("igdb-".length)));
      } else {
        // gog-/epic- prefixed (and anything else non-numeric) — no store-
        // native "more like this" exists, so the title is resolved to an
        // IGDB game id first and IGDB's similar_games used from there.
        // Resolution is cached main-side per app run.
        run(window.vault.game.igdbSimilarGamesByTitle(localItem.title));
      }
    } else if (localItem.media_type === "Music") {
      if (!localItem.genre) return;
      run(window.vault.music.similarByGenre(localItem.genre, localItem.style, localItem.platform_id));
    } else if (localItem.media_type === "Podcast") {
      if (!localItem.genre) return;
      run(window.vault.podcast.similarByGenre(localItem.genre, localItem.platform_id));
    }
    return () => { cancelled = true; };
  }, [localItem.platform_id, localItem.media_type, localItem.genre, localItem.style]);
  const similarInLibrary = [];
  const similarExternal = [];
  for (const w of rawSimilarTitles) {
    const match = inLibraryItemByTmdbId.get(String(w.id)) || inLibraryItemByTitle.get(w.title.toLowerCase());
    if (match) similarInLibrary.push(match); else similarExternal.push(w);
  }

  // "Expansions" — Board Game only, its own row rather than folded into
  // Similar To: an expansion complements its base game, it isn't "similar
  // to" it. Real BGG relationship data — a base game's response already
  // lists its expansions, and an expansion's response lists its base game
  // back. In-library matching reuses inLibraryItemByTmdbId from above,
  // since Board Game's platform_id (the bare BGG id) fits that same shape.
  const [rawExpansions, setRawExpansions] = useState([]);
  const [expansionsLoading, setExpansionsLoading] = useState(false);
  useEffect(() => {
    setRawExpansions([]);
    setExpansionsLoading(false);
    if (localItem.media_type !== "Board Game" || !localItem.platform_id) return;
    let cancelled = false;
    setExpansionsLoading(true);
    window.vault.bgg.expansions(localItem.platform_id)
      .then(works => { if (!cancelled) setRawExpansions((works || []).filter(w => w.title)); })
      .catch(() => { if (!cancelled) setRawExpansions([]); })
      .finally(() => { if (!cancelled) setExpansionsLoading(false); });
    return () => { cancelled = true; };
  }, [localItem.platform_id, localItem.media_type]);
  const expansionsInLibrary = [];
  const expansionsExternal = [];
  for (const w of rawExpansions) {
    const match = inLibraryItemByTmdbId.get(String(w.id));
    if (match) expansionsInLibrary.push(match); else expansionsExternal.push(w);
  }

  // Which external result (by its TMDB/etc. id) is mid-fetch from a tile
  // click right now — shows a loading state on that one tile so clicking
  // doesn't look like it did nothing during the fetch-then-navigate delay.
  const [quickAddViewingId, setQuickAddViewingId] = useState(null);

  // Shared by handleQuickAdd/handleTileClick below. Board Game (Expansions/
  // More From Designer results) has no branch in the generic
  // window.vault.search.details/resolveSearchDetails path — that's a Search
  // Online concept keyed on store, and BGG was never wired into it. Reuses
  // the same bggDetails()+downloadArt() shape handleForceResync above uses.
  const fetchWorkDetails = async (work) => {
    if (localItem.media_type === "Board Game") {
      const details = await bggDetails(String(work.id), "Board Game");
      if (details._thumbnailUrl) {
        return { ...details, cover_art_path: await window.vault.bgg.downloadArt(details._thumbnailUrl, String(work.id)) };
      }
      return details;
    }
    // year/creator only matter for Book/Audiobook's resolveSearchDetails
    // branch — a harmless no-op for Film/TV works. store (Game only) tells
    // resolveSearchDetails which branch a bare numeric id belongs to —
    // without it, an IGDB-sourced similar-game id would be silently
    // treated as a Steam appid (undefined store falls through to Steam).
    return await window.vault.search.details({
      platformId: String(work.id), mediaType: localItem.media_type,
      year: work.year, creator: work.creator,
      store: localItem.media_type === "Game" ? work.source : undefined,
    });
  };

  const handleQuickAdd = async (work) => {
    try {
      const details = await fetchWorkDetails(work);
      onQuickAdd(details);
    } catch { /* same silent-skip as any other optional lookup failing */ }
  };

  // Clicking the tile itself (not the "+" icon) — opens Item Profile in
  // preview mode on the fetched (not yet saved) details, no creation.
  // Different from "+" above, not a shortcut for it: "+" opens the review
  // modal so several related titles can be quick-added in a row.
  //
  // A duplicate here means there's nothing new to preview — the id/title
  // filtering usually keeps an already-owned title out of this row, but it
  // can lag behind a just-added item until the parent's items list
  // re-renders. So this checks again right before previewing, same as
  // Search Online's row click, and opens the existing item's profile instead.
  const handleTileClick = async (work) => {
    setQuickAddViewingId(work.id);
    try {
      const details = await fetchWorkDetails(work);
      const dupe = await window.vault.items.findDuplicate({
        title: details.title, media_type: details.media_type,
        imdb_url: details.imdb_url, platform_id: details.platform_id, year: details.year,
      });
      if (dupe) {
        if (details.cover_art_path) window.vault.coverArt.deleteIfUnused(details.cover_art_path).catch(() => {});
        onSelectItem(dupe);
        return;
      }
      onPreviewItem(details);
    } catch { /* same silent-skip as any other optional lookup failing */ }
    finally { setQuickAddViewingId(null); }
  };

  return (
    <div ref={scrollContainerRef} style={{
      // Full-viewport overlay — covers the TopBar too, not just the library/
      // stats body. TopBar's own controls (tabs, search, vault switcher)
      // don't reset viewingItemId/previewItem, so covering them removes a
      // dead-click trap and makes "Back to Library" below the one and only
      // way out, same relationship Search/Import/Settings have as modals.
      // zIndex 50 sits above TopBar's default stacking but below the
      // 100-tier modals, so those still open on top when triggered from here.
      position: "fixed", inset: 0, zIndex: 50,
      overflowY: "auto", background: T.bg,
    }}>

      {/* Hero */}
      <div style={{
        position: "relative", background: cfg.gradient,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 18px", minHeight: 46 }}>
          {/* Stacked, not side-by-side — two "← Back to X Library" links in
              a row reads as one confusing run-on control. Library always on
              top since it's the one that's always there; the specific-item
              undo below it. Library is only shown when it'd say something
              different from the link below it. This is the one and only
              way out now that the profile covers the TopBar too, so it
              stays reachable through however deep a click-through chain
              has gone, not just a single step back. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {backLabel !== "Back to Library" && onBackToLibrary && (
              <span onClick={onBackToLibrary} style={{ color: T.dim, fontSize: 12, cursor: "pointer", fontFamily: T.fontMono }}>
                &larr; Back to Library
              </span>
            )}
            <span onClick={onBack} style={{ color: T.dim, fontSize: 12, cursor: "pointer", fontFamily: T.fontMono }}>
              &larr; {backLabel}
            </span>
          </div>
          <div style={{ flex: 1 }} />
          {/* Resync/Edit/Delete all assume a persisted row — none apply to
              a preview, where the only meaningful action is the + Add to
              Library pill in the chip row below. */}
          {!isPreview && resyncError && (
            <span style={{ color: "#e84b6e", fontSize: 11, fontFamily: T.fontMono }}>{resyncError}</span>
          )}
          {/* Only ever undoes the most recently applied resync — disappears
              once used, once another resync runs, or once you navigate away. */}
          {!isPreview && resyncUndo && (
            <span
              onClick={handleUndoResync}
              title="Revert the fields the last Force Resync just changed"
              style={{ color: T.accent, fontSize: 11, cursor: "pointer", fontFamily: T.fontMono }}
            >
              ↩ Undo Resync
            </span>
          )}
          {!isPreview && (
            <span
              onClick={resyncing ? undefined : handleForceResync}
              title={resyncing ? "Resyncing…" : "Force resync — re-fetch metadata/cover art from source, overwriting existing values"}
              style={{
                display: "inline-flex", color: T.dim, fontSize: 16, lineHeight: 1,
                cursor: resyncing ? "default" : "pointer", opacity: resyncing ? 0.5 : 1,
              }}
            >
              ↻
            </span>
          )}
          {!isPreview && (
            <span onClick={handleToggleHidden} style={{ color: localItem.is_hidden ? T.accent : T.dim, fontSize: 12, cursor: "pointer", fontFamily: T.fontMono }}>
              {localItem.is_hidden ? "Unhide" : "Hide"}
            </span>
          )}
          {!isPreview && (
            <span onClick={() => onEdit(localItem)} style={{ color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.fontMono }}>
              Edit
            </span>
          )}
          {!isPreview && (
            <span onClick={() => onDeleteRequest(localItem)} style={{ color: "#e84b6e", fontSize: 12, cursor: "pointer", fontFamily: T.fontMono }}>
              Delete
            </span>
          )}
        </div>

        <div style={{ padding: "10px 34px 34px", display: "flex", gap: 34, alignItems: "flex-end" }}>
          <div style={{
            flexShrink: 0, width: 200, height: isSquareArt(localItem.media_type) ? 200 : 300, borderRadius: 8, overflow: "hidden",
            boxShadow: "0 18px 40px rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.08)",
            background: localItem.cover_art_path ? "transparent" : cfg.gradient,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {localItem.cover_art_path
              ? <ArtImage src={`file://${localItem.cover_art_path}`} wide={isWideArt(localItem)} />
              : <span style={{ fontSize: 62, opacity: 0.35 }}>{cfg.icon}</span>
            }
          </div>

          <div style={{ flex: 1, paddingBottom: 4, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14, flexWrap: "wrap" }}>
              <Chip color={cfg.color}>{localItem.media_type}</Chip>
              {isPreview ? (
                <span
                  onClick={addingToLibrary ? undefined : commitToLibrary}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    cursor: addingToLibrary ? "default" : "pointer",
                    padding: "4px 12px", borderRadius: 100, background: T.accent, color: T.bg,
                    fontFamily: T.fontMono, fontSize: 10.5, fontWeight: 700,
                    letterSpacing: "0.04em", textTransform: "uppercase",
                    opacity: addingToLibrary ? 0.7 : 1,
                  }}
                >
                  {addingToLibrary ? "Adding…" : "+ Add to Library"}
                </span>
              ) : (
                <>
                  {localItem.media_type === "Music" && musicTracks.length > 0 ? (
                    // Per-track ownership (see toggleTrackOwned/the Tracklist
                    // block below) replaces the whole-item is_local toggle
                    // here — a fraction is more informative than a boolean
                    // once tracks can differ.
                    <Chip color={musicTracksOwnedCount === musicTracks.length ? T.purple : T.muted}>
                      {musicTracksOwnedCount} of {musicTracks.length} track{musicTracks.length === 1 ? "" : "s"} owned
                    </Chip>
                  ) : (
                    <span
                      onClick={handleToggleLocal}
                      style={{ display: "inline-flex", cursor: "pointer" }}
                    >
                      <Chip color={isOwned(localItem) ? T.purple : T.muted}>
                        {localItem.is_local ? "Owned Locally" : localItem.owned_elsewhere ? "Owned (marked on phone)" : "Not Owned"}
                      </Chip>
                    </span>
                  )}
                  <span onClick={cycleStatus} style={{
                    display: "inline-flex", alignItems: "center", lineHeight: 1, gap: 5, cursor: "pointer",
                    padding: "3px 9px 3px 7px", borderRadius: 100, border: `1px solid ${statusColor}44`,
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 700, color: statusColor, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {STATUS_LABEL_MAP[localItem.status]}
                    </span>
                  </span>
                </>
              )}
            </div>

            <h1 style={{ fontFamily: T.fontSerif, fontWeight: 400, fontSize: 34, margin: "0 0 8px", color: T.text }}>
              {localItem.title}
            </h1>
            <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.dim, marginBottom: 24 }}>
              {keyFacts(localItem)}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 20 }}>
              {!isPreview && (
                <div>
                  <div style={{ fontSize: 9, color: T.muted, marginBottom: 2, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Your rating</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontFamily: T.fontSerif, fontSize: 24,
                      color: currentRating != null ? ratingColor(localItem.rating) : T.muted,
                      fontVariantNumeric: "tabular-nums", minWidth: 40, display: "inline-block", textAlign: "right",
                    }}>{currentRating != null ? formatRating(localItem.rating) : "—"}</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span onClick={() => nudgeRating(1)} style={{ width: 15, height: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: T.dim, cursor: "pointer", border: `1px solid ${T.border}`, borderRadius: 2 }}>▲</span>
                      <span onClick={() => nudgeRating(-1)} style={{ width: 15, height: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: T.dim, cursor: "pointer", border: `1px solid ${T.border}`, borderRadius: 2 }}>▼</span>
                    </span>
                    {currentRating != null && (
                      <span onClick={() => saveField({ rating: null })} title="Clear rating" style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: T.muted, cursor: "pointer", border: `1px solid ${T.border}`, borderRadius: 3 }}>×</span>
                    )}
                  </div>
                </div>
              )}

              {(() => {
                // Whichever of this type's external rating sources are
                // actually present — nothing hardcoded to "the" source, so
                // an item shows whatever it has (a TMDB-sourced Film only
                // ever gets its own score, never Rotten Tomatoes/Metacritic).
                const stats = [];
                if (localItem.media_type === "Movie" || localItem.media_type === "TV") {
                  if (localItem.imdb_rating != null) stats.push(
                    <RatingStat key="imdb" label="IMDb" value={localItem.imdb_rating} suffix="/10"
                      subLine={localItem.imdb_votes != null ? `${localItem.imdb_votes.toLocaleString()} votes` : null} />
                  );
                  if (localItem.rotten_tomatoes_rating != null) stats.push(
                    <RatingStat key="rt" label="Rotten Tomatoes" value={localItem.rotten_tomatoes_rating} suffix="%" />
                  );
                  if (localItem.metacritic_rating != null) stats.push(
                    <RatingStat key="mc" label="Metacritic" value={localItem.metacritic_rating} suffix="/100" />
                  );
                  // Only when none of OMDB's three sources are present — a
                  // TMDB-sourced item's one and only rating.
                  if (!stats.length && localItem.tmdb_rating != null) stats.push(
                    <RatingStat key="tmdb" label="TMDB" value={localItem.tmdb_rating} suffix="/10"
                      subLine={localItem.tmdb_votes != null ? `${localItem.tmdb_votes.toLocaleString()} votes` : null} />
                  );
                } else if (localItem.media_type === "Board Game" && localItem.bgg_rating != null) {
                  const subParts = [];
                  if (localItem.bgg_rank != null) subParts.push(`#${localItem.bgg_rank} Overall`);
                  if (localItem.bgg_rating_count != null) subParts.push(`${localItem.bgg_rating_count.toLocaleString()} ratings`);
                  stats.push(
                    <RatingStat key="bgg" label="BGG Rating" value={localItem.bgg_rating} suffix="/10"
                      subLine={subParts.length ? subParts.join(" · ") : null} />
                  );
                } else if (localItem.media_type === "Game") {
                  // Metacritic and IGDB Rating can both be present on the
                  // same item — a Steam-sourced game with an IGDB Fetch
                  // Info layered on top — so both stack here rather than
                  // one hiding the other.
                  if (localItem.metacritic_rating != null) stats.push(
                    <RatingStat key="mc" label="Metacritic" value={localItem.metacritic_rating} suffix="/100" />
                  );
                  if (localItem.igdb_rating != null) stats.push(
                    <RatingStat key="igdb" label="IGDB Rating" value={localItem.igdb_rating} suffix="/100"
                      subLine={localItem.igdb_rating_count != null ? `${localItem.igdb_rating_count.toLocaleString()} ratings` : null} />
                  );
                } else if ((localItem.media_type === "Book" || localItem.media_type === "Audiobook") && localItem.openlibrary_rating != null) {
                  // Same field, two real sources — Open Library's own
                  // keyless ratings.json (see main.js's
                  // fetchOpenLibraryRating; replaced Hardcover.app, which
                  // needed the user's own API token, 2026-08-20) for a
                  // regular Book/Audiobook, or Audible's own aggregate
                  // "Community Rating: Overall" for a Libation-imported one
                  // (mapLibationRow, ImportModal.jsx) — same `audible-`
                  // platform_id prefix sourceLabel()/ExternalLinks already
                  // key off of to tell the two apart.
                  stats.push(
                    <RatingStat key="openlibrary" label={(localItem.platform_id || "").startsWith("audible-") ? "Audible" : "Open Library"} value={localItem.openlibrary_rating.toFixed(2)} suffix="/5"
                      subLine={localItem.openlibrary_ratings_count != null ? `${localItem.openlibrary_ratings_count.toLocaleString()} ratings` : null} />
                  );
                } else if (localItem.media_type === "Music" && localItem.discogs_rating != null) {
                  // Discogs' own community rating (release.community.rating)
                  // — always present regardless of API key, unlike search-
                  // result thumbnails which need one.
                  stats.push(
                    <RatingStat key="discogs" label="Discogs" value={localItem.discogs_rating.toFixed(2)} suffix="/5"
                      subLine={localItem.discogs_ratings_count != null ? `${localItem.discogs_ratings_count.toLocaleString()} ratings` : null} />
                  );
                }
                return stats.length > 0 ? <><StatDivider />{stats}</> : null;
              })()}

              {(localItem.media_type === "Movie" || localItem.media_type === "TV") && localItem.content_rating && (
                <>
                  <StatDivider />
                  <div>
                    <div style={{ fontSize: 9, color: T.muted, marginBottom: 2, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Content Rating</div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 14, color: T.text }}>{localItem.content_rating}</div>
                  </div>
                </>
              )}
            </div>

            {genres.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                {genres.map(g => (
                  <span key={g} style={{ padding: "3px 10px", borderRadius: 100, background: T.surface2, border: `1px solid ${T.border}`, color: T.text, fontSize: 11 }}>{g}</span>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
              <GhostLink onClick={handleToggleFavourite} color={isFavourite ? T.accent : undefined}>
                {isFavourite ? "★ Favourited" : "☆ Add to Favourites"}
              </GhostLink>
              {onAddItemToList && (
                <AddToListMenu
                  lists={lists || []}
                  onAddToList={handleAddToList}
                  onCreateList={onCreateList}
                  onDeleteList={onDeleteList}
                  label="+ Add to List"
                />
              )}
              <ExternalLinks item={localItem} />
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", gap: 26, padding: "26px 34px 34px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>

          <CastRow cast={castMembers} onSelectPerson={onFilterByPerson} />

          {localItem.notes && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 12, color: T.accent, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Description</div>
              <Description key={localItem.id ?? localItem.platform_id} text={localItem.notes} />
            </div>
          )}

          {localItem.media_type === "Music" && musicTracks.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 12, color: T.accent, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Tracklist</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {musicTracks.map((t, i) => {
                  const owned = t.owned !== false;
                  return (
                    <div key={`${t.position}-${i}`} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "8px 2px",
                      borderBottom: i < musicTracks.length - 1 ? `1px solid ${T.border}` : "none",
                    }}>
                      <span style={{ width: 22, flexShrink: 0, textAlign: "right", color: T.muted, fontFamily: T.fontMono, fontSize: 12 }}>{t.position || i + 1}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: T.text, fontSize: 13.5 }}>{t.title}</span>
                      {t.duration && <span style={{ flexShrink: 0, color: T.muted, fontFamily: T.fontMono, fontSize: 12 }}>{t.duration}</span>}
                      <span
                        onClick={() => toggleTrackOwned(i)}
                        title={owned ? "Owned — click to mark not owned" : "Not owned — click to mark owned"}
                        style={{
                          width: 9, height: 9, flexShrink: 0, borderRadius: "50%", cursor: "pointer",
                          background: owned ? T.accent : "transparent",
                          border: `1.5px solid ${owned ? T.accent : T.muted}`,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 12, color: T.accent, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", rowGap: 10, fontSize: 13 }}>
              {fields.filter(f => {
                if (f.key === "cast_list") return false; // shown as its own photo row above instead
                if (f.key === "content_rating") return false; // shown in the hero stats row above instead
                const v = fieldValue(f);
                return v !== null && v !== undefined && v !== "";
              }).map(f => (
                <Fragment key={f.key}>
                  <Label>{f.label}</Label>
                  <span style={{ color: T.text }}>
                    {f.field_type === "checkbox" || f.key === "abridged"
                      ? (fieldValue(f) ? "Yes" : "No")
                      : f.field_type === "url"
                        ? <GhostLink href={fieldValue(f)} color={T.accent}>↗ {fieldValue(f)}</GhostLink>
                        // Director/Author/Designer/Developer/Artist/Host —
                        // whichever this type calls its "creator" field —
                        // clickable like Cast members, but passes media_type
                        // too so the receiving side can show a stats banner.
                        : f.key === "creator" && onFilterByPerson
                          ? <span onClick={() => onFilterByPerson(fieldValue(f), localItem.media_type)} style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: T.border }}>{String(fieldValue(f))}</span>
                          : String(fieldValue(f))}
                  </span>
                </Fragment>
              ))}
              {fields.every(f => f.key === "cast_list" || fieldValue(f) === null || fieldValue(f) === undefined || fieldValue(f) === "") && (
                <div style={{ gridColumn: "1 / -1", color: T.muted, fontSize: 12, fontFamily: T.fontMono }}>
                  No details filled in yet — click Edit to add some.
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Lists is meaningless before the item exists — once a preview
              gets favourited/list-added it flips to a real item and this
              reappears normally. */}
          {!isPreview && (
            <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 9, color: T.muted, marginBottom: 10, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Lists</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {isFavourite && <span style={{ padding: "3px 9px", borderRadius: 100, background: T.accent + "18", color: T.accent, border: `1px solid ${T.accent}44`, fontSize: 11 }}>★ Favourites</span>}
                {itemLists.map(l => (
                  <span key={l.id} style={{ padding: "3px 9px", borderRadius: 100, background: T.surface, color: T.text, border: `1px solid ${T.border}`, fontSize: 11 }}>{l.name}</span>
                ))}
                {!isFavourite && itemLists.length === 0 && (
                  <span style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>Not on any lists</span>
                )}
              </div>
            </div>
          )}

          <PlaytimeCard item={localItem} />

          <TimeToBeatCard item={localItem} />

          <WhereToWatchCard item={localItem} region={watchRegion} onRefresh={handleRefreshWatch} refreshing={watchRefreshing} />

          {localItem.personal_notes && (
            <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 9, color: T.muted, marginBottom: 10, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Notes</div>
              <div style={{ fontFamily: T.fontSerif, fontSize: 12.5, lineHeight: 1.6, color: T.dim, fontStyle: "italic" }}>
                "{localItem.personal_notes}"
              </div>
            </div>
          )}

          {!isPreview && (
            <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 9, color: T.muted, marginBottom: 10, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Library info</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.dim }}>Added</span><span>{localItem.date_added || "—"}</span></div>
                {localItem.date_consumed && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.dim }}>Consumed</span><span>{localItem.date_consumed}</span></div>
                )}
                {localItem.metadata_checked_date && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.dim }}>Last enriched</span><span>{localItem.metadata_checked_date}</span></div>
                )}
                {sourceLabel(localItem) && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.dim }}>Source</span><span>{sourceLabel(localItem)}</span></div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {(moreFromSeries.length > 0 || externalSeriesWorks.length > 0) && (
        <div style={{ padding: "0 34px 34px" }}>
          <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 14, color: T.accent, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            More in {localItem.series_name}
          </div>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
            {moreFromSeries.map(i => {
              const iCfg = getEffectiveTypeConfig(i, customTypes);
              const iGenre = (i.genre || "").split(",").map(g => g.trim()).filter(Boolean)[0];
              return (
                <CreatorWorkTile
                  key={`serieslib-${i.id}`}
                  title={i.title}
                  year={i.year}
                  posterUrl={i.cover_art_path ? `file://${i.cover_art_path}` : null}
                  icon={iCfg.icon}
                  ratingLabel={i.rating != null ? formatRating(i.rating) : null}
                  ratingColor={ratingColor(i.rating)}
                  genre={iGenre}
                  onClick={() => onSelectItem(i)}
                />
              );
            })}
            {onQuickAdd && externalSeriesWorks.map(w => (
              <CreatorWorkTile
                key={`seriesext-${w.id}`}
                title={w.title}
                year={w.year}
                posterUrl={w.poster_path ? `https://image.tmdb.org/t/p/w185${w.poster_path}` : null}
                icon={cfg.icon}
                ratingLabel={w.rating != null ? `★ ${w.rating.toFixed(1)}` : null}
                ratingColor="#f5c518"
                genre={w.genre}
                dimmed
                loading={quickAddViewingId === w.id}
                onClick={() => handleTileClick(w)}
                onQuickAdd={() => handleQuickAdd(w)}
              />
            ))}
          </div>
        </div>
      )}

      {(moreFromCreator.length > 0 || externalCreatorWorks.length > 0 || externalCreatorLoading) && (
        <div style={{ padding: "0 34px 34px" }}>
          <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 14, color: T.accent, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {isYoutubeChannel ? `Recent uploads from ${localItem.creator}` : `More from ${localItem.creator}`}
            {isYoutubeChannel && latestUpload && (
              <span style={{ marginLeft: 10, color: T.muted, textTransform: "none", letterSpacing: 0 }}>· latest {timeAgo(Date.parse(latestUpload))}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
            {moreFromCreator.map(i => {
              const iCfg = getEffectiveTypeConfig(i, customTypes);
              const iGenre = (i.genre || "").split(",").map(g => g.trim()).filter(Boolean)[0];
              return (
                <CreatorWorkTile
                  key={`lib-${i.id}`}
                  title={i.title}
                  year={i.year}
                  posterUrl={i.cover_art_path ? `file://${i.cover_art_path}` : null}
                  icon={iCfg.icon}
                  ratingLabel={i.rating != null ? formatRating(i.rating) : null}
                  ratingColor={ratingColor(i.rating)}
                  genre={iGenre}
                  square={isSquareArt(i.media_type)}
                  onClick={() => onSelectItem(i)}
                />
              );
            })}
            {onQuickAdd && externalCreatorWorks.map(w => (
              <CreatorWorkTile
                key={`ext-${w.id}`}
                title={w.title}
                year={w.year}
                role={localItem.media_type === "Movie" ? "Director" : (localItem.media_type === "Book" || localItem.media_type === "Audiobook") ? "Author" : localItem.media_type === "Music" ? "Artist" : localItem.media_type === "Podcast" ? "Host" : localItem.media_type === "Game" ? "Developer" : localItem.media_type === "Board Game" ? "Designer" : "Creator"}
                posterUrl={w.mediaType === "Book"
                  ? (w.coverId ? `https://covers.openlibrary.org/b/id/${w.coverId}-M.jpg` : null)
                  : (w.mediaType === "Music" || w.mediaType === "Podcast" || w.mediaType === "Game" || w.mediaType === "Board Game" || w.mediaType === "Audiobook" || w.mediaType === "Web Video")
                  ? (w.coverUrl || null)
                  : (w.poster_path ? `https://image.tmdb.org/t/p/w185${w.poster_path}` : null)}
                icon={cfg.icon}
                ratingLabel={w.rating != null ? `★ ${w.rating.toFixed(1)}` : null}
                ratingColor="#f5c518"
                genre={w.genre}
                dimmed
                square={isSquareArt(w.mediaType)}
                loading={quickAddViewingId === w.id}
                onClick={() => handleTileClick(w)}
                onQuickAdd={() => handleQuickAdd(w)}
              />
            ))}
            {externalCreatorLoading && Array.from({ length: 4 }, (_, i) => (
              <SkeletonWorkTile key={`skel-${i}`} square={isSquareArt(localItem.media_type)} />
            ))}
          </div>
        </div>
      )}

      {(similarInLibrary.length > 0 || similarExternal.length > 0 || similarLoading) && (
        <div style={{ padding: "0 34px 34px" }}>
          <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 14, color: T.accent, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Similar to {localItem.title}
          </div>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
            {similarInLibrary.map(i => {
              const iCfg = getEffectiveTypeConfig(i, customTypes);
              const iGenre = (i.genre || "").split(",").map(g => g.trim()).filter(Boolean)[0];
              return (
                <CreatorWorkTile
                  key={`simlib-${i.id}`}
                  title={i.title}
                  year={i.year}
                  posterUrl={i.cover_art_path ? `file://${i.cover_art_path}` : null}
                  icon={iCfg.icon}
                  ratingLabel={i.rating != null ? formatRating(i.rating) : null}
                  ratingColor={ratingColor(i.rating)}
                  genre={iGenre}
                  square={isSquareArt(i.media_type)}
                  onClick={() => onSelectItem(i)}
                />
              );
            })}
            {onQuickAdd && similarExternal.map(w => (
              <CreatorWorkTile
                key={`simext-${w.id}`}
                title={w.title}
                year={w.year}
                posterUrl={w.mediaType === "Book"
                  ? (w.coverId ? `https://covers.openlibrary.org/b/id/${w.coverId}-M.jpg` : null)
                  : (w.mediaType === "Game" || w.mediaType === "Music" || w.mediaType === "Podcast")
                  ? (w.coverUrl || null)
                  : (w.poster_path ? `https://image.tmdb.org/t/p/w185${w.poster_path}` : null)}
                icon={cfg.icon}
                ratingLabel={w.rating != null ? `★ ${w.rating.toFixed(1)}` : null}
                ratingColor="#f5c518"
                genre={w.genre}
                dimmed
                square={isSquareArt(w.mediaType)}
                loading={quickAddViewingId === w.id}
                onClick={() => handleTileClick(w)}
                onQuickAdd={() => handleQuickAdd(w)}
              />
            ))}
            {similarLoading && Array.from({ length: 4 }, (_, i) => (
              <SkeletonWorkTile key={`simskel-${i}`} square={isSquareArt(localItem.media_type)} />
            ))}
          </div>
        </div>
      )}

      {(expansionsInLibrary.length > 0 || expansionsExternal.length > 0 || expansionsLoading) && (
        <div style={{ padding: "0 34px 34px" }}>
          <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 14, color: T.accent, fontSize: 11, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Expansions
          </div>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
            {expansionsInLibrary.map(i => {
              const iCfg = getEffectiveTypeConfig(i, customTypes);
              const iGenre = (i.genre || "").split(",").map(g => g.trim()).filter(Boolean)[0];
              return (
                <CreatorWorkTile
                  key={`explib-${i.id}`}
                  title={i.title}
                  year={i.year}
                  posterUrl={i.cover_art_path ? `file://${i.cover_art_path}` : null}
                  icon={iCfg.icon}
                  ratingLabel={i.rating != null ? formatRating(i.rating) : null}
                  ratingColor={ratingColor(i.rating)}
                  genre={iGenre}
                  square
                  onClick={() => onSelectItem(i)}
                />
              );
            })}
            {onQuickAdd && expansionsExternal.map(w => (
              <CreatorWorkTile
                key={`expext-${w.id}`}
                title={w.title}
                year={w.year}
                posterUrl={w.coverUrl || null}
                icon={cfg.icon}
                genre={w.genre}
                square
                dimmed
                loading={quickAddViewingId === w.id}
                onClick={() => handleTileClick(w)}
                onQuickAdd={() => handleQuickAdd(w)}
              />
            ))}
            {expansionsLoading && Array.from({ length: 4 }, (_, i) => (
              <SkeletonWorkTile key={`expskel-${i}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
