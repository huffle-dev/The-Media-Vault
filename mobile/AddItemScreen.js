// Search & Add — generalized from the original Movie/TV-only screen (V3
// suggested-order step 6) to every media type whose search service is
// portable to mobile (packages/core/*.js's createXService(storage)
// factories — see movie.js's own header comment for why they're factories
// at all: a literal require of a desktop-only fs/path helper anywhere in
// the file would break Metro's bundle outright, whether or not the code
// path actually runs). Board Games aren't here — BGG's desktop service
// scrapes via an Electron BrowserWindow, which has no mobile equivalent.
//
// Movie/TV (TMDB) and Web Video (YouTube) need a key, via Encrypted Key
// Sync (V3 step 5) or a manual local fallback. Book/Audiobook (Open
// Library), Podcast (Apple/iTunes), Music (Discogs — a
// token only adds thumbnails/rate limit) and Game (Steam) work keyless;
// Game also searches IGDB when its synced client id/secret are present.
//
// Search itself never fetches cover art (none of the four search
// functions call storage) — only fetchDetails, triggered by tapping a
// result to preview it, downloads and caches art locally via
// coverArtStorage.js's Expo File/Directory-backed storage.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import AppButton from "./AppButton";
import Text from "./Text";
import TextInput from "./TextInput";
import { addItemToLibrary } from "./addToLibrary";
import BarcodeScanner from "./BarcodeScanner";
import { findDuplicate } from "./duplicates";
import { useLibrary } from "./LibraryContext";
import { bggSearch, bggDetails } from "./bgg";
import { BGG_WARNING, BGG_NOTICE_KEY } from "@media-vault/core/bggWarning.js";
import { diag } from "./diag";
import { isbnFromBarcode, isbnQuery, gtinFromBarcode, barcodeQuery, barcodeFromQuery } from "./isbn";
import { movie, openLibrary, audible, podcast, discogs, youtube, steam, igdb } from "./mediaServices";
import UnlockVaultForm from "./UnlockVaultForm";
import { F } from "./colors";
import { useApiKeys } from "./useApiKeys";

// Previewing a result (fetchDetails, below) downloads and caches real
// cover art locally via mediaServices.js's shared instances (backed by
// coverArtStorage.js's Expo File/Directory API) — the same
// createXService(storage) factories desktop uses, just with Expo's
// filesystem standing in for Node's fs/path. App.js's library tile grid
// uses this same cache, fetching+downloading art the first time any
// already-owned item scrolls into view.

// Some image CDNs (Discogs, formerly Scryfall) reject a generic HTTP-library
// User-Agent, and React Native's Image sends exactly that on Android, leaving
// thumbnails blank. Applied to every thumbnail — harmless for hosts that don't care.
const THUMBNAIL_HEADERS = { "User-Agent": "TheVault/1.0" };

// TMDB and Discogs search titles arrive as "Title (2019)" — split the
// trailing year back out for a quick add.
function titleWithTrailingYear(r) {
  const yearMatch = r.title.match(/\((\d{4})\)$/);
  return { title: r.title.replace(/\s*\(\d{4}\)$/, ""), year: yearMatch ? parseInt(yearMatch[1], 10) : null };
}

// One entry per tab. `needsKey` (a useApiKeys() field name) gates the
// key-setup flow — every other type's `search` works keyless. `fetchDetails` is the full
// lookup a tapped-to-preview result triggers, returning a details object
// already shaped like real items-table columns (each service's own
// convention — desktop's resolveSearchDetails in main.js relies on the
// exact same shape). `toQuickInsert` is the fallback used only if a quick
// "+ Add" happens to race ahead of (or skip) the detail fetch — it's the
// bare minimum (title/year) parsed straight off the search result, no
// extra network call.
// A Board Game from just its search row: the name, year, BGG link and the small picture the search list showed.
function bggQuickInsert(r) {
  const year = /\((\d{4})\)$/.exec(r.title);
  return { title: r.title.replace(/\s*\(\d{4}\)$/, ""), year: year ? Number(year[1]) : null, platform_id: r.platformId, bgg_url: r.storeUrl, cover_art_url: r.thumbnailUrl || null };
}

