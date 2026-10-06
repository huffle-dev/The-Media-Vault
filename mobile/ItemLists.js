// The item profile's list controls, mirroring desktop's: a Favourite toggle,
// an "Add to List" sheet (tick or untick any list, or make a new one), and
// the chips showing which lists this item is on.
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Text from "./Text";
import TextInput from "./TextInput";
import BottomSheet from "./BottomSheet";
import { fetchLists, fetchMemberships, setMembership, createList } from "./listsData";
import { useLibrary } from "./LibraryContext";
import { C } from "./colors";

export default function ItemLists({ itemSyncId, readOnly }) {
  const { refreshLists } = useLibrary();
  const [lists, setLists] = useState(null);
  const [member, setMember] = useState(() => new Set());
  const [sheet, setSheet] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      const [l, m] = await Promise.all([fetchLists(), fetchMemberships(itemSyncId)]);
      setLists(l);
      setMember(m);
    } catch { setLists([]); /* offline — the controls just stay empty */ }
  }, [itemSyncId]);

  useEffect(() => { load(); }, [load]);

  async function toggle(list) {
    if (readOnly) return;
    const next = !member.has(list.sync_id);
    setBusy(true);
    setMessage(null);
    try {
      await setMembership(list.sync_id, itemSyncId, next);
      setMember((prev) => { const s = new Set(prev); if (next) s.add(list.sync_id); else s.delete(list.sync_id); return s; });
      refreshLists();
      // Reconcile against the server afterward — a concurrent change to
      // this item's memberships (e.g. from desktop, between load() and this
      // toggle) wouldn't otherwise show up here until the screen remounts.
      // Best-effort: a failure here just leaves the optimistic patch above.
      fetchMemberships(itemSyncId).then(setMember).catch(() => {});
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    setBusy(true);
    setMessage(null);
    try {
      const created = await createList(newName, lists);
      await setMembership(created.sync_id, itemSyncId, true);
      setLists((prev) => [...prev, created].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
      setMember((prev) => new Set(prev).add(created.sync_id));
      setNewName("");
      refreshLists();
      fetchMemberships(itemSyncId).then(setMember).catch(() => {});
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!lists) return null;
  const favourites = lists.find((l) => l.is_default);
  const onLists = lists.filter((l) => member.has(l.sync_id));
  const isFav = favourites && member.has(favourites.sync_id);

  return (
    <View>
      <View style={styles.row}>
        {favourites && (
          <Pressable onPress={() => toggle(favourites)} disabled={readOnly || busy} style={[styles.btn, isFav && styles.btnOn, readOnly && { opacity: 0.5 }]}>
            <Text style={[styles.btnText, isFav && { color: C.accent }]}>{isFav ? "★ Favourited" : "☆ Add to Favourites"}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => { setMessage(null); setSheet(true); }} disabled={readOnly} style={[styles.btn, readOnly && { opacity: 0.5 }]}>
          <Text style={styles.btnText}>+ Add to List</Text>
        </Pressable>
      </View>

      {onLists.length > 0 && (
        <View style={styles.chips}>
          {onLists.map((l) => (
            <Text key={l.sync_id} style={[styles.chip, l.is_default && styles.chipFav]}>{l.is_default ? "★ " : ""}{l.name}</Text>
          ))}
        </View>
      )}

      <BottomSheet visible={sheet} title="Add to list" onClose={() => setSheet(false)}>
        {lists.map((l) => {
          const on = member.has(l.sync_id);
          return (
            <Pressable key={l.sync_id} onPress={() => toggle(l)} disabled={busy} style={styles.listRow}>
              <Text style={[styles.listName, on && { color: C.accent, fontWeight: "700" }]}>{l.is_default ? "★ " : ""}{l.name}</Text>
              <Text style={[styles.tick, on && { color: C.accent }]}>{on ? "✓" : ""}</Text>
            </Pressable>
          );
        })}
        <View style={styles.newRow}>
          <TextInput
            style={styles.input} value={newName} onChangeText={setNewName}
            placeholder="New list name" placeholderTextColor="#777" autoCapitalize="sentences"
          />
          <Pressable onPress={handleCreate} disabled={busy || !newName.trim()} style={[styles.createBtn, (busy || !newName.trim()) && { opacity: 0.4 }]}>
            <Text style={styles.createText}>Create</Text>
          </Pressable>
        </View>
        {message && <Text style={styles.error}>{message}</Text>}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  btn: { borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  btnOn: { borderColor: C.accent, backgroundColor: "#e3aa2622" },
  btnText: { color: C.textSoft, fontSize: 13, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { color: C.text, fontSize: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: "hidden" },
  chipFav: { color: C.accent, borderColor: "#e3aa2644" },
  listRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8 },
  listName: { color: C.text, fontSize: 15 },
  tick: { color: C.muted, fontSize: 16, width: 20, textAlign: "right" },
  newRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  input: { flex: 1, backgroundColor: C.bg, color: C.text, borderRadius: 8, padding: 10, fontSize: 14, borderWidth: 1, borderColor: C.border },
  createBtn: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  createText: { color: "#09090e", fontWeight: "700", fontSize: 14 },
  error: { color: C.danger, fontSize: 12 },
});
