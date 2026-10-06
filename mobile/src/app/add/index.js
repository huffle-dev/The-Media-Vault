// Step one of adding an item: pick what kind. A grid rather than a row of
// pills, so every type is visible at once with nothing to scroll sideways.
import { Pressable, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import { useRouter } from "expo-router";
import Screen from "../../../Screen";
import { ADD_TYPES } from "../../../AddItemScreen";
import { getTypeConfig } from "@media-vault/core/tokens/mediaTypes.js";
import { C, F } from "../../../colors";
import { useLibrary } from "../../../LibraryContext";

// Website has no search: it asks for the page's address first (and offers the form if the page can't be read).
const MANUAL_ONLY_TYPES = ["Website"];

export default function AddTypePicker() {
  const router = useRouter();
  const { customTypes } = useLibrary();
  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2}>What are you adding?</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.grid}>
        {ADD_TYPES.map((t) => {
          const cfg = getTypeConfig(t.key);
          return (
            <Pressable key={t.key} style={styles.cell} onPress={() => router.push(`/add/${encodeURIComponent(t.key)}`)}>
              <Text style={styles.icon}>{cfg.icon}</Text>
              <Text style={[styles.label, { color: cfg.color }]}>{t.label}</Text>
            </Pressable>
          );
        })}
        {MANUAL_ONLY_TYPES.map((key) => {
          const cfg = getTypeConfig(key);
          return (
            <Pressable key={key} style={styles.cell} onPress={() => router.push(key === "Website" ? "/add/website" : `/add/manual/${encodeURIComponent(key)}`)}>
              <Text style={styles.icon}>{cfg.icon}</Text>
              <Text style={[styles.label, { color: cfg.color }]} numberOfLines={1}>{cfg.label}</Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.cell} onPress={() => router.push("/add/photo")} accessibilityRole="button" accessibilityLabel="Scan a photo of a shelf">
          <Text style={styles.icon}>📷</Text>
          <Text style={[styles.label, { color: C.accent }]} numberOfLines={1}>Scan photo</Text>
        </Pressable>
        {/* Types made on desktop: no online search, so they go straight to the form. */}
        {customTypes.map((t) => (
          <Pressable key={t.id} style={styles.cell} onPress={() => router.push(`/add/manual/${encodeURIComponent(`custom:${t.id}`)}`)}>
            <Text style={styles.icon}>{t.icon}</Text>
            <Text style={[styles.label, { color: t.color }]} numberOfLines={1}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
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
  grid: { flexDirection: "row", flexWrap: "wrap", padding: 12 },
  cell: { width: "33.33%", padding: 6 },
  icon: {
    fontSize: 30, textAlign: "center", paddingVertical: 18,
    backgroundColor: C.surface, borderRadius: 12, overflow: "hidden",
  },
  label: { fontFamily: F.mono, textAlign: "center", fontSize: 12, fontWeight: "600", marginTop: 6 },
});
