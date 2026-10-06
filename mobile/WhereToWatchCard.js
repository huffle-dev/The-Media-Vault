// The item profile's Where to Watch card (Movie and TV): the providers for the
// country you pick, from the data desktop synced, with a button to check again
// right now (needs your TMDB key). The country is remembered on this phone only.
import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "./Text";
import BottomSheet from "./BottomSheet";
import { supabase } from "./supabase";
import { movie } from "./mediaServices";
import { saveItemCache } from "./libraryCache";
import { checkWatchProviders } from "./watchCheck";
import { whereToWatch } from "./profileData";
import { watchBuckets, watchLink, watchChecked, regionChoices, savedRegion, saveRegion } from "./watchData";
import { C, F } from "./colors";

export default function WhereToWatchCard({ item, keys, readOnly, onChecked }) {
  const choices = useMemo(() => regionChoices(() => movie.getWatchRegionOptions(), ["GB", "US"]), []);
  const [region, setRegion] = useState(() => savedRegion(choices.map((c) => c.code)));
  const [picking, setPicking] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  const buckets = watchBuckets(item, region);
  const link = watchLink(item, region);
  const legacy = buckets.length === 0 && !item.watch_providers ? whereToWatch(item) : [];
  const regionName = (choices.find((c) => c.code === region) || {}).name || region;

  const pick = (code) => {
    setRegion(code);
    setPicking(false);
    saveRegion(code);
  };

  // The same check desktop does: every country's providers in one call, saved on
  // the item (and so synced back to desktop).
  async function checkNow() {
    setChecking(true);
    setError(null);
    try {
      const patch = await checkWatchProviders({ client: supabase, movie, tmdbKey: keys?.tmdb, item });
      saveItemCache({ ...item, ...patch });
      onChecked({ ...item, ...patch });
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Where to Watch</Text>
        <Pressable onPress={() => setPicking(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Country: ${regionName}. Change country`}>
          <Text style={styles.region}>{regionName} ▾</Text>
        </Pressable>
      </View>

      {buckets.map((b) => (
        <View key={b.type} style={styles.row}>
          <Text style={styles.label}>{b.label}</Text>
          <Text style={styles.value}>{b.providers.join(" · ")}</Text>
        </View>
      ))}

      {buckets.length === 0 && legacy.length > 0 && (
        <>
          {legacy.map(([label, v]) => (
            <View key={label} style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{v}</Text></View>
          ))}
          <Text style={styles.note}>As of desktop's last check, for its country. Check again to see {regionName}.</Text>
        </>
      )}

      {buckets.length === 0 && legacy.length === 0 && (
        <Text style={styles.note}>
          {watchChecked(item) ? `Not available to stream, rent or buy in ${regionName} right now.` : "Not checked yet."}
        </Text>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        {link && (
          <Pressable onPress={() => Linking.openURL(link)} accessibilityRole="link" accessibilityLabel="See all options on TMDB">
            <Text style={styles.link}>See all options ↗</Text>
          </Pressable>
        )}
        {!readOnly && (
          <Pressable onPress={checkNow} disabled={checking} accessibilityRole="button" accessibilityLabel="Check where to watch again">
            <Text style={[styles.link, checking && { opacity: 0.5 }]}>{checking ? "Checking…" : "Check again"}</Text>
          </Pressable>
        )}
      </View>

      <BottomSheet visible={picking} title="Your country" onClose={() => setPicking(false)}>
        <ScrollView style={{ maxHeight: 420 }}>
          {choices.map((c) => (
            <Pressable key={c.code} style={styles.choice} onPress={() => pick(c.code)} accessibilityRole="radio" accessibilityState={{ selected: c.code === region }}>
              <Text style={[styles.choiceText, c.code === region && { color: C.accent, fontWeight: "700" }]}>{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 14, gap: 8 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: F.mono, color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 },
  region: { color: C.accent, fontSize: 12 },
  row: { flexDirection: "row", gap: 12 },
  label: { width: 56, color: C.muted, fontSize: 12 },
  value: { flex: 1, color: C.text, fontSize: 13, lineHeight: 18 },
  note: { color: C.muted, fontSize: 12, lineHeight: 17 },
  error: { color: C.danger, fontSize: 12 },
  actions: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  link: { color: C.accent, fontSize: 12 },
  choice: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  choiceText: { color: C.text, fontSize: 14 },
});
