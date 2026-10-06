// Settings → Resync tab: Auto-Update bundle toggle, manual Cover Art/
// Movie & TV Metadata/HowLongToBeat fetch buttons, and per-source
// (Steam/GOG) resync buttons + auto-sync toggles. `steam`/`gog`
// are the shared useSteamAccount/useGogAccount hook results
// — see ApiKeysTab.jsx's Games section for why this state isn't tab-local.
// The manual-fetch actions themselves live in useResyncActions.js — this
// component is layout only.
import { Group, Card, Toggle, StatusMsg, ProgressBox, actionBtnStyle } from "./SettingsShared.jsx";
import LibraryResyncSection from "./LibraryResyncSection.jsx";
import AutoSyncModePicker from "./AutoSyncModePicker.jsx";
import { useResyncActions } from "./useResyncActions.js";
import { useCoverArtBackfillStatus } from "./useCoverArtBackfillStatus.js";
import { T } from "../tokens.js";
import { timeAgo } from "@media-vault/core/tokens/timeAgo.js";
import { useEffect, useState } from "react";
import { useCloudSyncStatus } from "../hooks/useCloudSyncStatus.js";

export default function ResyncTab({ steam, gog, cloudSync, onLibraryUpdate }) {
  const {
    autoUpdateOnLaunch, handleToggleAutoUpdateOnLaunch,
    bulkState, bulkRunning, handleBulkFetch,
    enrichState, enrichRunning, handleFilmEnrich, handleFilmForceRefresh,
    hltbEnrichState, hltbEnrichRunning, handleHltbEnrich,
  } = useResyncActions(onLibraryUpdate);

  // Web Video channels: refresh subscriber/video counts (and any missing
  // picture or description) for every channel in the library at once.
  const [channelsState, setChannelsState] = useState(null); // null | "running" | { msg } | { error }
  const handleRefreshChannels = async () => {
    setChannelsState("running");
    try {
      const r = await window.vault.youtube.refreshChannels();
      setChannelsState({ msg: r.total === 0 ? "No YouTube channels in the library yet." : `✓ Refreshed ${r.updated} of ${r.total} channels${r.missing ? ` · ${r.missing} no longer on YouTube` : ""}` });
      if (r.updated) onLibraryUpdate && onLibraryUpdate();
    } catch (err) {
      setChannelsState({ error: (err && err.message ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : "Refresh failed.") });
    }
  };

  // Cover pictures with no source link can't be re-downloaded by the phone, so a
  // small thumbnail of each goes to the user's own server (also done after every sync).
  const [thumbsState, setThumbsState] = useState(null);
  const handleUploadThumbs = async () => {
    setThumbsState("running");
    try {
      const r = await window.vault.cloudSync.uploadThumbnails();
      const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
      // Only a real failure is red. An unreadable file is worth knowing about but isn't an error.
      if (r.error || (r.failed && !r.uploaded)) {
        setThumbsState({ error: r.error || `Nothing uploaded: ${r.failed} failed${r.firstProblem ? ` — ${r.firstProblem}` : ""}` });
      } else {
        const parts = [];
        if (r.uploaded) parts.push(`uploaded ${plural(r.uploaded, "cover thumbnail")}`);
        if (r.cleared) parts.push(`removed ${plural(r.cleared, "empty cover file")} so ${r.cleared === 1 ? "it" : "they"} can be fetched again`);
        if (r.failed) parts.push(`${r.failed} failed (${r.firstProblem})`);
        if (r.skipped) parts.push(`${plural(r.skipped, "cover")} can't be read as a picture${r.firstProblem ? ` (${r.firstProblem})` : ""}`);
        setThumbsState({ msg: parts.length ? `✓ ${parts.join(" · ")}${r.uploaded ? " — the links go out with the next sync" : ""}` : "✓ Up to date — every cover has a source link or a thumbnail." });
      }
    } catch (err) {
      setThumbsState({ error: (err && err.message ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : "Upload failed.") });
    }
  };

  // How the last background Cloud Sync went (lib/autoSync.js), re-rendered every
  // 30 s so "3 min ago" stays true.
  const syncStatus = useCloudSyncStatus(onLibraryUpdate);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(id); }, []);
  const syncStatusLine = !syncStatus || syncStatus.state === "idle" ? null
    : syncStatus.state === "syncing" ? { text: "Syncing…" }
    : syncStatus.state === "error"
      ? { error: true, text: syncStatus.needsLogin ? "Last sync failed: your login has expired — log in again in the Cloud Sync tab." : `Last sync failed: ${syncStatus.error}` }
      : { text: `Last synced ${timeAgo(syncStatus.at)}${syncStatus.result ? ` · sent ${syncStatus.result.pushed}, received ${syncStatus.result.inserted + syncStatus.result.updated + syncStatus.result.deleted}` : ""}` };

  // Cloud Sync also gathers each cover's source link in the background so
  // the phone can download art directly; that can take several minutes.
  const backfill = useCoverArtBackfillStatus();
  const backfillProgress = !backfill || (!backfill.running && backfill.total === 0) ? null
    : backfill.running
      ? { text: `Preparing cover art for your other devices… ${backfill.done.toLocaleString()} / ${backfill.total.toLocaleString()}`, done: backfill.done, total: backfill.total }
      : { text: `✓ Cover-art links ready (${backfill.recorded.toLocaleString()} of ${backfill.total.toLocaleString()}) — click Sync Now again to send them.`, done: backfill.total, total: backfill.total };

  const enrichText = enrichState && !enrichState.error && (
    enrichState.total === 0
      ? "Nothing to update — every movie and show already has this info."
      : enrichRunning
        ? `Fetching… ${enrichState.done} / ${enrichState.total}`
        : `Done — updated ${enrichState.total} item${enrichState.total === 1 ? "" : "s"}.`
  );
  const hltbText = hltbEnrichState && (
    hltbEnrichState.total === 0
      ? "Nothing to update — no games in your library."
      : hltbEnrichRunning
        ? `Fetching… ${hltbEnrichState.done} / ${hltbEnrichState.total}`
        : `Done — checked ${hltbEnrichState.total} game${hltbEnrichState.total === 1 ? "" : "s"}.`
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Group title="Automatic">
        <Card
          title="Update on launch"
          blurb="Each time the app opens, quietly import new Steam games and fill in missing cover art, movie & TV details and streaming info."
        >
          <Toggle first checked={autoUpdateOnLaunch} onChange={handleToggleAutoUpdateOnLaunch}>
            Update automatically when the app opens
          </Toggle>
        </Card>
      </Group>

      <Group title="Fill in what's missing">
        <Card title="Cover art" blurb="Find artwork for anything in your library that doesn't have any yet.">
          <button onClick={handleBulkFetch} disabled={bulkRunning} style={actionBtnStyle(bulkRunning)}>
            ✦ Fetch Missing Art
          </button>
          {bulkState && (
            <ProgressBox
              text={bulkRunning
                ? `Fetching… ${bulkState.success + bulkState.failed} / ${bulkState.total}`
                : `Done — ${bulkState.success} found · ${bulkState.failed} not found`}
              done={bulkState.success + bulkState.failed}
              total={bulkState.total}
            />
          )}
        </Card>

        <Card title="Movie & TV details" tag="Uses TMDB" blurb="Add cast, country, language and ratings to any movie or show that's missing them.">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleFilmEnrich} disabled={enrichRunning} style={actionBtnStyle(enrichRunning)}>
              ✦ Fill Missing Info
            </button>
            <button
              onClick={handleFilmForceRefresh}
              disabled={enrichRunning}
              title="Re-fetch and overwrite every movie and show's details, not just missing ones — use this to fix wrong or out-of-date info"
              style={{ ...actionBtnStyle(enrichRunning), color: enrichRunning ? T.muted : "#e8944b" }}
            >
              ⚠ Refresh Everything
            </button>
          </div>
          <StatusMsg msg={enrichState?.error ? { error: enrichState.error } : null} />
          {enrichText && <ProgressBox text={enrichText} done={enrichState.done} total={enrichState.total} />}
        </Card>

        <Card title="HowLongToBeat" tag="No key needed" blurb="Add rough play times to every game in your library.">
          <button onClick={handleHltbEnrich} disabled={hltbEnrichRunning} style={actionBtnStyle(hltbEnrichRunning)}>
            ✦ Fetch Play Times
          </button>
          {hltbText && <ProgressBox text={hltbText} done={hltbEnrichState.done} total={hltbEnrichState.total} />}
        </Card>
      </Group>

      <Group title="Game libraries">
        <LibraryResyncSection
          title="Steam"
          description="Import any games you've bought on Steam since the last sync."
          resyncLabel="↺ Sync Steam"
          syncing={steam.steamSyncing}
          onResync={steam.handleSteamResync}
          autoSync={steam.autoSteamSyncOnLaunch}
          onToggleAutoSync={steam.handleToggleAutoSteamSyncOnLaunch}
          result={steam.steamResult}
        />
        {gog.gogEnabled && (
        <LibraryResyncSection
          title="GOG"
          description="Import any games you've bought on GOG since the last sync."
          resyncLabel="↺ Sync GOG"
          syncing={gog.gogSyncing}
          onResync={gog.handleGogResync}
          autoSync={gog.autoGogSyncOnLaunch}
          onToggleAutoSync={gog.handleToggleAutoGogSyncOnLaunch}
          result={gog.gogResult}
        />
        )}
      </Group>

      <Group title="Web Video">
        <Card title="YouTube channels" blurb="Bring subscriber and video counts up to date for every channel in your library, and fill in any missing picture or description. Uses about one YouTube quota unit per 50 channels.">
          <button onClick={handleRefreshChannels} disabled={channelsState === "running"} style={actionBtnStyle(channelsState === "running")}>
            {channelsState === "running" ? "Refreshing…" : "↺ Refresh channel info"}
          </button>
          <StatusMsg msg={channelsState && channelsState !== "running" ? channelsState.error ? { error: channelsState.error } : channelsState.msg : null} />
        </Card>
      </Group>

      <Group title="Across devices">
        <LibraryResyncSection
          title="Cloud Sync"
          description="Send your changes up and bring down anything changed on your other devices."
          resyncLabel="⟲ Sync Now"
          syncing={cloudSync.cloudSyncSyncing}
          onResync={cloudSync.handleCloudSyncSync}
          autoSync={cloudSync.autoCloudSyncOnLaunch}
          onToggleAutoSync={cloudSync.handleToggleAutoCloudSyncOnLaunch}
          autoControl={<AutoSyncModePicker mode={cloudSync.cloudSyncMode} onChange={cloudSync.handleCloudSyncModeChange} name="cloud-sync-mode-resync" />}
          statusLine={syncStatusLine}
          result={cloudSync.cloudSyncResult}
          progress={backfillProgress}
        />
        <Card title="Cover thumbnails" blurb="Covers you uploaded or cropped yourself (or whose original source is gone) have no link another device can download. A small copy of each is stored on your own server so your phone can show them. This also runs by itself after every sync, so this button is only for checking right now.">
          <button onClick={handleUploadThumbs} disabled={thumbsState === "running"} style={actionBtnStyle(thumbsState === "running")}>
            {thumbsState === "running" ? "Uploading…" : "⇪ Upload cover thumbnails"}
          </button>
          <StatusMsg msg={thumbsState && thumbsState !== "running" ? thumbsState.error ? { error: thumbsState.error } : thumbsState.msg : null} />
        </Card>
      </Group>
    </div>
  );
}
