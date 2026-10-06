// Stats: the same cards as desktop's Stats tab, stacked vertically. Charts are
// plain Views (proportional bars) rather than SVG donuts — nothing extra to
// install, and a stacked bar reads better at phone width anyway. One type
// picker (a bottom sheet) scopes the status, rating and critic cards
// together, like desktop's shared dropdown.
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import { useRouter } from "expo-router";
import BottomSheet from "../../../BottomSheet";
import { useLibrary } from "../../../LibraryContext";
import {
  statusBreakdown, ratingHistogram, criticHistogram, mostPlayed, genreBreakdown, GENRE_TYPES,
} from "@media-vault/core/libraryStats.js";
import { TYPE_TABS, getTypeConfig } from "@media-vault/core/tokens/mediaTypes.js";
import { DEFAULT_STATUS_COLORS } from "@media-vault/core/tokens/theme.js";
import { formatAverageRating } from "@media-vault/core/tokens/ratings.js";
import { C, F } from "../../../colors";

const Card = ({ title, right, children }) => (
  <View style={styles.card}>
    <View style={styles.cardHead}>
      <Text style={styles.cardTitle}>{title}</Text>
      {right ? <Text style={styles.cardRight}>{right}</Text> : null}
    </View>
    {children}
  </View>
);

function StatusCard({ row, title, onOpen }) {
  // [label, count, colour] — the label is also the Library's status filter
  // value (QUICK_FILTERS), so tapping a row opens exactly that list.
  const segments = [
    ["Consumed", row.consumed, DEFAULT_STATUS_COLORS.seen],
    ["In Progress", row.inProgress, DEFAULT_STATUS_COLORS.progress],
    ["Not Started", row.notStarted, DEFAULT_STATUS_COLORS.notStarted],
    ["Wishlist", row.wishlist, DEFAULT_STATUS_COLORS.blue],
    ["Dropped", row.dropped, DEFAULT_STATUS_COLORS.dropped],
  ];
  return (
    <Card title={`${title} — status`} right={row.avgRating != null ? `avg rating ${formatAverageRating(row.avgRating)} of ±10` : null}>
      <View style={styles.stack}>
        {segments.filter(([, n]) => n > 0).map(([label, n, color]) => (
          <View key={label} style={{ flex: n, backgroundColor: color }} />
        ))}
      </View>
      {segments.map(([label, n, color]) => (
        <Pressable key={label} style={styles.legendRow} onPress={() => onOpen({ status: label })}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={styles.legendLabel}>{label}</Text>
          <Text style={styles.legendValue}>{n}  ›</Text>
        </Pressable>
      ))}
      <Pressable style={[styles.legendRow, styles.legendTotal]} onPress={() => onOpen({})}>
        <Text style={[styles.legendLabel, { marginLeft: 18 }]}>Total</Text>
        <Text style={styles.legendValue}>{row.total}  ›</Text>
      </Pressable>
    </Card>
  );
}

