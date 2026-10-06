// Every optional external service, one card each — the body of both the
// Welcome screen and Settings → API Keys & Accounts, so the two can never
// disagree on what's offered or how it's saved. Each card says in one line
// what the service gets you, then shows only the field(s) it needs, with
// signup steps tucked behind a toggle.
//
// `includeCloudSync` — Settings has Cloud Sync on its own tab, so it turns
// this off; Welcome shows everything on one page. `movieExtras` lets
// Settings add its advanced Where to Watch card under TMDB. `initialSection`
// ("Games", from the app menu's Account Access item) scrolls that group
// into view on open.
import { useState, useEffect, useRef } from "react";
import { T } from "../tokens.js";
import { KeyInput, inputStyle, Group, Card, Steps, Toggle, extLink, saveBtnStyle } from "./SettingsShared.jsx";
import CloudSyncSection from "./CloudSyncSection.jsx";
import GogCard from "./GogCard.jsx";

// A single-key service (TMDB, Discogs, YouTube, Gemini): loads the stored
// value, saves on click, and reports back whether a key is now set.
function KeyField({ settingKey, placeholder, onSaved }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    window.vault.settings.get(settingKey).then(v => { if (v) { setValue(v); onSaved?.(v, true); } });
  }, [settingKey]);
  const save = async () => {
    const trimmed = value.trim();
    await window.vault.settings.set(settingKey, trimmed);
    onSaved?.(trimmed, false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <KeyInput value={value} onChange={e => { setValue(e.target.value); setSaved(false); }} placeholder={placeholder} inputStyle={inputStyle} />
      <button onClick={save} style={saveBtnStyle(saved)}>{saved ? "✓ Saved" : "Save"}</button>
    </div>
  );
}

// GOG — a single "log in" button that opens the service's own
// sign-in page, so this app never sees the password.
const LoginRow = ({ connected, loggingIn, error, onLogin, onDisconnect, label }) => (
  <>
    {connected ? (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, color: T.seen, fontFamily: T.fontMono }}>✓ Connected</span>
        <span onClick={onDisconnect} style={{ fontSize: 11, color: T.muted, cursor: "pointer", fontFamily: T.fontMono, textDecoration: "underline" }}>Disconnect</span>
      </div>
    ) : (
      <button
        onClick={onLogin}
        disabled={loggingIn}
        style={{
          padding: "7px 16px", background: T.hoverWashStrong,
          border: `1px solid ${T.border}`, borderRadius: 5,
          color: T.text, fontSize: 12, fontWeight: 700,
          cursor: loggingIn ? "default" : "pointer", fontFamily: T.fontSans,
        }}
      >{loggingIn ? "Waiting for login…" : label}</button>
    )}
    {error && <div style={{ marginTop: 8, fontSize: 11, color: "#e84b6e", fontFamily: T.fontMono }}>{error}</div>}
  </>
);

export const CloudSyncCard = ({ cloudSync }) => (
  <Card
    title="Cloud Sync"
    done={cloudSync.cloudSyncConnected}
    blurb="Optional. Keep your library in step between computers and the Android app, through a free Supabase project of your own (about ten minutes, once)."
  >
    <CloudSyncSection cloudSync={cloudSync} />
  </Card>
);

