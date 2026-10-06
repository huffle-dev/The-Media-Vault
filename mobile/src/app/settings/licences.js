// Settings -> About -> Open-source licences: every package that ships in the app, with
// its licence; tap one to read the licence text. Generated into mobile/licenses.json by
// scripts/build-mobile-licenses.js.
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import { useRouter } from "expo-router";
import Screen from "../../../Screen";
import data from "../../../licenses.json";
import { C, F } from "../../../colors";

export default function LicencesScreen() {
  const router = useRouter();
  const [open, setOpen] = useState(null);
  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2}>Open-source licences</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        data={data.packages}
        keyExtractor={(p) => `${p.name}@${p.version}`}
        ListHeaderComponent={<Text style={styles.intro}>The Media Vault includes these {data.packages.length} open-source packages, each used under its own licence. Tap one to read the licence.</Text>}
        renderItem={({ item }) => {
          const key = `${item.name}@${item.version}`;
          const isOpen = open === key;
          return (
            <Pressable style={styles.row} onPress={() => setOpen(isOpen ? null : key)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
              <Text style={styles.name}>{item.name} <Text style={styles.ver}>{item.version}</Text></Text>
              <Text style={styles.lic}>{item.license}</Text>
              {isOpen && <Text style={styles.text}>{item.text != null ? data.texts[item.text] : `No licence file came with this package; it is declared as ${item.license}.`}</Text>}
            </Pressable>
          );
        }}
        initialNumToRender={20}
        windowSize={7}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  back: { color: C.muted, fontSize: 15 },
  h2: { color: C.text, fontSize: 15, fontWeight: "700" },
  intro: { color: C.muted, fontSize: 12.5, lineHeight: 18, padding: 16 },
  row: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  name: { color: C.text, fontSize: 13.5 },
  ver: { color: C.muted, fontSize: 11 },
  lic: { color: C.accent, fontFamily: F.mono, fontSize: 10.5, marginTop: 2 },
  text: { color: C.muted, fontFamily: F.mono, fontSize: 10.5, lineHeight: 15, marginTop: 8 },
});