const TYPE_TABS = [
  {
    key: "Movie", label: "Movie", needsKey: "tmdb", keyLabel: "TMDB",
    search: (query, keys) => movie.searchMovieTv(query, "Movie", keys.tmdb),
    fetchDetails: (r, keys) => movie.fetchTmdbMovieDetails("Movie", r.platformId, keys.tmdb),
    toQuickInsert: titleWithTrailingYear,
  },
  {
    key: "TV", label: "TV", needsKey: "tmdb", keyLabel: "TMDB",
    search: (query, keys) => movie.searchMovieTv(query, "TV", keys.tmdb),
    fetchDetails: (r, keys) => movie.fetchTmdbMovieDetails("TV", r.platformId, keys.tmdb),
    toQuickInsert: titleWithTrailingYear,
  },
  {
    key: "Book", label: "Book", needsKey: null,
    search: (query) => openLibrary.searchOpenLibrary(query, "Book"),
    fetchDetails: (r) => openLibrary.resolveOpenLibraryBookDetails({
      platformId: r.platformId, mediaType: "Book", creator: r.creator, year: r.year,
      publisher: r.publisher, language: r.language, pageCount: r.pageCount, ebookUrl: r.ebookUrl,
    }),
    toQuickInsert: (r) => ({ title: r.title, year: r.year || null, creator: r.creator || null }),
  },
  {
    key: "Audiobook", label: "Audiobook", needsKey: null,
    // Audible only (never Open Library) — matches desktop, and keeps cover
    // art consistent. Search results already carry creator/year.
    search: (query) => audible.searchAudibleBooks(query),
    fetchDetails: (r) => audible.getAudibleBookDetails(r.platformId),
    toQuickInsert: (r) => ({ title: r.title, year: r.year || null, creator: r.creator || null, platform_id: `audible-${r.platformId}` }),
  },
  {
    key: "Podcast", label: "Podcast", needsKey: null,
    search: (query) => podcast.searchPodcasts(query),
    fetchDetails: (r) => podcast.fetchApplePodcastDetails(r.platformId),
    toQuickInsert: (r) => ({ title: r.title }),
  },
  {
    key: "Music", label: "Music", needsKey: null,
    // Works keyless; a synced Discogs token just raises the rate limit and
    // makes search results include thumbnails.
    // "barcode:<digits>" (from the Scan button) looks the release up by the code on its case.
    search: async (query, keys) => {
      const code = barcodeFromQuery(query);
      const found = code ? await discogs.searchDiscogsByBarcode(code, keys.discogs) : await discogs.searchDiscogsReleases(query, keys.discogs);
      return found.filter(Boolean);
    },
    fetchDetails: (r, keys) => discogs.fetchDiscogsReleaseDetails(r.platformId, keys.discogs),
    toQuickInsert: titleWithTrailingYear,
  },
  {
    key: "Web Video", label: "Web Video", needsKey: "youtube", keyLabel: "YouTube Data API",
    // A pasted YouTube link/@handle resolves to that one channel, video or
    // playlist; plain text searches channels or videos, per the picker.
    search: async (query, keys, videoKind = "channel") => (youtube.parseYoutubeInput(query)
      ? [await youtube.resolveYoutubeInput(query, keys.youtube)].filter(Boolean)
      : youtube.searchYoutube(query, keys.youtube, videoKind)),
    fetchDetails: (r, keys) => youtube.getYoutubeDetails(r.platformId, keys.youtube),
    toQuickInsert: (r) => ({ title: r.title, platform: "YouTube" }),
  },
  {
    key: "Board Game", label: "Board Game", needsKey: null,
    // BoardGameGeek, through a hidden web view (bgg.js). The search list only has a tiny picture, so a
    // quick + Add fetches the details first (fetchOnQuickAdd) to get a proper cover and the player count.
    search: (query) => bggSearch(query),
    fetchDetails: (r) => bggDetails(r.platformId),
    fetchOnQuickAdd: true,
    toQuickInsert: bggQuickInsert,
  },
  {
    // Two sources feeding one type: Steam (keyless) always, plus IGDB when
    // its client id/secret have synced — a result's `source` says which
    // one it came from, since the two use overlapping numeric ids.
    key: "Game", label: "Game", needsKey: null,
    search: async (query, keys) => {
      const steamP = steam.searchSteamGames(query).then((rs) => rs
        .filter((r) => r.type === "game" || r.type === "dlc" || r.type === "demo")
        .map((r) => ({
          ...r, source: "steam",
          thumbnailUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${r.platformId}/header.jpg`,
        })));
      const igdbP = keys.igdbId && keys.igdbSecret
        ? igdb.searchIgdbGames(query, keys.igdbId, keys.igdbSecret)
        : Promise.resolve([]);
      const [steamRes, igdbRes] = await Promise.allSettled([steamP, igdbP]);
      if (steamRes.status === "rejected" && igdbRes.status === "rejected") throw steamRes.reason;
      return [
        ...(steamRes.status === "fulfilled" ? steamRes.value : []),
        ...(igdbRes.status === "fulfilled" ? igdbRes.value : []),
      ];
    },
    fetchDetails: async (r, keys) => {
      if (r.source === "igdb") return igdb.getIgdbGameDetailsById(r.platformId, keys.igdbId, keys.igdbSecret);
      const [base, extra] = await Promise.all([
        steam.getSteamGameDetailsById(r.platformId, r.type),
        steam.fetchSteamGameDetails(r.platformId).catch(() => null),
      ]);
      return { ...base, cover_art_path: extra?.cover_art_path ?? null };
    },
    toQuickInsert: (r) => ({
      title: r.title,
      // Same "igdb-" prefix igdbGameToItem uses — a bare numeric id reads as a Steam appid.
      platform_id: r.source === "igdb" ? `igdb-${r.platformId}` : r.platformId,
    }),
  },
];


// A few human-readable labels for the SYNCED_DETAIL_FIELDS keys worth
// actually showing on the preview — the rest (ids, tmdb_votes, checked
// dates, etc.) are real columns but not worth a line on a small screen.
const PREVIEW_FIELDS = [
  ["creator", "Creator"], ["genre", "Genre"], ["publisher", "Publisher"],
  ["language", "Language"], ["runtime", "Runtime"], ["series_name", "Series"],
  ["type_line", "Type"], ["mana_cost", "Mana Cost"], ["rarity", "Rarity"],
  ["set_name", "Set"], ["power_toughness", "Power/Toughness"], ["episode_count", "Episodes"],
  ["network", "Network"], ["season_count", "Seasons"],
];

// Shown after tapping a result (not its "+ Add" button) — fetches the
// same full detail lookup desktop's Search Online → Item Profile preview
// uses, so what you see here is the same real data, not a guess from the
// search row alone.
function PreviewPane({ tab, result, keys, onClose, onAdd, adding }) {
  const [details, setDetails] = useState(undefined); // undefined = loading
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setDetails(undefined);
    setError(null);
    tab.fetchDetails(result, keys)
      .then((d) => { if (!cancelled) setDetails(d); })
      .catch((e) => { if (!cancelled) { setError(e.message); setDetails(null); } });
    return () => { cancelled = true; };
  }, [tab, result]);

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2} numberOfLines={1}>{result.title}</Text>
        <View style={{ width: 40 }} />
      </View>
      {details === undefined ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {/* Prefer the freshly-downloaded local copy fetchDetails just
              cached — falls back to the search row's hotlinked thumbnail
              only if that download failed (details is null/errored) or
              the source genuinely has no art for this title. */}
          {(details?.cover_art_path || result.thumbnailUrl) && (
            <Image
              source={details?.cover_art_path
                ? { uri: details.cover_art_path }
                : { uri: result.thumbnailUrl, headers: THUMBNAIL_HEADERS }}
              style={styles.previewThumb}
            />
          )}
          <Text style={styles.previewTitle}>{details?.title || result.title}</Text>
          {details?.year && <Text style={styles.previewYear}>{details.year}</Text>}

          {error && <Text style={styles.error}>Couldn't load full details: {error} — you can still add with just what search found.</Text>}

          {details && PREVIEW_FIELDS.map(([key, label]) => details[key] ? (
            <View key={key} style={styles.previewRow}>
              <Text style={styles.previewLabel}>{label}</Text>
              <Text style={styles.previewValue}>{String(details[key])}</Text>
            </View>
          ) : null)}

          {details?.notes && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.previewLabel}>Description</Text>
              <Text style={styles.previewNotes}>{details.notes}</Text>
            </View>
          )}

          <Pressable onPress={() => onAdd(details)} disabled={adding} style={[styles.addBtnLarge, adding && { opacity: 0.6 }]}>
            <Text style={styles.addBtnLargeText}>{adding ? "Adding…" : "+ Add to Library"}</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

// One entry per type shown in the Add type-picker grid.
export const ADD_TYPES = TYPE_TABS.map(({ key, label }) => ({ key, label }));

// "X is already in your library. Add anyway?" — resolves true only if they choose to.
const confirmAddAnyway = (existing) => new Promise((resolve) => {
  Alert.alert("Already in your library", `"${existing.title}" is already in your library. Add it again?`, [
    { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
    { text: "Add anyway", onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) });
});

// Board Game search reads boardgamegeek.com through a hidden web view, which is unofficial: say so the first time,
// and only go on if they agree. Resolves true when they have (now or before).
const bggNoticeAccepted = () => { try { return localStorage.getItem(BGG_NOTICE_KEY) === "1"; } catch { return false; } };
const confirmBggNotice = () => new Promise((resolve) => {
  if (bggNoticeAccepted()) { resolve(true); return; }
  Alert.alert("Before searching Board Games", BGG_WARNING.join("\n\n"), [
    { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
    { text: "I understand, search", onPress: () => { try { localStorage.setItem(BGG_NOTICE_KEY, "1"); } catch { /* asks again next time */ } resolve(true); } },
  ], { cancelable: true, onDismiss: () => resolve(false) });
});

export default function AddItemScreen({ tabKey, initialQuery, onClose, onAdded, onManual, readOnly }) {
  const { keys, reload: reloadKeys, saveLocalKey, canPasteManually } = useApiKeys();
  const { items: libraryItems } = useLibrary();
  const [keyInput, setKeyInput] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);
  const activeTab = TYPE_TABS.find((t) => t.key === tabKey) || TYPE_TABS[0];
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [addingId, setAddingId] = useState(null);
  const [previewResult, setPreviewResult] = useState(null);
  const [scanning, setScanning] = useState(false); // Book / Music: the barcode camera is open
  // Web Video only: search channels or single videos (a pasted link ignores this).
  const [videoKind, setVideoKind] = useState("channel");

  function saveKey() {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    saveLocalKey(activeTab.needsKey, trimmed);
  }

  async function handleUnlock(masterKeyHex) {
    const loaded = await reloadKeys(masterKeyHex);
    if (!loaded[activeTab.needsKey]) throw new Error(`Unlocked, but no ${activeTab.keyLabel} key has been synced from desktop yet.`);
  }

  // A shared link arrives with its search already worked out: run it once.
  const ranInitial = useRef(false);
  useEffect(() => {
    if (!initialQuery || ranInitial.current || keys === undefined) return;
    if (activeTab.needsKey && !keys[activeTab.needsKey]) return; // the key setup shows instead
    ranInitial.current = true;
    setQuery(initialQuery);
    runSearch(initialQuery);
  }, [initialQuery, keys]);

  async function runSearch(override) {
    const q = typeof override === "string" ? override : query;
    if (!q.trim()) return;
    if (activeTab.key === "Board Game" && !(await confirmBggNotice())) return;
    setSearching(true);
    setError(null);
    try {
      const found = await activeTab.search(q.trim(), keys, videoKind);
      setResults(found.map((r) => ({ ...r, rowKey: `${r.source || ""}:${r.platformId}` })));
    } catch (e) {
      setError(e.message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  // Shared by the quick "+ Add" button (row-level, `details` is null — the
  // bare toQuickInsert() fields are all it has) and the preview pane's own
  // "+ Add to Library" (already has the full fetchDetails() result, so the
  // saved item comes out richer — genre, creator, notes, etc. — for the
  // exact same one extra network call the preview already made).
  // `disabled={addingId === item.rowKey}` alone isn't a hard guard — it
  // only takes effect once React actually re-renders with the new
  // addingId, so two fast taps on the same "+ Add" (a real double-tap, or
  // two separate onPress deliveries before that render lands) could both
  // get through and insert the item twice. addingRef blocks synchronously,
  // before any render is involved.
  const addingRef = useRef(new Set());

  async function addResult(result, details) {
    if (addingRef.current.has(result.rowKey)) return;
    addingRef.current.add(result.rowKey);
    setAddingId(result.rowKey);
    setError(null);
    try {
      // Already in the library? Ask first, like desktop does.
      const same = findDuplicate(libraryItems, {
        title: (details && details.title) || result.title, media_type: activeTab.key,
        platform_id: (details && details.platform_id) || result.platformId, year: (details && details.year) ?? result.year ?? null,
      });
      if (same && !(await confirmAddAnyway(same))) return;
      if (!details && activeTab.fetchOnQuickAdd) {
        // The extra lookup only improves the row (a proper cover, player count…). If it can't be made, add the
        // game with what the search found rather than losing the add; Refresh on the item fills the rest in later.
        try { details = await activeTab.fetchDetails(result, keys); }
        catch (e) { diag.add("warn", "add", `Added ${result.title} without its full details (${e && e.message}); the search result's basics were used`); details = null; }
      }
      await addItemToLibrary({
        mediaType: activeTab.key,
        title: result.title,
        platformId: result.platformId,
        details,
        quickRow: details ? null : activeTab.toQuickInsert(result),
      });
      onAdded();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      addingRef.current.delete(result.rowKey);
      setAddingId(null);
    }
  }

  if (keys === undefined) return <ActivityIndicator style={{ marginTop: 48 }} />;

  if (previewResult) {
    return (
      <PreviewPane
        tab={activeTab}
        result={previewResult}
        keys={keys}
        onClose={() => setPreviewResult(null)}
        onAdd={(details) => addResult(previewResult, details)}
        adding={addingId === previewResult.rowKey}
      />
    );
  }

  const showKeySetup = !readOnly && activeTab.needsKey && !keys[activeTab.needsKey];

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2}>Add {activeTab.label}</Text>
        <View style={{ width: 40 }} />
      </View>

      {!readOnly && onManual && (
        <Pressable onPress={onManual} style={styles.manualLink}>
          <Text style={styles.manualText}>Can't find it? Add it manually  ›</Text>
        </Pressable>
      )}

      {readOnly ? (
        <View style={styles.keySetup}>
          <Text style={styles.label}>You're offline</Text>
          <Text style={styles.hint}>Adding items needs a connection — the library is read-only until you're back online.</Text>
        </View>
      ) : showKeySetup ? (
        <View style={styles.keySetup}>
          {!showManualEntry ? (
            <>
              <Text style={styles.label}>Unlock Synced Keys</Text>
              <Text style={styles.hint}>
                Enter the passphrase you set up on desktop (Settings → Cloud
                Sync → Encrypted Key Sync) to pull your {activeTab.keyLabel} key here —
                nothing is stored except this phone's own copy of it.
              </Text>
              <UnlockVaultForm onUnlocked={handleUnlock} />
              {canPasteManually(activeTab.needsKey) && (
                <Pressable onPress={() => { setShowManualEntry(true); setError(null); }}>
                  <Text style={styles.linkText}>Or paste a {activeTab.keyLabel} key manually instead</Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <Text style={styles.label}>{activeTab.keyLabel} API Key</Text>
              <Text style={styles.hint}>
                Search needs your own free {activeTab.keyLabel} key (TMDB: themoviedb.org →
                Settings → API). Stored only on this phone, not synced.
              </Text>
              <TextInput
                style={styles.input} value={keyInput} onChangeText={setKeyInput}
                placeholder={`Paste your ${activeTab.keyLabel} key`} placeholderTextColor="#777"
                autoCapitalize="none" autoCorrect={false}
              />
              <AppButton variant="primary" title="Save" onPress={saveKey} disabled={!keyInput.trim()} />
              <Pressable onPress={() => { setShowManualEntry(false); setError(null); }}>
                <Text style={styles.linkText}>Or unlock synced keys instead</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]} value={query} onChangeText={setQuery}
              placeholder="Search title…" placeholderTextColor="#777"
              onSubmitEditing={() => runSearch()} returnKeyType="search"
            />
            <AppButton variant="primary" title="Go" onPress={() => runSearch()} disabled={searching || !query.trim()} />
            {(activeTab.key === "Book" || activeTab.key === "Music") && <AppButton variant="action" title="Scan" onPress={() => setScanning(true)} />}
          </View>

          {activeTab.key === "Web Video" && (
            <View style={styles.kindRow}>
              {[["channel", "Channels"], ["video", "Videos"]].map(([id, label]) => (
                <Pressable
                  key={id} onPress={() => { setVideoKind(id); setResults(null); setError(null); }}
                  style={[styles.typePill, videoKind === id && styles.typePillActive]}
                >
                  <Text style={{ color: videoKind === id ? "#e3aa26" : "#c7c7d8", fontSize: 12 }}>{label}</Text>
                </Pressable>
              ))}
              <Text style={styles.kindHint}>or paste a YouTube link</Text>
            </View>
          )}

          {activeTab.key === "Book" && (
            <BarcodeScanner
              visible={scanning} onClose={() => setScanning(false)} what="book" accept={isbnFromBarcode}
              onCode={(isbn) => { setScanning(false); setQuery(isbnQuery(isbn)); runSearch(isbnQuery(isbn)); }}
            />
          )}
          {activeTab.key === "Music" && (
            <BarcodeScanner
              visible={scanning} onClose={() => setScanning(false)} what="CD or record" accept={gtinFromBarcode}
              onCode={(code) => { setScanning(false); setQuery(barcodeQuery(code)); runSearch(barcodeQuery(code)); }}
            />
          )}

          {error && <Text style={styles.error}>{error}</Text>}
          {searching && <ActivityIndicator style={{ marginTop: 16 }} />}

          <FlatList
            data={results || []}
            keyExtractor={(r) => r.rowKey}
            renderItem={({ item }) => (
              <Pressable style={styles.resultRow} onPress={() => setPreviewResult(item)}>
                {item.thumbnailUrl
                  ? <Image source={{ uri: item.thumbnailUrl, headers: THUMBNAIL_HEADERS }} style={styles.thumb} />
                  : <View style={[styles.thumb, styles.thumbPlaceholder]} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
                  {item.detail ? <Text style={styles.resultDetail} numberOfLines={1}>{item.detail}</Text> : null}
                </View>
                <Pressable
                  onPress={(e) => { e.stopPropagation(); addResult(item, null); }}
                  disabled={addingId === item.rowKey}
                  accessibilityRole="button" accessibilityLabel={`Add ${item.title} to your library`}
                  style={styles.addBtn}
                >
                  <Text style={styles.addBtnText}>{addingId === item.rowKey ? "…" : "+ Add"}</Text>
                </Pressable>
              </Pressable>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  manualLink: { paddingHorizontal: 16, paddingTop: 10 },
  manualText: { color: "#e3aa26", fontSize: 12 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1e1e2a",
  },
  back: { color: "#c7c7d8", fontSize: 15 },
  h2: { color: "#fff", fontSize: 15, fontWeight: "700", flex: 1, textAlign: "center", marginHorizontal: 8 },
  keySetup: { padding: 20, gap: 10 },
  label: { fontFamily: F.mono, color: "#c7c7d8", fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  hint: { color: "#c7c7d8", fontSize: 12, lineHeight: 17, marginBottom: 4 },
  linkText: { color: "#e3aa26", fontSize: 12, textDecorationLine: "underline", marginTop: 10, textAlign: "center" },
  input: { backgroundColor: "#111118", color: "#fff", borderRadius: 8, padding: 12, fontSize: 15 },
  error: { color: "#e5384a", paddingHorizontal: 16, marginTop: 8 },
  kindRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 10 },
  kindHint: { color: "#777", fontSize: 11, marginLeft: 4 },
  typeRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
  typePill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "#1e1e2a", backgroundColor: "#111118", marginRight: 8 },
  typePillActive: { borderColor: "#e3aa26", backgroundColor: "#e3aa2622" },
  typePillText: { color: "#c7c7d8", fontSize: 13 },
  typePillTextActive: { color: "#e3aa26", fontWeight: "700" },
  searchRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12, alignItems: "center" },
  resultRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1e1e2a",
  },
  thumb: { width: 40, height: 60, borderRadius: 4, backgroundColor: "#111118" },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  resultTitle: { color: "#fff", fontSize: 14 },
  resultDetail: { color: "#8a8a9c", fontSize: 11, marginTop: 2 },
  addBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: "#e3aa2622", borderWidth: 1, borderColor: "#e3aa26" },
  addBtnText: { color: "#e3aa26", fontSize: 12, fontWeight: "700" },
  previewThumb: { width: 120, height: 180, borderRadius: 8, backgroundColor: "#111118", alignSelf: "center", marginBottom: 16 },
  previewTitle: { color: "#fff", fontSize: 20, fontWeight: "700", textAlign: "center" },
  previewYear: { color: "#c7c7d8", fontSize: 13, textAlign: "center", marginTop: 2, marginBottom: 12 },
  previewRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1e1e2a" },
  previewLabel: { fontFamily: F.mono, color: "#c7c7d8", fontSize: 12, textTransform: "uppercase" },
  previewValue: { color: "#fff", fontSize: 13, flexShrink: 1, textAlign: "right", marginLeft: 12 },
  previewNotes: { color: "#c7c7d8", fontSize: 13, lineHeight: 19, marginTop: 6 },
  addBtnLarge: { marginTop: 24, backgroundColor: "#e3aa26", borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  addBtnLargeText: { color: "#09090e", fontSize: 15, fontWeight: "700" },
});
