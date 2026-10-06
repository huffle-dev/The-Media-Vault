// User-created lists (create/delete, add a single item, favourites-list
// lookup) and the underlying `lists` array itself.
//
// Does NOT own `itemListIds`/`itemsWithLists` — those combine with `items`
// (item-CRUD state) to derive per-item list membership, so they stay in
// App.jsx. Takes `setItemListIds` since creating/deleting a list still
// needs to patch that map; same for `listFilter`/`setListFilter` since
// deleting the list currently being filtered on needs to reset that filter.
import { useState, useCallback } from "react";

export function useLists(setItemListIds, listFilter, setListFilter) {
  const [lists, setLists] = useState([]);

  const loadLists = useCallback(() => {
    window.vault.lists.getAll().then(setLists);
  }, []);

  const favouritesListId = lists.find(l => l.is_default)?.id ?? null;

  const handleCreateList = useCallback(async (name) => {
    const list = await window.vault.lists.create(name);
    loadLists();
    return list;
  }, [loadLists]);

  // Single-item counterpart to handleAddSelectedToList (useBulkSelection),
  // for Item Profile's own "Add to list" action rather than the bulk bar.
  const handleAddItemToList = useCallback(async (itemId, listId) => {
    await window.vault.lists.addItems(listId, [itemId]);
    setItemListIds(prev => {
      const cur = new Set(prev[itemId] || []);
      cur.add(listId);
      return { ...prev, [itemId]: [...cur] };
    });
    loadLists();
  }, [setItemListIds, loadLists]);

  const handleDeleteList = useCallback(async (listId) => {
    const res = await window.vault.lists.delete(listId);
    if (!res.success) { alert(res.error || "Failed to delete list."); return; }
    setItemListIds(prev => {
      const next = {};
      for (const [id, ids] of Object.entries(prev)) next[id] = ids.filter(i => i !== listId);
      return next;
    });
    if (listFilter === listId) setListFilter("");
    loadLists();
  }, [listFilter, setListFilter, setItemListIds, loadLists]);

  return {
    lists, loadLists, favouritesListId,
    handleCreateList, handleAddItemToList, handleDeleteList,
  };
}
