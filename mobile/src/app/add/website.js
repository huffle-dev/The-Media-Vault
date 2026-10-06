// Add -> Website: paste a page's address, see what it says about itself, add it.
import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import TextInput from "../../../TextInput";
import { useRouter } from "expo-router";
import Screen from "../../../Screen";
import AppButton from "../../../AppButton";
import { useLibrary } from "../../../LibraryContext";
import { fetchWebsiteInfo } from "../../../websiteInfo";
import { addItemToLibrary } from "../../../addToLibrary";
import { findDuplicate } from "../../../duplicates";
import { C, F } from "../../../colors";

export default function AddWebsiteRoute() {
  const router = useRouter();
  const { items, reload, offline } = useLibrary();
  const [address, setAddress] = useState("");
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function look() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try { setInfo(await fetchWebsiteInfo(address)); } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function add() {
    if (!info || busy) return;
    const same = findDuplicate(items, { title: info.title, media_type: "Website" });
    if (same) {
      const go = await new Promise((resolve) => Alert.alert("Already in your library", `"${same.title}" is already in your library. Add it again?`, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) }, { text: "Add anyway", onPress: () => resolve(true) },
      ], { onDismiss: () => resolve(false) }));
      if (!go) return;
    }
    setBusy(true);
    setError(null);
    try {
      await addItemToLibrary({ mediaType: "Website", title: info.title, platformId: null, details: null, quickRow: info });
      await reload();
      router.dismissTo("/");
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2}>Add a website</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {offline ? <Text style={styles.error}>You're offline — adding needs a connection.</Text> : (
          <>
            <TextInput
              style={styles.input} value={address} onChangeText={setAddress} placeholder="Paste a web address" placeholderTextColor="#777"
              autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" onSubmitEditing={look}
            />
            <AppButton title={busy && !info ? "Reading the page…" : "Read the page"} variant="primary" onPress={look} disabled={busy || !address.trim()} />
            {error && <Text style={styles.error}>{error}</Text>}
            {info && (
              <View style={styles.card}>
                {info.cover_art_url ? <Image source={{ uri: info.cover_art_url }} style={styles.pic} resizeMode="contain" /> : null}
                <Text style={styles.title}>{info.title}</Text>
                <Text style={styles.meta}>{[info.site_name, info.creator, info.year].filter(Boolean).join(" · ")}</Text>
                {info.notes ? <Text style={styles.notes} numberOfLines={6}>{info.notes}</Text> : null}
                <AppButton title={busy ? "Adding…" : "Add to library"} variant="primary" onPress={add} disabled={busy} style={{ marginTop: 12 }} />
              </View>
            )}
            <Pressable onPress={() => router.push("/add/manual/Website")} style={{ marginTop: 16 }}><Text style={styles.link}>Can't read it? Enter it by hand ›</Text></Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  back: { color: C.muted, fontSize: 15 },
  h2: { color: C.text, fontSize: 15, fontWeight: "700" },
  body: { padding: 16, gap: 12 },
  input: { backgroundColor: C.surface2, color: C.text, borderRadius: 8, padding: 12, fontSize: 15, borderWidth: 1, borderColor: C.border },
  error: { color: C.danger },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, gap: 6 },
  pic: { width: "100%", height: 120, marginBottom: 6 },
  title: { fontFamily: F.serif, color: C.text, fontSize: 19 },
  meta: { color: C.muted, fontFamily: F.mono, fontSize: 11 },
  notes: { color: C.text, fontSize: 13, lineHeight: 19 },
  link: { color: C.accent, fontSize: 13 },
});
