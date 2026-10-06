// Settings -> Library maintenance: the phone's versions of desktop's Resync menu items.
// Fetch missing covers, fill in missing Movie/TV details, and refresh YouTube channel
// info. Each runs a few items at a time with a count, can be stopped, and writes what it
// finds to your library (so desktop gets it by sync).
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import { useRouter } from "expo-router";
import Screen from "../../../Screen";
import AppButton from "../../../AppButton";
import { supabase } from "../../../supabase";
import { useLibrary } from "../../../LibraryContext";
import { useApiKeys } from "../../../useApiKeys";
import { getCoverArtForItem, youtube, movie, refreshServicesFor } from "../../../mediaServices";
import { needsWatchCheck, checkWatchProviders } from "../../../watchCheck";
import { getCoverArtSourceUrl } from "../../../coverArtStorage";
import { SYNCED_DETAIL_FIELDS } from "../../../addToLibrary";
import { fetchRefreshDetails, buildRefreshPatch, saveRefresh, needsMovieInfo, needsCover, isChannel, runBatch } from "../../../refreshItem";
import { C, F } from "../../../colors";

const today = () => new Date().toISOString().split("T")[0];

function Job({ title, blurb, count, noun, run, disabled, disabledReason }) {
  const [state, setState] = useState({ running: false, text: null });
  const stop = useRef(false);
  const start = async () => {
    stop.current = false;
    setState({ running: true, text: "Starting…" });
    try {
      const result = await run({
        isCancelled: () => stop.current,
        onProgress: ({ done, total }) => setState({ running: true, text: `${done} of ${total}…` }),
      });
      setState({ running: false, text: result });
    } catch (e) {
      setState({ running: false, text: `Could not finish: ${e.message}` });
    }
  };
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.sub}>{blurb}</Text>
      <Text style={styles.sub}>{disabledReason || (count === 0 ? `Nothing to do: every ${noun} is already filled in.` : `${count} ${noun}${count === 1 ? "" : "s"} could use this.`)}</Text>
      {state.text ? <Text style={styles.status}>{state.text}</Text> : null}
      <View style={styles.row}>
        <AppButton title={state.running ? "Working…" : "Start"} variant="action" disabled={state.running || disabled || count === 0} onPress={start} />
        {state.running && <AppButton title="Stop" variant="ghost" onPress={() => { stop.current = true; }} />}
      </View>
    </View>
  );
}

