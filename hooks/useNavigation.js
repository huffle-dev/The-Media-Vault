// Navigation and modal-open state — which full-body view is showing
// (library/stats/history/discover), the Item Profile navigation stack (Back
// button), Import/Local-Library/Settings/Custom-Type-Builder/Welcome/Search
// modal visibility, and the global Esc-key handler that closes whatever's
// on top.
//
// Does NOT own modalOpen/editingItem/quickAddPrefill or deleteTarget/
// bulkDeletePending — those stay with the item-CRUD hook, since
// handleEdit/handleAddNew/handleDeleteRequest open/close them together
// with editingItem in the same gesture. The Esc-key effect still needs to
// know about them, so they — plus loadWatchSettings/watchRegionTouchedRef/
// loadAutoEnrichSettings, needed by handleCloseSettings — come in as
// explicit parameters.
import { useState, useRef, useEffect, useCallback } from "react";

export function useNavigation(
  setItems,
  modalOpen, handleCloseAddEdit,
  deleteTarget, setDeleteTarget,
  bulkDeletePending, setBulkDeletePending,
  loadWatchSettings, watchRegionTouchedRef, loadAutoEnrichSettings,
) {
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [mainView, setMainView]               = useState("library");
  // Just the id, not the item object — the object gets re-resolved fresh
  // from itemsWithLists on every render, so edits/quick-saves while the
  // Profile view is open are never showing stale data.
  const [viewingItemId, setViewingItemId]     = useState(null);
  // A not-yet-saved item being previewed in Item Profile (clicked a tile/row
  // for something outside the library). Mutually exclusive with
  // viewingItemId; ItemProfile decides which features apply based on
  // whether the item has a real id.
  const [previewItem, setPreviewItem]         = useState(null);
  // "Where did the current viewingItemId/previewItem navigation come from" —
  // a stack so Item Profile's back button can undo it instead of always
  // dropping to the Library. Each entry is one of:
  //   { type: "search", state: {...} } — SearchModal's own state, snapshotted
  //     before unmount, so "back" reopens it pre-filled instead of blank.
  //   { type: "discover" } — just needs mainView restored.
  //   { type: "item", viewingItemId, previewItem } — whichever was showing
  //     before navigating to a tile row's target.
  const [navStack, setNavStack]               = useState([]);
  // Set only by clicking a Details-grid creator field (Director/Author/
  // Designer/etc.), not Cast (plain name search, no stats banner). Read at
  // render time against the *current* search/tab state rather than reset on
  // every mutation site — editing the search box naturally stops matching.
  const [creatorFilterCtx, setCreatorFilterCtx] = useState(null); // { name, mediaType } | null
  // Only set right before reopening Search Online from a "back" navigation —
  // the normal open path (toolbar "+" -> Search Online) always starts fresh.
  const [searchRestoreState, setSearchRestoreState] = useState(null);
  const [localLibraryOpen, setLocalLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen]           = useState(false);
  // Which Settings tab to land on — most opens want the default (API Keys),
  // but File menu's Export/Backup and Resync actions jump straight to the
  // relevant tab.
  const [settingsInitialTab, setSettingsInitialTab] = useState("API Keys & Accounts");
  const [customTypeBuilderOpen, setCustomTypeBuilderOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen]             = useState(false);
  const [searchOpen, setSearchOpen]               = useState(false);
  // True only when this open should fire the search immediately (a vault://
  // deep-link) rather than waiting for a manual submit — reset by the
  // SearchModal render call's own onClose, not owned/reset here.
  const [searchAutoRun, setSearchAutoRun]         = useState(false);
  // Bumped on every deep-link open so App.jsx can key <SearchModal> on it —
  // SearchModal only seeds its mediaType/query state from props on mount, so
  // a second deep link arriving while it's already open (warm second-instance)
  // needs a fresh mount to actually pick up the new prefill, not just new props.
  const [deepLinkSeq, setDeepLinkSeq]             = useState(0);

  useEffect(() => {
    window.vault.settings.get("welcomed").then(v => {
      if (!v) setWelcomeOpen(true);
    });
  }, []);

  // Tile/list-row click opens the Item Profile view instead of jumping
  // straight to Edit — Edit is still one hover-button away, and Profile
  // itself has its own Edit action.
  const handleViewItem = useCallback((item) => {
    setViewingItemId(item.id);
  }, []);

  // Item Profile's More From Creator/Series/Similar rows and Search Online's
  // row click both land here for a not-yet-owned result: it opens Item
  // Profile in "preview" mode on the fetched (not persisted) details, with
  // a + Add to Library button standing in for the status chips.
  const handlePreviewItem = useCallback((details) => {
    setViewingItemId(null);
    setPreviewItem(details);
  }, []);

  // Pops navStack and restores whatever it points at. Falls through to
  // plain Library when the stack is empty, e.g. a tile clicked directly
  // from the Library grid rather than from Search/Discover/another profile.
  const handleBack = useCallback(() => {
    setNavStack(prev => {
      if (!prev.length) {
        setViewingItemId(null);
        setPreviewItem(null);
        return prev;
      }
      const entry = prev[prev.length - 1];
      setViewingItemId(null);
      setPreviewItem(null);
      if (entry.type === "search") {
        setSearchRestoreState(entry.state);
        setSearchOpen(true);
      } else if (entry.type === "discover") {
        setMainView("discover");
      } else if (entry.type === "item") {
        if (entry.viewingItemId != null) setViewingItemId(entry.viewingItemId);
        else setPreviewItem(entry.previewItem);
      }
      return prev.slice(0, -1);
    });
  }, []);

  // Jumps straight to Library regardless of how deep a click-through chain
  // (Similar To/Expansions/More From X) has gone — the counterpart to
  // handleBack's one-step-at-a-time undo.
  const handleBackToLibrary = useCallback(() => {
    setNavStack([]);
    setViewingItemId(null);
    setPreviewItem(null);
    setMainView("library");
  }, []);

  // Named (not inline) so Esc below can call the exact same close path the
  // modal's own dismiss button uses, rather than duplicating its cleanup.
  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    setSettingsInitialTab("API Keys & Accounts");
    loadWatchSettings(watchRegionTouchedRef.current);
    watchRegionTouchedRef.current = false;
    loadAutoEnrichSettings();
  }, [loadWatchSettings, watchRegionTouchedRef, loadAutoEnrichSettings]);

  // Esc closes whatever's currently on top — a modal first if one's open,
  // then Stats/History/Discovery, then Item Profile straight back to
  // Library. Each branch returns after acting so one Esc press only ever
  // closes one layer, same as a browser's Esc behavior for nested UI.
  //
  // The input/textarea focus check only guards the last branch — standard
  // modal convention is that Esc while typing in a modal's own field closes
  // the modal; it's only Item Profile's page-level inline fields (rating,
  // personal notes), with no enclosing modal, where Esc should cancel just
  // the field instead.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      // Keeps Esc inert while onboarding is up, rather than reaching past
      // it to whatever's underneath.
      if (welcomeOpen) return;

      if (modalOpen) { handleCloseAddEdit(); return; }
      if (settingsOpen) { handleCloseSettings(); return; }
      if (customTypeBuilderOpen) { setCustomTypeBuilderOpen(false); return; }
      if (importModalOpen) { setImportModalOpen(false); return; }
      if (localLibraryOpen) { setLocalLibraryOpen(false); return; }
      if (searchOpen) { setSearchOpen(false); return; }
      if (deleteTarget) { setDeleteTarget(null); return; }
      if (bulkDeletePending) { setBulkDeletePending(false); return; }

      if (mainView === "stats" || mainView === "history" || mainView === "discover") { setMainView("library"); return; }

      if (viewingItemId != null || previewItem != null) {
        if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
        handleBackToLibrary();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    welcomeOpen, modalOpen, settingsOpen, customTypeBuilderOpen, importModalOpen, localLibraryOpen, searchOpen, deleteTarget, bulkDeletePending,
    mainView, viewingItemId, previewItem,
    handleCloseAddEdit, handleCloseSettings, handleBackToLibrary,
    setDeleteTarget, setBulkDeletePending,
  ]);

  // Fires once a preview actually gets saved (the profile's + button, or
  // Favourite/Add to List, which save first) — syncs the new row into
  // `items` and hands the page off to the normal owned-item view in place.
  const handlePreviewItemSaved = useCallback((created) => {
    setItems(prev => [created, ...prev]);
    setPreviewItem(null);
    setViewingItemId(created.id);
  }, [setItems]);

  return {
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
  };
}
