import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { T, TYPE_TABS, SORT_OPTIONS, QUICK_FILTERS, externalRatingValue, cleanIpcError, effectiveType, STATUS_WHEEL_ORDER, formatRating, ratingColor, effectivePlatform, UNDO_WINDOW_MS, splitGenres, buildBaseFilter, applyQuickFilter, applyOwnedRatedFilter, applyWatchFilter, sortItems } from "./tokens.js";
import TopBar from "./components/TopBar.jsx";
import LibraryGrid from "./components/LibraryGrid.jsx";
import UndoToast from "./components/UndoToast.jsx";
import SelectionBarBtn from "./components/SelectionBarBtn.jsx";
import AddEditModal from "./modals/AddEditModal.jsx";
import ImportModal from "./modals/ImportModal.jsx";
import StatsView from "./views/StatsView.jsx";
import HistoryView from "./views/HistoryView.jsx";
import DiscoverView from "./views/DiscoverView.jsx";
import SyncBanner from "./components/SyncBanner.jsx";
import AboutModal from "./modals/AboutModal.jsx";
import { useCloudSyncStatus } from "./hooks/useCloudSyncStatus.js";
import LocalLibraryModal from "./modals/LocalLibraryModal.jsx";
import SettingsModal from "./modals/SettingsModal.jsx";
import CustomTypeBuilder from "./modals/CustomTypeBuilder.jsx";
import WelcomeModal from "./modals/WelcomeModal.jsx";
import SearchModal from "./modals/SearchModal.jsx";
import ItemProfile from "./views/ItemProfile.jsx";
import AddToListMenu from "./components/AddToListMenu.jsx";
import { StatusWheel, STATUS_COLOR_MAP, STATUS_LABEL_MAP } from "./components/PosterCard.jsx";
import { useCustomTypeSettings } from "./hooks/useCustomTypeSettings.js";
import { useUndoAction } from "./hooks/useUndoAction.js";
import { useAppearanceSettings } from "./hooks/useAppearanceSettings.js";
import { useDisplayPrefs } from "./hooks/useDisplayPrefs.js";
import { useLibraryFilters } from "./hooks/useLibraryFilters.js";
import { useBulkSelection } from "./hooks/useBulkSelection.js";
import { useLists } from "./hooks/useLists.js";
import { useWatchSettings } from "./hooks/useWatchSettings.js";
import { useAutoUpdateOnLaunch } from "./hooks/useAutoUpdateOnLaunch.js";
import { useMenuActions } from "./hooks/useMenuActions.js";
import { useNavigation } from "./hooks/useNavigation.js";
import { useItemCrud } from "./hooks/useItemCrud.js";

// itemId → array of list_ids, built from the list_ids the getAll() join
// returns. Kept as its own state rather than trusting item.list_ids
// directly, since most other IPC calls (add/update/enrich) SELECT a plain
// row with no list join and would otherwise silently wipe list membership.
const buildListMap = (data) => Object.fromEntries(data.map(i => [i.id, i.list_ids || []]));

