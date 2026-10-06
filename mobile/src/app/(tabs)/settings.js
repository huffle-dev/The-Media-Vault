// Settings, grouped like desktop's cards but as a short list that opens a
// sub-screen per topic — nothing to scroll sideways or squeeze in. Store
// logins, appearance, export and library resync are desktop-only.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { supabase, serverHost } from "../../../supabase";
import { useLibrary } from "../../../LibraryContext";
import { useApiKeys } from "../../../useApiKeys";
import AppButton from "../../../AppButton";
import { timeAgo } from "../../../format";
import { cacheAllCoverArt } from "../../../mediaServices";
import { itemsToPrefetch, prefetchItems, orphanNames, pruneManifest } from "../../../offlinePrefetch";
import { loadItemManifest, saveItemManifest, saveItemCache, listItemCacheFiles, removeOrphanItemFiles } from "../../../libraryCache";
import { coverFileNameForUrl, listLinkedCoverFiles, deleteCoverFiles } from "../../../coverArtStorage";
import { C, F } from "../../../colors";
import { diag, lastViewed } from "../../../diag";

const Row = ({ title, sub, onPress }) => (
  <Pressable style={styles.navRow} onPress={onPress}>
    <View style={{ flex: 1 }}>
      <Text style={styles.navTitle}>{title}</Text>
      {sub ? <Text style={styles.navSub}>{sub}</Text> : null}
    </View>
    <Text style={styles.chevron}>›</Text>
  </Pressable>
);

// "v1.0.0 · build 2": the version people know, plus the Android build number (versionCode in app.json, which I
// raise for every build that goes to a phone) so two installs of the same version can be told apart.
const appVersionLabel = () => {
  const build = Constants.expoConfig?.android?.versionCode;
  return `v${Constants.expoConfig?.version || "1.0.0"}${build ? ` · build ${build}` : ""}`;
};

const problemsSub = ({ problems, fatal }) => (fatal ? "The app closed unexpectedly: tap to see why" : problems ? `${problems} new since you last looked` : "Nothing new; covers, errors and what went wrong");

