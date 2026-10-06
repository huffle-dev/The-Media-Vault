// The review list shared by the Steam and GOG imports: tick the games to add, then add them.
// Owned games are also marked owned on this phone.
import { Pressable, StyleSheet, View } from "react-native";
import Text from "./Text";
import AppButton from "./AppButton";
import { supabase } from "./supabase";
import { addItemToLibrary } from "./addToLibrary";
import { ensureDevice, writeOwned } from "./ownership";
import { quickRowFor } from "./libraryImport";
import { C } from "./colors";

export function ReviewList({ rows, setRows, onAdd, adding, error }) {
  const chosen = rows.filter((r) => r.selected);
  const setAll = (selected) => setRows((rs) => rs.map((r) => ({ ...r, selected })));
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.rowLine}>
        <Text style={styles.p}>{rows.length} found · {rows.filter((r) => r.duplicate).length} already in your library</Text>
        <Pressable onPress={() => setAll(true)} accessibilityRole="button"><Text style={styles.link}>All</Text></Pressable>
        <Pressable onPress={() => setAll(false)} accessibilityRole="button"><Text style={styles.link}>None</Text></Pressable>
      </View>
      {rows.map((r) => (
        <Pressable key={r.id} style={styles.item} onPress={() => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, selected: !x.selected } : x)))} accessibilityRole="checkbox" accessibilityState={{ checked: r.selected }} accessibilityLabel={r.title}>
          <View style={[styles.box, r.selected && styles.boxOn]}>{r.selected && <Text style={styles.tick}>✓</Text>}</View>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle} numberOfLines={2}>{r.title}</Text>
            <Text style={styles.meta}>{r.owned ? "Owned" : "Wishlist"}{r.runtime ? ` · ${r.runtime} h played` : ""}{r.duplicate ? " · already in your library" : ""}</Text>
          </View>
        </Pressable>
      ))}
      {error && <Text style={styles.error}>{error}</Text>}
      <AppButton title={adding ? "Adding…" : `Add ${chosen.length} game${chosen.length === 1 ? "" : "s"}`} variant="primary" disabled={adding || chosen.length === 0} onPress={onAdd} />
    </View>
  );
}

// Adds the chosen rows (owned ones also marked owned on this phone). Shared with the GOG section.
export async function addReviewedGames({ rows, deviceId }) {
  const chosen = rows.filter((r) => r.selected);
  const ownedIds = [];
  for (const r of chosen) {
    const id = await addItemToLibrary({ mediaType: "Game", title: r.title, platformId: r.platform_id, details: null, quickRow: quickRowFor(r) });
    if (r.owned && id) ownedIds.push(id);
  }
  if (ownedIds.length) { await ensureDevice(supabase, deviceId); await writeOwned(supabase, { deviceId, ids: ownedIds, owned: true }); }
  return chosen.length;
}


const styles = StyleSheet.create({
  p: { color: C.muted, fontSize: 12.5, lineHeight: 18, flex: 1 },
  error: { color: C.danger },
  link: { color: C.accent, fontSize: 13, marginLeft: 12 },
  rowLine: { flexDirection: "row", alignItems: "center" },
  item: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10 },
  box: { width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: C.muted, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: C.accent, borderColor: C.accent },
  tick: { color: "#09090e", fontWeight: "800" },
  itemTitle: { color: C.text, fontSize: 14 },
  meta: { color: C.muted, fontSize: 11.5, marginTop: 2 },
});
