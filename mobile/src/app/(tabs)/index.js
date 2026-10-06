// Library: the tile grid, with desktop's filters and sorts as bottom sheets
// rather than its horizontal tab strips and dropdown row (which would need
// sideways scrolling on a phone). Type and Status are the two dropdown-style
// buttons; Sort, Filters and View are icon buttons that open their own sheet.
// The filtering and sorting themselves are desktop's own shared functions
// (packages/core/tokens/filters.js), so both apps narrow and order a library
// identically.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, BackHandler, FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Text from "../../../Text";
import TextInput from "../../../TextInput";
import { useLocalSearchParams, useRouter } from "expo-router";
import Tile from "../../../Tile";
import ListRow, { LIST_ROW_HEIGHT } from "../../../ListRow";
import BottomSheet from "../../../BottomSheet";
import AppButton from "../../../AppButton";
import UndoBar from "../../../UndoBar";
import { supabase } from "../../../supabase";
import { setMembership } from "../../../listsData";
import { useWatchIndex } from "../../../useWatchIndex";
import { PROVIDER_TYPES, DEFAULT_PROVIDER_TYPES, providerChoices, filterByProvider } from "../../../watchIndex";
import { bulkAddToList, bulkDelete, bulkSetHidden, bulkSetOwned, bulkSetStatus } from "../../../bulkActions";
import { statusLabel } from "../../../format";
import { STATUS_WHEEL_ORDER } from "@media-vault/core/tokens/constants.js";
import { useLibrary } from "../../../LibraryContext";
import { useApiKeys } from "../../../useApiKeys";
import { useDisplayPrefs, TILE_COLUMNS, TILE_GAPS } from "../../../useDisplayPrefs";
import { withCustomTypeTabs, effectiveType } from "@media-vault/core/tokens/mediaTypes.js";
import {
  QUICK_FILTERS, PERSONAL_RATING_BUCKETS, CRITIC_RATING_BUCKETS,
} from "@media-vault/core/tokens/constants.js";
import { SORT_FIELDS, DIRECTION_LABELS, parseSort, buildSort, hasDirection, defaultDirection } from "@media-vault/core/tokens/sortFields.js";
import {
  applyQuickFilter, applyOwnedRatedFilter, buildBaseFilter, sortItems, splitGenres,
} from "@media-vault/core/tokens/filters.js";
import { ratingToDisplay, externalRatingValue } from "@media-vault/core/tokens/ratings.js";
import { isSquareArt, effectivePlatform } from "@media-vault/core/tokens/itemHelpers.js";
import { C, F } from "../../../colors";
import { FilterIcon, GridIcon, SortIcon } from "../../../Icons";

// Options shown in the View sheet (desktop's tile size / spacing / overlay).
const VIEW_OPTIONS = [
  { key: "layout", label: "Layout", options: [["grid", "Tiles"], ["list", "List"]] },
  { key: "tileSize", label: "Tile size", options: [["small", "Small"], ["medium", "Medium"], ["large", "Large"]] },
  { key: "tileGap", label: "Spacing", options: [["small", "Tight"], ["medium", "Medium"], ["large", "Wide"]] },
  { key: "tileOverlay", label: "Tile overlay", options: [["none", "None"], ["no-icon", "No icons"], ["full", "Full"]] },
];

// "Nothing chosen" values — the same strings desktop's filters start on.
const DEFAULT_FILTERS = {
  genre: "All Genres", age: "All Age Ratings", platform: "All Platforms", os: "All OS & Consoles",
  personal: "Any Rating", critic: "Any Critic Rating", rated: "all", owned: "all", hidden: "visible", list: null, kind: "all",
};
const OWNED_OPTIONS = [["all", "All"], ["owned", "Owned"], ["not-owned", "Not owned"]];
const RATED_OPTIONS = [["all", "All"], ["rated", "Rated"], ["not-rated", "Not rated"]];
const HIDDEN_OPTIONS = [["visible", "Visible"], ["hidden", "Hidden"], ["all", "All"]];
const KIND_OPTIONS = [["all", "All"], ["channel", "Channels"], ["video", "Videos"], ["playlist", "Playlists"]];

