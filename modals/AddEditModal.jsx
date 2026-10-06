import { useState, useEffect, useRef } from "react";
import { T, MEDIA_TYPES, TYPE_FIELDS, getTypeConfig, ratingToStored, ratingToDisplay, formatRating, cleanIpcError, parseCastList, applyFetchedPatch, OWNED_PLATFORM_OPTIONS, isSquareArt } from "../tokens.js";
import { bggSearch, bggDetails } from "../sync/bggApi.js";
import CropModal from "../components/CropModal.jsx";

const today = () => new Date().toISOString().split("T")[0];

// Standard collectibles grading scale (Trading Card Game, Board Game,
// Music) — always manual, no integrated source reports a specific copy's
// physical condition.
const CONDITION_OPTIONS = ["Mint", "Near Mint", "Excellent", "Good", "Light Played", "Played", "Poor"];

// Applies an applyFetchedPatch() result to this form's setters/refs — plain
// setState calls for most fields, wrapper functions for the handful backed
// by a ref (metadata_checked_date, tracklist, rating-breakdown numbers) or
// needing more than one field touched (cover_art_path's preview pairing,
// cast_list's dual plain-text/JSON-source state).
const applyPatchToSetters = (patch, setters) => {
  for (const [key, value] of Object.entries(patch)) setters[key]?.(value);
};

const Label = ({ children }) => (
  <label style={{
    fontSize: 9, color: T.muted, display: "block", marginBottom: 5,
    fontFamily: T.fontMono, letterSpacing: "0.08em",
    textTransform: "uppercase",
  }}>{children}</label>
);

const Input = ({ style, ...props }) => (
  <input
    style={{
      width: "100%", padding: "7px 11px",
      background: T.surface2, border: `1px solid ${T.border}`,
      borderRadius: 5, color: T.text, fontSize: 12,
      outline: "none", boxSizing: "border-box",
      fontFamily: T.fontSans,
      ...style,
    }}
    {...props}
  />
);

