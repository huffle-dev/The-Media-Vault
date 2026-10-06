// Multi-select toolbar — selection state, the bulk status/owned/hidden/
// export/add-to-list actions, and bulk delete (with its own undo, same
// delayed-commit pattern as the single-item delete).
//
// Cross-cutting: reads/writes item-CRUD state (items/setItems, loadItems),
// lists state (setItemListIds, loadLists), and the undo mechanism
// (pushUndoAction) — all passed in explicitly rather than reached into
// silently. filteredItems is needed only for "Select all".
import { useState, useRef, useCallback } from "react";
import { buildStatusChangePatch, buildOwnedChangePatch } from "../tokens.js";

export function useBulkSelection(items, setItems, filteredItems, loadItems, loadLists, setItemListIds, pushUndoAction) {
  const [selectedIds, setSelectedIds]         = useState(new Set());
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [bulkDeleteCoverArtToo, setBulkDeleteCoverArtToo] = useState(false);

  // Anchor-rect-captured-at-click-time, same as the tile/list status wheels
  // (the wheel's options sit outside the trigger's own bounds).
  const bulkStatusBtnRef = useRef(null);
  const [bulkStatusWheelRect, setBulkStatusWheelRect] = useState(null);

  // Brief "✓ Done" flash on the completed action — bulk status/owned-flag
  // changes don't open a dialog the way Export/Delete do.
  const [bulkFeedback, setBulkFeedback] = useState(null); // "status" | "owned" | "notOwned" | null
  const bulkFeedbackTimer = useRef(null);
  const flashBulkFeedback = (key) => {
    setBulkFeedback(key);
    clearTimeout(bulkFeedbackTimer.current);
    bulkFeedbackTimer.current = setTimeout(() => setBulkFeedback(null), 1400);
  };

  const handleToggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(filteredItems.map(i => i.id)));
  }, [filteredItems]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Same delayed-commit undo pattern as the single-item delete — targets
  // are captured before the optimistic removal so Undo can restore them
  // all, with the real `deleteMany` call running at the window's end.
  const handleBulkDeleteConfirm = useCallback(() => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const coverArtToo = bulkDeleteCoverArtToo;
    const targets = items.filter(i => selectedIds.has(i.id));
    setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
    setSelectedIds(new Set());
    setBulkDeletePending(false);
    const restore = () => setItems(prev => {
      const existingIds = new Set(prev.map(i => i.id));
      const toRestore = targets.filter(t => !existingIds.has(t.id));
      return toRestore.length ? [...toRestore, ...prev] : prev;
    });
    pushUndoAction(`${targets.length} item${targets.length === 1 ? "" : "s"} deleted`, {
      revert: restore,
      commit: async () => {
        try {
          await window.vault.items.deleteMany(ids, coverArtToo);
        } catch (err) {
          console.error("Bulk delete failed:", err);
          restore();
        }
      },
    });
  }, [selectedIds, bulkDeleteCoverArtToo, items, setItems, pushUndoAction]);

  const handleAddSelectedToList = useCallback(async (listId) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    await window.vault.lists.addItems(listId, ids);
    setItemListIds(prev => {
      const next = { ...prev };
      ids.forEach(id => {
        const cur = new Set(next[id] || []);
        cur.add(listId);
        next[id] = [...cur];
      });
      return next;
    });
    loadLists();
  }, [selectedIds, setItemListIds, loadLists]);

  // Bulk status/owned-flag — updateFields, narrow field-only writes.
  // Parallel, not sequential — pure local SQLite writes, no rate limit.
  // Undoable like handleBulkSetHidden below — each item's prior values for
  // every field buildStatusChangePatch can touch (status, rating,
  // date_consumed) are captured first, so Undo restores exactly those
  // rather than guessing at a blanket reverse status.
  const handleBulkSetStatus = useCallback(async (status) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const previous = new Map(
      items.filter(i => selectedIds.has(i.id))
        .map(i => [i.id, { status: i.status, rating: i.rating, date_consumed: i.date_consumed }])
    );
    await Promise.all(ids.map(id => {
      const item = items.find(i => i.id === id);
      if (!item) return null;
      return window.vault.items.updateFields(id, buildStatusChangePatch(item, status));
    }));
    loadItems({ silent: true });
    flashBulkFeedback("status");
    pushUndoAction(`${ids.length} item${ids.length === 1 ? "" : "s"} set to ${status}`, {
      revert: async () => {
        await Promise.all([...previous].map(([id, patch]) => window.vault.items.updateFields(id, patch).catch(() => {})));
        loadItems({ silent: true });
      },
      commit: null,
    });
  }, [selectedIds, items, loadItems, pushUndoAction]);

  const handleBulkSetOwned = useCallback(async (isLocal) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    // Wishlist/Not Started auto-flip is applied per-item since it depends on
    // each item's own current status.
    await Promise.all(ids.map(id => {
      const item = items.find(i => i.id === id);
      return window.vault.items.updateFields(id, item ? buildOwnedChangePatch(item, isLocal) : { is_local: isLocal ? 1 : 0 });
    }));
    loadItems({ silent: true });
    flashBulkFeedback(isLocal ? "owned" : "notOwned");
  }, [selectedIds, items, loadItems]);

  const handleBulkSetHidden = useCallback(async (hidden) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    // Each item's prior value, captured before the write — Undo restores
    // exactly that, not a blanket flip (the selection can mix hidden/visible).
    const previous = new Map(items.filter(i => selectedIds.has(i.id)).map(i => [i.id, i.is_hidden ? 1 : 0]));
    await Promise.all(ids.map(id => window.vault.items.updateFields(id, { is_hidden: hidden ? 1 : 0 })));
    loadItems({ silent: true });
    flashBulkFeedback(hidden ? "hidden" : "unhidden");
    pushUndoAction(`${ids.length} item${ids.length === 1 ? "" : "s"} ${hidden ? "hidden" : "unhidden"}`, {
      revert: async () => {
        await Promise.all([...previous].map(([id, value]) => window.vault.items.updateFields(id, { is_hidden: value }).catch(() => {})));
        loadItems({ silent: true });
      },
      commit: null,
    });
  }, [selectedIds, items, loadItems, pushUndoAction]);

  const handleExportSelected = useCallback(async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    await window.vault.export.selected(ids);
  }, [selectedIds]);

  return {
    selectedIds, setSelectedIds,
    bulkDeletePending, setBulkDeletePending,
    bulkDeleteCoverArtToo, setBulkDeleteCoverArtToo,
    bulkStatusBtnRef, bulkStatusWheelRect, setBulkStatusWheelRect,
    bulkFeedback,
    handleToggleSelect, handleSelectAll, handleDeselectAll,
    handleBulkDeleteConfirm, handleAddSelectedToList,
    handleBulkSetStatus, handleBulkSetOwned, handleBulkSetHidden,
    handleExportSelected,
  };
}