export default function LibraryTab() {
  const router = useRouter();
  const { items, offline, savedAt, error, lists, listIdsByItem, refresh, refreshing, reload, refreshLists, customTypes, deviceId, phoneOwnedIds, otherOwnedIds, undo, undoBusy, offerUndo, runUndo, dismissUndo } = useLibrary();
  const { keys } = useApiKeys();
  // Built-in types plus one tab per custom type made on desktop.
  const TYPE_TABS = useMemo(() => withCustomTypeTabs(customTypes), [customTypes]);
  const [query, setQuery] = useState("");
  const [typeTab, setTypeTab] = useState("All");
  const [quick, setQuick] = useState("All");
  const [sort, setSort] = useState("Recently Added");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  // "Where to stream": the provider chosen (null = any) and which kinds of availability count.
  const [provider, setProvider] = useState(null);
  const [providerTypes, setProviderTypes] = useState(DEFAULT_PROVIDER_TYPES);
  const watch = useWatchIndex();
  // Stats' tap-through has two filters with no picker of their own: an exact
  // personal rating (-10..+10) and a rounded critic score (0..10). They show
  // as dismissible chips.
  const [extra, setExtra] = useState({ rating: null, critic: null });
  // null | "type" | "status" | "sort" | "filter" | "view" | "pick:<filter key>"
  const [sheet, setSheet] = useState(null);
  const [prefs, setPref] = useDisplayPrefs();
  const { width: screenWidth } = useWindowDimensions();
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  // ── Multi-select: long-press a tile to start, tap more to add or remove ──
  // (read-only while offline). Actions run in ../../../bulkActions.js; each hands
  // back an undo that UndoBar offers for ten seconds.
  const [selected, setSelected] = useState(() => new Set());
  const [working, setWorking] = useState(false);
  // Tapping a tile's status dot opens a one-item status sheet (same writes and Undo as the bulk Status action).
  const [quickItem, setQuickItem] = useState(null);
  const selecting = selected.size > 0;
  const toggleSelected = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  // The phone's Back button leaves selection mode instead of the screen.
  useEffect(() => {
    if (!selecting) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { clearSelection(); return true; });
    return () => sub.remove();
  }, [selecting, clearSelection]);

  // One tap action from the quick sheet on the item `target`. `action()` returns
  // { message, failed, undo } like the bulk actions do.
  async function runQuick(action, labelFor) {
    const target = quickItem;
    setQuickItem(null);
    if (!target || working) return;
    setWorking(true);
    try {
      const result = await action(target);
      offerUndo({ message: labelFor ? labelFor(target, result) : `${target.title}: ${result.message}`, failed: result.failed, undo: result.undo });
      await Promise.all([reload(), refreshLists()]);
    } catch (e) {
      offerUndo({ message: `Couldn't save: ${e.message}`, failed: 0, undo: null });
    } finally {
      setWorking(false);
    }
  }
  const runQuickStatus = (status) => runQuick(
    (t) => bulkSetStatus(supabase, items, [t.sync_id], status, statusLabel(status)),
    (t) => `${t.title}: ${statusLabel(status)}`,
  );
  const favouritesList = lists.find((l) => l.is_default) || null;
  const quickIsFav = !!(quickItem && favouritesList && (listIdsByItem.get(quickItem.sync_id) || []).includes(favouritesList.sync_id));
  const quickIsOwnedHere = !!(quickItem && phoneOwnedIds.has(quickItem.sync_id));
  const quickIsHidden = !!(quickItem && (quickItem.is_hidden === 1 || quickItem.is_hidden === true));
  const toggleFavourite = () => runQuick(async (t) => {
    if (!quickIsFav) return bulkAddToList(supabase, listIdsByItem, favouritesList.sync_id, [t.sync_id], "Favourites");
    await setMembership(favouritesList.sync_id, t.sync_id, false);
    return { message: "removed from Favourites", failed: 0, undo: () => setMembership(favouritesList.sync_id, t.sync_id, true) };
  });

  async function runBulk(action) {
    if (working) return;
    setWorking(true);
    setSheet(null);
    try {
      const result = await action([...selected]);
      clearSelection();
      offerUndo({ message: result.message, failed: result.failed, undo: result.undo });
      await Promise.all([reload(), refreshLists()]);
    } catch (e) {
      offerUndo({ message: `Couldn't save: ${e.message}`, failed: 0, undo: null });
    } finally {
      setWorking(false);
    }
  }

  // Stats navigates here with params (plus a changing `n`, so tapping the
  // same bar twice still applies). Each arrival REPLACES the filters.
  const params = useLocalSearchParams();
  useEffect(() => {
    if (!params.n) return;
    setTypeTab(params.type && TYPE_TABS.some((t) => t.label === params.type) ? params.type : "All");
    setQuick(params.status && QUICK_FILTERS.includes(params.status) ? params.status : "All");
    setFilters({ ...DEFAULT_FILTERS, genre: params.genre || DEFAULT_FILTERS.genre, hidden: params.hidden === "hidden" ? "hidden" : DEFAULT_FILTERS.hidden });
    setExtra({
      rating: params.rating != null && params.rating !== "" ? Number(params.rating) : null,
      critic: params.critic != null && params.critic !== "" ? Number(params.critic) : null,
    });
    setQuery("");
  }, [params.n]);

  // Items with their list ids attached — buildBaseFilter's List filter reads them.
  const withLists = useMemo(
    () => (items || []).map((i) => ({ ...i, list_ids: listIdsByItem.get(i.sync_id) || [] })),
    [items, listIdsByItem],
  );

  // Option lists for the filter pickers, derived from what the active type
  // tab contains (like desktop): genres, age ratings, game platforms.
  const tabScoped = useMemo(() => {
    if (typeTab === "All") return withLists;
    const tab = TYPE_TABS.find((t) => t.label === typeTab);
    return tab ? withLists.filter((i) => tab.includes.includes(effectiveType(i))) : withLists;
  }, [withLists, typeTab, TYPE_TABS]);
  const genres = useMemo(() => {
    const set = new Set();
    tabScoped.forEach((i) => splitGenres(i.genre).forEach((g) => set.add(g)));
    return [...set].sort();
  }, [tabScoped]);
  const ageRatings = useMemo(() => [...new Set(tabScoped.map((i) => i.content_rating).filter(Boolean))].sort(), [tabScoped]);
  const platforms = useMemo(() => [...new Set(tabScoped.map(effectivePlatform).filter(Boolean))].sort(), [tabScoped]);
  const osConsoles = useMemo(() => {
    const set = new Set();
    tabScoped.forEach((i) => splitGenres(i.platform).forEach((p) => set.add(p)));
    return [...set].sort();
  }, [tabScoped]);

  // Everything except the Status pill — the Status sheet's counts come from
  // this, so they reflect every other filter.
  const beforeStatus = useMemo(() => buildBaseFilter(withLists, {
    activeTab: typeTab, allTypeTabs: TYPE_TABS,
    genre: filters.genre, ageRating: filters.age, platformFilter: filters.platform, osConsole: filters.os,
    listFilter: filters.list, personalRating: filters.personal, criticRating: filters.critic,
    search: query, hiddenFilter: filters.hidden, webKind: filters.kind,
  }), [withLists, typeTab, filters, query, TYPE_TABS]);

  const shown = useMemo(() => {
    let result = filterByProvider(applyOwnedRatedFilter(applyQuickFilter(beforeStatus, quick), filters.owned, filters.rated), watch.index, provider, providerTypes);
    if (extra.rating != null) result = result.filter((i) => i.rating != null && ratingToDisplay(i.rating) === extra.rating);
    if (extra.critic != null) {
      result = result.filter((i) => {
        const v = externalRatingValue(i);
        return v != null && Math.min(10, Math.max(0, Math.round(v))) === extra.critic;
      });
    }
    return sortItems(result, sort);
  }, [beforeStatus, quick, filters.owned, filters.rated, extra, sort, watch.index, provider, providerTypes]);

  const activeFilterCount =
    (filters.genre !== DEFAULT_FILTERS.genre) + (filters.age !== DEFAULT_FILTERS.age) +
    (filters.platform !== DEFAULT_FILTERS.platform) + (filters.os !== DEFAULT_FILTERS.os) +
    (filters.personal !== DEFAULT_FILTERS.personal) + (filters.critic !== DEFAULT_FILTERS.critic) +
    (filters.rated !== "all") + (filters.owned !== "all") + (provider != null) + (filters.hidden !== "visible") + (filters.list != null) + (filters.kind !== "all") +
    (extra.rating != null) + (extra.critic != null);

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    setProvider(null);
    setExtra({ rating: null, critic: null });
    setQuick("All");
    setQuery("");
  }

  // Grid geometry: N columns per tile size, gap between tiles. Tiles run
  // edge to edge at the tightest spacing (desktop's default look).
  const columns = TILE_COLUMNS[prefs.tileSize] || 3;
  const listLayout = prefs.layout === "list";
  const gap = TILE_GAPS[prefs.tileGap] ?? 1;
  const pad = gap > 1 ? 8 : 0;
  const tileWidth = (screenWidth - pad * 2 - gap * (columns - 1)) / columns;
  // Filtered to ONE square-art type (Music, Podcast, Audiobook, Board Game):
  // tiles are square and the art fills them, like desktop's single-type tab.
  const activeTab = typeTab === "All" ? null : TYPE_TABS.find((t) => t.label === typeTab);
  const squareTile = !!activeTab && activeTab.includes.length === 1 && isSquareArt(activeTab.includes[0]);

  // ── Filter sheet rows: [key, label, current value text, options as [value, label]] ──
  const listName = (id) => lists.find((l) => l.sync_id === id)?.name || "Any list";
  const filterRows = [
    ["genre", "Genre", filters.genre, [["All Genres", "All Genres"], ...genres.map((g) => [g, g])], genres.length > 0],
    ["age", "Age rating", filters.age, [["All Age Ratings", "All Age Ratings"], ...ageRatings.map((a) => [a, a])], ageRatings.length > 0],
    ["personal", "Your rating", filters.personal, PERSONAL_RATING_BUCKETS.map((b) => [b, b]), true],
    ["critic", "Critic rating", filters.critic, CRITIC_RATING_BUCKETS.map((b) => [b, b]), true],
    ["owned", "Owned", OWNED_OPTIONS.find(([v]) => v === filters.owned)[1], OWNED_OPTIONS, true],
    ["rated", "Rated", RATED_OPTIONS.find(([v]) => v === filters.rated)[1], RATED_OPTIONS, true],
    ["hidden", "Hidden items", HIDDEN_OPTIONS.find(([v]) => v === filters.hidden)[1], HIDDEN_OPTIONS, true],
    ["kind", "Kind", KIND_OPTIONS.find(([v]) => v === filters.kind)[1], KIND_OPTIONS, tabScoped.some((i) => i.media_type === "Web Video") && typeTab !== "All"],
    ["list", "List", filters.list ? listName(filters.list) : "Any list", [[null, "Any list"], ...lists.map((l) => [l.sync_id, l.name])], lists.length > 0],
    ["platform", "Platform", filters.platform, [["All Platforms", "All Platforms"], ...platforms.map((p) => [p, p])], platforms.length > 0],
    ["os", "OS & Consoles", filters.os, [["All OS & Consoles", "All OS & Consoles"], ...osConsoles.map((p) => [p, p])], osConsoles.length > 0],
  ].filter((row) => row[4]);

  const pickKey = sheet && sheet.startsWith("pick:") ? sheet.slice(5) : null;
  const pickRow = pickKey ? filterRows.find((r) => r[0] === pickKey) : null;

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        {selecting ? (
          <>
            <View>
              <Text style={styles.wordmark}>{selected.size} selected</Text>
              <Pressable onPress={() => setSelected(new Set(shown.map((i) => i.sync_id)))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Select all ${shown.length} items`}>
                <Text style={[styles.count, { color: C.accent }]}>Select all {shown.length}</Text>
              </Pressable>
            </View>
            <Pressable onPress={clearSelection} style={styles.cancelBtn} accessibilityRole="button" accessibilityLabel="Cancel selection"><Text style={styles.cancelText}>Cancel</Text></Pressable>
          </>
        ) : (
          <>
            <View>
              <Text style={styles.wordmark}>The Media Vault</Text>
              <Text style={styles.count}>{items ? `${shown.length} of ${items.length} items` : "Loading…"}</Text>
            </View>
            <Pressable onPress={() => router.push("/add")} style={styles.addBtn} accessibilityRole="button" accessibilityLabel="Add an item">
              <Text style={styles.addBtnText}>+</Text>
            </Pressable>
          </>
        )}
      </View>

      {offline && (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>
            Offline — showing the copy saved {savedAt ? new Date(savedAt).toLocaleDateString() : "earlier"}. Read-only until you reconnect.
          </Text>
        </View>
      )}

      <View style={styles.filterRow}>
        <Pressable style={styles.filterBtn} onPress={() => setSheet("type")} accessibilityRole="button" accessibilityLabel={`Type filter, ${typeTab}`}>
          <Text style={styles.filterText} numberOfLines={1}>Type: {typeTab} ▾</Text>
        </Pressable>
        <Pressable style={styles.filterBtn} onPress={() => setSheet("status")} accessibilityRole="button" accessibilityLabel={`Status filter, ${quick}`}>
          <Text style={styles.filterText} numberOfLines={1}>Status: {quick} ▾</Text>
        </Pressable>
        <Pressable style={[styles.iconBtn, sort !== "Recently Added" && styles.iconBtnOn]} onPress={() => setSheet("sort")} accessibilityRole="button" accessibilityLabel={`Sort, ${sort}`}>
          <SortIcon size={15} color={sort !== "Recently Added" ? C.accent : C.textSoft} />
        </Pressable>
        <Pressable style={[styles.iconBtn, activeFilterCount > 0 && styles.iconBtnOn]} onPress={() => setSheet("filter")} accessibilityRole="button" accessibilityLabel={activeFilterCount > 0 ? `More filters, ${activeFilterCount} active` : "More filters"}>
          <FilterIcon size={14} color={activeFilterCount > 0 ? C.accent : C.textSoft} />
          {activeFilterCount > 0 && <Text style={styles.badge}>{activeFilterCount}</Text>}
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setSheet("view")} accessibilityRole="button" accessibilityLabel="View options">
          <GridIcon size={16} color={C.textSoft} />
        </Pressable>
      </View>

      {(extra.rating != null || extra.critic != null) && (
        <View style={styles.activeRow}>
          {extra.rating != null && <Pressable style={styles.activeChip} onPress={() => setExtra((e) => ({ ...e, rating: null }))}><Text style={styles.activeText}>Your rating: {extra.rating > 0 ? "+" : ""}{extra.rating}  ✕</Text></Pressable>}
          {extra.critic != null && <Pressable style={styles.activeChip} onPress={() => setExtra((e) => ({ ...e, critic: null }))}><Text style={styles.activeText}>Critic score: {extra.critic}  ✕</Text></Pressable>}
        </View>
      )}

      <TextInput
        style={styles.search} placeholder="Search title, creator or tag" placeholderTextColor="#777"
        value={query} onChangeText={setQuery}
      />

      {error && <Text style={styles.error}>{error}</Text>}
      {!items && !error && <ActivityIndicator style={{ marginTop: 24 }} />}

      <FlatList
        key={listLayout ? "list" : columns}
        data={shown}
        refreshing={refreshing}
        onRefresh={refresh}
        initialNumToRender={24}
        windowSize={11}
        maxToRenderPerBatch={16}
        keyExtractor={(i) => i.sync_id}
        numColumns={listLayout ? 1 : columns}
        columnWrapperStyle={listLayout ? undefined : { gap }}
        getItemLayout={listLayout ? (_, index) => ({ length: LIST_ROW_HEIGHT, offset: LIST_ROW_HEIGHT * index, index }) : undefined}
        extraData={selected}
        contentContainerStyle={{ paddingHorizontal: listLayout ? 0 : pad, paddingBottom: selecting || undo ? 96 : 24 }}
        renderItem={({ item }) => listLayout ? (
          <ListRow
            item={item} keys={keys}
            selectMode={selecting} selected={selected.has(item.sync_id)}
            onPress={() => (selecting ? toggleSelected(item.sync_id) : router.push(`/item/${item.sync_id}`))}
            onLongPress={offline ? undefined : () => toggleSelected(item.sync_id)}
            onStatusPress={offline ? undefined : () => setQuickItem(item)}
          />
        ) : (
          <View style={{ marginBottom: gap }}>
            <Tile
              item={item} keys={keys} width={tileWidth} squareTile={squareTile}
              tileSize={prefs.tileSize} overlay={prefs.tileOverlay}
              selectMode={selecting} selected={selected.has(item.sync_id)}
              onPress={() => (selecting ? toggleSelected(item.sync_id) : router.push(`/item/${item.sync_id}`))}
              onLongPress={offline ? undefined : () => toggleSelected(item.sync_id)}
              onStatusPress={offline ? undefined : () => setQuickItem(item)}
            />
          </View>
        )}
      />

      {/* ── Selection action bar ── */}
      {selecting && (
        <View style={styles.actionBar}>
          {[
            ["Status", () => setSheet("bulk-status")],
            ["List", () => setSheet("bulk-list")],
            ["Owned", () => setSheet("bulk-owned")],
            ["Hide", () => runBulk((ids) => bulkSetHidden(supabase, items, ids, true))],
            ["Unhide", () => runBulk((ids) => bulkSetHidden(supabase, items, ids, false))],
            ["Delete", () => setSheet("bulk-delete")],
          ].map(([label, onPress]) => (
            <Pressable key={label} onPress={onPress} disabled={working} accessibilityRole="button" accessibilityLabel={`${label} selected items`} style={[styles.actionBtn, working && { opacity: 0.5 }]}>
              <Text style={[styles.actionText, label === "Delete" && { color: C.danger }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {undo && !selecting && <UndoBar message={undo.message} failed={undo.failed} busy={undoBusy} onUndo={runUndo} onDismiss={dismissUndo} />}

      <BottomSheet visible={sheet === "bulk-status"} title={`Set status for ${selected.size}`} onClose={() => setSheet(null)}>
        {STATUS_WHEEL_ORDER.map((s) => (
          <Pressable key={s} style={styles.statusRow} onPress={() => runBulk((ids) => bulkSetStatus(supabase, items, ids, s, statusLabel(s)))}>
            <Text style={styles.statusLabel}>{statusLabel(s)}</Text>
          </Pressable>
        ))}
      </BottomSheet>

      <BottomSheet visible={!!quickItem} title={quickItem ? quickItem.title : ""} onClose={() => setQuickItem(null)}>
        {STATUS_WHEEL_ORDER.map((s) => (
          <Pressable key={s} style={styles.statusRow} onPress={() => runQuickStatus(s)}>
            <Text style={[styles.statusLabel, quickItem && quickItem.status === s && { color: C.accent }]}>{statusLabel(s)}</Text>
          </Pressable>
        ))}
        <View style={styles.quickDivider} />
        {favouritesList && (
          <Pressable style={styles.statusRow} onPress={toggleFavourite} accessibilityRole="button">
            <Text style={styles.statusLabel}>{quickIsFav ? "★ Remove from Favourites" : "☆ Add to Favourites"}</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.statusRow} accessibilityRole="button"
          onPress={() => runQuick((t) => bulkSetOwned(supabase, items, [t.sync_id], !quickIsOwnedHere, { deviceId, phoneOwnedIds, otherOwnedIds }))}
        >
          <Text style={styles.statusLabel}>{quickIsOwnedHere ? "Remove my owned mark" : "Mark as owned"}</Text>
        </Pressable>
        <Pressable style={styles.statusRow} accessibilityRole="button" onPress={() => runQuick((t) => bulkSetHidden(supabase, items, [t.sync_id], !quickIsHidden))}>
          <Text style={styles.statusLabel}>{quickIsHidden ? "Unhide" : "Hide"}</Text>
        </Pressable>
      </BottomSheet>

      <BottomSheet visible={sheet === "bulk-owned"} title={`Owned: ${selected.size} item${selected.size === 1 ? "" : "s"}`} onClose={() => setSheet(null)}>
        <Text style={styles.count}>Marks them as owned on this phone (a physical copy, say). Desktop sees it after its next sync.</Text>
        {[[true, "Mark as owned"], [false, "Mark as not owned"]].map(([owned, label]) => (
          <Pressable key={label} style={styles.statusRow} onPress={() => runBulk((ids) => bulkSetOwned(supabase, items, ids, owned, { deviceId, phoneOwnedIds, otherOwnedIds }))}>
            <Text style={styles.statusLabel}>{label}</Text>
          </Pressable>
        ))}
      </BottomSheet>

      <BottomSheet visible={sheet === "bulk-list"} title={`Add ${selected.size} to a list`} onClose={() => setSheet(null)}>
        {lists.length === 0 ? <Text style={styles.count}>No lists yet — create one from an item's page.</Text> : lists.map((l) => (
          <Pressable key={l.sync_id} style={styles.statusRow} onPress={() => runBulk((ids) => bulkAddToList(supabase, listIdsByItem, l.sync_id, ids, l.name))}>
            <Text style={styles.statusLabel}>{l.name}</Text>
          </Pressable>
        ))}
      </BottomSheet>

      <BottomSheet visible={sheet === "bulk-delete"} title={`Delete ${selected.size} item${selected.size === 1 ? "" : "s"}?`} onClose={() => setSheet(null)}>
        <Text style={styles.count}>They disappear from this phone and from desktop after its next sync. You can undo for ten seconds.</Text>
        <AppButton title={`Delete ${selected.size}`} variant="ghost" color={C.danger} onPress={() => runBulk((ids) => bulkDelete(supabase, items, ids))} />
        <AppButton title="Cancel" variant="action" onPress={() => setSheet(null)} />
      </BottomSheet>

      {/* ── Sort: pick what to sort by, then which way (it applies as you tap) ── */}
      <BottomSheet visible={sheet === "sort"} title="Sort by" onClose={() => setSheet(null)}>
        {(() => {
          const current = parseSort(sort) || { field: "recent", direction: "desc" };
          const field = SORT_FIELDS.find((f) => f.key === current.field);
          const labels = DIRECTION_LABELS[field.kind];
          return (
            <>
              {hasDirection(field.key) ? (
                <View style={styles.sortDirections}>
                  {[["asc", labels[0]], ["desc", labels[1]]].map(([dir, label]) => {
                    const on = current.direction === dir;
                    return (
                      <Pressable key={dir} style={[styles.sortCell, styles.sortDir, on && styles.sortCellOn]} onPress={() => setSort(buildSort(field.key, dir))} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${field.label}, ${label}`}>
                        <Text style={[styles.sortText, on && { color: C.accent, fontWeight: "700" }]} numberOfLines={1}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <View style={styles.sortGrid}>
                {SORT_FIELDS.map((f) => {
                  const on = f.key === current.field;
                  return (
                    <Pressable key={f.key} style={[styles.sortCell, on && styles.sortCellOn]} onPress={() => setSort(buildSort(f.key, on ? current.direction : defaultDirection(f.key)))} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <Text style={[styles.sortText, on && { color: C.accent, fontWeight: "700" }]} numberOfLines={1}>{f.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <AppButton title="Done" variant="action" onPress={() => setSheet(null)} />
            </>
          );
        })()}
      </BottomSheet>

      {/* ── Filters: one row per filter, tap to pick ── */}
      <BottomSheet visible={sheet === "watch"} title="Where to stream" onClose={() => setSheet("filter")}>
        <Text style={styles.count}>Shows films and shows available on one service in {watch.region || "your country"} (set the country on any film's Where to Watch card).</Text>
        <View style={styles.watchTypes}>
          {PROVIDER_TYPES.map(([type, label]) => {
            const on = providerTypes.includes(type);
            return (
              <Pressable key={type} style={[styles.chip, on && styles.chipOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                onPress={() => setProviderTypes((cur) => (on ? (cur.length > 1 ? cur.filter((t) => t !== type) : cur) : [...cur, type]))}>
                <Text style={[styles.chipText, on && { color: C.accent }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {watch.loading && <Text style={styles.count}>Loading availability… {watch.loaded} checked so far</Text>}
        {watch.error && <Text style={[styles.count, { color: C.danger }]}>{watch.error}</Text>}
        {watch.index && watch.index.size === 0 && !watch.loading && <Text style={styles.count}>No film or show has been checked for streaming yet. Run Settings → Library maintenance → Check where to watch.</Text>}
        {watch.index && (
          <ScrollView style={{ maxHeight: 340 }}>
            <Pressable style={styles.statusRow} onPress={() => { setProvider(null); setSheet("filter"); }} accessibilityRole="radio" accessibilityState={{ selected: provider == null }}>
              <Text style={[styles.statusLabel, provider == null && { color: C.accent }]}>Any service</Text>
            </Pressable>
            {providerChoices(watch.index, providerTypes).map((p) => (
              <Pressable key={p.name} style={styles.statusRow} onPress={() => { setProvider(p.name); setSheet("filter"); }} accessibilityRole="radio" accessibilityState={{ selected: provider === p.name }}>
                <Text style={[styles.statusLabel, provider === p.name && { color: C.accent }]}>{p.name}</Text>
                <Text style={styles.count}>{p.count}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <AppButton title="Check again" variant="action" disabled={watch.loading} onPress={() => watch.load({ force: true })} style={{ marginTop: 8, alignSelf: "flex-start" }} />
      </BottomSheet>

      <BottomSheet visible={sheet === "filter"} title="Filters" onClose={() => setSheet(null)}>
        {filterRows.map(([key, label, value]) => {
          const isDefault = value === DEFAULT_FILTERS[key] || value === "All" || value === "Visible" || value === "Any list";
          return (
            <Pressable key={key} style={styles.filterRowItem} onPress={() => setSheet(`pick:${key}`)}>
              <Text style={styles.filterRowLabel}>{label}</Text>
              <Text style={[styles.filterRowValue, !isDefault && { color: C.accent }]} numberOfLines={1}>{value}  ▾</Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.filterRowItem} onPress={() => { setSheet("watch"); if (!watch.index && !watch.loading) watch.load(); }} accessibilityRole="button" accessibilityLabel={`Where to stream, ${provider || "any"}`}>
          <Text style={styles.filterRowLabel}>Where to stream</Text>
          <Text style={[styles.filterRowValue, provider && { color: C.accent }]} numberOfLines={1}>{provider || "Any"}  ▾</Text>
        </Pressable>
        <AppButton title={activeFilterCount > 0 || quick !== "All" ? "Reset all filters" : "No filters applied"} variant="action" disabled={activeFilterCount === 0 && quick === "All"} onPress={resetFilters} />
      </BottomSheet>

      {/* ── One filter's options (wrapped chips; many genres may scroll) ── */}
      <BottomSheet visible={!!pickRow} title={pickRow ? pickRow[1] : ""} onClose={() => setSheet("filter")}>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.chips}>
          {pickRow && pickRow[3].map(([value, label]) => {
            const on = filters[pickRow[0]] === value;
            return (
              <Pressable key={String(value)} style={[styles.chip, on && styles.chipOn]} onPress={() => { setFilter(pickRow[0], value); setSheet("filter"); }}>
                <Text style={[styles.chipText, on && { color: C.accent, fontWeight: "700" }]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={sheet === "view"} title="View options" onClose={() => setSheet(null)}>
        {VIEW_OPTIONS.map((group) => (
          <View key={group.key} style={styles.optGroup}>
            <Text style={styles.optLabel}>{group.label}</Text>
            <View style={styles.optRow}>
              {group.options.map(([value, label]) => {
                const on = prefs[group.key] === value;
                return (
                  <Pressable key={value} style={[styles.optBtn, on && styles.optBtnOn]} onPress={() => setPref({ [group.key]: value })}>
                    <Text style={[styles.optText, on && { color: C.accent, fontWeight: "700" }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </BottomSheet>

      <BottomSheet visible={sheet === "type"} title="Show type" onClose={() => setSheet(null)}>
        <View style={styles.typeGrid}>
          {TYPE_TABS.map((t) => {
            const active = typeTab === t.label;
            return (
              <Pressable
                key={t.label}
                style={[styles.typeCell, active && styles.typeCellActive]}
                onPress={() => { setTypeTab(t.label); setSheet(null); }}
              >
                <Text style={styles.typeIcon}>{t.icon || "🗂️"}</Text>
                <Text style={[styles.typeLabel, active && { color: C.accent, fontWeight: "700" }]} numberOfLines={1}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      <BottomSheet visible={sheet === "status"} title="Show status" onClose={() => setSheet(null)}>
        {QUICK_FILTERS.map((f) => {
          const active = quick === f;
          return (
            <Pressable
              key={f}
              style={[styles.statusRow, active && styles.statusRowActive]}
              onPress={() => { setQuick(f); setSheet(null); }}
            >
              <Text style={[styles.statusLabel, active && { color: C.accent, fontWeight: "700" }]}>{f}</Text>
              <Text style={styles.statusCount}>{applyQuickFilter(beforeStatus, f).length}</Text>
            </Pressable>
          );
        })}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8 },
  // Desktop's wordmark: DM Serif Display in the accent colour.
  wordmark: { fontFamily: F.serif, color: C.accent, fontSize: 22, letterSpacing: -0.4 },
  count: { color: C.muted, fontSize: 12, marginTop: 2 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.surface },
  cancelText: { color: C.text, fontSize: 14 },
  actionBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", backgroundColor: C.surface2, borderTopWidth: 1, borderTopColor: C.border },
  actionBtn: { flex: 1, alignItems: "center", paddingVertical: 16 },
  actionText: { color: C.text, fontSize: 14, fontWeight: "600" },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  addBtnText: { color: C.accent, fontSize: 26, lineHeight: 28, fontWeight: "700" },
  offline: { marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: "#e8b84b22", borderWidth: 1, borderColor: "#e8b84b" },
  offlineText: { color: "#e8b84b", fontSize: 12 },
  filterRow: { flexDirection: "row", gap: 6, paddingHorizontal: 16, marginTop: 12 },
  filterBtn: { flex: 1, backgroundColor: C.surface, borderRadius: 5, paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: C.border },
  filterText: { color: C.textSoft, fontSize: 13 },
  iconBtn: { backgroundColor: C.surface, borderRadius: 5, width: 38, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3 },
  iconBtnOn: { borderColor: C.accent, backgroundColor: "#e3aa2622" },
  badge: { color: C.accent, fontSize: 10, fontFamily: F.mono },
  activeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginTop: 10 },
  activeChip: { backgroundColor: "#e3aa2622", borderWidth: 1, borderColor: C.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  activeText: { color: C.accent, fontSize: 12 },
  search: { backgroundColor: C.surface, color: C.text, borderRadius: 5, padding: 12, fontSize: 15, marginHorizontal: 16, marginVertical: 10 },
  error: { color: C.danger, paddingHorizontal: 16 },
  sortDirections: { flexDirection: "row", gap: 6 },
  sortDir: { width: undefined, flex: 1, alignItems: "center" },
  sortGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sortCell: { width: "48.5%", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 5, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  sortCellOn: { borderColor: C.accent, backgroundColor: "#e3aa2622" },
  sortText: { color: C.textSoft, fontSize: 13 },
  filterRowItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  filterRowLabel: { color: C.text, fontSize: 14 },
  filterRowValue: { color: C.muted, fontSize: 13, maxWidth: "60%" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  chipOn: { borderColor: C.accent, backgroundColor: "#e3aa2622" },
  chipText: { color: C.textSoft, fontSize: 13 },
  optGroup: { gap: 8 },
  optLabel: { color: C.muted, fontSize: 10, fontFamily: F.mono, letterSpacing: 0.8, textTransform: "uppercase" },
  optRow: { flexDirection: "row", gap: 8 },
  optBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 5, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  optBtnOn: { borderColor: C.accent, backgroundColor: "#e3aa2622" },
  optText: { color: C.textSoft, fontSize: 13 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap" },
  typeCell: { width: "33.33%", alignItems: "center", paddingVertical: 12, borderRadius: 10 },
  typeCellActive: { backgroundColor: "#e3aa2622" },
  typeIcon: { fontSize: 24 },
  typeLabel: { color: C.textSoft, fontSize: 12, marginTop: 4 },
  watchTypes: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 },
  quickDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 6 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10 },
  statusRowActive: { backgroundColor: "#e3aa2622" },
  statusLabel: { color: C.text, fontSize: 15 },
  statusCount: { color: C.muted, fontSize: 14 },
});