export default function SettingsTab() {
  const router = useRouter();
  const { items, offline, savedAt, refresh, fullReload, refreshing, refreshedAt } = useLibrary();
  const { keys, sources } = useApiKeys();
  const [email, setEmail] = useState(null);
  const [, setDiagTick] = useState(0); // re-draw the Problems row when something new is logged
  useEffect(() => diag.subscribe(() => setDiagTick((t) => t + 1)), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email || null)).catch(() => {});
  }, []);

  // How many items have a synced cover link (desktop uploads them after its
  // "Preparing cover art" step) — the number to look at when tiles are blank.
  const withLink = items ? items.filter((i) => i.cover_art_url).length : 0;

  // Offline: save every item's full details, then every cover, so the whole library
  // browses with no connection; and clear out saved files for items that are gone.
  const [offlineStatus, setOfflineStatus] = useState(null);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const saveForOffline = async () => {
    setOfflineBusy(true);
    try {
      const manifest = pruneManifest(await loadItemManifest(), items);
      const todo = itemsToPrefetch(items, manifest);
      const res = await prefetchItems({
        client: supabase, items: todo, manifest, save: saveItemCache,
        onProgress: ({ done, total }) => setOfflineStatus(`Saving item details… ${done} / ${total}`),
      });
      saveItemManifest(res.manifest);
      setOfflineStatus("Saving covers…");
      const covers = await cacheAllCoverArt(items, ({ done, total }) => setOfflineStatus(`Saving covers… ${done} / ${total}`), { verify: true });
      setOfflineStatus(`Done: ${res.saved} item${res.saved === 1 ? "" : "s"} saved${res.failed ? `, ${res.failed} could not be saved (run again)` : ""}; ${covers.failed ? `${covers.failed} of ${covers.total} covers could not be saved (check your connection and run again).` : "covers up to date."}`);
    } catch (e) {
      setOfflineStatus(`Could not finish: ${e.message}`);
    } finally {
      setOfflineBusy(false);
    }
  };
  const cleanUp = () => {
    const keepCovers = items.filter((i) => i.cover_art_url).map((i) => coverFileNameForUrl(i.cover_art_url));
    const coverCount = deleteCoverFiles(orphanNames(listLinkedCoverFiles(), keepCovers));
    const itemCount = removeOrphanItemFiles(orphanNames(listItemCacheFiles(), items.map((i) => `${i.sync_id}.json`)));
    setOfflineStatus(`Cleaned up ${coverCount} cover${coverCount === 1 ? "" : "s"} and ${itemCount} saved item${itemCount === 1 ? "" : "s"} that are no longer in your library.`);
  };

  const setKeys = keys ? Object.values(sources).filter(Boolean).length : 0;

  return (
    <ScrollView contentContainerStyle={styles.fill}>
      <View style={styles.titleRow}>
        <Text style={styles.h1}>Settings</Text>
        <Text style={styles.titleVersion}>{appVersionLabel()}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Account</Text>
        <Text style={styles.value}>{email || "Signed in"}</Text>
        <Text style={styles.sub}>Server: {serverHost()} (sign out to change it)</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Library</Text>
        <Text style={styles.value}>{items ? `${items.length} items` : "Loading…"}</Text>
        <Text style={styles.sub}>
          {withLink.toLocaleString()} of {items ? items.length.toLocaleString() : 0} items have a cover picture
        </Text>
        <Text style={styles.sub}>
          {offline
            ? `Offline — showing the copy saved ${savedAt ? new Date(savedAt).toLocaleString() : "earlier"} (read-only)`
            : refreshing ? "Refreshing…" : `Up to date${refreshedAt ? ` · updated ${timeAgo(refreshedAt)}` : ""}`}
        </Text>
        <Text style={styles.sub}>
          Pull down on Library, Stats or History to refresh. It also refreshes when you come back to the app. Refresh now fetches only what changed since desktop last synced; Full reload downloads the whole library again.
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <AppButton title={refreshing ? "Refreshing…" : "Refresh now"} variant="action" disabled={refreshing} onPress={refresh} />
          <AppButton title="Full reload" variant="action" disabled={refreshing} onPress={fullReload} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Offline use</Text>
        <Text style={styles.sub}>
          Covers download as tiles come into view, and items you have opened already work offline. To browse the whole library with no connection, save every item's details and cover now (it only fetches what is new or changed, and re-downloads any cover that was cut short). Clean up removes saved files for items you have deleted.
        </Text>
        {offlineStatus ? <Text style={styles.sub}>{offlineStatus}</Text> : null}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <AppButton title={offlineBusy ? "Saving…" : "Save for offline"} variant="action" disabled={offline || !items || offlineBusy} onPress={saveForOffline} />
          <AppButton title="Clean up" variant="action" disabled={!items || offlineBusy} onPress={cleanUp} />
        </View>
      </View>

      <View style={styles.group}>
        <Row title="API keys & sync" sub={keys ? `${setKeys} of ${Object.keys(sources).length} keys set` : "Loading…"} onPress={() => router.push("/settings/keys")} />
        <Row title="Hidden items" sub="Items you hid from the Library" onPress={() => router.navigate({ pathname: "/", params: { n: String(Date.now()), hidden: "hidden" } })} />
        <Row title="Steam & GOG libraries" sub="Bring in the games you own and your wishlist" onPress={() => router.push("/settings/game-libraries")} />
        <Row title="Custom media types" sub="Make your own kinds of thing to track" onPress={() => router.push("/settings/custom-types")} />
        <Row title="Library maintenance" sub="Fetch missing covers, fill in details, refresh YouTube channels" onPress={() => router.push("/settings/maintenance")} />
        <Row title="Problems & logs" sub={problemsSub(diag.counts(lastViewed()))} onPress={() => router.push("/settings/diagnostics")} />
        <Row title="About & credits" sub="Version, licences, privacy, send feedback" onPress={() => router.push("/settings/about")} />
        <Row title="Dismissed suggestions" sub="Titles you marked Not interested in Discover" onPress={() => router.push("/settings/dismissed")} />
      </View>

      <Text style={styles.footnote}>
        Appearance (colours and icons) is set in the desktop app and followed here after its next sync. Store logins (Steam, GOG), export and library resync live in the desktop app.
      </Text>

      <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Text style={styles.version}>The Media Vault · {appVersionLabel()}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { padding: 16, gap: 12, paddingBottom: 32 },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  titleVersion: { fontFamily: F.mono, fontSize: 11, color: C.muted },
  h1: { fontFamily: F.serif, color: C.text, fontSize: 22, fontWeight: "700", marginBottom: 4 },
  card: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 14, gap: 4 },
  label: { fontFamily: F.mono, color: C.muted, fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  value: { color: C.text, fontSize: 15 },
  sub: { color: C.muted, fontSize: 12 },
  group: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 8, overflow: "hidden" },
  navRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  navTitle: { color: C.text, fontSize: 15 },
  navSub: { color: C.muted, fontSize: 12, marginTop: 2 },
  chevron: { color: C.muted, fontSize: 22 },
  footnote: { color: C.muted, fontSize: 12, lineHeight: 17 },
  signOut: { marginTop: 4, borderRadius: 10, borderWidth: 1, borderColor: C.danger, paddingVertical: 12, alignItems: "center" },
  signOutText: { color: C.danger, fontSize: 15, fontWeight: "700" },
  version: { color: C.muted, fontSize: 11, textAlign: "center", marginTop: 4 },
});
