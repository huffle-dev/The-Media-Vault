// The item profile's related rows, mirroring desktop's: More from the
// creator, More in the series, Similar to this title. Each row shows titles already in the library as real tiles that
// open their own profile, followed by titles from the source's catalog that
// aren't owned yet — tap one to preview it and add it to the library.
//
// Board Game rows (More from designer, Expansions) need BGG, which the
// phone can't reach until the official-API work lands.
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "./Text";
import BottomSheet from "./BottomSheet";
import { useCoverArt } from "./Tile";
import { useLibrary } from "./LibraryContext";
import { movie, openLibrary, podcast, discogs, steam, igdb, audible, youtube } from "./mediaServices";
import { addWorkToLibrary, workPosterUrl } from "./addExternalWork";
import { getTypeConfig } from "@media-vault/core/tokens/mediaTypes.js";
import { formatRating, ratingColor } from "@media-vault/core/tokens/ratings.js";
import { isSquareArt } from "@media-vault/core/tokens/itemHelpers.js";
import { C, F } from "./colors";

const TILE_W = 104;

// Runs `fetcher` (returning a promise of works, or null to skip) whenever
// `deps` change; returns { works, loading }. Failures just mean an empty row.
function useWorks(fetcher, deps) {
  const [state, setState] = useState({ works: [], loading: false });
  useEffect(() => {
    let cancelled = false;
    const promise = fetcher();
    if (!promise) { setState({ works: [], loading: false }); return; }
    setState({ works: [], loading: true });
    promise
      .then((works) => { if (!cancelled) setState({ works: (works || []).filter((w) => w.title), loading: false }); })
      .catch(() => { if (!cancelled) setState({ works: [], loading: false }); });
    return () => { cancelled = true; };
  }, deps);
  return state;
}

function LibraryTile({ item, keys, onPress }) {
  const artUri = useCoverArt(item, keys);
  const cfg = getTypeConfig(item.media_type);
  const square = isSquareArt(item.media_type);
  return (
    <Pressable style={styles.tile} onPress={onPress}>
      <View style={[styles.art, styles.artCenter]}>
        {artUri
          ? <Image source={{ uri: artUri }} style={square ? styles.imgSquare : styles.imgFill} />
          : <Text style={styles.fallbackIcon}>{cfg.icon}</Text>}
      </View>
      <Text style={styles.tileTitle} numberOfLines={2}>{item.title}</Text>
      {item.rating != null
        ? <Text style={[styles.tileMeta, { color: ratingColor(item.rating) }]}>{formatRating(item.rating)}</Text>
        : item.year ? <Text style={styles.tileMeta}>{item.year}</Text> : null}
    </Pressable>
  );
}

function WorkTile({ work, onPress }) {
  const uri = workPosterUrl(work);
  const square = isSquareArt(work.mediaType);
  return (
    <Pressable style={styles.tile} onPress={onPress}>
      <View style={[styles.art, styles.artCenter]}>
        {uri
          ? <Image source={{ uri }} style={[square ? styles.imgSquare : styles.imgFill, { opacity: 0.85 }]} />
          : <Text style={styles.fallbackIcon}>{getTypeConfig(work.mediaType).icon}</Text>}
        <Text style={styles.plus}>+</Text>
      </View>
      <Text style={styles.tileTitle} numberOfLines={2}>{work.title}</Text>
      <Text style={styles.tileMeta} numberOfLines={1}>
        {[work.year, work.rating != null ? `★ ${Number(work.rating).toFixed(1)}` : null].filter(Boolean).join(" · ")}
      </Text>
    </Pressable>
  );
}

function Row({ title, libraryItems, works, loading, keys, onOpenItem, onSelectWork }) {
  if (!libraryItems.length && !works.length && !loading) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowContent}>
        {libraryItems.map((i) => <LibraryTile key={`lib-${i.sync_id}`} item={i} keys={keys} onPress={() => onOpenItem(i.sync_id)} />)}
        {works.map((w) => <WorkTile key={`ext-${w.mediaType}-${w.id}`} work={w} onPress={() => onSelectWork(w)} />)}
        {loading && <ActivityIndicator style={{ marginHorizontal: 16 }} />}
      </ScrollView>
    </View>
  );
}

