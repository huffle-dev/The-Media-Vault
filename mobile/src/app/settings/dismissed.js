// Settings → Dismissed suggestions: everything marked "Not interested" in
// Discover (synced with desktop), each with an Undo that brings it back into
// future suggestions on both devices.
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import { useRouter } from "expo-router";
import Screen from "../../../Screen";
import { useLibrary } from "../../../LibraryContext";
import { loadDismissals, removeDismissal } from "../../../discoveryDismissals";
import { C } from "../../../colors";

export default function DismissedScreen() {
  const router = useRouter();
  const { offline } = useLibrary();
  const [list, setList] = useState(null);
  const [message, setMessage] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  useEffect(() => { loadDismissals().then(setList); }, []);

  async function undo(d) {
    const key = `${d.media_type}:${d.tmdb_id}`;
    setBusyKey(key);
    setMessage(null);
    try {
      setList(await removeDismissal(list, d.media_type, d.tmdb_id));
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2}>Dismissed suggestions</Text>
        <View style={{ width: 40 }} />
      </View>

      {offline && <Text style={styles.notice}>You're offline — Undo needs a connection.</Text>}
      {message && <Text style={styles.error}>{message}</Text>}

      {!list ? <ActivityIndicator style={{ marginTop: 40 }} /> : list.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>Nothing dismissed</Text></View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(d) => `${d.media_type}:${d.tmdb_id}`}
          renderItem={({ item: d }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{d.title || `#${d.tmdb_id}`}</Text>
                <Text style={styles.sub}>{d.media_type}</Text>
              </View>
              <Pressable
                onPress={() => undo(d)} disabled={offline || busyKey === `${d.media_type}:${d.tmdb_id}`}
                style={[styles.undoBtn, offline && { opacity: 0.4 }]}
              >
                <Text style={styles.undoText}>Undo</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  back: { color: C.muted, fontSize: 15 },
  h2: { color: C.text, fontSize: 15, fontWeight: "700" },
  notice: { color: "#e8b84b", fontSize: 12, padding: 12 },
  error: { color: C.danger, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: C.muted, fontSize: 13 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  title: { color: C.text, fontSize: 14 },
  sub: { color: C.muted, fontSize: 11, marginTop: 2 },
  undoBtn: { borderWidth: 1, borderColor: C.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  undoText: { color: C.accent, fontSize: 13, fontWeight: "600" },
});
