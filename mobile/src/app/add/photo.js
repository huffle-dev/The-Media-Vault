// Add -> Scan a photo: take or pick a photo of a shelf, let Gemini read the titles, tick the
// ones that are right (fix a title or its type if needed) and add them as owned.
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import TextInput from "../../../TextInput";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import Screen from "../../../Screen";
import AppButton from "../../../AppButton";
import { supabase } from "../../../supabase";
import { useLibrary } from "../../../LibraryContext";
import { useApiKeys } from "../../../useApiKeys";
import { addItemToLibrary } from "../../../addToLibrary";
import { ensureDevice, writeOwned } from "../../../ownership";
import { scanImageBase64 } from "@media-vault/core/gemini.js";
import { reviewRows, rowsToAdd, confidenceLabel, SCAN_TYPES } from "../../../photoScan";
import { C, F } from "../../../colors";

export default function PhotoScanRoute() {
  const router = useRouter();
  const { items, reload, offline, deviceId, refreshLists } = useLibrary();
  const { keys } = useApiKeys();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  async function scan(pick) {
    setError(null);
    try {
      const picked = await pick();
      if (picked.canceled || !picked.assets || !picked.assets[0]) return;
      setBusy(true);
      // Shrunk first: a phone photo is many megabytes, and Gemini reads titles fine at 1600 px.
      const edit = ImageManipulator.manipulate(picked.assets[0].uri);
      edit.resize({ width: Math.min(1600, picked.assets[0].width || 1600) });
      const image = await edit.renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
      const found = await scanImageBase64(saved.base64, "image/jpeg", keys && keys.gemini);
      const next = reviewRows(found, items);
      if (!next.length) setError("No items were identified in that photo. Try a clearer or closer shot.");
      else setRows(next);
    } catch (e) {
      setError(e.message || "Photo scan failed.");
    } finally {
      setBusy(false);
    }
  }
  const fromLibrary = () => scan(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 }));
  const fromCamera = () => scan(() => ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 }));

  const update = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const cycleType = (r) => update(r.id, { media_type: SCAN_TYPES[(SCAN_TYPES.indexOf(r.media_type) + 1) % SCAN_TYPES.length] });
  const chosen = rows ? rowsToAdd(rows) : [];

  async function addAll() {
    setAdding(true);
    setError(null);
    try {
      const ids = [];
      for (const r of chosen) ids.push(await addItemToLibrary({ mediaType: r.mediaType, title: r.title, platformId: null, details: null, quickRow: r.quickRow }));
      await ensureDevice(supabase, deviceId);
      await writeOwned(supabase, { deviceId, ids: ids.filter(Boolean), owned: true });
      await Promise.all([reload(), refreshLists()]);
      router.dismissTo("/");
    } catch (e) {
      setError(e.message);
      setAdding(false);
    }
  }

  const noKey = keys && !keys.gemini;
  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => (rows ? setRows(null) : router.back())} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2}>Scan a photo</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {offline ? <Text style={styles.error}>You're offline — scanning needs a connection.</Text> : !rows ? (
          <>
            <Text style={styles.p}>Photograph a shelf of films, games, books or records. Gemini reads the titles and you choose which to add. They go in as owned.</Text>
            <Text style={styles.p}>The photo is sent to Google's Gemini service with your own key; nothing is kept by this app.</Text>
            {noKey && <Text style={styles.error}>Needs your Gemini key — unlock it in Settings → API keys & sync, or paste one there.</Text>}
            <View style={styles.buttons}>
              <AppButton title="Take a photo" variant="primary" disabled={busy || noKey} onPress={fromCamera} />
              <AppButton title="Choose a photo" variant="action" disabled={busy || noKey} onPress={fromLibrary} />
            </View>
            {busy && <View style={styles.busy}><ActivityIndicator /><Text style={styles.p}>Reading the photo…</Text></View>}
            {error && <Text style={styles.error}>{error}</Text>}
          </>
        ) : (
          <>
            <Text style={styles.p}>Tick the ones to add. Tap a title to fix it, or the type to change it.</Text>
            {rows.map((r) => (
              <View key={r.id} style={styles.row}>
                <Pressable onPress={() => update(r.id, { selected: !r.selected })} style={[styles.box, r.selected && styles.boxOn]} accessibilityRole="checkbox" accessibilityState={{ checked: r.selected }} accessibilityLabel={`Add ${r.title}`}>
                  {r.selected && <Text style={styles.tick}>✓</Text>}
                </Pressable>
                <View style={{ flex: 1, gap: 4 }}>
                  <TextInput style={styles.titleInput} value={r.title} onChangeText={(title) => update(r.id, { title })} />
                  <View style={styles.meta}>
                    <Pressable onPress={() => cycleType(r)} accessibilityRole="button" accessibilityLabel={`Type ${r.media_type}, tap to change`}><Text style={styles.type}>{r.media_type} ⟳</Text></Pressable>
                    <Text style={styles.conf}>{confidenceLabel(r.confidence)}</Text>
                    {r.duplicate && <Text style={styles.dupe}>already in your library</Text>}
                  </View>
                  {r.note ? <Text style={styles.conf}>{r.note}</Text> : null}
                </View>
              </View>
            ))}
            {error && <Text style={styles.error}>{error}</Text>}
            <AppButton title={adding ? "Adding…" : `Add ${chosen.length} item${chosen.length === 1 ? "" : "s"}`} variant="primary" disabled={adding || chosen.length === 0} onPress={addAll} style={{ marginTop: 12 }} />
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
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  p: { color: C.text, fontSize: 13.5, lineHeight: 20 },
  buttons: { flexDirection: "row", gap: 10, marginTop: 4 },
  busy: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 8 },
  error: { color: C.danger },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10 },
  box: { width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: C.muted, alignItems: "center", justifyContent: "center", marginTop: 4 },
  boxOn: { backgroundColor: C.accent, borderColor: C.accent },
  tick: { color: "#09090e", fontWeight: "800" },
  titleInput: { backgroundColor: C.surface2, color: C.text, borderRadius: 5, padding: 8, fontSize: 14, borderWidth: 1, borderColor: C.border },
  meta: { flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap" },
  type: { color: C.accent, fontFamily: F.mono, fontSize: 11 },
  conf: { color: C.muted, fontSize: 11.5 },
  dupe: { color: C.danger, fontSize: 11.5 },
});