export default function RelatedRows({ item, keys, offline, onOpenItem, onAdded }) {
  const { items } = useLibrary();
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [addedIds, setAddedIds] = useState(() => new Set());

  const type = item.media_type;
  const pid = item.platform_id ? String(item.platform_id) : null;
  const k = keys || {};

  // ── Library matching (mirrors desktop): same-type items other than this
  // one, matched to a catalog title by id first (numeric TMDB/Steam ids and
  // Audible ASINs), then by title, so an owned title shows as a real tile
  // rather than a "+" one.
  const { byTitle, byId } = useMemo(() => {
    const byTitle = new Map();
    const byId = new Map();
    for (const i of items || []) {
      if (i.sync_id === item.sync_id || i.media_type !== type) continue;
      byTitle.set((i.title || "").toLowerCase(), i);
      if (i.platform_id) byId.set(String(i.platform_id).replace(/^audible-/, ""), i);
    }
    return { byTitle, byId };
  }, [items, item.sync_id, type]);
  const ownedMatch = (w) => byId.get(String(w.id)) || byTitle.get(w.title.toLowerCase()) || null;
  const notOwned = (w) => !ownedMatch(w) && (w.title || "").toLowerCase() !== (item.title || "").toLowerCase() && !addedIds.has(`${w.mediaType}-${w.id}`);

  // ── More from the creator
  const moreFromCreatorLib = useMemo(() => !item.creator ? [] : (items || []).filter((i) =>
    i.sync_id !== item.sync_id && i.media_type === type && (i.creator || "").toLowerCase() === item.creator.toLowerCase()
  ), [items, item.sync_id, item.creator, type]);

  const creatorFetch = useWorks(() => {
    if (!item.creator) return null;
    if (type === "Movie" || type === "TV") return k.tmdb ? movie.getMovieMoreFromCreator(item.creator, type, k.tmdb) : null;
    if (type === "Book") return openLibrary.getBookWorksByAuthor(item.creator, pid);
    if (type === "Audiobook") return audible.getAudibleMoreFromAuthor(item.creator, pid);
    if (type === "Music") return discogs.getMusicMoreFromArtist(item.creator, item.title, k.discogs);
    if (type === "Podcast") return podcast.getPodcastMoreFromHost(item.creator, pid);
    if (type === "Game") return k.igdbId && k.igdbSecret ? igdb.getIgdbMoreFromDeveloper(item.creator, item.title, k.igdbId, k.igdbSecret) : null;
    // A channel's latest uploads (a video/playlist item has none).
    if (type === "Web Video") return pid && !/^(video|playlist)-/.test(pid) && k.youtube ? youtube.getYoutubeRecentUploads(pid, items, k.youtube) : null;
    return null;
  }, [item.sync_id, keys]);

  // ── More in the series
  const moreInSeriesLib = useMemo(() => !item.series_name ? [] : (items || []).filter((i) =>
    i.sync_id !== item.sync_id && (i.series_name || "").toLowerCase() === item.series_name.toLowerCase()
  ), [items, item.sync_id, item.series_name]);

  const seriesFetch = useWorks(() =>
    item.series_name && type === "Movie" && k.tmdb ? movie.getMovieMoreFromSeries(item.series_name, k.tmdb) : null,
  [item.sync_id, keys]);

  // ── Similar to this title
  const similarFetch = useWorks(() => {
    if (type === "Movie" || type === "TV") return pid && k.tmdb ? movie.getMovieSimilarTitles(pid, type, k.tmdb) : null;
    if (type === "Book") return item.genre ? openLibrary.getBookSimilarByGenre(item.genre, pid) : null;
    if (type === "Music") return item.genre ? discogs.getMusicSimilarByGenre(item.genre, item.style, pid, k.discogs) : null;
    if (type === "Podcast") return item.genre ? podcast.getPodcastSimilarByGenre(item.genre, pid) : null;
    if (type === "Game") {
      if (!pid) return null;
      const igdbCreds = k.igdbId && k.igdbSecret;
      if (/^\d+$/.test(pid)) {
        // Steam's own "more like this" first, IGDB when it yields nothing
        // (Steam's page is scraped and intermittently blocked).
        return steam.fetchSteamSimilarGames(pid).catch(() => []).then((works) =>
          works && works.length ? works : (igdbCreds ? igdb.getIgdbSimilarGamesByTitle(item.title, k.igdbId, k.igdbSecret) : []));
      }
      if (!igdbCreds) return null;
      return pid.startsWith("igdb-")
        ? igdb.getIgdbSimilarGames(pid.slice("igdb-".length), k.igdbId, k.igdbSecret)
        : igdb.getIgdbSimilarGamesByTitle(item.title, k.igdbId, k.igdbSecret);
    }
    return null;
  }, [item.sync_id, keys]);

  // Similar results already owned render as real tiles instead of "+" ones.
  const similarLib = [];
  const similarExt = [];
  for (const w of similarFetch.works) {
    const match = ownedMatch(w);
    if (match) similarLib.push(match); else if (notOwned(w)) similarExt.push(w);
  }

  async function handleAdd(work) {
    setBusy(true);
    setMessage(null);
    try {
      await addWorkToLibrary(work, k);
      setAddedIds((prev) => new Set(prev).add(`${work.mediaType}-${work.id}`));
      setSelected(null);
      onAdded();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  const rowProps = { keys, onOpenItem, onSelectWork: (w) => { setMessage(null); setSelected(w); } };

  return (
    <View>
      <Row
        {...rowProps} title={`More from ${item.creator}`}
        libraryItems={moreFromCreatorLib} works={creatorFetch.works.filter(notOwned)} loading={creatorFetch.loading}
      />
      <Row
        {...rowProps} title={`More in ${item.series_name}`}
        libraryItems={moreInSeriesLib} works={seriesFetch.works.filter(notOwned)} loading={false}
      />
      <Row
        {...rowProps} title={`Similar to ${item.title}`}
        libraryItems={similarLib} works={similarExt} loading={similarFetch.loading}
      />

      <BottomSheet visible={!!selected} title={selected?.mediaType || ""} onClose={() => setSelected(null)}>
        {selected && (
          <View style={styles.sheetBody}>
            <View style={styles.sheetTop}>
              <View style={[styles.art, styles.artCenter, styles.sheetArt]}>
                {workPosterUrl(selected)
                  ? <Image source={{ uri: workPosterUrl(selected) }} style={styles.imgFill} />
                  : <Text style={styles.fallbackIcon}>{getTypeConfig(selected.mediaType).icon}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{selected.title}</Text>
                <Text style={styles.tileMeta}>{[selected.year, selected.genre, selected.creator].filter(Boolean).join(" · ")}</Text>
              </View>
            </View>
            {message && <Text style={styles.error}>{message}</Text>}
            <Pressable
              onPress={() => handleAdd(selected)} disabled={busy || offline}
              style={[styles.primaryBtn, (busy || offline) && { opacity: 0.5 }]}
            >
              <Text style={styles.primaryText}>{offline ? "Offline — can't add" : busy ? "Adding…" : "+ Add to Library"}</Text>
            </Pressable>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 26 },
  sectionTitle: { fontFamily: F.mono,
    color: C.accent, fontSize: 11, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, paddingBottom: 8, marginBottom: 12,
  },
  rowContent: { gap: 12, paddingRight: 8 },
  tile: { width: TILE_W },
  art: { width: TILE_W, aspectRatio: 2 / 3, borderRadius: 8, backgroundColor: C.surface, overflow: "hidden" },
  artCenter: { alignItems: "center", justifyContent: "center" },
  imgFill: { width: "100%", height: "100%" },
  imgSquare: { width: "100%", aspectRatio: 1 },
  fallbackIcon: { fontSize: 26, opacity: 0.6 },
  plus: {
    position: "absolute", right: 6, top: 6, width: 22, height: 22, borderRadius: 11, overflow: "hidden",
    backgroundColor: "#000a", color: C.accent, textAlign: "center", lineHeight: 22, fontSize: 16, fontWeight: "700",
  },
  tileTitle: { color: C.text, fontSize: 12, marginTop: 6 },
  tileMeta: { color: C.muted, fontSize: 11, marginTop: 2 },
  sheetBody: { gap: 12 },
  sheetTop: { flexDirection: "row", gap: 14 },
  sheetArt: { width: 90 },
  sheetTitle: { color: C.text, fontSize: 17, fontWeight: "700" },
  error: { color: C.danger, fontSize: 12 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  primaryText: { color: "#09090e", fontSize: 15, fontWeight: "700" },
});