export default function ServiceConnections({ steam, gog, cloudSync, includeCloudSync = true, movieExtras, initialSection }) {
  const [hasTmdb, setHasTmdb] = useState(false);
  const [hasDiscogs, setHasDiscogs] = useState(false);
  const [hasYoutube, setHasYoutube] = useState(false);
  const [hasGemini, setHasGemini] = useState(false);
  const [autoEnrichFilmTV, setAutoEnrichFilmTV] = useState(true);
  const [autoEnrichHltb, setAutoEnrichHltb] = useState(false);

  const [igdbId, setIgdbId] = useState("");
  const [igdbSecret, setIgdbSecret] = useState("");
  const [igdbSaved, setIgdbSaved] = useState(false);
  const [steamSavedOk, setSteamSavedOk] = useState(false);

  const gamesRef = useRef(null);
  useEffect(() => {
    if (initialSection === "Games") gamesRef.current?.scrollIntoView({ block: "start" });
  }, [initialSection]);

  useEffect(() => {
    Promise.all([
      window.vault.settings.get("auto_enrich_film_tv"),
      window.vault.settings.get("auto_enrich_hltb"),
      window.vault.settings.get("igdb_client_id"),
      window.vault.settings.get("igdb_client_secret"),
      window.vault.settings.get("tmdb_api_key"),
    ]).then(([film, hltb, id, secret, tmdb]) => {
      // No TMDB key → auto-fill is forced off regardless of what was last
      // stored (it's guaranteed to fail without one), and the correction is
      // persisted so App.jsx's own copy of this flag agrees.
      if (!tmdb) {
        setAutoEnrichFilmTV(false);
        if (film !== "0") window.vault.settings.set("auto_enrich_film_tv", "0");
      } else if (film != null) {
        setAutoEnrichFilmTV(film === "1");
      }
      setAutoEnrichHltb(hltb === "1");
      if (id) setIgdbId(id);
      if (secret) setIgdbSecret(secret);
    });
  }, []);

  // A first TMDB key switches auto-fill on, and clearing it switches
  // auto-fill off (it can't work without one). Editing an existing key
  // leaves the checkbox however the user last set it.
  const handleTmdbSaved = (value, isInitialLoad) => {
    const had = hasTmdb;
    setHasTmdb(!!value);
    if (isInitialLoad) return;
    if (!had && value) { setAutoEnrichFilmTV(true); window.vault.settings.set("auto_enrich_film_tv", "1"); }
    if (!value) { setAutoEnrichFilmTV(false); window.vault.settings.set("auto_enrich_film_tv", "0"); }
  };

  const toggleFilmTV = (checked) => {
    setAutoEnrichFilmTV(checked);
    window.vault.settings.set("auto_enrich_film_tv", checked ? "1" : "0");
  };
  const toggleHltb = (checked) => {
    setAutoEnrichHltb(checked);
    window.vault.settings.set("auto_enrich_hltb", checked ? "1" : "0");
  };

  const saveIgdb = async () => {
    await Promise.all([
      window.vault.settings.set("igdb_client_id", igdbId.trim()),
      window.vault.settings.set("igdb_client_secret", igdbSecret.trim()),
    ]);
    setIgdbSaved(true);
    setTimeout(() => setIgdbSaved(false), 2000);
  };

  const saveSteam = async () => {
    const ok = await steam.handleSteamSave();
    if (ok) setSteamSavedOk(true);
  };

  const steamDone = steamSavedOk || (steam.steamId && steam.steamKey);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Group title="Movies & TV">
        <Card
          title="TMDB"
          tag="Recommended"
          done={hasTmdb}
          blurb="Search for films and shows, and get posters, cast and descriptions filled in automatically."
        >
          <KeyField settingKey="tmdb_api_key" placeholder="Paste your TMDB API key…" onSaved={handleTmdbSaved} />
          <Steps>
            <li>Create a free account at {extLink("https://www.themoviedb.org/signup", "themoviedb.org")}</li>
            <li>Go to {extLink("https://www.themoviedb.org/settings/api", "Settings → API")} and request a key (choose "Developer")</li>
            <li>Copy the <strong style={{ color: T.dim }}>API Key</strong> into the box above</li>
          </Steps>
          <Toggle checked={autoEnrichFilmTV} disabled={!hasTmdb} onChange={toggleFilmTV}>
            Fill in details automatically when I add a movie or show
          </Toggle>
        </Card>
        {movieExtras}
      </Group>

      <Group title="Games" groupRef={gamesRef}>
        <Card title="Steam" done={steamDone} blurb="Import the games you own and your wishlist.">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              value={steam.steamId}
              onChange={e => { steam.setSteamId(e.target.value); steam.setSteamSaved(false); steam.setSteamErrors(p => ({ ...p, id: null })); }}
              placeholder="Steam ID (e.g. 76561198012345678)"
              style={{ ...inputStyle, ...(steam.steamErrors.id && { borderColor: "#e84b6e" }) }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <KeyInput
                value={steam.steamKey}
                onChange={e => { steam.setSteamKey(e.target.value); steam.setSteamSaved(false); steam.setSteamErrors(p => ({ ...p, key: null })); }}
                placeholder="Steam API key"
                inputStyle={{ ...inputStyle, ...(steam.steamErrors.key && { borderColor: "#e84b6e" }) }}
              />
              <button onClick={saveSteam} style={saveBtnStyle(steam.steamSaved)}>{steam.steamSaved ? "✓ Saved" : "Save"}</button>
            </div>
            {(steam.steamErrors.id || steam.steamErrors.key) && (
              <div style={{ fontSize: 11, color: "#e84b6e", fontFamily: T.fontMono }}>{steam.steamErrors.id || steam.steamErrors.key}</div>
            )}
          </div>
          <Steps>
            <li>Your Steam ID is the long number in your Steam profile's web address</li>
            <li>Get an API key at {extLink("https://steamcommunity.com/dev/apikey", "steamcommunity.com/dev/apikey")}</li>
            <li>Set your Steam profile and game details to <strong style={{ color: T.dim }}>Public</strong></li>
          </Steps>
        </Card>

        <GogCard gog={gog} LoginRow={LoginRow} />

        <Card
          title="IGDB"
          done={!!(igdbId && igdbSecret)}
          blurb="Cover art and details for games that aren't on Steam (Nintendo, EA and others)."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <KeyInput value={igdbId} onChange={e => { setIgdbId(e.target.value); setIgdbSaved(false); }} placeholder="Client ID" inputStyle={inputStyle} />
            <div style={{ display: "flex", gap: 8 }}>
              <KeyInput value={igdbSecret} onChange={e => { setIgdbSecret(e.target.value); setIgdbSaved(false); }} placeholder="Client Secret" inputStyle={inputStyle} />
              <button onClick={saveIgdb} style={saveBtnStyle(igdbSaved)}>{igdbSaved ? "✓ Saved" : "Save"}</button>
            </div>
          </div>
          <Steps>
            <li>Create an app at {extLink("https://dev.twitch.tv/console/apps/create", "dev.twitch.tv")} (free Twitch account)</li>
            <li>Set the redirect URL to <code>https://localhost</code> and Client Type to Confidential</li>
            <li>Copy the Client ID and a new Client Secret into the boxes above</li>
          </Steps>
        </Card>

        <Card title="HowLongToBeat" tag="No key needed" blurb="See roughly how many hours a game takes to finish.">
          <Toggle checked={autoEnrichHltb} onChange={toggleHltb}>
            Add play times automatically when I add a game
          </Toggle>
        </Card>
      </Group>

      <Group title="Music, video & photos">
        <Card
          title="Discogs"
          done={hasDiscogs}
          blurb="Music already works without this — a key just adds thumbnails to search results and allows more searches."
        >
          <KeyField settingKey="discogs_api_key" placeholder="Paste your Discogs token…" onSaved={v => setHasDiscogs(!!v)} />
          <Steps>
            <li>Go to {extLink("https://www.discogs.com/settings/developers", "discogs.com/settings/developers")}</li>
            <li>Click "Generate new token" and copy it above</li>
          </Steps>
        </Card>

        <Card title="YouTube" done={hasYoutube} blurb="Search for YouTube channels and videos, and look up any YouTube link you paste, when adding a Web Video.">
          <KeyField settingKey="youtube_api_key" placeholder="Paste your YouTube API key…" onSaved={v => setHasYoutube(!!v)} />
          <Steps>
            <li>Enable the "YouTube Data API v3" at {extLink("https://console.cloud.google.com/apis/library/youtube.googleapis.com", "console.cloud.google.com")}</li>
            <li>Create an API key under Credentials and copy it above</li>
          </Steps>
        </Card>

        <Card title="Gemini" done={hasGemini} blurb="Snap a photo of a shelf and have the titles read out and added for you.">
          <KeyField settingKey="gemini_api_key" placeholder="Paste your Gemini API key…" onSaved={v => setHasGemini(!!v)} />
          <Steps>
            <li>Go to {extLink("https://aistudio.google.com/apikey", "aistudio.google.com/apikey")} and sign in with Google</li>
            <li>Click "Create API key" and copy it above</li>
          </Steps>
        </Card>
      </Group>

      {includeCloudSync && (
        <Group title="Across devices">
          <CloudSyncCard cloudSync={cloudSync} />
        </Group>
      )}
    </div>
  );
}