// Vertical-bar histogram. `labels` maps a bar's key to a caption shown under
// it (only a few, so 21 bars stay legible).
function Histogram({ title, bars, color, labels, right, onBar }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  const total = bars.reduce((s, b) => s + b.count, 0);
  return (
    <Card title={title} right={right ?? `${total} rated`}>
      {total === 0 ? (
        <Text style={styles.empty}>Nothing rated yet</Text>
      ) : (
        <View style={styles.histogram}>
          {bars.map((b) => (
            <Pressable key={b.key} style={styles.histCol} onPress={() => b.count > 0 && onBar(b.key)} accessibilityRole="button" accessibilityLabel={`Rating ${labels[b.key] ?? b.key}: ${b.count} item${b.count === 1 ? "" : "s"}`}>
              <View style={styles.histTrack}>
                <View style={{ height: `${(b.count / max) * 100}%`, backgroundColor: color, borderRadius: 2, minHeight: b.count ? 2 : 0 }} />
              </View>
              <Text style={styles.histLabel}>{labels[b.key] ?? ""}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}

export default function StatsTab() {
  const router = useRouter();
  const { items, error, refresh, refreshing } = useLibrary();
  const [selectedType, setSelectedType] = useState(null); // null = All
  const [sheet, setSheet] = useState(false);

  // Only types the library actually has items of.
  const typeOptions = useMemo(() => {
    if (!items) return [];
    return TYPE_TABS
      .filter((t) => t.includes?.length === 1)
      .map((t) => ({ id: t.includes[0], label: t.label, color: t.color, icon: t.icon }))
      .filter((o) => items.some((i) => i.media_type === o.id));
  }, [items]);

  const active = typeOptions.find((o) => o.id === selectedType) ?? null;
  const scoped = useMemo(
    () => (!items ? [] : active ? items.filter((i) => i.media_type === active.id) : items),
    [items, active],
  );
  const title = active ? active.label : "All";
  const color = active ? active.color : C.accent;

  const status = useMemo(() => statusBreakdown(scoped), [scoped]);
  const myBars = useMemo(() => ratingHistogram(scoped).map((b) => ({ key: b.display, count: b.count })), [scoped]);
  const criticBars = useMemo(() => criticHistogram(scoped).map((b) => ({ key: b.value, count: b.count })), [scoped]);
  const played = useMemo(() => mostPlayed(items || []), [items]);

  // Opens the Library filtered to what was tapped, scoped to the current
  // type. `n` changes every time so re-tapping the same thing still applies.
  const openLibrary = (filters) => router.navigate({
    pathname: "/",
    params: { type: active ? active.label : "All", n: String(Date.now()), ...filters },
  });
  const genres = useMemo(() => genreBreakdown(items || []), [items]);

  if (!items) {
    return error
      ? <Text style={styles.error}>{error}</Text>
      : <ActivityIndicator style={{ marginTop: 48 }} />;
  }
  if (items.length === 0) {
    return <View style={styles.emptyWrap}><Text style={styles.empty}>No items in library</Text></View>;
  }

  const genreMax = genres[0]?.total || 1;
  const genreTypes = GENRE_TYPES.filter((t) => genres.some((g) => g.segments.some((s) => s.type === t)));

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Text style={styles.h1}>Stats</Text>
        <Pressable style={styles.filterBtn} onPress={() => setSheet(true)}>
          <Text style={styles.filterText}>Type: {title} ▾</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <StatusCard row={status} title={title} onOpen={openLibrary} />

        <Histogram
          title={`${title} — your ratings`} bars={myBars} color={color}
          labels={{ [-10]: "-10", 0: "0", 10: "+10" }}
          onBar={(rating) => openLibrary({ rating: String(rating) })}
        />
        <Histogram
          title={`${title} — critic ratings`} bars={criticBars} color={color}
          labels={{ 0: "0", 5: "5", 10: "10" }}
          onBar={(critic) => openLibrary({ critic: String(critic) })}
          right={`${criticBars.reduce((s, b) => s + b.count, 0)} scored`}
        />

        {played.ranked.length > 0 && (
          <Card title="Most played" right={`${played.totalHours.toLocaleString()}h total`}>
            {played.ranked.map((g, i) => (
              <Pressable key={g.sync_id} onPress={() => router.push(`/item/${g.sync_id}`)} style={styles.playedRow}>
                <View style={styles.playedTop}>
                  <Text style={styles.playedTitle} numberOfLines={1}>{i + 1}  {g.title}</Text>
                  <Text style={styles.playedHours}>{g.runtime}h</Text>
                </View>
                <View style={styles.playedTrack}>
                  <View style={{ width: `${(g.runtime / played.ranked[0].runtime) * 100}%`, height: "100%", backgroundColor: getTypeConfig("Game").color, borderRadius: 2 }} />
                </View>
              </Pressable>
            ))}
          </Card>
        )}

        {genres.length > 0 && (
          <Card title="Top genres">
            <View style={styles.keyRow}>
              {genreTypes.map((t) => (
                <View key={t} style={styles.keyItem}>
                  <View style={[styles.dot, { backgroundColor: getTypeConfig(t).color }]} />
                  <Text style={styles.keyText}>{t}</Text>
                </View>
              ))}
            </View>
            {genres.map((g) => (
              <Pressable key={g.genre} style={styles.genreRow} onPress={() => router.navigate({ pathname: "/", params: { type: "All", n: String(Date.now()), genre: g.genre } })}>
                <Text style={styles.genreLabel} numberOfLines={1}>{g.genre}</Text>
                <View style={styles.genreBar}>
                  {g.segments.map((s) => (
                    <View key={s.type} style={{ width: `${(s.count / genreMax) * 100}%`, height: "100%", backgroundColor: s.color, borderRadius: 3 }} />
                  ))}
                </View>
                <Text style={styles.genreTotal}>{g.total}</Text>
              </Pressable>
            ))}
          </Card>
        )}
      </ScrollView>

      <BottomSheet visible={sheet} title="Show stats for" onClose={() => setSheet(false)}>
        <View style={styles.typeGrid}>
          {[{ id: null, label: "All", icon: "🗂️" }, ...typeOptions].map((o) => {
            const on = (selectedType ?? null) === o.id;
            return (
              <Pressable
                key={o.id ?? "all"} style={[styles.typeCell, on && styles.typeCellOn]}
                onPress={() => { setSelectedType(o.id); setSheet(false); }}
              >
                <Text style={styles.typeIcon}>{o.icon || "🗂️"}</Text>
                <Text style={[styles.typeLabel, on && { color: C.accent, fontWeight: "700" }]} numberOfLines={1}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  h1: { fontFamily: F.serif, color: C.text, fontSize: 22, fontWeight: "700" },
  filterBtn: { backgroundColor: C.surface, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border },
  filterText: { color: C.textSoft, fontSize: 13 },
  body: { padding: 16, paddingBottom: 32, gap: 14 },
  error: { color: C.danger, padding: 16 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: C.muted, fontSize: 13 },

  card: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 14 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 },
  cardTitle: { fontFamily: F.mono, color: C.muted, fontSize: 10, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", flexShrink: 1 },
  cardRight: { color: C.muted, fontSize: 11 },

  stack: { flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", backgroundColor: C.border, marginBottom: 12, gap: 1 },
  legendRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  legendTotal: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  legendLabel: { flex: 1, color: C.textSoft, fontSize: 13 },
  legendValue: { color: C.text, fontSize: 13, fontWeight: "600" },

  histogram: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 110 },
  histCol: { flex: 1, height: "100%", alignItems: "center" },
  histTrack: { flex: 1, width: "100%", justifyContent: "flex-end" },
  histLabel: { color: C.muted, fontSize: 9, height: 12, marginTop: 4 },

  playedRow: { marginBottom: 12 },
  playedTop: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  playedTitle: { flex: 1, color: C.text, fontSize: 13 },
  playedHours: { color: C.muted, fontSize: 12 },
  playedTrack: { height: 4, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" },

  keyRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 12 },
  keyItem: { flexDirection: "row", alignItems: "center" },
  keyText: { color: C.muted, fontSize: 10 },
  genreRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  genreLabel: { width: 86, color: C.text, fontSize: 12, textAlign: "right" },
  genreBar: { flex: 1, flexDirection: "row", height: 14, gap: 1 },
  genreTotal: { width: 26, color: C.muted, fontSize: 11, textAlign: "right" },

  typeGrid: { flexDirection: "row", flexWrap: "wrap" },
  typeCell: { width: "33.33%", alignItems: "center", paddingVertical: 12, borderRadius: 10 },
  typeCellOn: { backgroundColor: "#e3aa2622" },
  typeIcon: { fontSize: 24 },
  typeLabel: { color: C.textSoft, fontSize: 12, marginTop: 4 },
});
