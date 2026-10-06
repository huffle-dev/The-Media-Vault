// Discover: "Recommended For You" (seeded from what you rated positively) and
// "Trending This Week", computed on the phone by the same shared functions
// desktop uses (packages/core movie.js / openLibrary.js) against the library
// list. Sections show two rows with a Show More, and tapping a title opens a
// bottom sheet to add it to the watchlist or dismiss it.
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import BottomSheet from "../../../BottomSheet";
import { useLibrary } from "../../../LibraryContext";
import { useApiKeys } from "../../../useApiKeys";
import { movie, openLibrary, youtube } from "../../../mediaServices";
import { addWorkToLibrary, workPosterUrl } from "../../../addExternalWork";
import { loadDismissals, addDismissal } from "../../../discoveryDismissals";
import { C, F } from "../../../colors";

const COLLAPSED_COUNT = 6; // two rows of the 3-column grid

const EMPTY = { items: [], reason: null };

// Computed once per app session — recommendations fan out to dozens of API
// calls, so re-opening the tab shouldn't repeat them. "Refresh" clears it.
let sessionCache = null;

const REASON_TEXT = {
  no_key: "Movie and TV suggestions need your TMDB key — unlock it from Add → Movie.",
  no_seeds: "Rate a few titles above 0 and suggestions will appear here.",
  no_youtube_key: "New uploads need your YouTube key — unlock it from Settings → API keys & sync.",
  no_channels: "Add a few YouTube channels to your library and their newest videos will show up here.",
};

// Only ever shown in the browser demo (see demo/installDemo.js), which has no internet to fetch suggestions from.
const DEMO_TEXT = "Suggestions come from TMDB, Open Library and YouTube, using your own API keys, so Discover is switched off in this demo.";

