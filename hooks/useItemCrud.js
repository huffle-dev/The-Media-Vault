// Core item CRUD — save (add/edit), quick field patches with undo, hide
// toggle, and delete (with its own undo).
//
// Does NOT own items/setItems/loading/error/loadItems, or modalOpen/
// editingItem/deleteTarget/deleteCoverArtToo/quickAddPrefill — those stay
// as plain state in App.jsx since several other hooks (useLists,
// useWatchSettings, useBulkSelection, useAutoUpdateOnLaunch, useMenuActions,
// useNavigation) already need them and are called before this hook exists.
// Called after useNavigation specifically because handleDeleteConfirm needs
// viewingItemId/setViewingItemId from it (a deleted item currently being
// viewed backs out to the library).
import { useCallback, useEffect, useRef } from "react";
import { STATUS_LABEL_MAP } from "../components/PosterCard.jsx";

export function useItemCrud(
  items, setItems,
  editingItem, setEditingItem, setModalOpen, setEditSavedAt, setQuickAddPrefill,
  deleteTarget, setDeleteTarget, deleteCoverArtToo, setDeleteCoverArtToo,
  viewingItemId, setViewingItemId,
  pushUndoAction,
  withAutoEnrichGate, withHltbGate, fetchMissingArt,
) {
  const handleSave = useCallback(async (formData) => {
    try {
      // install_path isn't part of items.update/items.add's column whitelist
      // — written separately via updateFields once the id is known, then
      // merged into the result by hand.
      const { install_path, ...restFormData } = formData;

      if (editingItem) {
        let updated = await window.vault.items.update(editingItem.id, restFormData);
        if (formData.media_type === "Game") {
          await window.vault.items.updateFields(updated.id, { install_path });
          updated = { ...updated, install_path };
        }
        setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
        setEditSavedAt(Date.now());
      } else {
        const dupe = await window.vault.items.findDuplicate({
          title: formData.title, media_type: formData.media_type,
          imdb_url: formData.imdb_url, platform_id: formData.platform_id, year: formData.year,
        });
        if (dupe && !confirm(`"${dupe.title}" is already in your library. Add anyway?`)) {
          return;
        }

        let created = await window.vault.items.add(restFormData);
        if (install_path) {
          await window.vault.items.updateFields(created.id, { install_path });
          created = { ...created, install_path };
        }
        setItems(prev => [created, ...prev]);
        setModalOpen(false);
        setEditingItem(null);
        setQuickAddPrefill(null);

        // Auto-fetch cover art and metadata in background after modal closes
        const gated = withAutoEnrichGate([created]);
        fetchMissingArt(gated);
        if (gated.length) window.vault.movie.enrich(gated);
        const hltbGated = withHltbGate(gated);
        if (hltbGated.length) window.vault.hltb.enrich(hltbGated);
        return;
      }
      setModalOpen(false);
      setEditingItem(null);
      setQuickAddPrefill(null);
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save item. Please try again.");
    }
  }, [editingItem, setItems, setEditingItem, setModalOpen, setEditSavedAt, setQuickAddPrefill, withAutoEnrichGate, withHltbGate, fetchMissingArt]);

  const handleEdit = useCallback((item) => {
    setEditingItem(item);
    setModalOpen(true);
  }, [setEditingItem, setModalOpen]);

  const handleAddNew = useCallback(() => {
    setEditingItem(null);
    setModalOpen(true);
  }, [setEditingItem, setModalOpen]);

  const handleDeleteRequest = useCallback((item) => {
    setDeleteTarget(item);
    setDeleteCoverArtToo(false);
  }, [setDeleteTarget, setDeleteCoverArtToo]);

  // The item is removed from view immediately, but the actual DB/cover-art
  // deletion is deferred to the undo window's commit — so Undo restores an
  // item that was never really deleted. If commit itself fails, the item is
  // put back rather than left missing.
  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const coverArtToo = deleteCoverArtToo;
    setItems(prev => prev.filter(i => i.id !== target.id));
    setDeleteTarget(null);
    // The item being viewed no longer exists — back out to the library
    // rather than leaving Profile pointed at a deleted item.
    if (viewingItemId === target.id) setViewingItemId(null);
    const restore = () => setItems(prev => prev.some(i => i.id === target.id) ? prev : [target, ...prev]);
    pushUndoAction(`"${target.title}" deleted`, {
      revert: restore,
      commit: async () => {
        try {
          await window.vault.items.delete(target.id, coverArtToo);
        } catch (err) {
          console.error("Delete failed:", err);
          restore();
        }
      },
    });
  }, [deleteTarget, deleteCoverArtToo, viewingItemId, setViewingItemId, setItems, setDeleteTarget, pushUndoAction]);

  // items.update sends the WHOLE current+patch merge, not a partial write
  // (see installPath comment above) — so two quick-saves on the same item
  // fired close together (e.g. a double-click rating nudge racing a status
  // change) could both read the same stale `current` out of the `items`
  // closure and the second write would silently clobber the first's change
  // once both resolved. itemsRef always holds the latest items, and
  // pendingWritesRef chains writes per id so each one reads `current` only
  // after the previous write for that same id has actually landed.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const pendingWritesRef = useRef(new Map());

  // Bare field patch — no undo bookkeeping. Used by handleQuickSave for the
  // actual write and by its own revert closure — going through
  // handleQuickSave for the revert would spawn a second "undo the undo" toast.
  const applyItemPatch = useCallback((id, patch) => {
    const prior = pendingWritesRef.current.get(id) || Promise.resolve();
    const next = prior.then(async () => {
      const current = itemsRef.current.find(i => i.id === id);
      if (!current) return;
      await window.vault.items.update(id, { ...current, ...patch });
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    });
    pendingWritesRef.current.set(id, next.catch(() => {}));
    return next;
  }, [setItems]);

  // Status changes (status wheel, Item Profile's status cycle, owned-flag
  // toggle) get an Undo toast — every field this patch is about to
  // overwrite is captured first, so Undo reverts exactly. Rating nudges and
  // other quick-saves that don't touch status stay un-undoable.
  const handleQuickSave = useCallback(async (id, patch) => {
    if ("status" in patch) {
      const current = items.find(i => i.id === id);
      if (current) {
        const previousValues = Object.fromEntries(Object.keys(patch).map(k => [k, current[k] ?? null]));
        pushUndoAction(`Status changed to "${STATUS_LABEL_MAP[patch.status] || patch.status}"`, {
          revert: () => applyItemPatch(id, previousValues),
          commit: null,
        });
      }
    }
    await applyItemPatch(id, patch);
  }, [items, pushUndoAction, applyItemPatch]);

  // updateFields, not handleQuickSave's items.update() — is_hidden isn't
  // part of updateItem()'s column whitelist, since AddEditModal's form has
  // no field for it and would silently reset it to 0 on every edit.
  const handleToggleHidden = useCallback(async (item) => {
    const next = item.is_hidden ? 0 : 1;
    const previous = item.is_hidden ? 1 : 0;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_hidden: next } : i));
    try { await window.vault.items.updateFields(item.id, { is_hidden: next }); } catch {}
    pushUndoAction(next ? `"${item.title}" hidden` : `"${item.title}" unhidden`, {
      revert: () => {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_hidden: previous } : i));
        window.vault.items.updateFields(item.id, { is_hidden: previous }).catch(() => {});
      },
      commit: null,
    });
  }, [pushUndoAction, setItems]);

  return {
    handleSave, handleEdit, handleAddNew,
    handleDeleteRequest, handleDeleteConfirm,
    applyItemPatch, handleQuickSave, handleToggleHidden,
  };
}
