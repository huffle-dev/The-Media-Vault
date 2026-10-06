// Settings -> Custom media types: the types made for things the built-ins don't cover
// (vinyl, wine, coins...). Tap one to change it, or make a new one. Desktop gets the
// same types through sync.
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import { useRouter } from "expo-router";
import Screen from "../../../Screen";
import AppButton from "../../../AppButton";
import { useLibrary } from "../../../LibraryContext";
import { C, F } from "../../../colors";

export default function CustomTypesScreen() {
  const router = useRouter();
  const { customTypes, items, offline } = useLibrary();
  const count = (id) => (items || []).filter((i) => i.custom_type_sync_id === id).length;
  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2}>Custom media types</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sub}>Make your own kind of thing to track, with the extra fields you want. They show up in the Library's Type picker and under + Add, here and on desktop.</Text>
        {customTypes.length === 0 && <Text style={styles.sub}>None yet.</Text>}
        {customTypes.map((t) => (
          <Pressable key={t.id} style={styles.row} onPress={() => router.push({ pathname: "/settings/custom-type", params: { id: t.id } })} accessibilityRole="button" accessibilityLabel={`Edit ${t.label}`}>
            <Text style={styles.icon}>{t.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: t.color }]}>{t.label}</Text>
              <Text style={styles.meta}>{count(t.id)} item{count(t.id) === 1 ? "" : "s"} · {t.fields.length} field{t.fields.length === 1 ? "" : "s"}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
        <AppButton title="New custom type" variant="primary" disabled={offline} onPress={() => router.push({ pathname: "/settings/custom-type", params: { id: "new" } })} style={{ marginTop: 8, alignSelf: "flex-start" }} />
        {offline && <Text style={styles.sub}>You're offline — changing types needs a connection.</Text>}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  back: { color: C.muted, fontSize: 15 },
  h2: { color: C.text, fontSize: 15, fontWeight: "700" },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  sub: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12 },
  icon: { fontSize: 26 },
  name: { fontSize: 15, fontWeight: "700" },
  meta: { color: C.muted, fontFamily: F.mono, fontSize: 10.5, marginTop: 2 },
  chevron: { color: C.muted, fontSize: 20 },
});
