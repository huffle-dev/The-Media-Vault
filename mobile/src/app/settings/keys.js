// Settings → API keys & sync: the phone side of desktop's Settings → Cloud
// Sync → Encrypted Key Sync and its API-key cards. Unlock the vault once and
// every key you've set on desktop arrives; the few single-string keys can
// also be pasted directly on this phone.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import AppButton from "../../../AppButton";
import Text from "../../../Text";
import TextInput from "../../../TextInput";
import { useRouter } from "expo-router";
import Screen from "../../../Screen";
import UnlockVaultForm from "../../../UnlockVaultForm";
import { useApiKeys } from "../../../useApiKeys";
import { getCachedMasterKey } from "../../../secretsSync";
import { C, F } from "../../../colors";

const Badge = ({ source }) => {
  const text = source === "synced" ? "Synced" : source === "manual" ? "This phone" : "Not set";
  const color = source === "synced" ? "#4bb851" : source === "manual" ? C.accent : C.muted;
  return <Text style={[styles.badge, { color, borderColor: color }]}>{text}</Text>;
};

// Single-string keys: status, plus paste-to-save / remove for the ones that
// allow a phone-only copy.
function KeyRow({ name, label, usedFor, hint }) {
  const { keys, sources, saveLocalKey, removeLocalKey, canPasteManually } = useApiKeys();
  const [input, setInput] = useState("");
  const source = sources[name] || null;
  const pasteable = canPasteManually(name);

  return (
    <View style={styles.keyRow}>
      <View style={styles.keyHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.keyLabel}>{label}</Text>
          <Text style={styles.keyUsed}>{usedFor}</Text>
        </View>
        <Badge source={source} />
      </View>
      {hint && !keys?.[name] ? <Text style={styles.hint}>{hint}</Text> : null}
      {pasteable && source !== "synced" && (
        <View style={styles.pasteRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]} value={input} onChangeText={setInput}
            placeholder={source === "manual" ? "Replace with a new key" : `Paste ${label} key`}
            placeholderTextColor="#777" autoCapitalize="none" autoCorrect={false}
          />
          <AppButton variant="primary" title="Save" disabled={!input.trim()} onPress={() => { saveLocalKey(name, input.trim()); setInput(""); }} />
        </View>
      )}
      {pasteable && source === "manual" && (
        <Pressable onPress={() => removeLocalKey(name)}><Text style={styles.removeText}>Remove from this phone</Text></Pressable>
      )}
    </View>
  );
}

export default function KeysScreen() {
  const router = useRouter();
  const { keys, sources, reload, forgetVault } = useApiKeys();
  const [unlocked, setUnlocked] = useState(null);

  useEffect(() => {
    getCachedMasterKey().then((k) => setUnlocked(!!k)).catch(() => setUnlocked(false));
  }, [keys]);

  const igdbSource = sources.igdbId && sources.igdbSecret ? "synced" : null;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2}>API keys & sync</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Encrypted key sync</Text>
          {unlocked ? (
            <>
              <Text style={styles.value}>Unlocked on this phone</Text>
              <Text style={styles.hint}>Keys you set on desktop arrive when desktop syncs. Forgetting only removes this phone's copy.</Text>
              <AppButton variant="action" title="Refresh keys" onPress={() => reload()} />
              <Pressable onPress={async () => { await forgetVault(); setUnlocked(false); }}>
                <Text style={styles.removeText}>Forget on this phone</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.hint}>
                Enter the passphrase you set up on desktop (Settings → Cloud Sync → Encrypted Key Sync)
                to pull your keys here. Nothing but this phone's own copy is stored.
              </Text>
              <UnlockVaultForm onUnlocked={async (masterKeyHex) => { await reload(masterKeyHex); setUnlocked(true); }} />
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Keys</Text>
          <KeyRow name="tmdb" label="TMDB" usedFor="Movie & TV search, cover art, Discover"
            hint="Free at themoviedb.org → Settings → API." />
          <KeyRow name="discogs" label="Discogs" usedFor="Music (optional — adds search thumbnails)" />
          <KeyRow name="youtube" label="YouTube Data API" usedFor="Web Video search" />
          <KeyRow name="gemini" label="Google Gemini" usedFor="Scan a photo of a shelf" hint="Free at aistudio.google.com → Get API key." />
          <View style={styles.keyRow}>
            <View style={styles.keyHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.keyLabel}>IGDB</Text>
                <Text style={styles.keyUsed}>Game search alongside Steam (Client ID + Secret)</Text>
              </View>
              <Badge source={igdbSource} />
            </View>
            {!igdbSource && <Text style={styles.hint}>IGDB needs two values, so it only arrives through key sync.</Text>}
          </View>
        </View>
      </ScrollView>
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
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  card: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 14, gap: 10 },
  cardTitle: { fontFamily: F.mono, color: C.muted, fontSize: 10, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase" },
  value: { color: C.text, fontSize: 15 },
  hint: { color: C.muted, fontSize: 12, lineHeight: 17 },
  keyRow: { gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  keyHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  keyLabel: { color: C.text, fontSize: 14, fontWeight: "600" },
  keyUsed: { color: C.muted, fontSize: 12, marginTop: 2 },
  badge: { fontSize: 11, fontWeight: "600", borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  pasteRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { backgroundColor: C.bg, color: C.text, borderRadius: 8, padding: 10, fontSize: 14, borderWidth: 1, borderColor: C.border },
  removeText: { color: C.danger, fontSize: 12, textDecorationLine: "underline" },
});