export default function App() {
  // ── Data state ───────────────────────────────────────────────────────────
  const [items, setItems]         = useState([]);
  const [itemListIds, setItemListIds] = useState({});
  const [aboutOpen, setAboutOpen] = useState(false); // Help → About & Credits
  const [listFilter, setListFilter] = useState(""); // "" = All Lists, else a list id
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const {
    lists, loadLists, favouritesListId,
    handleCreateList, handleAddItemToList, handleDeleteList,
  } = useLists(setItemListIds, listFilter, setListFilter);

  const {
    loadAppearance,
    handleSetAccent, handleSetStatusColor, handleSetTextColor,
    handleSetFontPair, handleSetTypeStyle, handleSetThemeMode,
    handleResetAppearance,
  } = useAppearanceSettings();

  // ── UI state ─────────────────────────────────────────────────────────────
  const {
    activeTab, setActiveTab,
    quickFilter, setQuickFilter,
    genre, setGenre,
    sort, setSort,
    search, setSearch,
    ownedFilter, setOwnedFilter,
    ratedFilter, setRatedFilter,
    ageRating, setAgeRating,
    platformFilter, setPlatformFilter,
    osConsole, setOsConsole,
    personalRating, setPersonalRating,
    criticRating, setCriticRating,
    watchFilter, setWatchFilter,
    hiddenFilter, setHiddenFilter,
    webKindFilter, setWebKindFilter,
    handleResetFilters,
  } = useLibraryFilters(setListFilter);

  const {
    customTypes, allTypeTabs, loadCustomTypes,
    hiddenTypeKeys, handleToggleTypeHidden,
    handleDeleteCustomType,
    typeOrder, handleReorderTypes,
  } = useCustomTypeSettings(activeTab, setActiveTab);

  const {
    view, setView,
    tileSize, tileGap, tileOverlay, listRowSize, scrollSpeed,
    handleTileSizeChange, handleTileGapChange, handleTileOverlayChange, handleListRowSizeChange, handleScrollSpeedChange,
  } = useDisplayPrefs();

  const {
    watchProgress, setWatchProgress,
    watchRegion, watchRegionTouchedRef,
    watchProviderOptions, watchAvailabilityTypes,
    loadWatchSettings,
  } = useWatchSettings(setItems);

  // ── Modal state ──────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]         = useState(false);
  const [editingItem, setEditingItem]     = useState(null);
  // Bumped whenever an existing item is saved via the Edit modal — lets
  // ItemProfile know a deliberate full refresh happened, distinct from its
  // own quick actions like favourite/list-add/status changes.
  const [editSavedAt, setEditSavedAt]     = useState(0);
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [deleteCoverArtToo, setDeleteCoverArtToo] = useState(false);
  // ── "Last action" undo (delete/hide/status) ───────────────────────────
  const { undoDisplay, pushUndoAction, handleUndoClick } = useUndoAction(setEditSavedAt);

  // Prefills the Add/Edit modal for Discovery's and Item Profile's quick-add
  // "+" icons — deliberately a review step, not a silent add, unlike Search
  // Online's row/+ actions which save directly. Distinct from editingItem so
  // an in-flight quick-add never collides with an open edit.
  const [quickAddPrefill, setQuickAddPrefill]     = useState(null);
  // LibraryGrid fully unmounts while an Item Profile is open, which would
  // otherwise reset scroll position every time — a ref survives that
  // unmount/remount since App itself never does.
  const libraryScrollOffsetRef = useRef(0);

  // ── Load all items and genres on mount ───────────────────────────────────

  useEffect(() => {
    loadItems();
    loadWatchSettings();
    loadAutoEnrichSettings();
    loadLists();
    loadAppearance();
    runAutoUpdateOnLaunch();
    runAutoSteamSyncOnLaunch();
    runAutoGogSyncOnLaunch();
    runAutoCloudSyncOnLaunch();
    runGogInstallScanOnLaunch();
  }, []);

  const loadItems = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const data = await window.vault.items.getAll();
      setItems(data);
      setItemListIds(buildListMap(data));
    } catch (err) {
      setError("Failed to load library. Please restart the app.");
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const {
    enrichProgress, filmEnrichProgress, hltbEnrichProgress, gogEnrichProgress,
    autoUpdateStatus,
    loadAutoEnrichSettings,
    runAutoUpdateOnLaunch, runAutoSteamSyncOnLaunch, runAutoGogSyncOnLaunch,
    runAutoCloudSyncOnLaunch,
    runGogInstallScanOnLaunch,
    withAutoEnrichGate, withHltbGate, fetchMissingArt,
  } = useAutoUpdateOnLaunch(loadItems, setItems);

  // Background Cloud Sync: reload the library when a sync brought changes down, and
  // feed the failure banner below.
  const cloudSyncStatus = useCloudSyncStatus(() => loadItems({ silent: true }));

  const {
    menuActionStatus,
    handleMenuResyncSteam, handleMenuResyncGog,
    handleMenuResyncAll, handleMenuFetchArt, handleMenuFillMovieTv, handleMenuFetchHltb,
  } = useMenuActions(loadItems, fetchMissingArt);

  // Fresh list_ids on every item, sourced from itemListIds rather than
  // whatever the item object itself carries.
  const itemsWithLists = useMemo(() =>
    items.map(i => ({ ...i, list_ids: itemListIds[i.id] || [] })),
  [items, itemListIds]);

  // Selecting a provider in the "Where to Watch" filter checks (or re-checks
  // stale) availability for whatever's currently in view — same scope as
  // filteredItems, minus the watch predicate itself.
  const handleWatchFilterChange = (provider) => {
    setWatchFilter(provider);
    if (!provider) return;

    let scope = itemsWithLists.filter(i => i.media_type === "Movie" || i.media_type === "TV");
    scope = buildBaseFilter(scope, { activeTab, allTypeTabs, genre, ageRating, platformFilter, osConsole, listFilter, personalRating, criticRating, search });
    scope = applyQuickFilter(scope, quickFilter);
    scope = applyOwnedRatedFilter(scope, ownedFilter, ratedFilter);

    window.vault.movie.checkWatchProviders(scope);
  };

  // ── Filtered + sorted items ──────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let result = buildBaseFilter(itemsWithLists, { activeTab, allTypeTabs, genre, ageRating, platformFilter, osConsole, listFilter, personalRating, criticRating, search, hiddenFilter, webKind: webKindFilter });

    // Quick filter
    result = applyQuickFilter(result, quickFilter);

    // Owned + Rated — independent of the status quick filter and each other
    result = applyOwnedRatedFilter(result, ownedFilter, ratedFilter);

    result = applyWatchFilter(result, watchFilter, watchAvailabilityTypes, watchRegion);

    return sortItems(result, sort);
  }, [itemsWithLists, activeTab, allTypeTabs, quickFilter, genre, search, ownedFilter, ratedFilter, sort, ageRating, platformFilter, osConsole, listFilter, hiddenFilter, webKindFilter, personalRating, criticRating, watchFilter, watchAvailabilityTypes, watchRegion]);

  const {
    selectedIds, setSelectedIds,
    bulkDeletePending, setBulkDeletePending,
    bulkDeleteCoverArtToo, setBulkDeleteCoverArtToo,
    bulkStatusBtnRef, bulkStatusWheelRect, setBulkStatusWheelRect,
    bulkFeedback,
    handleToggleSelect, handleSelectAll, handleDeselectAll,
    handleBulkDeleteConfirm, handleAddSelectedToList,
    handleBulkSetStatus, handleBulkSetOwned, handleBulkSetHidden,
    handleExportSelected,
  } = useBulkSelection(items, setItems, filteredItems, loadItems, loadLists, setItemListIds, pushUndoAction);

  // ── Genres — derived from items matching the active tab ─────────────────
  const genres = useMemo(() => {
    const tab = allTypeTabs.find(t => t.label === activeTab);
    const scoped = tab && activeTab !== "All"
      ? items.filter(i => tab.includes.includes(effectiveType(i)))
      : items;
    const set = new Set();
    scoped.forEach(i => splitGenres(i.genre).forEach(g => set.add(g)));
    return [...set].sort();
  }, [items, activeTab]);

  // ── Age Ratings — derived from items matching the active tab ────────────
  const ageRatings = useMemo(() => {
    const tab = allTypeTabs.find(t => t.label === activeTab);
    const scoped = tab && activeTab !== "All"
      ? items.filter(i => tab.includes.includes(effectiveType(i)))
      : items;
    return [...new Set(scoped.map(i => i.content_rating).filter(Boolean))].sort();
  }, [items, activeTab]);

  // ── Platforms — derived from items matching the active tab. effectivePlatform
  // returns null for non-Games, so this naturally comes back empty (hiding
  // the filter section) outside the Games tab. ────────────────────────────
  const platforms = useMemo(() => {
    const tab = allTypeTabs.find(t => t.label === activeTab);
    const scoped = tab && activeTab !== "All"
      ? items.filter(i => tab.includes.includes(effectiveType(i)))
      : items;
    return [...new Set(scoped.map(effectivePlatform).filter(Boolean))].sort();
  }, [items, activeTab]);

  // ── OS & Consoles — distinct values from Game's `platform` column
  // (comma-separated, same shape as genre), scoped to the active tab. Empty
  // outside the Games tab, sparse within it until more of the library has
  // IGDB-sourced data.
  const osConsoles = useMemo(() => {
    const tab = allTypeTabs.find(t => t.label === activeTab);
    const scoped = tab && activeTab !== "All"
      ? items.filter(i => tab.includes.includes(effectiveType(i)))
      : items;
    const set = new Set();
    scoped.forEach(i => splitGenres(i.platform).forEach(p => set.add(p)));
    return [...set].sort();
  }, [items, activeTab]);

  // ── Stats scope — tab/genre/rating/list/search/watch, ignores quickFilter,
  // ownedFilter & ratedFilter (those toggles live on the pill counts
  // themselves — recalculating off the currently-applied value would be
  // circular). Where to Watch isn't circular the same way (a plain dropdown,
  // not a pill), so it's included via applyWatchFilter. ──
  const statScopedItems = useMemo(() =>
    applyWatchFilter(
      buildBaseFilter(itemsWithLists, { activeTab, allTypeTabs, genre, ageRating, platformFilter, osConsole, listFilter, personalRating, criticRating, search, hiddenFilter }),
      watchFilter, watchAvailabilityTypes, watchRegion
    ),
    [itemsWithLists, activeTab, allTypeTabs, genre, ageRating, platformFilter, osConsole, listFilter, hiddenFilter, webKindFilter, personalRating, criticRating, search, watchFilter, watchAvailabilityTypes, watchRegion]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:      statScopedItems.length,
    wishlist:   statScopedItems.filter(i => i.status === "wishlist").length,
    notStarted: statScopedItems.filter(i => i.status === "not-started").length,
    inProgress: statScopedItems.filter(i => i.status === "in-progress").length,
    completed:  statScopedItems.filter(i => i.status === "consumed").length,
    dropped:    statScopedItems.filter(i => i.status === "dropped").length,
    rated:      statScopedItems.filter(i => i.rating !== null).length,
    owned:      statScopedItems.filter(i => i.is_local === 1).length,
  }), [statScopedItems]);

  // ── CRUD handlers ────────────────────────────────────────────────────────
  const handleCloseAddEdit = useCallback(() => {
    setModalOpen(false);
    setEditingItem(null);
    setQuickAddPrefill(null);
  }, []);

  const {
    importModalOpen, setImportModalOpen,
    mainView, setMainView,
    viewingItemId, setViewingItemId,
    previewItem, setPreviewItem,
    navStack, setNavStack,
    creatorFilterCtx, setCreatorFilterCtx,
    searchRestoreState, setSearchRestoreState,
    localLibraryOpen, setLocalLibraryOpen,
    settingsOpen, setSettingsOpen,
    settingsInitialTab, setSettingsInitialTab,
    customTypeBuilderOpen, setCustomTypeBuilderOpen,
    welcomeOpen, setWelcomeOpen,
    searchOpen, setSearchOpen,
    searchAutoRun, setSearchAutoRun,
    deepLinkSeq, setDeepLinkSeq,
    handleViewItem, handlePreviewItem, handleBack, handleBackToLibrary,
    handleCloseSettings, handlePreviewItemSaved,
  } = useNavigation(
    setItems,
    modalOpen, handleCloseAddEdit,
    deleteTarget, setDeleteTarget,
    bulkDeletePending, setBulkDeletePending,
    loadWatchSettings, watchRegionTouchedRef, loadAutoEnrichSettings,
  );

  // Wordmark click ("go home") — out of any item profile view (same reset
  // handleBackToLibrary already does for Stats/Discover/History and Esc),
  // every filter cleared, and back to the default tile display.
  const handleLogoClick = () => {
    handleBackToLibrary();
    handleResetFilters();
    setView("tile");
  };

  const {
    handleSave, handleEdit, handleAddNew,
    handleDeleteRequest, handleDeleteConfirm,
    applyItemPatch, handleQuickSave, handleToggleHidden,
  } = useItemCrud(
    items, setItems,
    editingItem, setEditingItem, setModalOpen, setEditSavedAt, setQuickAddPrefill,
    deleteTarget, setDeleteTarget, deleteCoverArtToo, setDeleteCoverArtToo,
    viewingItemId, setViewingItemId,
    pushUndoAction,
    withAutoEnrichGate, withHltbGate, fetchMissingArt,
  );

  // Clicking a chart segment in Stats jumps to the Library view scoped to
  // that segment — all other filters reset, since a filter carried over
  // from one media type is usually meaningless for another.
  const handleStatsNavigate = useCallback((tab, { quickFilter: qf, ratedFilter: rf, genre: g, ageRating: ar, personalRating: pr, criticRating: cr, sort: so, list: l } = {}) => {
    setActiveTab(tab);
    setQuickFilter(qf || "All");
    setGenre(g || "All Genres");
    setAgeRating(ar || "All Age Ratings");
    setPersonalRating(pr || "Any Rating");
    setCriticRating(cr || "Any Critic Rating");
    setListFilter(l || "");
    setSearch("");
    setOwnedFilter("all");
    setRatedFilter(rf || "all");
    setWatchFilter("");
    setSort(so || "Recently Added");
    setMainView("library");
  }, []);

  // Custom application menu (main.js) — almost every action is renderer-side
  // React state, so main.js just dispatches an id here. Subscribed once for
  // the app's lifetime.
  useEffect(() => {
    const unsubscribe = window.vault.menu.onAction((actionId, value) => {
      switch (actionId) {
        case "addItem":         handleAddNew(); break;
        case "addCustomType":   setCustomTypeBuilderOpen(true); break;
        case "import":          setImportModalOpen(true); break;
        case "settings":        setSettingsInitialTab(value || "API Keys & Accounts"); setSettingsOpen(true); break;
        case "toggleView":      setView(v => v === "tile" ? "list" : "tile"); break;
        case "toggleStats":     setMainView(v => v === "stats" ? "library" : "stats"); break;
        case "resetFilters":    handleResetFilters(); break;
        case "tileSize":        handleTileSizeChange(value); break;
        case "tileGap":         handleTileGapChange(value); break;
        case "tileOverlay":     handleTileOverlayChange(value); break;
        case "listRowSize":     handleListRowSizeChange(value); break;
        case "scrollSpeed":     handleScrollSpeedChange(value); break;
        case "resyncSteam":     handleMenuResyncSteam(); break;
        case "resyncGog":       handleMenuResyncGog(); break;
        case "resyncAll":       handleMenuResyncAll(); break;
        case "fetchArt":        handleMenuFetchArt(); break;
        case "fillMovieTv":      handleMenuFillMovieTv(); break;
        case "fetchHltb":       handleMenuFetchHltb(); break;
        case "showWelcome":     setWelcomeOpen(true); break;
        case "showAbout":       setAboutOpen(true); break;
        default: break;
      }
    });
    return unsubscribe;
  }, []);

  // vault:// deep-link (browser extension or OS protocol launch, main.js) —
  // opens Search Online pre-filled and already searching, same screen and
  // duplicate-detection as a manually typed search.
  useEffect(() => {
    return window.vault.deepLink.onOpen(({ mediaType, query, year }) => {
      setSearchRestoreState({ mediaType, query, year });
      setSearchAutoRun(true);
      setSearchOpen(true);
      setDeepLinkSeq(n => n + 1); // forces a fresh SearchModal mount even if one's already open
    });
  }, []);

  // ── Lists ────────────────────────────────────────────────────────────────

  // Toggling Favourites doesn't need a full item reload — patch the map
  // directly and refresh list counts for the Settings/Stats display.
  const handleToggleFavourite = useCallback(async (itemId) => {
    if (!favouritesListId) return;
    try {
      const res = await window.vault.lists.toggleFavourite(itemId);
      setItemListIds(prev => {
        const cur = new Set(prev[itemId] || []);
        res.favourited ? cur.add(favouritesListId) : cur.delete(favouritesListId);
        return { ...prev, [itemId]: [...cur] };
      });
      loadLists();
    } catch (err) {
      console.error("Toggle favourite failed:", err);
    }
  }, [favouritesListId]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", flexDirection: "column", gap: 12,
        background: T.bg, color: T.muted,
      }}>
        <div style={{ fontFamily: T.fontSerif, fontSize: 22, color: T.accent }}>
          The Media Vault
        </div>
        <div style={{ fontSize: 12, fontFamily: T.fontMono }}>
          Loading your library…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", flexDirection: "column", gap: 12,
        background: T.bg, color: T.muted,
      }}>
        <div style={{ fontSize: 13, color: "#e84b6e" }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh", background: T.bg, overflow: "hidden",
    }}>
      <SyncBanner
        status={cloudSyncStatus}
        onRetry={() => window.vault.cloudSync.retry()}
        onOpenSettings={() => { setSettingsInitialTab("Cloud Sync"); setSettingsOpen(true); }}
      />

      {/* Top bar */}
      <TopBar
        stats={stats}
        typeTabs={allTypeTabs}
        activeTab={activeTab}           onTabChange={tab => { setActiveTab(tab); setGenre("All Genres"); }}
        quickFilter={quickFilter}       onQuickFilterChange={setQuickFilter}
        genre={genre}                   onGenreChange={setGenre}
        genres={genres}
        sort={sort}                     onSortChange={setSort}
        search={search}                 onSearchChange={setSearch}
        ownedFilter={ownedFilter}       onOwnedFilterChange={setOwnedFilter}
        ratedFilter={ratedFilter}       onRatedFilterChange={setRatedFilter}
        hiddenFilter={hiddenFilter}     onHiddenFilterChange={setHiddenFilter}
        webKindFilter={webKindFilter}   onWebKindFilterChange={setWebKindFilter}
        view={view}                     onViewChange={setView}
        tileSize={tileSize}             onTileSizeChange={handleTileSizeChange}
        tileGap={tileGap}               onTileGapChange={handleTileGapChange}
        tileOverlay={tileOverlay}       onTileOverlayChange={handleTileOverlayChange}
        listRowSize={listRowSize}       onListRowSizeChange={handleListRowSizeChange}
        ageRating={ageRating}           onAgeRatingChange={setAgeRating}
        ageRatings={ageRatings}
        platformFilter={platformFilter} onPlatformFilterChange={setPlatformFilter}
        platforms={platforms}
        osConsole={osConsole}           onOsConsoleChange={setOsConsole}
        osConsoles={osConsoles}
        lists={lists}                   listFilter={listFilter} onListFilterChange={setListFilter} onDeleteList={handleDeleteList}
        personalRating={personalRating} onPersonalRatingChange={setPersonalRating}
        criticRating={criticRating}     onCriticRatingChange={setCriticRating}
        watchFilter={watchFilter}       onWatchFilterChange={handleWatchFilterChange}
        watchProviderOptions={watchProviderOptions}
        watchRegion={watchRegion}
        onRefreshWatchSettings={loadWatchSettings}
        onResetFilters={handleResetFilters}
        onLogoClick={handleLogoClick}
        onImport={() => setImportModalOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        mainView={mainView}
        onMainViewChange={setMainView}
        onOpenCustomTypeBuilder={() => setCustomTypeBuilderOpen(true)}
        hiddenTypeKeys={hiddenTypeKeys}
        onToggleTypeHidden={handleToggleTypeHidden}
        onDeleteCustomType={handleDeleteCustomType}
        typeOrder={typeOrder}
        onReorderTypes={handleReorderTypes}
      />

      {/* Item Profile — replaces Stats/Library entirely while an item is
          being viewed, same "swap the whole body" pattern Stats/Discover use.
          Also renders for a previewItem (fetched-but-not-saved) —
          viewingItemId and previewItem are mutually exclusive. */}
      {(viewingItemId != null || previewItem != null) && (() => {
        const viewedItem = viewingItemId != null ? itemsWithLists.find(i => i.id === viewingItemId) : previewItem;
        if (!viewedItem) return null; // shouldn't happen — guarded on delete above
        // What "back" resolves to, for the button's own label — computed
        // from the stack, since it describes where you'd land, not what
        // you're currently looking at.
        const backEntry = navStack[navStack.length - 1];
        const backLabel = !backEntry ? "Back to Library"
          : backEntry.type === "search" ? "Back to Search"
          : backEntry.type === "discover" ? "Back to Discover"
          : backEntry.type === "item"
            ? `Back to ${(backEntry.viewingItemId != null ? itemsWithLists.find(i => i.id === backEntry.viewingItemId)?.title : backEntry.previewItem?.title) || "Previous Item"}`
            : "Back to Library";
        // Pushed onto navStack before a tile-row click (More From Author/
        // Series/Similar) swaps to a different item, so "back" undoes just
        // that one hop.
        const pushCurrentItem = () => setNavStack(prev => [...prev, { type: "item", viewingItemId, previewItem }]);
        return (
          <ItemProfile
            item={viewedItem}
            items={itemsWithLists}
            lists={lists}
            favouritesListId={favouritesListId}
            watchRegion={watchRegion}
            editSavedAt={editSavedAt}
            onBack={handleBack}
            backLabel={backLabel}
            onBackToLibrary={handleBackToLibrary}
            onEdit={handleEdit}
            onDeleteRequest={handleDeleteRequest}
            onQuickSave={handleQuickSave}
            onToggleFavourite={handleToggleFavourite}
            onToggleHidden={handleToggleHidden}
            onSelectItem={i => { pushCurrentItem(); setPreviewItem(null); setViewingItemId(i.id); }}
            onFilterByPerson={(name, mediaType) => {
              setNavStack([]);
              setViewingItemId(null);
              setPreviewItem(null);
              setMainView("library");
              if (mediaType) {
                // Scoped to the single matching type tab, not "All" — same
                // collision-avoidance reasoning the More From Creator row
                // applies, and what lets the stats banner trust these are
                // really the same person's items, not just a text match.
                const tab = allTypeTabs.find(t => t.includes.length === 1 && t.includes[0] === mediaType);
                setActiveTab(tab ? tab.label : "All");
                setCreatorFilterCtx({ name, mediaType });
              } else {
                setActiveTab("All");
                setCreatorFilterCtx(null);
              }
              setSearch(name);
            }}
            onAddItemToList={handleAddItemToList}
            onCreateList={handleCreateList}
            onDeleteList={handleDeleteList}
            onQuickAdd={details => { setQuickAddPrefill(details); setEditingItem(null); setModalOpen(true); }}
            onPreviewItem={details => { pushCurrentItem(); handlePreviewItem(details); }}
            onItemSaved={handlePreviewItemSaved}
            customTypes={customTypes}
          />
        );
      })()}

      {/* Stats / Library switch */}
      {!viewingItemId && !previewItem && mainView === "stats" ? (
        <StatsView items={itemsWithLists} lists={lists} onNavigate={handleStatsNavigate} onViewItem={handleViewItem} customTypes={customTypes} />
      ) : null}

      {/* Completed History — chronological list, its own tab rather than
          living inside Stats' scroll page. */}
      {!viewingItemId && !previewItem && mainView === "history" && (
        <HistoryView items={itemsWithLists} customTypes={customTypes} onEdit={handleEdit} />
      )}

      {/* Discovery — same "swap the whole body" pattern as Stats. Quick-add
          reuses the same prefill-and-open-modal flow as Item Profile's
          creator/series/similar rows, not a silent add. */}
      {!viewingItemId && !previewItem && mainView === "discover" && (
        <DiscoverView
          items={itemsWithLists}
          onQuickAdd={details => { setQuickAddPrefill(details); setEditingItem(null); setModalOpen(true); }}
          onViewItem={item => { setNavStack(prev => [...prev, { type: "discover" }]); handleViewItem(item); }}
          onPreviewItem={details => { setNavStack(prev => [...prev, { type: "discover" }]); handlePreviewItem(details); }}
          onOpenSettings={() => { setSettingsInitialTab("API Keys & Accounts"); setSettingsOpen(true); }}
        />
      )}

      {/* Selection bar */}
      {!viewingItemId && selectedIds.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "6px 14px", background: T.accentWash,
          borderBottom: `1px solid ${T.accent}44`, flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: T.accent, fontFamily: T.fontMono }}>
            {selectedIds.size} selected
          </span>
          <SelectionBarBtn variant="plain" onClick={handleSelectAll}>Select all {filteredItems.length}</SelectionBarBtn>
          <SelectionBarBtn variant="plain" onClick={handleDeselectAll}>Deselect all</SelectionBarBtn>
          <div style={{ flex: 1 }} />
          <SelectionBarBtn
            buttonRef={bulkStatusBtnRef}
            success={bulkFeedback === "status"}
            onClick={() => { if (bulkStatusBtnRef.current) setBulkStatusWheelRect(bulkStatusBtnRef.current.getBoundingClientRect()); }}
          >{bulkFeedback === "status" ? "✓ Status Set" : "Set Status"}</SelectionBarBtn>
          <SelectionBarBtn success={bulkFeedback === "owned"} onClick={() => handleBulkSetOwned(true)}>
            {bulkFeedback === "owned" ? "✓ Marked Owned" : "Mark Owned"}
          </SelectionBarBtn>
          <SelectionBarBtn success={bulkFeedback === "notOwned"} onClick={() => handleBulkSetOwned(false)}>
            {bulkFeedback === "notOwned" ? "✓ Marked Not Owned" : "Mark Not Owned"}
          </SelectionBarBtn>
          <SelectionBarBtn success={bulkFeedback === "hidden"} onClick={() => handleBulkSetHidden(true)}>
            {bulkFeedback === "hidden" ? "✓ Hidden" : "Hide"}
          </SelectionBarBtn>
          <SelectionBarBtn success={bulkFeedback === "unhidden"} onClick={() => handleBulkSetHidden(false)}>
            {bulkFeedback === "unhidden" ? "✓ Unhidden" : "Unhide"}
          </SelectionBarBtn>
          <SelectionBarBtn onClick={handleExportSelected}>↓ Export Selected</SelectionBarBtn>
          <AddToListMenu
            lists={lists}
            onAddToList={handleAddSelectedToList}
            onCreateList={handleCreateList}
            onDeleteList={handleDeleteList}
          />
          <SelectionBarBtn variant="danger" onClick={() => { setBulkDeletePending(true); setBulkDeleteCoverArtToo(false); }}>
            Delete {selectedIds.size} items
          </SelectionBarBtn>
        </div>
      )}
      {bulkStatusWheelRect && (
        <StatusWheel
          current={null}
          anchorRect={bulkStatusWheelRect}
          onSelect={handleBulkSetStatus}
          onClose={() => setBulkStatusWheelRect(null)}
        />
      )}

      {/* Creator Page banner — only while the current search/tab still
          matches what a creator-field click set (see onFilterByPerson
          above); editing the search box or switching tabs stops matching
          and the banner stops appearing on its own. Stats are computed from
          an exact case-insensitive creator+media_type match against the
          full library, not the substring `search` filter LibraryGrid uses
          — a precise match is what makes these numbers trustworthy. */}
      {(() => {
        // Same visibility gate LibraryGrid below uses — without it the
        // banner could render while Stats/Discover/Item Profile is showing,
        // since creatorFilterCtx alone doesn't imply the grid is on screen.
        if (viewingItemId || previewItem || mainView === "stats" || mainView === "discover" || mainView === "history") return null;
        if (!creatorFilterCtx) return null;
        if (search.trim().toLowerCase() !== creatorFilterCtx.name.toLowerCase()) return null;
        const tab = allTypeTabs.find(t => t.includes.length === 1 && t.includes[0] === creatorFilterCtx.mediaType);
        if (tab && activeTab !== tab.label && activeTab !== "All") return null;
        const matches = itemsWithLists.filter(i =>
          i.media_type === creatorFilterCtx.mediaType &&
          (i.creator || "").toLowerCase() === creatorFilterCtx.name.toLowerCase()
        );
        if (!matches.length) return null;
        const rated = matches.filter(i => i.rating != null);
        const avgRating = rated.length ? rated.reduce((sum, i) => sum + i.rating, 0) / rated.length : null;
        const statusCounts = {};
        for (const i of matches) statusCounts[i.status] = (statusCounts[i.status] || 0) + 1;
        const statusParts = STATUS_WHEEL_ORDER
          .filter(s => statusCounts[s])
          .map(s => `${statusCounts[s]} ${STATUS_LABEL_MAP[s]}`);
        return (
          <div style={{ padding: "0 20px 14px", display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <div style={{ fontFamily: T.fontSerif, fontSize: 18, color: T.text }}>{creatorFilterCtx.name}</div>
            <div style={{ fontSize: 12, color: T.muted, fontFamily: T.fontMono }}>
              {matches.length} item{matches.length === 1 ? "" : "s"}
              {avgRating != null && (
                <> · avg rating <span style={{ color: ratingColor(avgRating) }}>{formatRating(avgRating)}</span></>
              )}
              {statusParts.length > 0 && <> · {statusParts.join(" · ")}</>}
            </div>
          </div>
        );
      })()}

      {/* Library */}
      {!viewingItemId && !previewItem && mainView !== "stats" && mainView !== "discover" && mainView !== "history" && <LibraryGrid
        items={filteredItems}
        hasUnfilteredItems={itemsWithLists.length > 0}
        view={view}
        tileSize={tileSize}
        tileGap={tileGap}
        tileOverlay={tileOverlay}
        listRowSize={listRowSize}
        scrollSpeed={scrollSpeed}
        sort={sort}
        onSortChange={setSort}
        activeTab={activeTab}
        onView={handleViewItem}
        onEdit={handleEdit}
        onDeleteRequest={handleDeleteRequest}
        onQuickSave={handleQuickSave}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        favouritesListId={favouritesListId}
        onToggleFavourite={handleToggleFavourite}
        onToggleHidden={handleToggleHidden}
        customTypes={customTypes}
        initialScrollOffset={libraryScrollOffsetRef.current}
        onScrollOffsetChange={offset => { libraryScrollOffsetRef.current = offset; }}
      />}

      {/* Local library modal */}
      {localLibraryOpen && (
        <LocalLibraryModal
          onScanComplete={async (recognised) => {
            const all = await window.vault.items.getAll();
            setItems(all);
            setItemListIds(buildListMap(all));
            // Only fetch art/metadata for the items just scanned, matched by title + media_type
            const scannedKeys = new Set((recognised || []).map(r => `${r.title?.toLowerCase()}|${r.media_type}`));
            const newItems = scannedKeys.size > 0
              ? all.filter(i => scannedKeys.has(`${i.title?.toLowerCase()}|${i.media_type}`))
              : [];
            const gated = withAutoEnrichGate(newItems);
            fetchMissingArt(gated);
            window.vault.movie.enrich(gated);
            const hltbGated = withHltbGate(gated);
            if (hltbGated.length) window.vault.hltb.enrich(hltbGated);
          }}
          onClose={() => setLocalLibraryOpen(false)}
        />
      )}

      {/* Import modal */}
      {importModalOpen && (
        <ImportModal
          onComplete={async (importedRows) => {
            const all = await window.vault.items.getAll();
            setItems(all);
            setItemListIds(buildListMap(all));
            setImportModalOpen(false);
            // Only fetch art for the items that were just imported, matched by title + media_type
            const importedKeys = new Set((importedRows || []).map(r => `${r.title?.toLowerCase()}|${r.media_type}`));
            const newItems = importedKeys.size > 0
              ? all.filter(i => importedKeys.has(`${i.title?.toLowerCase()}|${i.media_type}`))
              : [];
            const gated = withAutoEnrichGate(newItems);
            fetchMissingArt(gated);
            window.vault.movie.enrich(gated);
            const hltbGated = withHltbGate(gated);
            if (hltbGated.length) window.vault.hltb.enrich(hltbGated);
            // Freshly imported YouTube channels (e.g. a Takeout subscriptions.csv) only have a
            // name and id: one batched lookup adds counts, picture and description.
            const newChannels = newItems.filter(i => i.media_type === "Web Video" && i.platform_id && !/^(video|playlist)-/.test(i.platform_id) && !i.cover_art_path);
            if (newChannels.length) {
              window.vault.youtube.refreshChannels(newChannels.map(i => i.id)).then(() => loadItems({ silent: true })).catch(() => {});
            }
          }}
          onClose={() => setImportModalOpen(false)}
          onLocalLibrary={() => { setImportModalOpen(false); setLocalLibraryOpen(true); }}
          onAddManually={() => { setImportModalOpen(false); handleAddNew(); }}
          onOnlineSearch={() => { setImportModalOpen(false); setSearchRestoreState(null); setSearchOpen(true); }}
        />
      )}

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}

      {/* Welcome modal — first launch only */}
      {welcomeOpen && (
        <WelcomeModal
          onClose={() => { setWelcomeOpen(false); loadAutoEnrichSettings(); }}
          onLibraryUpdate={() => loadItems({ silent: true })}
        />
      )}

      {/* Settings modal */}
      {settingsOpen && (
        <SettingsModal
          initialTab={settingsInitialTab}
          onClose={handleCloseSettings}
          onWatchRegionTouched={() => { watchRegionTouchedRef.current = true; }}
          onLibraryUpdate={() => loadItems({ silent: true })}
          items={items}
          onSetAccent={handleSetAccent}
          onSetStatusColor={handleSetStatusColor}
          onSetTextColor={handleSetTextColor}
          onSetFontPair={handleSetFontPair}
          onSetTypeStyle={handleSetTypeStyle}
          customTypes={customTypes}
          onCustomTypesChanged={loadCustomTypes}
          onSetThemeMode={handleSetThemeMode}
          onResetAppearance={handleResetAppearance}
        />
      )}

      {/* Custom type builder */}
      {customTypeBuilderOpen && (
        <CustomTypeBuilder
          customTypes={customTypes}
          items={items}
          onClose={() => setCustomTypeBuilderOpen(false)}
          onChanged={loadCustomTypes}
        />
      )}

      {/* Add / Edit modal */}
      {modalOpen && (
        <AddEditModal
          item={editingItem || quickAddPrefill}
          onSave={handleSave}
          onClose={handleCloseAddEdit}
          customTypes={customTypes}
        />
      )}

      {/* Search modal */}
      {searchOpen && (
        <SearchModal
          key={deepLinkSeq}
          initialMediaType={searchRestoreState?.mediaType || "Game"}
          initialState={searchRestoreState}
          autoRun={searchAutoRun}
          onItemAdded={(item) => setItems(prev => [item, ...prev])}
          onViewItem={(item, searchState) => {
            setSearchOpen(false);
            if (searchState) setNavStack(prev => [...prev, { type: "search", state: searchState }]);
            handleViewItem(item);
          }}
          onPreviewItem={(details, searchState) => {
            setSearchOpen(false);
            if (searchState) setNavStack(prev => [...prev, { type: "search", state: searchState }]);
            handlePreviewItem(details);
          }}
          onClose={() => { setSearchOpen(false); setSearchAutoRun(false); }}
        />
      )}

      {/* Bulk delete confirmation */}
      {bulkDeletePending && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(5,5,10,0.85)",
          backdropFilter: "blur(6px)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 200,
        }}>
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 10, padding: 24, width: 360,
            boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
          }}>
            <div style={{ fontFamily: T.fontSerif, fontSize: 17, color: T.text, marginBottom: 8 }}>
              Delete {selectedIds.size} items?
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
              These items will be removed from your library. You'll have a few seconds to undo after confirming.
            </div>
            {[...selectedIds].some(id => items.find(i => i.id === id)?.cover_art_path) && (
              <div
                onClick={() => setBulkDeleteCoverArtToo(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  marginBottom: 20, cursor: "pointer", userSelect: "none",
                }}
              >
                <div style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  border: `1px solid ${bulkDeleteCoverArtToo ? "#e84b6e" : T.border}`,
                  background: bulkDeleteCoverArtToo ? "#e84b6e" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {bulkDeleteCoverArtToo && <span style={{ fontSize: 9, color: "#fff", lineHeight: 1 }}>✓</span>}
                </div>
                <span style={{ fontSize: 12, color: T.muted, fontFamily: T.fontMono }}>
                  Also delete cover art files (only where no other item uses the same one)
                </span>
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleBulkDeleteConfirm}
                style={{
                  flex: 1, padding: "9px", background: "#e84b6e",
                  color: "#fff", border: "none", borderRadius: 5,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >Delete {selectedIds.size} items</button>
              <button
                onClick={() => setBulkDeletePending(false)}
                style={{
                  padding: "9px 16px", background: "transparent",
                  border: `1px solid ${T.border}`, borderRadius: 5,
                  color: T.muted, fontSize: 13, cursor: "pointer",
                }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(5,5,10,0.85)",
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 200,
        }}>
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 10, padding: 24, width: 360,
            boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
          }}>
            <div style={{ fontFamily: T.fontSerif, fontSize: 17, color: T.text, marginBottom: 8 }}>
              Delete item?
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: deleteTarget.cover_art_path ? 14 : 20, lineHeight: 1.5 }}>
              <span style={{ color: T.text }}>{deleteTarget.title}</span> will be removed from your library.
              You'll have a few seconds to undo after confirming.
            </div>
            {deleteTarget.cover_art_path && (
              <div
                onClick={() => setDeleteCoverArtToo(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  marginBottom: 20, cursor: "pointer", userSelect: "none",
                }}
              >
                <div style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  border: `1px solid ${deleteCoverArtToo ? "#e84b6e" : T.border}`,
                  background: deleteCoverArtToo ? "#e84b6e" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {deleteCoverArtToo && <span style={{ fontSize: 9, color: "#fff", lineHeight: 1 }}>✓</span>}
                </div>
                <span style={{ fontSize: 12, color: T.muted, fontFamily: T.fontMono }}>
                  Also delete its cover art file
                </span>
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  flex: 1, padding: "9px", background: "#e84b6e",
                  color: "#fff", border: "none", borderRadius: 5,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >Delete</button>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  padding: "9px 16px", background: "transparent",
                  border: `1px solid ${T.border}`, borderRadius: 5,
                  color: T.muted, fontSize: 13, cursor: "pointer",
                }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* "Last action" undo toast — delete/hide/status. Top-right, clear of
          the Auto-Update/enrichment chips below (bottom-right). */}
      {undoDisplay && (
        <UndoToast key={undoDisplay.key} label={undoDisplay.label} durationMs={UNDO_WINDOW_MS} onUndo={handleUndoClick} />
      )}

      {/* Auto-Update on Launch — unified chip covering the whole batch,
          including the otherwise-silent Steam sync and Cover Art steps
          (Film/TV metadata and Streaming Availability get their own chips
          below). */}
      {autoUpdateStatus && (
        <div style={{
          position: "fixed", bottom: 16, right: 16, zIndex: 300,
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: "10px 14px", minWidth: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          opacity: autoUpdateStatus === "done" ? 0.6 : 1,
          transition: "opacity 0.4s",
        }}>
          <span style={{
            fontSize: 10, color: T.muted,
            fontFamily: T.fontMono, letterSpacing: "0.04em",
          }}>
            {autoUpdateStatus === "done" ? "✓ Library updated" : "Auto-updating library…"}
          </span>
        </div>
      )}

      {/* Background enrichment progress chip */}
      {enrichProgress && (
        <div style={{
          position: "fixed", bottom: autoUpdateStatus ? 96 : 16, right: 16, zIndex: 300,
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: "10px 14px", minWidth: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          opacity: enrichProgress.done === enrichProgress.total ? 0.6 : 1,
          transition: "opacity 0.4s",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6, gap: 12,
          }}>
            <span style={{
              fontSize: 10, color: T.muted,
              fontFamily: T.fontMono, letterSpacing: "0.04em",
            }}>
              {enrichProgress.done === enrichProgress.total
                ? "✓ Game details synced"
                : "Fetching game details…"}
            </span>
            <span style={{
              fontSize: 10, color: T.accent,
              fontFamily: T.fontMono,
            }}>
              {enrichProgress.done} / {enrichProgress.total}
            </span>
          </div>
          <div style={{ height: 2, background: T.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99, background: T.accent,
              width: `${(enrichProgress.done / enrichProgress.total) * 100}%`,
              transition: "width 0.2s",
            }} />
          </div>
        </div>
      )}

      {/* Film/TV metadata backfill progress chip — visible regardless of Settings being open */}
      {filmEnrichProgress && filmEnrichProgress.total > 0 && (
        <div style={{
          position: "fixed",
          bottom: 16 + (autoUpdateStatus ? 80 : 0) + (enrichProgress ? 80 : 0),
          right: 16, zIndex: 300,
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: "10px 14px", minWidth: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          opacity: filmEnrichProgress.done === filmEnrichProgress.total ? 0.6 : 1,
          transition: "opacity 0.4s, bottom 0.2s",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6, gap: 12,
          }}>
            <span style={{
              fontSize: 10, color: T.muted,
              fontFamily: T.fontMono, letterSpacing: "0.04em",
            }}>
              {filmEnrichProgress.done === filmEnrichProgress.total
                ? "✓ Movie/TV info synced"
                : "Fetching Movie/TV info…"}
            </span>
            <span style={{
              fontSize: 10, color: T.accent,
              fontFamily: T.fontMono,
            }}>
              {filmEnrichProgress.done} / {filmEnrichProgress.total}
            </span>
          </div>
          <div style={{ height: 2, background: T.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99, background: T.accent,
              width: `${(filmEnrichProgress.done / filmEnrichProgress.total) * 100}%`,
              transition: "width 0.2s",
            }} />
          </div>
        </div>
      )}

      {/* HowLongToBeat completion-time backfill progress chip */}
      {hltbEnrichProgress && hltbEnrichProgress.total > 0 && (
        <div style={{
          position: "fixed",
          bottom: 16 + (autoUpdateStatus ? 80 : 0) + (enrichProgress ? 80 : 0) + (filmEnrichProgress && filmEnrichProgress.total > 0 ? 80 : 0),
          right: 16, zIndex: 300,
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: "10px 14px", minWidth: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          opacity: hltbEnrichProgress.done === hltbEnrichProgress.total ? 0.6 : 1,
          transition: "opacity 0.4s, bottom 0.2s",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6, gap: 12,
          }}>
            <span style={{
              fontSize: 10, color: T.muted,
              fontFamily: T.fontMono, letterSpacing: "0.04em",
            }}>
              {hltbEnrichProgress.done === hltbEnrichProgress.total
                ? "✓ HowLongToBeat times synced"
                : "Fetching HowLongToBeat times…"}
            </span>
            <span style={{
              fontSize: 10, color: T.accent,
              fontFamily: T.fontMono,
            }}>
              {hltbEnrichProgress.done} / {hltbEnrichProgress.total}
            </span>
          </div>
          <div style={{ height: 2, background: T.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99, background: T.accent,
              width: `${(hltbEnrichProgress.done / hltbEnrichProgress.total) * 100}%`,
              transition: "width 0.2s",
            }} />
          </div>
        </div>
      )}

      {/* GOG game details backfill progress chip */}
      {gogEnrichProgress && gogEnrichProgress.total > 0 && (
        <div style={{
          position: "fixed",
          bottom: 16 + (autoUpdateStatus ? 80 : 0) + (enrichProgress ? 80 : 0) + (filmEnrichProgress && filmEnrichProgress.total > 0 ? 80 : 0) + (hltbEnrichProgress && hltbEnrichProgress.total > 0 ? 80 : 0),
          right: 16, zIndex: 300,
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: "10px 14px", minWidth: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          opacity: gogEnrichProgress.done === gogEnrichProgress.total ? 0.6 : 1,
          transition: "opacity 0.4s, bottom 0.2s",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6, gap: 12,
          }}>
            <span style={{
              fontSize: 10, color: T.muted,
              fontFamily: T.fontMono, letterSpacing: "0.04em",
            }}>
              {gogEnrichProgress.done === gogEnrichProgress.total
                ? "✓ GOG game details synced"
                : "Fetching GOG game details…"}
            </span>
            <span style={{
              fontSize: 10, color: T.accent,
              fontFamily: T.fontMono,
            }}>
              {gogEnrichProgress.done} / {gogEnrichProgress.total}
            </span>
          </div>
          <div style={{ height: 2, background: T.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99, background: T.accent,
              width: `${(gogEnrichProgress.done / gogEnrichProgress.total) * 100}%`,
              transition: "width 0.2s",
            }} />
          </div>
        </div>
      )}

      {/* Where to Watch check progress chip */}
      {watchProgress && watchProgress.total > 0 && (
        <div style={{
          position: "fixed",
          bottom: 16 + (autoUpdateStatus ? 80 : 0) + (enrichProgress ? 80 : 0) + (filmEnrichProgress && filmEnrichProgress.total > 0 ? 80 : 0) + (hltbEnrichProgress && hltbEnrichProgress.total > 0 ? 80 : 0) + (gogEnrichProgress && gogEnrichProgress.total > 0 ? 80 : 0),
          right: 16, zIndex: 300,
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: "10px 14px", minWidth: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          opacity: watchProgress.done === watchProgress.total ? 0.6 : 1,
          transition: "opacity 0.4s, bottom 0.2s",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6, gap: 12,
          }}>
            <span style={{
              fontSize: 10, color: T.muted,
              fontFamily: T.fontMono, letterSpacing: "0.04em",
            }}>
              {watchProgress.done === watchProgress.total
                ? "✓ Watch availability checked"
                : "Checking where to watch…"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontSize: 10, color: T.accent,
                fontFamily: T.fontMono,
              }}>
                {watchProgress.done} / {watchProgress.total}
              </span>
              {watchProgress.done !== watchProgress.total && (
                <button
                  onClick={() => {
                    window.vault.movie.cancelWatchCheck();
                    setWatchProgress(null);
                  }}
                  title="Cancel"
                  style={{
                    width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "none", border: "none", color: T.muted,
                    fontSize: 11, cursor: "pointer", lineHeight: 1, padding: 0,
                  }}
                >✕</button>
              )}
            </div>
          </div>
          <div style={{ height: 2, background: T.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99, background: T.accent,
              width: `${(watchProgress.done / watchProgress.total) * 100}%`,
              transition: "width 0.2s",
            }} />
          </div>
        </div>
      )}

      {/* Menu-triggered Resync/Fetch feedback — bottom-left, opposite corner
          from the auto-update/progress chips so it never touches their
          cascading offset math. */}
      {menuActionStatus && (
        <div style={{
          position: "fixed", bottom: 16, left: 16, zIndex: 300,
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: "10px 14px", minWidth: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          opacity: menuActionStatus.done ? 0.6 : 1,
          transition: "opacity 0.4s",
        }}>
          <span style={{
            fontSize: 10, color: T.muted,
            fontFamily: T.fontMono, letterSpacing: "0.04em",
          }}>
            {menuActionStatus.label}
          </span>
        </div>
      )}
    </div>
  );
}
