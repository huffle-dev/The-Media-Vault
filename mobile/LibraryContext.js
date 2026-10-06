// One shared copy of the library list for every tab/screen, loaded from the
// cache first (instant start, works offline) and then refreshed from
// Supabase. When the refresh fails, the cached list stays on screen and
// `offline` flips true — screens use it to make the app read-only.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "./supabase";
import { latestUpdatedAt, mergeItemChanges } from "./libraryMerge";
import { clearLibraryCache, loadLibraryCache, saveLibraryCache } from "./libraryCache";
import { fetchLists, fetchAllMemberships } from "./listsData";
import { clearDismissals } from "./discoveryDismissals";
import { syncAppearance } from "./appearance";
import { diag } from "./diag";
import { fetchCustomTypes, withCustomTypeId } from "./customTypes";
import { fetchOwnedIds, withOwned } from "./ownership";
import { getDeviceId } from "./deviceId";
import { uuidv4 } from "./addToLibrary";

const PAGE = 1000;

// Coming back to the app after at least this long triggers a quiet refresh.
const FOREGROUND_REFRESH_AFTER_MS = 60_000;
// While the app is open and in front, quietly check for changes about once a minute —
// the phone's counterpart of desktop's automatic sync (edits made on desktop appear
// within a minute or so of its own sync, without pulling down to refresh).
const OPEN_APP_REFRESH_EVERY_MS = 60_000;

// date_consumed/runtime feed History and Most Played; the rest are the
// per-type reference-rating columns Stats' critic histogram reads.
// updated_at drives the incremental refresh (see refresh() below).
const ITEM_LIST_COLUMNS = "sync_id, updated_at, title, media_type, status, year, rating, creator, genre, platform_id, cover_art_url, series_name, series_order, content_rating, custom_type_sync_id, metadata_checked_date, watch_checked_date, platform, owned_platform, is_hidden, tags, created_at, date_consumed, runtime, critic_rating, metacritic_rating, igdb_rating, bgg_rating, discogs_rating, openlibrary_rating";

const page = (from, withCount) => supabase
  .from("items")
  .select(ITEM_LIST_COLUMNS, withCount ? { count: "exact" } : undefined)
  .is("deleted_at", null)
  .order("title", { ascending: true })
  .range(from, from + PAGE - 1);

// Reads the real Cloud Sync schema this app shares with desktop. Stays lean
// (a few columns) since it's the one query that runs for the whole library
// at once — the item screen fetches (and writes) the full row on demand.
// RLS already scopes every row to the signed-in user, so no explicit user_id
// filter is needed. deleted_at is filtered defensively — a pull-style client
// should never assume nothing sets it.
//
// The first page also asks Postgres for an exact row count, so every
// remaining page's range is already known and can be fetched in parallel
// instead of one round trip at a time — at ~1900 items (2 pages) this
// already halves the wait, and it stops scaling linearly with library size
// as it grows past a handful of pages.
async function fetchAllItems() {
  const first = await page(0, true);
  if (first.error) throw first.error;
  const total = first.count ?? first.data.length;
  const rest = [];
  for (let from = PAGE; from < total; from += PAGE) rest.push(from);
  const restResults = await Promise.all(rest.map((from) => page(from, false)));
  for (const r of restResults) if (r.error) throw r.error;
  return [first.data, ...restResults.map((r) => r.data)].flat();
}

