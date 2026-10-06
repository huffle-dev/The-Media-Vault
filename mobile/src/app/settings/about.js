// Settings -> About & credits: the version, who supplies the data (with the wording
// each provider asks for, and TMDB's logo with its statement), and links to the
// open-source licences, the privacy notice, the welcome screen, and the pre-filled
// error-report and feature-request pages.
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import Screen from "../../../Screen";
import AppButton from "../../../AppButton";
import TmdbLogo from "../../../TmdbLogo";
import { showWelcome } from "../../../welcome";
import { CREDITS } from "@media-vault/core/credits.js";
import { issueUrl } from "@media-vault/core/links.js";
import { C, F } from "../../../colors";

export default function AboutScreen() {
  const router = useRouter();
  const version = Constants.expoConfig?.version || "1.0.0";
  const device = `${Platform.OS} ${Platform.Version}`;
  const open = (url) => Linking.openURL(url);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2}>About & credits</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>The Media Vault</Text>
        <Text style={styles.sub}>Version {version}{Constants.expoConfig?.android?.versionCode ? ` (build ${Constants.expoConfig.android.versionCode})` : ""}</Text>
        <Text style={styles.p}>
          Your library lives on this phone's saved copy and in the Supabase project you set up yourself. Nothing is sent to anyone else.
        </Text>

        <View style={styles.buttons}>
          <AppButton title="Open-source licences" variant="action" onPress={() => router.push("/settings/licences")} />
          <AppButton title="Privacy notice" variant="action" onPress={() => router.push("/settings/privacy")} />
          <AppButton title="Show the welcome screen" variant="action" onPress={() => { showWelcome(); router.back(); }} />
          <AppButton title="Send an error report" variant="action" onPress={() => open(issueUrl("bug", { version, platform: device }))} />
          <AppButton title="Request a feature" variant="action" onPress={() => open(issueUrl("enhancement", { version, platform: device }))} />
        </View>

        <Text style={styles.label}>Where the information comes from</Text>
        {CREDITS.map((c) => (
          <View key={c.name} style={styles.credit}>
            {c.name === "TMDB" && <TmdbLogo height={14} onPress={() => open(c.url)} />}
            <Pressable onPress={() => open(c.url)} accessibilityRole="link"><Text style={styles.creditName}>{c.name}</Text></Pressable>
            <Text style={styles.creditText}>{c.text}</Text>
            {(c.links || []).map((l) => (
              <Pressable key={l.url} onPress={() => open(l.url)} accessibilityRole="link"><Text style={styles.link}>{l.label}</Text></Pressable>
            ))}
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
  title: { fontFamily: F.serif, color: C.text, fontSize: 24 },
  sub: { color: C.muted, fontFamily: F.mono, fontSize: 11 },
  p: { color: C.text, fontSize: 13, lineHeight: 19, marginTop: 8 },
  buttons: { gap: 8, marginTop: 14, alignItems: "flex-start" },
  label: { fontFamily: F.mono, color: C.accent, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 22, marginBottom: 6 },
  credit: { marginBottom: 14, gap: 3 },
  creditName: { color: C.text, fontSize: 14, fontWeight: "600", textDecorationLine: "underline" },
  creditText: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  link: { color: C.accent, fontSize: 12.5, textDecorationLine: "underline" },
});
