// History: every completed item, newest first, grouped by month — a
// browsable timeline rather than a chart (same idea as desktop's History
// tab, with the wide 9-column table collapsed into one two-line row).
import { useMemo } from "react";
import { ActivityIndicator, Image, Pressable, SectionList, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import { useRouter } from "expo-router";
import { useLibrary } from "../../../LibraryContext";
import { useApiKeys } from "../../../useApiKeys";
import { useCoverArt } from "../../../Tile";
import { groupCompletedHistory } from "@media-vault/core/libraryStats.js";
import { getEffectiveTypeConfig } from "@media-vault/core/tokens/mediaTypes.js";
import { formatRating, ratingColor } from "@media-vault/core/tokens/ratings.js";
import { C, F } from "../../../colors";

function HistoryRow({ item, keys, onPress }) {
  const artUri = useCoverArt(item, keys);
  const { customTypes } = useLibrary();
  const cfg = getEffectiveTypeConfig(item, customTypes);
  const day = item.date_consumed ? item.date_consumed.slice(8, 10) : null;
  const genre = (item.genre || "").split(",")[0].trim();
  const sub = [item.creator, genre, item.media_type === "Game" && item.runtime ? `${item.runtime}h played` : null]
    .filter(Boolean).join(" · ");

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.day}>{day ?? "—"}</Text>
      <View style={styles.thumb}>
        {artUri
          ? <Image source={{ uri: artUri }} style={styles.thumbImage} resizeMode="cover" />
          : <Text style={styles.thumbIcon}>{cfg.icon}</Text>}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        {sub ? <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {item.rating ? (
        <Text style={[styles.rating, { color: ratingColor(item.rating) }]}>★ {formatRating(item.rating)}</Text>
      ) : null}
    </Pressable>
  );
}

export default function HistoryTab() {
  const router = useRouter();
  const { items, error, refresh, refreshing } = useLibrary();
  const { keys } = useApiKeys();
  const sections = useMemo(() => (items ? groupCompletedHistory(items) : []), [items]);

  if (!items) {
    return error
      ? <Text style={styles.error}>{error}</Text>
      : <ActivityIndicator style={{ marginTop: 48 }} />;
  }

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Text style={styles.h1}>History</Text>
        <Text style={styles.count}>{sections.reduce((n, s) => n + s.data.length, 0)} consumed</Text>
      </View>
      {sections.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>Nothing consumed yet</Text></View>
      ) : (
        <SectionList
          refreshing={refreshing}
          onRefresh={refresh}
          sections={sections}
          keyExtractor={(i) => i.sync_id}
          stickySectionHeadersEnabled
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <HistoryRow item={item} keys={keys} onPress={() => router.push(`/item/${item.sync_id}`)} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  h1: { fontFamily: F.serif, color: C.text, fontSize: 22, fontWeight: "700" },
  count: { color: C.muted, fontSize: 12 },
  error: { color: C.danger, padding: 16 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: C.muted, fontSize: 13 },
  list: { paddingBottom: 24 },
  sectionHeader: {
    flexDirection: "row", justifyContent: "space-between", backgroundColor: C.bg,
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  sectionTitle: { fontFamily: F.mono, color: C.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  sectionCount: { color: C.muted, fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  day: { width: 22, color: C.muted, fontSize: 12, textAlign: "center" },
  thumb: { width: 40, height: 40, borderRadius: 6, backgroundColor: C.surface, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  thumbImage: { width: "100%", height: "100%" },
  thumbIcon: { fontSize: 16, opacity: 0.5 },
  rowText: { flex: 1 },
  rowTitle: { color: C.text, fontSize: 14 },
  rowSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  rating: { fontSize: 12, fontWeight: "700" },
});