// Rows changed since `since` (INCLUDING soft-deleted ones, which is how a
// deletion reaches this phone), oldest first, paged past the 1000-row cap.
// ">=" not ">": the newest row already held is fetched again, which the merge
// tolerates, instead of risking a row that shares its timestamp.
async function fetchChangesSince(since) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("items")
      .select(`${ITEM_LIST_COLUMNS}, deleted_at`)
      .gte("updated_at", since)
      .order("updated_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

// How many live items the cloud holds: one cheap head request, used to check
// an incremental refresh really did end up identical to the cloud.
async function fetchLiveCount() {
  const { count, error } = await supabase.from("items").select("sync_id", { count: "exact", head: true }).is("deleted_at", null);
  if (error) throw error;
  return count;
}

const LibraryContext = createContext(null);

// `enabled` is false while signed out — nothing loads, and any previous
// user's list is dropped.
export function LibraryProvider({ enabled, children }) {
  const [items, setItems] = useState(null);
  const [offline, setOffline] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);
  // When the list last matched the cloud, and whether a MANUAL refresh (pull
  // down, the Settings button) is running; the quiet ones show no spinner.
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const itemsRef = useRef(null);
  const inFlightRef = useRef(null);
  const lastRefreshRef = useRef(0);
  // Lists and which items are on them (the Library's List filter). Best-
  // effort: a failure just leaves the List filter empty.
  const [lists, setLists] = useState([]);
  const [listIdsByItem, setListIdsByItem] = useState(() => new Map());
  // Custom media types made on desktop, with their fields (see customTypes.js).
  const [customTypes, setCustomTypes] = useState([]);
  // Items marked owned on any of your devices (null until loaded) — see ownership.js.
  const [ownedIds, setOwnedIds] = useState(null);
  const [phoneOwnedIds, setPhoneOwnedIds] = useState(() => new Set()); // marked on this phone
  const [otherOwnedIds, setOtherOwnedIds] = useState(() => new Set()); // marked on any other device
  const deviceId = useMemo(() => getDeviceId(uuidv4), []);

  // Bumped every time the signed-in/out state changes, so a reload() still
  // in flight from a PREVIOUS session can't land after a sign-out (or a
  // sign-out followed by signing into a different account) — without this,
  // a slow fetchAllItems()/loadLibraryCache() from the old session could
  // resolve after the new session's effect already ran, momentarily
  // showing or re-caching the previous account's library.
  const epochRef = useRef(0);

  const refreshLists = useCallback(async () => {
    try {
      const [l, m] = await Promise.all([fetchLists(), fetchAllMemberships()]);
      setLists(l);
      setListIdsByItem(m);
    } catch (e) { diag.add("warn", "library", `Could not refresh lists: ${e && e.message}`); }
    try { setCustomTypes(await fetchCustomTypes(supabase)); } catch (e) { diag.add("warn", "library", `Could not load custom types: ${e && e.message}`); }
    try {
      const [all, mine, others] = await Promise.all([fetchOwnedIds(supabase), fetchOwnedIds(supabase, { deviceId }), fetchOwnedIds(supabase, { exceptDeviceId: deviceId })]);
      setOwnedIds(all);
      setPhoneOwnedIds(mine);
      setOtherOwnedIds(others);
    } catch (e) { diag.add("warn", "library", `Could not load what you own: ${e && e.message}`); }
  },[deviceId]);

  // Brings the list up to date with the cloud. By default INCREMENTAL: fetch
  // only rows changed since the newest updated_at held, fold them in, then
  // check the live count matches the cloud; if it does not (a row was removed
  // outright, or a change was missed) fall back to downloading everything.
  // `full` skips straight to the full download; `manual` shows the spinner.
  // Overlapping calls share one run. A failure keeps the list on screen and
  // marks the app offline (read-only), exactly as before.
  const refresh = useCallback(({ full = false, manual = false } = {}) => {
    if (inFlightRef.current) return inFlightRef.current;
    const epoch = epochRef.current;
    if (manual) setRefreshing(true);
    const run = (async () => {
      try {
        const held = itemsRef.current;
        const since = !full && held ? latestUpdatedAt(held) : null;
        let fresh = null;
        if (since) {
          const changes = await fetchChangesSince(since);
          // Merge into whatever is held NOW (an edit may have patched the list while waiting).
          const merged = mergeItemChanges(itemsRef.current || held, changes).items;
          if ((await fetchLiveCount()) === merged.length) fresh = merged;
        }
        if (!fresh) fresh = await fetchAllItems();
        if (epoch !== epochRef.current) return;
        setItems(fresh);
        setOffline(false);
        setError(null);
        setRefreshedAt(Date.now());
        lastRefreshRef.current = Date.now();
        saveLibraryCache(fresh);
        refreshLists();
      } catch (e) {
        if (epoch !== epochRef.current) return;
        const cached = await loadLibraryCache();
        if (epoch !== epochRef.current) return;
        // No connection is expected when offline; keep "error" for real failures.
        const offlineMsg = /Unable to resolve host|UnknownHost|Network request failed|network error|timed out|Failed to connect/i.test(String(e && e.message));
        diag.add(offlineMsg ? "warn" : "error", "library", offlineMsg ? "Offline: showing the saved copy of the library." : `Could not refresh the library: ${e && e.message}`);
        if (cached) {
          setItems((prev) => prev || cached.items);
          setSavedAt(cached.savedAt);
          setOffline(true);
        } else if (!itemsRef.current) {
          setError(e.message);
        } else {
          setOffline(true);
        }
      } finally {
        inFlightRef.current = null;
        if (manual) setRefreshing(false);
      }
    })();
    inFlightRef.current = run;
    return run;
  }, [refreshLists]);

  // What add / edit / delete / Discover call after changing something: the
  // incremental refresh (they used to re-download the whole library each time).
  const reload = useCallback(() => refresh(), [refresh]);
  const fullReload = useCallback(() => refresh({ full: true, manual: true }), [refresh]);
  const manualRefresh = useCallback(() => refresh({ manual: true }), [refresh]);

  // Coming back to the app after a minute or more quietly refreshes, so a
  // desktop sync that happened meanwhile shows up without restarting anything.
  useEffect(() => {
    if (!enabled) return undefined;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastRefreshRef.current > FOREGROUND_REFRESH_AFTER_MS) refresh();
    });
    // The minute-by-minute check, only while the app is in front and online.
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && Date.now() - lastRefreshRef.current >= OPEN_APP_REFRESH_EVERY_MS - 1000) refresh();
    }, OPEN_APP_REFRESH_EVERY_MS);
    return () => { sub.remove(); clearInterval(timer); };
  }, [enabled, refresh]);

  useEffect(() => {
    epochRef.current += 1;
    const epoch = epochRef.current;
    // Signed out: drop the list and the on-disk copy, so the next person to
    // sign in on this phone never sees the previous library.
    if (!enabled) { itemsRef.current = null; setItems(null); setOffline(false); setError(null); setRefreshedAt(null); clearLibraryCache(); clearDismissals(); return; }
    (async () => {
      const cached = await loadLibraryCache();
      if (epoch !== epochRef.current) return;
      if (cached) { itemsRef.current = cached.items; setItems(cached.items); setSavedAt(cached.savedAt); }
      // A saved list from before custom types existed lacks their column: download everything once.
      const stale = !!cached && cached.items.length > 0 && !("custom_type_sync_id" in cached.items[0]);
      await refresh(stale ? { full: true } : undefined);
    })();
  }, [enabled, refresh]);

  useEffect(() => { itemsRef.current = items; }, [items]);

  // Patches just the columns the list itself displays after an edit.
  const patchItem = useCallback((patch) => {
    setItems((prev) => prev && prev.map((i) => i.sync_id === patch.sync_id
      ? { ...i, status: patch.status, rating: patch.rating, date_consumed: patch.date_consumed }
      : i));
  }, []);

  // The desktop's Appearance choices (accent, status and type colours). Applied in
  // place to the shared colour objects; the tick makes context consumers redraw.
  // Colours baked into a stylesheet at load (e.g. the accent in some buttons) pick
  // the change up the next time the app starts.
  const [appearanceTick, setAppearanceTick] = useState(0);
  const refreshAppearance = useCallback(() => {
    syncAppearance().then((applied) => { if (applied) setAppearanceTick((t) => t + 1); });
  }, []);
  useEffect(() => { if (enabled) refreshAppearance(); }, [enabled, refreshAppearance]);
  useEffect(() => {
    if (!enabled) return undefined;
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") refreshAppearance(); });
    return () => sub.remove();
  }, [enabled, refreshAppearance]);

  // ── Undo: one bar for every screen (bulk actions, and single-item save/delete).
  // `offerUndo({ message, failed, undo })` shows it; the Library tab renders it.
  const [undo, setUndo] = useState(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const offerUndo = useCallback((offer) => setUndo(offer), []);
  const dismissUndo = useCallback(() => setUndo(null), []);
  const runUndo = useCallback(async () => {
    if (!undo || !undo.undo) { setUndo(null); return; }
    setUndoBusy(true);
    try { await undo.undo(); } catch (e) { /* the refresh below shows what really happened */ } finally {
      setUndoBusy(false);
      setUndo(null);
      await Promise.all([refresh(), refreshLists()]);
    }
  }, [undo, refresh, refreshLists]);

  // Custom-type items carry desktop's `custom_type_id` (= the type's sync id) for the shared helpers.
  const itemsOut = useMemo(() => (items ? withOwned(items.map(withCustomTypeId), ownedIds) : items), [items, ownedIds]);

  const value = useMemo(
    () => ({ deviceId, ownedIds: ownedIds || new Set(), phoneOwnedIds, otherOwnedIds, customTypes, appearanceTick, undo, undoBusy, offerUndo, runUndo, dismissUndo, items: itemsOut, offline, savedAt, error, reload, refresh: manualRefresh, fullReload, refreshing, refreshedAt, patchItem, lists, listIdsByItem, refreshLists }),
    [deviceId, ownedIds, phoneOwnedIds, otherOwnedIds, customTypes, appearanceTick, undo, undoBusy, offerUndo, runUndo, dismissUndo, itemsOut, offline, savedAt, error, reload, manualRefresh, fullReload, refreshing, refreshedAt, patchItem, lists, listIdsByItem, refreshLists],
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export const useLibrary = () => useContext(LibraryContext);