export default function MaintenanceScreen() {
  const router = useRouter();
  const { items, offline, reload } = useLibrary();
  const { keys } = useApiKeys();
  const list = items || [];
  const k = keys || {};

  const missingCovers = list.filter(needsCover);
  const movieGaps = list.filter((i) => needsMovieInfo(i, today()));
  const channels = list.filter(isChannel);
  const watchDue = list.filter((i) => needsWatchCheck(i, today()));

  // Fetch covers: look each one up (the same lookup the tiles use), then save its source link.
  const fetchCovers = async ({ isCancelled, onProgress }) => {
    let found = 0;
    const { done, failed } = await runBatch(missingCovers, async (item) => {
      const path = await getCoverArtForItem(item, k, isCancelled);
      const url = path ? getCoverArtSourceUrl(path) : null;
      if (!url) return;
      await saveRefresh(supabase, item, { cover_art_url: url });
      found++;
    }, { limit: 4, onProgress, isCancelled });
    await reload();
    return `Done: found ${found} cover${found === 1 ? "" : "s"} of ${done}${failed ? ` (${failed} errors)` : ""}.`;
  };

  // Fill in: fetch details and fill only the blanks (never overwrite), then note the date so
  // today's retry skips items with nothing more to find.
  const fillMovieInfo = async ({ isCancelled, onProgress }) => {
    const services = refreshServicesFor(k);
    let filled = 0;
    const { done, failed } = await runBatch(movieGaps, async (item) => {
      const details = await fetchRefreshDetails(item, k, services);
      const patch = buildRefreshPatch(item, details, { allowed: SYNCED_DETAIL_FIELDS, sourceUrlFor: getCoverArtSourceUrl, overwrite: false });
      if (Object.keys(patch).length) filled++;
      await saveRefresh(supabase, item, { ...patch, metadata_checked_date: today() });
    }, { limit: 3, onProgress, isCancelled });
    await reload();
    return `Done: ${filled} of ${done} updated${failed ? ` (${failed} could not be looked up)` : ""}.`;
  };

  // YouTube: fresh subscriber and video counts, link, and a picture if missing (in one batched call).
  const refreshChannels = async ({ isCancelled }) => {
    const need = channels.filter((c) => !c.cover_art_url).map((c) => c.platform_id);
    const details = await youtube.getYoutubeChannelsBatch(channels.map((c) => c.platform_id), k.youtube, { artFor: need });
    let updated = 0, missing = 0;
    for (const item of channels) {
      if (isCancelled()) break;
      const d = details.get(item.platform_id);
      if (!d) { missing++; continue; }
      const patch = { subscribers: d.subscribers, video_count: d.video_count, url: d.url };
      if (!item.cover_art_url && d.cover_art_path) { const u = getCoverArtSourceUrl(d.cover_art_path); if (u) patch.cover_art_url = u; }
      await saveRefresh(supabase, item, patch);
      updated++;
    }
    await reload();
    return `Done: ${updated} channel${updated === 1 ? "" : "s"} updated${missing ? `, ${missing} not found on YouTube` : ""}.`;
  };

  // Where to watch: every country's providers for each film and show, a few at a time.
  const checkWatch = async ({ isCancelled, onProgress }) => {
    const { done, failed } = await runBatch(watchDue, (item) => checkWatchProviders({ client: supabase, movie, tmdbKey: k.tmdb, item }), { limit: 3, onProgress, isCancelled });
    await reload();
    return `Done: checked ${done - failed} of ${done}${failed ? ` (${failed} could not be looked up)` : ""}. The Library's "Where to stream" filter uses this.`;
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2}>Library maintenance</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {offline && <Text style={styles.warn}>You are offline. These need a connection.</Text>}
        <Job
          title="Fetch missing covers" noun="item without a cover" count={missingCovers.length} disabled={offline}
          blurb="Looks up a cover for every item that has none and saves its link, so desktop gets it too."
          run={fetchCovers}
        />
        <Job
          title="Fill in missing Movie and TV details" noun="film or show" count={movieGaps.length}
          disabled={offline || !k.tmdb} disabledReason={!k.tmdb ? "Needs your TMDB key — unlock it in Settings → API keys & sync." : null}
          blurb="Fetches year, genre, director, runtime, age rating and cover for Movies and TV that are missing any. Only fills blanks; nothing you typed is changed."
          run={fillMovieInfo}
        />
        <Job
          title="Check where to watch" noun="film or show" count={watchDue.length}
          disabled={offline || !k.tmdb} disabledReason={!k.tmdb ? "Needs your TMDB key — unlock it in Settings → API keys & sync." : null}
          blurb="Looks up which services stream, rent or sell each film and show, for every country. Skips ones checked in the last week."
          run={checkWatch}
        />
        <Job
          title="Refresh YouTube channels" noun="channel" count={channels.length}
          disabled={offline || !k.youtube} disabledReason={!k.youtube ? "Needs your YouTube key — unlock it in Settings → API keys & sync." : null}
          blurb="Updates subscriber and video counts, the channel link and a missing picture for every channel you track."
          run={refreshChannels}
        />
        <Text style={styles.note}>To refresh one item, open it and tap "Refresh details and cover".</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  back: { color: C.muted, fontSize: 15 },
  h2: { color: C.text, fontSize: 15, fontWeight: "700" },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 14, gap: 6 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: "700" },
  sub: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  status: { color: C.text, fontSize: 13, marginTop: 2 },
  row: { flexDirection: "row", gap: 8, marginTop: 8 },
  warn: { color: C.danger, fontSize: 13 },
  note: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
});