export default function AddEditModal({ item, onSave, onClose, customTypes = [] }) {
  const isEditing = !!item;

  // Form state
  const [title, setTitle]               = useState(item?.title || "");
  const [mediaType, setMediaType]       = useState(item?.media_type || "Movie");
  const [customTypeId, setCustomTypeId] = useState(item?.custom_type_id || null);
  const [customFieldValues, setCustomFieldValues] = useState(item?.custom_fields || {});
  const [status, setStatus]             = useState(item?.status || "wishlist");
  const [isLocal, setIsLocal]           = useState(item?.is_local === 1 || false);
  // rating stored as display value (-10 to +10) or null
  const [rating, setRating]             = useState(item?.rating != null ? ratingToDisplay(item.rating) : null);
  const [dateConsumed, setDateConsumed] = useState(item?.date_consumed || today());
  const [notes, setNotes]               = useState(item?.notes || "");

  // Type-specific fields
  const [creator, setCreator]           = useState(item?.creator || "");
  const [genre, setGenre]               = useState(item?.genre || "");
  const [year, setYear]                 = useState(item?.year || "");
  const [network, setNetwork]           = useState(item?.network || "");
  const [seasonCount, setSeasonCount]   = useState(item?.season_count || "");
  const [narrator, setNarrator]         = useState(item?.narrator || "");
  const [platform, setPlatform]         = useState(item?.platform || "");
  const [label, setLabel]               = useState(item?.label || "");

  // V2 fields
  const [runtime, setRuntime]           = useState(item?.runtime || "");
  const [imdbUrl, setImdbUrl]           = useState(item?.imdb_url || "");
  const [steamUrl, setSteamUrl]         = useState(item?.steam_url || "");
  const [seriesName, setSeriesName]     = useState(item?.series_name || "");
  const [seriesOrder, setSeriesOrder]   = useState(item?.series_order || "");
  const [videoQuality, setVideoQuality] = useState(item?.video_quality || "");
  const [localPath, setLocalPath]       = useState(item?.local_path || "");
  const [platformId, setPlatformId]     = useState(item?.platform_id || null);
  // Not part of updateItem()'s column whitelist, same as is_hidden — saved
  // separately via items.updateFields after the main save completes. Manual
  // counterpart to what the GOG/Epic auto-scans write.
  const [installPath, setInstallPath]   = useState(item?.install_path || "");
  const [browsingExe, setBrowsingExe]   = useState(false);

  // Search-enrichment fields (Film/TV)
  const [country, setCountry]           = useState(item?.country || "");
  const [language, setLanguage]         = useState(item?.language || "");
  // cast_list is stored as JSON (name/character/photo) but edited here as a
  // plain comma list. castListSource holds the richer value to actually
  // save (original JSON or a freshly-fetched one) — at submit time, if the
  // displayed text still matches what that source reconstructs to, the
  // source is saved as-is; only a manual edit downgrades it to plain text.
  const [castList, setCastList]         = useState(parseCastList(item?.cast_list).map(c => c.name).join(", "));
  const [castListSource, setCastListSource] = useState(item?.cast_list || null);
  const [criticRating, setCriticRating] = useState(item?.critic_rating || "");
  const [contentRating, setContentRating] = useState(item?.content_rating || "");
  // Per-source rating breakdown (Item Profile hero row) — purely derived,
  // never hand-edited, so a ref is enough: it just carries whatever the
  // item/search-prefill (or a fresh Fetch Info) had through to formData.
  const ratingBreakdownRef = useRef({
    imdb_rating: item?.imdb_rating ?? null,
    imdb_votes: item?.imdb_votes ?? null,
    rotten_tomatoes_rating: item?.rotten_tomatoes_rating ?? null,
    metacritic_rating: item?.metacritic_rating ?? null,
    tmdb_rating: item?.tmdb_rating ?? null,
    tmdb_votes: item?.tmdb_votes ?? null,
    bgg_rating: item?.bgg_rating ?? null,
    bgg_rating_count: item?.bgg_rating_count ?? null,
    bgg_rank: item?.bgg_rank ?? null,
    anilist_score: item?.anilist_score ?? null,
    // igdb_url isn't a rating, but it's the same "fetched, never hand-typed"
    // shape as everything else here.
    igdb_url: item?.igdb_url ?? null,
    igdb_rating: item?.igdb_rating ?? null,
    igdb_rating_count: item?.igdb_rating_count ?? null,
    openlibrary_rating: item?.openlibrary_rating ?? null,
    openlibrary_ratings_count: item?.openlibrary_ratings_count ?? null,
  });
  // Same reasoning as ratingBreakdownRef above — Discogs' tracklist is
  // fetched data, not something a user hand-types track by track.
  const tracklistRef = useRef(item?.tracklist ?? null);
  // Same reasoning again — when metadata was last actually fetched from a
  // source, purely derived, never hand-edited.
  const metadataCheckedDateRef = useRef(item?.metadata_checked_date ?? null);
  const [trailerUrl, setTrailerUrl]     = useState(item?.trailer_url || "");

  // Board Game fields
  const [playerCount, setPlayerCount]   = useState(item?.player_count || "");
  const [playTime, setPlayTime]         = useState(item?.play_time    || "");
  const [complexity, setComplexity]     = useState(item?.complexity   ?? "");
  const [bggUrl, setBggUrl]             = useState(item?.bgg_url      || "");

  // Item Profile fields
  const [writer, setWriter]                     = useState(item?.writer             || "");
  const [composer, setComposer]                 = useState(item?.composer           || "");
  const [studio, setStudio]                     = useState(item?.studio             || "");
  const [budget, setBudget]                     = useState(item?.budget             || "");
  const [boxOffice, setBoxOffice]               = useState(item?.box_office         || "");
  const [publisher, setPublisher]               = useState(item?.publisher          || "");
  const [themes, setThemes]                     = useState(item?.themes             || "");
  const [gameModes, setGameModes]               = useState(item?.game_modes         || "");
  const [playerPerspective, setPlayerPerspective] = useState(item?.player_perspective || "");
  const [gameEngine, setGameEngine]             = useState(item?.game_engine        || "");
  const [tags, setTags]                         = useState(item?.tags               || "");
  const [editionFormat, setEditionFormat]       = useState(item?.edition_format     || "");
  const [abridged, setAbridged]                 = useState(item?.abridged === 1);
  const [style, setStyle]                       = useState(item?.style              || "");
  const [albumType, setAlbumType]               = useState(item?.album_type         || "");
  const [copyrightText, setCopyrightText]       = useState(item?.copyright          || "");
  const [artist, setArtist]                     = useState(item?.artist             || "");
  const [mechanics, setMechanics]               = useState(item?.mechanics          || "");
  const [minAge, setMinAge]                     = useState(item?.min_age            || "");
  const [condition, setCondition]               = useState(item?.condition          || "");
  const [personalNotes, setPersonalNotes]       = useState(item?.personal_notes     || "");
  const [ownedPlatform, setOwnedPlatform]       = useState(item?.owned_platform     || "");

  // New media types (Trading Card Game, Web Video, Website)
  const [setName, setSetName]                   = useState(item?.set_name           || "");
  const [collectorNumber, setCollectorNumber]   = useState(item?.collector_number   || "");
  const [rarity, setRarity]                     = useState(item?.rarity             || "");
  const [typeLine, setTypeLine]                 = useState(item?.type_line          || "");
  const [manaCost, setManaCost]                 = useState(item?.mana_cost          || "");
  const [powerToughness, setPowerToughness]     = useState(item?.power_toughness    || "");
  const [formatLegality, setFormatLegality]     = useState(item?.format_legality    || "");
  const [subscribers, setSubscribers]           = useState(item?.subscribers        || "");
  const [videoCount, setVideoCount]             = useState(item?.video_count        || "");
  const [system, setSystem]                     = useState(item?.system             || "");
  const [recommendedLevel, setRecommendedLevel] = useState(item?.recommended_level  || "");
  const [siteName, setSiteName]                 = useState(item?.site_name          || "");
  const [url, setUrl]                           = useState(item?.url                || "");
  const [episodeCount, setEpisodeCount]         = useState(item?.episode_count      || "");

  // Cover art
  const [coverArtPath, setCoverArtPath]       = useState(item?.cover_art_path || null);
  const [coverArtPreview, setCoverArtPreview] = useState(item?.cover_art_path || null);
  const [fetchingArt, setFetchingArt]         = useState(false);
  const [fetchArtError, setFetchArtError]     = useState(null);
  const [cropSource, setCropSource]           = useState(null); // pending file:// src awaiting crop
  const [coverDragOver, setCoverDragOver]     = useState(false);

  // Validation
  const [errors, setErrors]             = useState({});

  useEffect(() => {
    if (status !== "consumed" && status !== "dropped") {
      setRating(null);
    }
  }, [status]);

  // Owned Locally and status stay independent everywhere else, but the
  // Wishlist/Not Started boundary specifically tracks ownership — marking
  // owned while Wishlist bumps to Not Started, and un-marking while Not
  // Started drops back to Wishlist. Any other status is left alone.
  const handleToggleLocal = () => {
    const next = !isLocal;
    setIsLocal(next);
    if (next && status === "wishlist") setStatus("not-started");
    if (!next && status === "not-started") setStatus("wishlist");
  };

  // Picking (click) or dropping a local file both route through the crop
  // tool — coverArtPath/Preview only get set once the user confirms.
  const handleCoverArtClick = async () => {
    const selectedPath = await window.vault.dialog.openImage();
    if (!selectedPath) return;
    setCropSource(`file://${selectedPath}`);
  };

  const handleCoverArtRemove = () => {
    setCoverArtPath(null);
    setCoverArtPreview(null);
  };

  const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
  const handleCoverDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setCoverDragOver(true); };
  const handleCoverDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setCoverDragOver(false); };
  const handleCoverDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCoverDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const filePath = window.vault.files.getPathForFile(file);
    if (!filePath || !IMAGE_EXTENSIONS.test(filePath)) return;
    setCropSource(`file://${filePath}`);
  };

  const handleCropConfirm = async (dataUrl) => {
    const savedPath = await window.vault.files.saveCoverArtDataUrl(dataUrl);
    setCoverArtPath(savedPath);
    setCoverArtPreview(savedPath);
    setCropSource(null);
  };

  const handleCropCancel = () => setCropSource(null);

  // forceOverwrite: true replaces every fetched field unconditionally
  // instead of only filling blank ones — the "Force Refresh" button. Needed
  // because the normal safe-merge behaviour can never correct an
  // already-populated field, even with wrong or stale data.
  const handleFetchArt = async (forceOverwrite = false) => {
    // Website works backwards from every other type — there's no title to
    // search by yet; the URL itself is the input and the fetch fills in
    // the title.
    if (mediaType === "Website") {
      if (!url.trim()) return;
      setFetchingArt(true);
      setFetchArtError(null);
      try {
        const details = await window.vault.website.fetchInfo(url.trim());
        const current = { title, site_name: siteName, creator, year, notes, cover_art_path: coverArtPath };
        const patch = applyFetchedPatch(details, current, {
          overwrite: forceOverwrite,
          alwaysFresh: ["metadata_checked_date"],
        });
        applyPatchToSetters(patch, {
          title:      setTitle,
          site_name:  setSiteName,
          creator:    setCreator,
          year:       v => setYear(String(v)),
          notes:      setNotes,
          cover_art_path: v => { setCoverArtPath(v); setCoverArtPreview(v); },
          metadata_checked_date: v => { metadataCheckedDateRef.current = v; },
        });
      } catch (err) {
        setFetchArtError(cleanIpcError(err) || "Failed to fetch page info");
      } finally {
        setFetchingArt(false);
      }
      return;
    }

    if (!title.trim()) return;
    setFetchingArt(true);
    setFetchArtError(null);
    try {
      let localPath;
      if (mediaType === "Board Game") {
        let bggId = item?.platform_id || null;
        if (!bggId) {
          const results = await bggSearch(title.trim());
          if (!results.length) throw new Error("No board game found on BGG — try uploading art manually.");
          bggId = results[0].platformId;
        }
        const details = await bggDetails(bggId, mediaType);
        // A missing thumbnail no longer fails the whole fetch — BGG can have
        // solid metadata without cover art, and this is "Fetch Info" now,
        // not just art.
        if (details._thumbnailUrl) {
          details.cover_art_path = await window.vault.bgg.downloadArt(details._thumbnailUrl, bggId);
        }
        const current = {
          title, creator, genre, year, notes, cover_art_path: coverArtPath,
          player_count: playerCount, play_time: playTime, complexity,
          bgg_url: bggUrl, publisher, system, recommended_level: recommendedLevel, min_age: minAge,
        };
        const patch = applyFetchedPatch(details, current, {
          overwrite: forceOverwrite,
          alwaysFresh: ["platform_id", "metadata_checked_date", "bgg_rating", "bgg_rating_count", "bgg_rank"],
        });
        applyPatchToSetters(patch, {
          title:         setTitle,
          creator:       setCreator,
          genre:         setGenre,
          year:          v => setYear(String(v)),
          notes:         setNotes,
          cover_art_path: v => { setCoverArtPath(v); setCoverArtPreview(v); },
          player_count:  setPlayerCount,
          play_time:     v => setPlayTime(String(v)),
          complexity:    v => setComplexity(String(v)),
          bgg_url:       setBggUrl,
          publisher:     setPublisher,
          system:        setSystem,
          recommended_level: setRecommendedLevel,
          min_age:       v => setMinAge(String(v)),
          platform_id:   setPlatformId,
          metadata_checked_date: v => { metadataCheckedDateRef.current = v; },
          bgg_rating:       v => { ratingBreakdownRef.current.bgg_rating = v; },
          bgg_rating_count: v => { ratingBreakdownRef.current.bgg_rating_count = v; },
          bgg_rank:         v => { ratingBreakdownRef.current.bgg_rank = v; },
        });
        if (!coverArtPath && !patch.cover_art_path) throw new Error("No thumbnail found on BGG — try uploading art manually.");
      } else if (mediaType === "Movie" || mediaType === "TV") {
        const details = await window.vault.movie.lookupDetails({
          title:       title.trim(),
          year:        year || null,
          media_type:  mediaType,
          platform_id: platformId,
        });
        const current = {
          title, creator, genre, year, country, language, critic_rating: criticRating,
          content_rating: contentRating, trailer_url: trailerUrl, runtime, imdb_url: imdbUrl,
          series_name: seriesName, notes, network, season_count: seasonCount, cover_art_path: coverArtPath,
        };
        const patch = applyFetchedPatch(details, current, {
          overwrite: forceOverwrite,
          // Purely derived, nothing a user hand-curates to protect — always
          // take the freshest value. Also what lets Fetch Info upgrade an
          // item stuck on the old plain-name cast format to the richer
          // photo one, and an item added via OMDB upgrade to a TMDB id.
          alwaysFresh: [
            "platform_id", "cast_list", "metadata_checked_date",
            "imdb_rating", "imdb_votes", "rotten_tomatoes_rating", "metacritic_rating", "tmdb_rating", "tmdb_votes",
          ],
        });
        applyPatchToSetters(patch, {
          title:          setTitle,
          creator:        setCreator,
          genre:          setGenre,
          year:           v => setYear(String(v)),
          country:        setCountry,
          language:       setLanguage,
          critic_rating:  setCriticRating,
          content_rating: setContentRating,
          trailer_url:    setTrailerUrl,
          runtime:        v => setRuntime(String(v)),
          imdb_url:       setImdbUrl,
          series_name:    setSeriesName,
          notes:          setNotes,
          network:        setNetwork,
          season_count:   v => setSeasonCount(String(v)),
          cover_art_path: v => { setCoverArtPath(v); setCoverArtPreview(v); },
          platform_id:    setPlatformId,
          cast_list:      v => { setCastList(parseCastList(v).map(c => c.name).join(", ")); setCastListSource(v); },
          metadata_checked_date: v => { metadataCheckedDateRef.current = v; },
          imdb_rating:             v => { ratingBreakdownRef.current.imdb_rating = v; },
          imdb_votes:              v => { ratingBreakdownRef.current.imdb_votes = v; },
          rotten_tomatoes_rating:  v => { ratingBreakdownRef.current.rotten_tomatoes_rating = v; },
          metacritic_rating:       v => { ratingBreakdownRef.current.metacritic_rating = v; },
          tmdb_rating:             v => { ratingBreakdownRef.current.tmdb_rating = v; },
          tmdb_votes:              v => { ratingBreakdownRef.current.tmdb_votes = v; },
        });
      } else if (mediaType === "Music") {
        const details = await window.vault.music.lookupDetails({
          title:       title.trim(),
          year:        year || null,
          platform_id: platformId,
        });
        const current = { title, creator, label, genre, style, album_type: albumType, year, cover_art_path: coverArtPath };
        const patch = applyFetchedPatch(details, current, {
          overwrite: forceOverwrite,
          alwaysFresh: ["platform_id", "tracklist", "metadata_checked_date"],
        });
        applyPatchToSetters(patch, {
          title:      setTitle,
          creator:    setCreator,
          label:      setLabel,
          genre:      setGenre,
          style:      setStyle,
          album_type: setAlbumType,
          year:       v => setYear(String(v)),
          cover_art_path: v => { setCoverArtPath(v); setCoverArtPreview(v); },
          platform_id: setPlatformId,
          tracklist:   v => { tracklistRef.current = v; },
          metadata_checked_date: v => { metadataCheckedDateRef.current = v; },
        });
      } else if (mediaType === "Podcast") {
        const details = await window.vault.podcast.lookupDetails({
          title:       title.trim(),
          platform_id: platformId,
        });
        const current = {
          title, creator, network, genre, language, episode_count: episodeCount,
          runtime, year, notes, copyright: copyrightText, cover_art_path: coverArtPath,
        };
        const patch = applyFetchedPatch(details, current, {
          overwrite: forceOverwrite,
          alwaysFresh: ["platform_id", "metadata_checked_date"],
        });
        applyPatchToSetters(patch, {
          title:         setTitle,
          creator:       setCreator,
          network:       setNetwork,
          genre:         setGenre,
          language:      setLanguage,
          episode_count: setEpisodeCount,
          runtime:       v => setRuntime(String(v)),
          year:          v => setYear(String(v)),
          notes:         setNotes,
          copyright:     setCopyrightText,
          cover_art_path: v => { setCoverArtPath(v); setCoverArtPreview(v); },
          platform_id:   setPlatformId,
          metadata_checked_date: v => { metadataCheckedDateRef.current = v; },
        });
      } else if (mediaType === "Game") {
        // Search Online's own Steam/GOG/Epic flow is untouched — this is
        // for a Game added another way (manually typed, Photo Scanned,
        // CSV-imported) with no metadata beyond a title. IGDB is optional;
        // its own try/catch here means no key or a genuine no-match falls
        // through to the plain Steam-cover-art-only fetch below instead of
        // surfacing as an error.
        let igdbDetails = null;
        try {
          igdbDetails = await window.vault.game.igdbLookupDetails({
            title:       title.trim(),
            platform_id: platformId,
          });
        } catch { /* no IGDB key set, or no match — fall through below */ }

        if (igdbDetails) {
          const current = {
            title, creator, publisher, platform, genre, themes, game_modes: gameModes,
            player_perspective: playerPerspective, game_engine: gameEngine,
            year, notes, cover_art_path: coverArtPath,
          };
          const patch = applyFetchedPatch(igdbDetails, current, {
            overwrite: forceOverwrite,
            // igdb_rating/igdb_rating_count always refresh regardless of
            // Force Overwrite, same reasoning as bgg_rating elsewhere in
            // this file — a rating is live data that should update on every
            // re-fetch.
            alwaysFresh: ["platform_id", "metadata_checked_date", "igdb_url", "igdb_rating", "igdb_rating_count"],
          });
          applyPatchToSetters(patch, {
            title:               setTitle,
            creator:             setCreator,
            publisher:           setPublisher,
            platform:            setPlatform,
            genre:               setGenre,
            themes:              setThemes,
            game_modes:          setGameModes,
            player_perspective:  setPlayerPerspective,
            game_engine:         setGameEngine,
            year:                v => setYear(String(v)),
            notes:               setNotes,
            cover_art_path:      v => { setCoverArtPath(v); setCoverArtPreview(v); },
            platform_id:         setPlatformId,
            metadata_checked_date: v => { metadataCheckedDateRef.current = v; },
            igdb_url:            v => { ratingBreakdownRef.current.igdb_url = v; },
            igdb_rating:         v => { ratingBreakdownRef.current.igdb_rating = v; },
            igdb_rating_count:   v => { ratingBreakdownRef.current.igdb_rating_count = v; },
          });
        } else {
          localPath = await window.vault.coverArt.fetch({
            title:      title.trim(),
            year:       year || null,
            mediaType,
            imdbUrl:    imdbUrl.trim() || null,
            platformId: item?.platform_id || null,
          });
          setCoverArtPath(localPath);
          setCoverArtPreview(localPath);
        }
      } else if (mediaType === "Book" || mediaType === "Audiobook") {
        // No key needed (Open Library is keyless) — its own try/catch means
        // a genuine no-match falls through to the plain cover-art-only
        // fetch below instead of surfacing as an error, same as Game above.
        let bookDetails = null;
        try {
          bookDetails = await window.vault.book.lookupDetails({
            title:       title.trim(),
            platform_id: platformId,
          });
        } catch { /* no match — fall through below */ }

        if (bookDetails) {
          const current = { title, creator, genre, notes, cover_art_path: coverArtPath, series_name: seriesName, tags };
          const patch = applyFetchedPatch(bookDetails, current, {
            overwrite: forceOverwrite,
            // Same reasoning as igdb_rating above — a rating is live data
            // that should update on every re-fetch.
            alwaysFresh: ["platform_id", "metadata_checked_date", "openlibrary_rating", "openlibrary_ratings_count"],
          });
          applyPatchToSetters(patch, {
            title:          setTitle,
            creator:        setCreator,
            genre:          setGenre,
            notes:          setNotes,
            cover_art_path: v => { setCoverArtPath(v); setCoverArtPreview(v); },
            series_name:    setSeriesName,
            tags:           setTags,
            platform_id:    setPlatformId,
            metadata_checked_date: v => { metadataCheckedDateRef.current = v; },
            openlibrary_rating:        v => { ratingBreakdownRef.current.openlibrary_rating = v; },
            openlibrary_ratings_count: v => { ratingBreakdownRef.current.openlibrary_ratings_count = v; },
          });
        } else {
          localPath = await window.vault.coverArt.fetch({
            title:      title.trim(),
            year:       year || null,
            mediaType,
            imdbUrl:    imdbUrl.trim() || null,
            platformId: item?.platform_id || null,
          });
          setCoverArtPath(localPath);
          setCoverArtPreview(localPath);
        }
      } else {
        localPath = await window.vault.coverArt.fetch({
          title:      title.trim(),
          year:       year || null,
          mediaType,
          imdbUrl:    imdbUrl.trim() || null,
          platformId: item?.platform_id || null,
        });
        setCoverArtPath(localPath);
        setCoverArtPreview(localPath);
      }
    } catch (err) {
      setFetchArtError(cleanIpcError(err) || "Failed to fetch cover art");
    } finally {
      setFetchingArt(false);
    }
  };

  const validate = () => {
    const e = {};
    if (!title.trim()) e.title = "Title is required";
    if (mediaType === "Custom" && !customTypeId) e.mediaType = "Pick a custom type";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    let finalCoverArtPath = null;
    if (coverArtPath === null) {
      finalCoverArtPath = null;
    } else if (coverArtPath.includes("cover_art")) {
      // Already saved — fetched via API or previously stored
      finalCoverArtPath = coverArtPath;
    } else {
      // Local file selected by user — copy it into cover_art folder
      finalCoverArtPath = await window.vault.files.saveCoverArt(coverArtPath);
    }

    const formData = {
      title:         title.trim(),
      media_type:    mediaType,
      status,
      is_local:      isLocal,
      rating:        (status === "consumed" || status === "dropped") && rating !== null ? ratingToStored(rating) : null,
      date_consumed: (status === "consumed" || status === "dropped") ? dateConsumed : null,
      notes:         notes.trim() || null,
      cover_art_path: finalCoverArtPath,
      creator:       creator.trim() || null,
      genre:         genre.trim() || null,
      year:          year ? parseInt(year, 10) : null,
      network:       network.trim() || null,
      season_count:  seasonCount ? parseInt(seasonCount, 10) : null,
      narrator:      narrator.trim() || null,
      platform:      platform.trim() || null,
      label:         label.trim() || null,
      runtime:       runtime ? parseInt(runtime, 10) : null,
      imdb_url:      imdbUrl.trim() || null,
      steam_url:     steamUrl.trim() || null,
      platform_id:   platformId || null,
      player_count:  playerCount  || null,
      play_time:     playTime     ? parseInt(playTime, 10)   : null,
      complexity:    complexity !== "" ? parseFloat(complexity) : null,
      bgg_url:       bggUrl.trim() || null,
      series_name:   seriesName.trim() || null,
      series_order:  seriesOrder ? parseInt(seriesOrder, 10) : null,
      video_quality: videoQuality.trim() || null,
      local_path:    localPath.trim() || null,
      // Not a real column on the add/update whitelist — App.jsx's handleSave
      // writes this separately via items.updateFields once the id is known.
      install_path:  mediaType === "Game" ? (installPath.trim() || null) : null,
      country:       country.trim() || null,
      language:      language.trim() || null,
      cast_list:     castList.trim() === parseCastList(castListSource).map(c => c.name).join(", ").trim()
                       ? (castListSource || null)
                       : (castList.trim() || null),
      critic_rating: criticRating.trim() || null,
      ...ratingBreakdownRef.current,
      tracklist:     tracklistRef.current || null,
      metadata_checked_date: metadataCheckedDateRef.current || null,
      content_rating: contentRating.trim() || null,
      trailer_url:   trailerUrl.trim() || null,
      writer:              writer.trim() || null,
      composer:            composer.trim() || null,
      studio:              studio.trim() || null,
      budget:              budget.trim() || null,
      box_office:          boxOffice.trim() || null,
      publisher:           publisher.trim() || null,
      themes:              themes.trim() || null,
      game_modes:          gameModes.trim() || null,
      player_perspective:  playerPerspective.trim() || null,
      game_engine:         gameEngine.trim() || null,
      owned_platform:      ownedPlatform || null,
      tags:                tags.trim() || null,
      edition_format:      editionFormat.trim() || null,
      abridged,
      style:               style.trim() || null,
      album_type:          albumType.trim() || null,
      copyright:           copyrightText.trim() || null,
      artist:              artist.trim() || null,
      mechanics:           mechanics.trim() || null,
      min_age:             minAge ? parseInt(minAge, 10) : null,
      condition:           condition || null,
      personal_notes:      personalNotes.trim() || null,
      set_name:            setName.trim() || null,
      collector_number:    collectorNumber.trim() || null,
      rarity:              rarity.trim() || null,
      type_line:           typeLine.trim() || null,
      mana_cost:           manaCost.trim() || null,
      power_toughness:     powerToughness.trim() || null,
      format_legality:     formatLegality.trim() || null,
      subscribers:         subscribers.trim() || null,
      video_count:         videoCount ? parseInt(videoCount, 10) : null,
      system:              system.trim() || null,
      recommended_level:   recommendedLevel.trim() || null,
      site_name:           siteName.trim() || null,
      url:                 url.trim() || null,
      episode_count:       episodeCount ? parseInt(episodeCount, 10) : null,
      custom_type_id:      mediaType === "Custom" ? customTypeId : null,
      custom_fields:       mediaType === "Custom" ? customFieldValues : null,
    };

    onSave(formData);
  };

  const isCustomType = mediaType === "Custom";
  const activeCustomType = isCustomType ? (customTypes.find(t => t.id === customTypeId) || null) : null;
  const cfg = getTypeConfig(mediaType);
  const fields = isCustomType ? (activeCustomType?.fields || []) : (TYPE_FIELDS[mediaType] || []);
  const getCustomValue = (key) => customFieldValues[key] ?? "";
  const setCustomValue = (key, val) => setCustomFieldValues(prev => ({ ...prev, [key]: val }));

  // Map field key to state setter
  const fieldMap = {
    creator:      { value: creator,      set: setCreator },
    genre:        { value: genre,        set: setGenre },
    year:         { value: year,         set: setYear },
    network:      { value: network,      set: setNetwork },
    season_count: { value: seasonCount,  set: setSeasonCount },
    narrator:     { value: narrator,     set: setNarrator },
    platform:     { value: platform,     set: setPlatform },
    label:        { value: label,        set: setLabel },
    runtime:      { value: runtime,      set: setRuntime },
    imdb_url:     { value: imdbUrl,      set: setImdbUrl },
    steam_url:    { value: steamUrl,     set: setSteamUrl },
    series_name:  { value: seriesName,   set: setSeriesName },
    series_order: { value: seriesOrder,  set: setSeriesOrder },
    player_count: { value: playerCount,  set: setPlayerCount },
    play_time:    { value: playTime,     set: setPlayTime    },
    complexity:   { value: complexity,   set: setComplexity  },
    bgg_url:      { value: bggUrl,       set: setBggUrl      },
    country:       { value: country,       set: setCountry       },
    language:      { value: language,      set: setLanguage      },
    cast_list:     { value: castList,      set: setCastList      },
    critic_rating: { value: criticRating,  set: setCriticRating  },
    content_rating: { value: contentRating, set: setContentRating },
    trailer_url:   { value: trailerUrl,    set: setTrailerUrl    },
    writer:             { value: writer,             set: setWriter },
    composer:           { value: composer,           set: setComposer },
    studio:             { value: studio,             set: setStudio },
    budget:             { value: budget,              set: setBudget },
    box_office:         { value: boxOffice,           set: setBoxOffice },
    publisher:          { value: publisher,           set: setPublisher },
    themes:             { value: themes,              set: setThemes },
    game_modes:         { value: gameModes,           set: setGameModes },
    player_perspective: { value: playerPerspective,   set: setPlayerPerspective },
    game_engine:        { value: gameEngine,          set: setGameEngine },
    owned_platform:     { value: ownedPlatform,       set: setOwnedPlatform },
    tags:               { value: tags,                set: setTags },
    edition_format:     { value: editionFormat,       set: setEditionFormat },
    style:              { value: style,               set: setStyle },
    album_type:         { value: albumType,           set: setAlbumType },
    copyright:          { value: copyrightText,       set: setCopyrightText },
    artist:             { value: artist,              set: setArtist },
    mechanics:          { value: mechanics,           set: setMechanics },
    min_age:            { value: minAge,              set: setMinAge },
    condition:          { value: condition,           set: setCondition },
    set_name:            { value: setName,             set: setSetName },
    collector_number:    { value: collectorNumber,     set: setCollectorNumber },
    rarity:              { value: rarity,              set: setRarity },
    type_line:           { value: typeLine,            set: setTypeLine },
    mana_cost:           { value: manaCost,            set: setManaCost },
    power_toughness:     { value: powerToughness,      set: setPowerToughness },
    format_legality:     { value: formatLegality,      set: setFormatLegality },
    subscribers:         { value: subscribers,         set: setSubscribers },
    video_count:         { value: videoCount,          set: setVideoCount },
    system:              { value: system,              set: setSystem },
    recommended_level:   { value: recommendedLevel,    set: setRecommendedLevel },
    site_name:           { value: siteName,            set: setSiteName },
    url:                 { value: url,                 set: setUrl },
    episode_count:       { value: episodeCount,        set: setEpisodeCount },
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(5,5,10,0.88)",
      backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, width: 540, maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px", borderBottom: `1px solid ${T.border}`,
          flexShrink: 0,
        }}>
          <div style={{ fontFamily: T.fontSerif, fontSize: 17, color: T.text }}>
            {isEditing ? "Edit Item" : "Add Media Item"}
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Form body */}
        <div style={{ overflowY: "auto", padding: "18px 20px", flex: 1, display: "flex", gap: 20 }}>

          {/* Cover art panel */}
          <div style={{ width: 140, flexShrink: 0 }}>
            <label style={{
              fontSize: 9, color: T.muted, display: "block", marginBottom: 8,
              fontFamily: T.fontMono, letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}>Cover Art</label>
            <div
              onClick={handleCoverArtClick}
              onDragOver={handleCoverDragOver}
              onDragLeave={handleCoverDragLeave}
              onDrop={handleCoverDrop}
              style={{
                width: "100%", aspectRatio: isSquareArt(mediaType) ? "1/1" : "2/3",
                background: coverArtPreview ? "transparent" : T.surface2,
                border: `1px dashed ${coverDragOver ? T.accent : T.border}`,
                borderRadius: 5, overflow: "hidden",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                cursor: "pointer", gap: 5,
              }}
            >
              {coverArtPreview ? (
                <img
                  src={coverArtPreview}
                  alt="Cover art"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <>
                  <span style={{ fontSize: 20, opacity: 0.35 }}>↑</span>
                  <span style={{ fontSize: 10, color: T.muted, textAlign: "center", whiteSpace: "pre-line" }}>{"Click or drop\nan image"}</span>
                </>
              )}
            </div>
            {coverArtPreview && (
              <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
                <button
                  onClick={() => setCropSource(coverArtPreview)}
                  title="Crop or zoom the current cover art — including art that was auto-fetched"
                  style={{
                    flex: 1, padding: "4px",
                    background: "transparent", border: `1px solid ${T.border}`,
                    borderRadius: 4, color: T.accent, fontSize: 10,
                    cursor: "pointer", fontFamily: T.fontMono,
                  }}
                >Adjust</button>
                <button
                  onClick={handleCoverArtRemove}
                  style={{
                    flex: 1, padding: "4px",
                    background: "transparent", border: `1px solid ${T.border}`,
                    borderRadius: 4, color: T.muted, fontSize: 10,
                    cursor: "pointer", fontFamily: T.fontMono,
                  }}
                >Remove</button>
              </div>
            )}
            {(mediaType === "Movie" || mediaType === "TV" || mediaType === "Book" || mediaType === "Audiobook" || mediaType === "Game" || mediaType === "Board Game" || mediaType === "Website" || mediaType === "Music" || mediaType === "Podcast") && (() => {
              // Website fetches by URL, not title — everything else needs a
              // title typed first.
              const isDisabled = fetchingArt || (mediaType === "Website" ? !url.trim() : !title.trim());
              // Music/Podcast get the richer Fetch Info + Force Refresh
              // treatment, not just Fetch Art — Discogs/Apple's Lookup API
              // return full metadata in the same call, same shape as
              // Film/TV's TMDB fetch.
              const isInfoType = mediaType === "Movie" || mediaType === "TV" || mediaType === "Website" || mediaType === "Music" || mediaType === "Podcast";
              return (
                <>
                  <button
                    onClick={() => handleFetchArt()}
                    disabled={isDisabled}
                    style={{
                      marginTop: 6, width: "100%", padding: "5px",
                      background: fetchingArt ? T.surface2 : T.hoverWash,
                      border: `1px solid ${T.border}`,
                      borderRadius: 4, color: fetchingArt ? T.muted : T.accent, fontSize: 10,
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      fontFamily: T.fontMono,
                    }}
                  >{fetchingArt ? "Fetching…" : isInfoType ? "✦ Fetch Info" : "✦ Fetch Art"}</button>
                  {isInfoType && (
                    <button
                      onClick={() => {
                        if (confirm("Overwrite every field with freshly-fetched data, including ones already filled in? This can't be undone.")) {
                          handleFetchArt(true);
                        }
                      }}
                      disabled={isDisabled}
                      title="Re-fetch and overwrite every field, not just blank ones — use this to correct wrong or stale data"
                      style={{
                        marginTop: 6, width: "100%", padding: "5px",
                        background: fetchingArt ? T.surface2 : "transparent",
                        border: `1px solid ${T.border}`,
                        borderRadius: 4, color: fetchingArt ? T.muted : "#e8944b", fontSize: 10,
                        cursor: isDisabled ? "not-allowed" : "pointer",
                        fontFamily: T.fontMono,
                      }}
                    >⚠ Force Refresh (overwrite all)</button>
                  )}
                </>
              );
            })()}
            {fetchArtError && (
              <div style={{ fontSize: 9, color: "#e84b6e", marginTop: 4, fontFamily: T.fontMono, lineHeight: 1.4 }}>
                {fetchArtError}
              </div>
            )}
            <div style={{
              fontSize: 9, color: T.muted, marginTop: 5,
              fontFamily: T.fontMono,
            }}>JPG · PNG · WebP</div>
          </div>

          {/* Main form fields */}
          <div style={{ flex: 1, minWidth: 0 }}>

          {/* Title */}
          <div style={{ marginBottom: 14 }}>
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Dune: Part Two"
              style={{ borderColor: errors.title ? "#e84b6e" : T.border }}
            />
            {errors.title && (
              <div style={{ fontSize: 10, color: "#e84b6e", marginTop: 4, fontFamily: T.fontMono }}>
                {errors.title}
              </div>
            )}
          </div>

          {/* Media type */}
          <div style={{ marginBottom: 14 }}>
            <Label>Media Type *</Label>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {MEDIA_TYPES.map(t => (
                <button
                  key={t.label}
                  onClick={() => setMediaType(t.label)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "5px 11px",
                    border: `1px solid ${mediaType === t.label ? t.color : T.border}`,
                    borderRadius: 100, cursor: "pointer",
                    background: mediaType === t.label ? t.color + "22" : "transparent",
                    color: mediaType === t.label ? t.color : T.muted,
                    fontSize: 11, fontFamily: T.fontMono,
                    transition: "all 0.1s",
                  }}
                >
                  <span>{t.icon}</span> {t.label}
                </button>
              ))}
              {customTypes.map(t => {
                const active = mediaType === "Custom" && customTypeId === t.id;
                return (
                  <button
                    key={`custom-${t.id}`}
                    onClick={() => { setMediaType("Custom"); setCustomTypeId(t.id); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "5px 11px",
                      border: `1px solid ${active ? t.color : T.border}`,
                      borderRadius: 100, cursor: "pointer",
                      background: active ? t.color + "22" : "transparent",
                      color: active ? t.color : T.muted,
                      fontSize: 11, fontFamily: T.fontMono,
                      transition: "all 0.1s",
                    }}
                  >
                    <span>{t.icon}</span> {t.label}
                  </button>
                );
              })}
            </div>
            {errors.mediaType && (
              <div style={{ fontSize: 10, color: "#e84b6e", marginTop: 4, fontFamily: T.fontMono }}>
                {errors.mediaType}
              </div>
            )}
          </div>

          {/* Status */}
          <div style={{ marginBottom: 14 }}>
            <Label>Status *</Label>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {[["wishlist", T.blue, "Wishlist"], ["not-started", T.notStarted, "Not Started"], ["in-progress", T.progress, "In Progress"], ["consumed", T.seen, "Consumed"], ["dropped", T.dropped, "Dropped"]].map(([val, color, lbl]) => (
                <button
                  key={val}
                  onClick={() => setStatus(val)}
                  style={{
                    padding: "5px 14px",
                    border: `1px solid ${status === val ? color : T.border}`,
                    borderRadius: 100, cursor: "pointer",
                    background: status === val ? color + "22" : "transparent",
                    color: status === val ? color : T.muted,
                    fontSize: 11, fontFamily: T.fontMono,
                    transition: "all 0.1s",
                  }}
                >{lbl}</button>
              ))}
            </div>
          </div>

          {/* Owned / Local toggle */}
          <div style={{ marginBottom: 14 }}>
            <Label>Owned Locally</Label>
            <button
              onClick={handleToggleLocal}
              style={{
                padding: "5px 14px",
                border: `1px solid ${isLocal ? T.purple : T.border}`,
                borderRadius: 100, cursor: "pointer",
                background: isLocal ? T.purple + "22" : "transparent",
                color: isLocal ? T.purple : T.muted,
                fontSize: 11, fontFamily: T.fontMono,
                transition: "all 0.1s",
              }}
            >{isLocal ? "✓ Owned locally" : "Not owned locally"}</button>
          </div>

          {/* Rating + date consumed — Consumed and Dropped are both ratable */}
          {(status === "consumed" || status === "dropped") && (
            <>
              <div style={{ marginBottom: 14 }}>
                <Label>Rating (-10 to +10) — optional</Label>
                {/* Negative row */}
                <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
                  {[-10,-9,-8,-7,-6,-5,-4,-3,-2,-1].map(n => (
                    <button key={n} onClick={() => setRating(rating === n ? null : n)} style={{
                      flex: 1, padding: "4px 0",
                      border: `1px solid ${rating === n ? "#e84b6e" : T.border}`,
                      borderRadius: 3, background: rating === n ? "#e84b6e33" : "transparent",
                      color: rating === n ? "#e84b6e" : T.muted,
                      fontSize: 9, fontWeight: 600, cursor: "pointer",
                      fontFamily: T.fontMono,
                    }}>{n}</button>
                  ))}
                </div>
                {/* Neutral */}
                <div style={{ marginBottom: 2 }}>
                  <button onClick={() => setRating(rating === 0 ? null : 0)} style={{
                    width: "100%", padding: "4px 0",
                    border: `1px solid ${rating === 0 ? T.muted : T.border}`,
                    borderRadius: 3, background: rating === 0 ? T.muted + "22" : "transparent",
                    color: rating === 0 ? T.text : T.muted,
                    fontSize: 9, fontWeight: 600, cursor: "pointer",
                    fontFamily: T.fontMono,
                  }}>0 — Neutral</button>
                </div>
                {/* Positive row */}
                <div style={{ display: "flex", gap: 2 }}>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button key={n} onClick={() => setRating(rating === n ? null : n)} style={{
                      flex: 1, padding: "4px 0",
                      border: `1px solid ${rating === n ? "#4bb87a" : T.border}`,
                      borderRadius: 3, background: rating === n ? "#4bb87a33" : "transparent",
                      color: rating === n ? "#4bb87a" : T.muted,
                      fontSize: 9, fontWeight: 600, cursor: "pointer",
                      fontFamily: T.fontMono,
                    }}>+{n}</button>
                  ))}
                </div>
                {rating !== null && (
                  <div style={{ fontSize: 10, color: T.muted, marginTop: 4, fontFamily: T.fontMono }}>
                    Rated {rating > 0 ? `+${rating}` : rating} · <span style={{ cursor: "pointer", color: "#e84b6e" }} onClick={() => setRating(null)}>clear</span>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <Label>{status === "dropped" ? "Date Dropped" : "Date Consumed"}</Label>
                <input
                  type="date"
                  value={dateConsumed}
                  onChange={e => setDateConsumed(e.target.value)}
                  style={{
                    padding: "7px 11px", background: T.surface2,
                    border: `1px solid ${T.border}`, borderRadius: 5,
                    color: T.text, fontSize: 12, outline: "none",
                    fontFamily: T.fontSans,
                  }}
                />
              </div>
            </>
          )}

          {/* Type-specific metadata */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginBottom: 14 }}>
            <div style={{
              fontSize: 9, color: T.muted, fontFamily: T.fontMono,
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
            }}>
              {isCustomType ? (activeCustomType?.label || "Custom") : mediaType} details — optional
            </div>
            {isCustomType && !activeCustomType && (
              <div style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>
                Pick a custom type above to see its fields.
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {fields.map(field => (
                <div key={field.key} style={{ gridColumn: (field.key === "imdb_url" || field.key === "steam_url" || field.key === "bgg_url" || field.key === "trailer_url" || field.key === "cast_list" || field.key === "url") ? "1 / -1" : undefined }}>
                  <Label>{field.label}</Label>
                  {isCustomType ? (
                    field.field_type === "checkbox" ? (
                      <button
                        onClick={() => setCustomValue(field.key, !getCustomValue(field.key))}
                        style={{
                          padding: "5px 14px",
                          border: `1px solid ${getCustomValue(field.key) ? T.purple : T.border}`,
                          borderRadius: 100, cursor: "pointer",
                          background: getCustomValue(field.key) ? T.purple + "22" : "transparent",
                          color: getCustomValue(field.key) ? T.purple : T.muted,
                          fontSize: 11, fontFamily: T.fontMono,
                        }}
                      >{getCustomValue(field.key) ? "✓ Yes" : "No"}</button>
                    ) : (
                      <Input
                        value={getCustomValue(field.key)}
                        onChange={e => setCustomValue(field.key, e.target.value)}
                        placeholder="—"
                        type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : field.field_type === "url" ? "url" : "text"}
                      />
                    )
                  ) : field.key === "imdb_url" ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <Input
                        value={fieldMap[field.key]?.value || ""}
                        onChange={e => fieldMap[field.key]?.set(e.target.value)}
                        placeholder="https://www.imdb.com/title/…"
                        style={{ flex: 1 }}
                      />
                      {imdbUrl.trim() && (
                        <button
                          onClick={() => window.vault.shell.openExternal(imdbUrl.trim())}
                          style={{
                            padding: "6px 10px", background: "transparent",
                            border: `1px solid ${T.border}`, borderRadius: 5,
                            color: T.accent, fontSize: 11, cursor: "pointer",
                            fontFamily: T.fontMono, flexShrink: 0,
                          }}
                        >↗ Open</button>
                      )}
                    </div>
                  ) : field.key === "steam_url" ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <Input
                        value={fieldMap[field.key]?.value || ""}
                        onChange={e => fieldMap[field.key]?.set(e.target.value)}
                        placeholder="https://store.steampowered.com/app/…"
                        style={{ flex: 1 }}
                      />
                      {steamUrl.trim() && (
                        <button
                          onClick={() => window.vault.shell.openExternal(steamUrl.trim())}
                          style={{
                            padding: "6px 10px", background: "transparent",
                            border: `1px solid ${T.border}`, borderRadius: 5,
                            color: "#4be8c8", fontSize: 11, cursor: "pointer",
                            fontFamily: T.fontMono, flexShrink: 0,
                          }}
                        >↗ Steam</button>
                      )}
                    </div>
                  ) : field.key === "trailer_url" ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <Input
                        value={fieldMap[field.key]?.value || ""}
                        onChange={e => fieldMap[field.key]?.set(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=…"
                        style={{ flex: 1 }}
                      />
                      {trailerUrl.trim() && (
                        <button
                          onClick={() => window.vault.shell.openExternal(trailerUrl.trim())}
                          style={{
                            padding: "6px 10px", background: "transparent",
                            border: `1px solid ${T.border}`, borderRadius: 5,
                            color: "#f472b6", fontSize: 11, cursor: "pointer",
                            fontFamily: T.fontMono, flexShrink: 0,
                          }}
                        >▶ Play</button>
                      )}
                    </div>
                  ) : field.key === "bgg_url" ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <Input
                        value={fieldMap[field.key]?.value || ""}
                        onChange={e => fieldMap[field.key]?.set(e.target.value)}
                        placeholder="https://boardgamegeek.com/boardgame/…"
                        style={{ flex: 1 }}
                      />
                      {bggUrl.trim() && (
                        <button
                          onClick={() => window.vault.shell.openExternal(bggUrl.trim())}
                          style={{
                            padding: "6px 10px", background: "transparent",
                            border: `1px solid ${T.border}`, borderRadius: 5,
                            color: "#e84b4b", fontSize: 11, cursor: "pointer",
                            fontFamily: T.fontMono, flexShrink: 0,
                          }}
                        >↗ BGG</button>
                      )}
                    </div>
                  ) : field.key === "url" ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <Input
                        value={fieldMap[field.key]?.value || ""}
                        onChange={e => fieldMap[field.key]?.set(e.target.value)}
                        placeholder="https://…"
                        style={{ flex: 1 }}
                      />
                      {url.trim() && (
                        <button
                          onClick={() => window.vault.shell.openExternal(url.trim())}
                          style={{
                            padding: "6px 10px", background: "transparent",
                            border: `1px solid ${T.border}`, borderRadius: 5,
                            color: T.dim, fontSize: 11, cursor: "pointer",
                            fontFamily: T.fontMono, flexShrink: 0,
                          }}
                        >↗ Open</button>
                      )}
                    </div>
                  ) : field.key === "tags" ? (
                    <Input
                      value={fieldMap[field.key]?.value || ""}
                      onChange={e => fieldMap[field.key]?.set(e.target.value)}
                      placeholder="e.g. rewatch, gift idea, cozy"
                    />
                  ) : field.key === "abridged" ? (
                    <button
                      onClick={() => setAbridged(!abridged)}
                      style={{
                        padding: "5px 14px",
                        border: `1px solid ${abridged ? T.purple : T.border}`,
                        borderRadius: 100, cursor: "pointer",
                        background: abridged ? T.purple + "22" : "transparent",
                        color: abridged ? T.purple : T.muted,
                        fontSize: 11, fontFamily: T.fontMono,
                      }}
                    >{abridged ? "✓ Abridged" : "Unabridged"}</button>
                  ) : field.key === "condition" ? (
                    <select
                      value={condition}
                      onChange={e => setCondition(e.target.value)}
                      style={{
                        width: "100%", padding: "7px 11px", boxSizing: "border-box",
                        background: T.surface2, border: `1px solid ${T.border}`,
                        borderRadius: 5, color: T.text, fontSize: 12,
                        outline: "none", fontFamily: T.fontSans,
                      }}
                    >
                      <option value="">—</option>
                      {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : field.key === "owned_platform" ? (
                    <select
                      value={ownedPlatform}
                      onChange={e => setOwnedPlatform(e.target.value)}
                      title="Only for a store this app can't sync (Steam/GOG/Epic are detected automatically)"
                      style={{
                        width: "100%", padding: "7px 11px", boxSizing: "border-box",
                        background: T.surface2, border: `1px solid ${T.border}`,
                        borderRadius: 5, color: T.text, fontSize: 12,
                        outline: "none", fontFamily: T.fontSans,
                      }}
                    >
                      <option value="">—</option>
                      {OWNED_PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <Input
                      value={fieldMap[field.key]?.value || ""}
                      onChange={e => fieldMap[field.key]?.set(e.target.value)}
                      placeholder="—"
                      type={["year","season_count","runtime","series_order","play_time","complexity","min_age","video_count","episode_count"].includes(field.key) ? "number" : "text"}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Local-only fields — shown when owned locally */}
          {isLocal && (
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginBottom: 14 }}>
              <div style={{
                fontSize: 9, color: T.purple, fontFamily: T.fontMono,
                letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
              }}>
                Local copy details
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {(mediaType === "Movie" || mediaType === "TV") && (
                  <div>
                    <Label>Video Quality</Label>
                    <Input
                      value={videoQuality}
                      onChange={e => setVideoQuality(e.target.value)}
                      placeholder="e.g. 1080p, 4K"
                    />
                  </div>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <Label>Local Folder Path</Label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Input
                      value={localPath}
                      onChange={e => setLocalPath(e.target.value)}
                      placeholder="Path to local folder"
                      style={{ flex: 1 }}
                    />
                    {localPath.trim() && (
                      <button
                        onClick={() => window.vault.shell.openPath(localPath.trim())}
                        style={{
                          padding: "6px 10px", background: "transparent",
                          border: `1px solid ${T.border}`, borderRadius: 5,
                          color: T.purple, fontSize: 11, cursor: "pointer",
                          fontFamily: T.fontMono, flexShrink: 0,
                        }}
                      >📁 Open</button>
                    )}
                  </div>
                </div>
                {mediaType === "Game" && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Label>Launch Path (.exe)</Label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Input
                        value={installPath}
                        onChange={e => setInstallPath(e.target.value)}
                        placeholder="Path to game executable — enables the ▶ Launch button"
                        style={{ flex: 1 }}
                      />
                      <button
                        disabled={browsingExe}
                        onClick={async () => {
                          setBrowsingExe(true);
                          try {
                            const picked = await window.vault.dialog.openExecutable();
                            if (picked) setInstallPath(picked);
                          } finally {
                            setBrowsingExe(false);
                          }
                        }}
                        style={{
                          padding: "6px 10px", background: "transparent",
                          border: `1px solid ${T.border}`, borderRadius: 5,
                          color: T.purple, fontSize: 11, cursor: browsingExe ? "default" : "pointer",
                          fontFamily: T.fontMono, flexShrink: 0,
                          opacity: browsingExe ? 0.6 : 1,
                        }}
                      >📁 Browse</button>
                      {installPath.trim() && (
                        <button
                          onClick={() => window.vault.game.launch(installPath.trim())}
                          style={{
                            padding: "6px 10px", background: "transparent",
                            border: `1px solid ${T.border}`, borderRadius: 5,
                            color: "#4be8c8", fontSize: 11, cursor: "pointer",
                            fontFamily: T.fontMono, flexShrink: 0,
                          }}
                        >▶ Test</button>
                      )}
                    </div>
                    {/* Only used by games with no Steam appid/GOG/Epic scan match — those
                        populate this automatically and don't need it set by hand. */}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom: 4 }}>
            <Label>Description — optional</Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Synopsis / plot / summary… (auto-filled by Fetch Info where available)"
              rows={3}
              style={{
                width: "100%", padding: "8px 11px",
                background: T.surface2, border: `1px solid ${T.border}`,
                borderRadius: 5, color: T.text, fontSize: 12,
                outline: "none", resize: "vertical",
                boxSizing: "border-box", fontFamily: T.fontSans,
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* Personal notes — distinct from Description above: this is the
              user's own take, never auto-filled by any enrichment source. */}
          <div style={{ marginBottom: 4 }}>
            <Label>Personal Notes — optional</Label>
            <textarea
              value={personalNotes}
              onChange={e => setPersonalNotes(e.target.value)}
              placeholder="Your own thoughts…"
              rows={3}
              style={{
                width: "100%", padding: "8px 11px",
                background: T.surface2, border: `1px solid ${T.border}`,
                borderRadius: 5, color: T.text, fontSize: 12,
                outline: "none", resize: "vertical",
                boxSizing: "border-box", fontFamily: T.fontSans,
                lineHeight: 1.5,
              }}
            />
          </div>
          </div>{/* end main form fields */}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 8, padding: "14px 20px",
          borderTop: `1px solid ${T.border}`, flexShrink: 0,
        }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: "9px", background: T.accent, color: T.bg,
              border: "none", borderRadius: 5, fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: T.fontSans,
            }}
          >{isEditing ? "Save Changes" : "Add to Library"}</button>
          <button
            onClick={onClose}
            style={{
              padding: "9px 18px", background: "transparent",
              border: `1px solid ${T.border}`, borderRadius: 5,
              color: T.muted, fontSize: 13, cursor: "pointer",
            }}
          >Cancel</button>
        </div>
      </div>

      {cropSource && (
        <CropModal
          imageSrc={cropSource}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
          square={isSquareArt(mediaType)}
        />
      )}
    </div>
  );
}
