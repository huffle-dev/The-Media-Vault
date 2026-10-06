// Settings -> About -> Privacy notice (text in packages/core/privacyText.js).
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import { useRouter } from "expo-router";
import Screen from "../../../Screen";
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from "@media-vault/core/privacyText.js";
import { C, F } from "../../../colors";

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2}>Privacy notice</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.meta}>The Media Vault · last updated {PRIVACY_UPDATED}</Text>
        {PRIVACY_SECTIONS.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text style={styles.heading}>{s.title}</Text>
            {s.paragraphs.map((p, i) => <Text key={i} style={styles.p}>{p}</Text>)}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  back: { color: C.muted, fontSize: 15 },
  h2: { color: C.text, fontSize: 15, fontWeight: "700" },
  body: { padding: 16, paddingBottom: 40, gap: 6 },
  meta: { color: C.muted, fontFamily: F.mono, fontSize: 11 },
  section: { marginTop: 18, gap: 8 },
  heading: { color: C.text, fontSize: 15, fontWeight: "700" },
  p: { color: C.text, fontSize: 13.5, lineHeight: 20 },
});
