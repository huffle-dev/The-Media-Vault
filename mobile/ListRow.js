// One row of the Library's list view (the alternative to the tile grid): a small
// cover, the title, one line of detail, and the status dot and rating on the
// right. Selecting works the same as on a tile: long-press, then tap.
import { Pressable, StyleSheet, View, Image } from "react-native";
import Text from "./Text";
import { useCoverArt } from "./Tile";
import { reportCoverError } from "./coverHealing";
import { getEffectiveTypeConfig } from "@media-vault/core/tokens/mediaTypes.js";
import { useLibrary } from "./LibraryContext";
import { formatRating, ratingColor } from "@media-vault/core/tokens/ratings.js";
import { isSquareArt, isWideArt } from "@media-vault/core/tokens/itemHelpers.js";
import { statusLabel } from "./format";
import { C, statusColor } from "./colors";
import { describeItem, selectHint } from "./a11y";

export const LIST_ROW_HEIGHT = 64;

const detailLine = (item) =>
  [item.creator, item.year, item.genre && String(item.genre).split(",")[0].trim()].filter(Boolean).join(" · ");

export default function ListRow({ item, keys, onPress, onLongPress, selectMode = false, selected = false, onStatusPress }) {
  const artUri = useCoverArt(item, keys);
  const { customTypes } = useLibrary();
  const type = getEffectiveTypeConfig(item, customTypes);
  const wide = isWideArt(item);
  const square = wide || isSquareArt(item.media_type);
  // Cover box: 2:3 for posters, square for album/podcast/audiobook-style art.
  const box = square ? { width: 44, height: 44 } : { width: 40, height: 56 };
  return (
    <Pressable
      onPress={onPress} onLongPress={onLongPress} delayLongPress={350}
      style={[styles.row, selected && styles.rowSelected]}
      accessibilityRole="button" accessibilityLabel={describeItem(item)} accessibilityHint={selectHint(selectMode, selected)}
      accessibilityState={{ selected }}
    >
      {selectMode && (
        <View style={[styles.ring, selected && styles.ringOn]}>{selected && <Text style={styles.tick}>✓</Text>}</View>
      )}
      <View style={[styles.cover, box]}>
        {artUri
          ? <Image source={{ uri: artUri }} resizeMode="cover" style={{ width: "100%", height: "100%" }} onError={() => reportCoverError(item)} />
          : <Text style={{ fontSize: 18, opacity: 0.5 }}>{type.icon}</Text>}
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.detail} numberOfLines={1}>{detailLine(item) || type.label}</Text>
      </View>
      <View style={styles.right}>
        <Pressable
          onPress={onStatusPress && !selectMode ? onStatusPress : undefined} disabled={!onStatusPress || selectMode}
          hitSlop={10} accessibilityRole="button" accessibilityLabel={`Change status of ${item.title}, now ${item.status}`} style={styles.statusRow}
        >
          <View style={[styles.dot, { backgroundColor: statusColor(item.status) }]} />
          <Text style={styles.status} numberOfLines={1}>{statusLabel(item.status)}</Text>
        </Pressable>
        {item.rating != null && <Text style={[styles.rating, { color: ratingColor(item.rating) }]}>{formatRating(item.rating)}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { height: LIST_ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  rowSelected: { backgroundColor: "#e3aa2622" },
  cover: { borderRadius: 3, backgroundColor: C.surface, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0 },
  title: { color: C.text, fontSize: 14 },
  detail: { color: C.muted, fontSize: 12, marginTop: 2 },
  right: { alignItems: "flex-end", gap: 3, maxWidth: 110 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { color: C.textSoft, fontSize: 11 },
  rating: { fontSize: 12, fontWeight: "600" },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center" },
  ringOn: { backgroundColor: C.accent, borderColor: C.accent },
  tick: { color: "#09090e", fontSize: 13, fontWeight: "800", lineHeight: 15 },
});