function WorkTile({ work, onPress }) {
  const uri = workPosterUrl(work);
  return (
    <Pressable style={[styles.tile, work.mediaType === "Web Video" && { width: "50%" }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${work.title}${work.year ? `, ${work.year}` : ""}`} accessibilityHint="Opens its details">
      <View style={[styles.poster, work.mediaType === "Web Video" && { aspectRatio: 16 / 9 }]}>
        {uri ? <Image source={{ uri }} style={styles.posterImage} /> : <Text style={styles.posterFallback}>🎬</Text>}
      </View>
      <Text style={styles.tileTitle} numberOfLines={2}>{work.title}</Text>
      <Text style={styles.tileMeta} numberOfLines={1}>
        {[work.year, work.rating != null ? `★ ${Number(work.rating).toFixed(1)}` : null].filter(Boolean).join(" · ")}
      </Text>
    </Pressable>
  );
}

function Section({ title, block, expanded, onToggle, onSelect }) {
  const list = block.items;
  const shown = expanded ? list : list.slice(0, COLLAPSED_COUNT);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {list.length === 0 ? (
        <Text style={styles.hint}>{globalThis.__DEMO__ ? DEMO_TEXT : (REASON_TEXT[block.reason] || "Nothing to show right now.")}</Text>
      ) : (
        <>
          <View style={styles.grid}>
            {shown.map((w) => <WorkTile key={`${w.mediaType}-${w.id}`} work={w} onPress={() => onSelect(w)} />)}
          </View>
          {list.length > COLLAPSED_COUNT && (
            <Pressable onPress={onToggle} style={styles.moreBtn}>
              <Text style={styles.moreText}>{expanded ? "Show less" : `Show more (${list.length - COLLAPSED_COUNT})`}</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

// "New from your channels": one section per channel (newest-uploading first),
// each titled with the channel's name. Only appears for people with channels
// saved — or to say why it's empty (no key / nothing yet).
function webSections(block) {
  if (!block.items.length) return block.reason ? [["rec-web", "New from your channels", block]] : [];
  const groups = new Map();
  for (const w of block.items) {
    const key = w.channelId || w.genre || "";
    if (!groups.has(key)) groups.set(key, { title: w.channelTitle || w.genre || "Unknown channel", items: [] });
    groups.get(key).items.push(w);
  }
  return [...groups.entries()].map(([key, g]) => [`rec-web-${key}`, g.title, { items: g.items, reason: null }]);
}

export default function DiscoverTab() {
  const { items, offline, reload } = useLibrary();
  const { keys } = useApiKeys();
  const [mode, setMode] = useState("rec"); // "rec" | "trend"
  const [dismissals, setDismissals] = useState(null);
  const [data, setData] = useState(sessionCache);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => { loadDismissals().then(setDismissals); }, []);

  const ready = !!items && keys !== undefined && dismissals !== null;

  async function compute(dismissed = dismissals) {
    setLoading(true);
    const safe = (p) => p.catch(() => EMPTY);
    const [recs, trend, books, uploads] = await Promise.all([
      safe(movie.getMovieRecommendations(items, dismissed, keys.tmdb)),
      safe(movie.getMovieTrending(items, dismissed, keys.tmdb)),
      safe(openLibrary.getBookRecommendations(items, dismissed)),
      // Only for people with channels saved; costs ~1 YouTube quota unit each.
      keys.youtube ? safe(youtube.getYoutubeNewUploads(items, dismissed, keys.youtube))
        : Promise.resolve(items.some((i) => i.media_type === "Web Video") ? { items: [], reason: "no_youtube_key" } : EMPTY),
    ]);
    sessionCache = {
      recMovie: recs.movie || EMPTY, recTv: recs.tv || EMPTY, recBook: books || EMPTY, recWeb: uploads || EMPTY,
      trendMovie: trend.movie || EMPTY, trendTv: trend.tv || EMPTY,
    };
    setData(sessionCache);
    setLoading(false);
  }

  useEffect(() => {
    if (ready && !sessionCache) compute();
  }, [ready]);

  // Re-reads the synced dismissal list first, so a title dismissed on
  // desktop since this session began is excluded too.
  async function refresh() {
    sessionCache = null;
    setData(null);
    const fresh = await loadDismissals();
    setDismissals(fresh);
    compute(fresh);
  }

  const removeWork = (work) => {
    const drop = (block) => ({ ...block, items: block.items.filter((w) => !(w.id === work.id && w.mediaType === work.mediaType)) });
    sessionCache = Object.fromEntries(Object.entries(sessionCache || data).map(([k, b]) => [k, drop(b)]));
    setData(sessionCache);
  };

  async function handleDismiss(work) {
    setBusy(true);
    setMessage(null);
    try {
      setDismissals(await addDismissal(dismissals, work.mediaType, work.id, work.title));
      removeWork(work);
      setSelected(null);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(work) {
    setBusy(true);
    setMessage(null);
    try {
      await addWorkToLibrary(work, keys);
      removeWork(work);
      setSelected(null);
      reload();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const sections = useMemo(() => {
    if (!data) return [];
    // The YouTube section only appears for people who have channels saved.
    return mode === "rec"
      ? [["rec-movie", "Movies", data.recMovie], ["rec-tv", "TV", data.recTv], ["rec-book", "Books", data.recBook], ...webSections(data.recWeb)]
      : [["trend-movie", "Movies", data.trendMovie], ["trend-tv", "TV", data.trendTv]];
  }, [data, mode]);

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Text style={styles.h1}>Discover</Text>
        <Pressable onPress={refresh} disabled={loading || !ready}>
          <Text style={[styles.refresh, (loading || !ready) && { opacity: 0.4 }]}>Refresh</Text>
        </Pressable>
      </View>

      <View style={styles.segment}>
        {[["rec", "Recommended"], ["trend", "Trending"]].map(([id, label]) => (
          <Pressable key={id} onPress={() => setMode(id)} style={[styles.segBtn, mode === id && styles.segBtnOn]} accessibilityRole="button" accessibilityState={{ selected: mode === id }}>
            <Text style={[styles.segText, mode === id && styles.segTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {!items || loading || !data
        ? <ActivityIndicator style={{ marginTop: 40 }} />
        : (
          <ScrollView contentContainerStyle={styles.body}>
            {offline && <Text style={styles.hint}>You're offline — suggestions may be missing.</Text>}
            {sections.map(([id, title, block]) => (
              <Section
                key={id} title={title} block={block}
                expanded={!!expanded[id]} onToggle={() => toggle(id)} onSelect={setSelected}
              />
            ))}
          </ScrollView>
        )}

      <BottomSheet visible={!!selected} title={selected?.mediaType || ""} onClose={() => setSelected(null)}>
        {selected && (
          <View style={styles.sheetBody}>
            <View style={styles.sheetTop}>
              <View style={[styles.poster, styles.sheetPoster]}>
                {workPosterUrl(selected) ? <Image source={{ uri: workPosterUrl(selected) }} style={styles.posterImage} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{selected.title}</Text>
                <Text style={styles.tileMeta}>{[selected.year, selected.genre, selected.creator].filter(Boolean).join(" · ")}</Text>
                {selected.because ? <Text style={styles.because}>Because you liked {selected.because}</Text> : null}
              </View>
            </View>
            {message && <Text style={styles.error}>{message}</Text>}
            <Pressable
              onPress={() => handleAdd(selected)} disabled={busy || offline}
              style={[styles.primaryBtn, (busy || offline) && { opacity: 0.5 }]}
            >
              <Text style={styles.primaryText}>{offline ? "Offline — can't add" : busy ? "Adding…" : "+ Add to Wishlist"}</Text>
            </Pressable>
            <Pressable onPress={() => handleDismiss(selected)} disabled={busy || offline} style={[styles.secondaryBtn, offline && { opacity: 0.5 }]}>
              <Text style={styles.secondaryText}>Not interested</Text>
            </Pressable>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 },
  h1: { fontFamily: F.serif, color: C.text, fontSize: 22, fontWeight: "700" },
  refresh: { color: C.accent, fontSize: 14 },
  segment: { flexDirection: "row", backgroundColor: C.surface, borderRadius: 10, margin: 16, marginBottom: 8, padding: 3 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8 },
  segBtnOn: { backgroundColor: "#e3aa2622" },
  segText: { color: C.muted, fontSize: 13 },
  segTextOn: { color: C.accent, fontWeight: "700" },
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  hint: { color: C.muted, fontSize: 13, lineHeight: 19 },
  section: { marginTop: 18 },
  sectionTitle: { fontFamily: F.mono,
    color: C.accent, fontSize: 11, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, paddingBottom: 8, marginBottom: 12,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  tile: { width: "33.33%", paddingHorizontal: 5, marginBottom: 14 },
  poster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 8, backgroundColor: C.surface, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  posterImage: { width: "100%", height: "100%" },
  posterFallback: { fontSize: 26, opacity: 0.5 },
  tileTitle: { color: C.text, fontSize: 12, marginTop: 6 },
  tileMeta: { color: C.muted, fontSize: 11, marginTop: 2 },
  moreBtn: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16 },
  moreText: { color: C.accent, fontSize: 13 },
  sheetBody: { gap: 12 },
  sheetTop: { flexDirection: "row", gap: 14 },
  sheetPoster: { width: 90 },
  sheetTitle: { color: C.text, fontSize: 17, fontWeight: "700" },
  because: { color: C.textSoft, fontSize: 12, marginTop: 8, fontStyle: "italic" },
  error: { color: C.danger, fontSize: 12 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  primaryText: { color: "#09090e", fontSize: 15, fontWeight: "700" },
  secondaryBtn: { borderRadius: 10, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: C.border },
  secondaryText: { color: C.textSoft, fontSize: 14 },
});
