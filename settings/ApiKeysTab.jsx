// Settings → API Keys & Accounts tab. The same service cards as the Welcome
// screen (settings/ServiceConnections.jsx — one implementation for both),
// plus the one thing only Settings needs: the Where to Watch card under
// TMDB (streaming region, which services to show, and which availability
// types count as a match). Cloud Sync is left out here since it has its
// own Settings tab.
import { useState, useEffect, useRef } from "react";
import { T } from "../tokens.js";
import { Label, Card } from "./SettingsShared.jsx";
import ServiceConnections from "./ServiceConnections.jsx";

const AVAILABILITY_TYPES = [
  { key: "flatrate", label: "Streaming" },
  { key: "rent",     label: "Rent" },
  { key: "buy",      label: "Buy" },
  { key: "free",     label: "Free" },
];

const selectStyle = {
  width: "100%", padding: "7px 11px",
  background: T.surface, border: `1px solid ${T.border}`,
  borderRadius: 5, color: T.text, fontSize: 12,
  outline: "none", fontFamily: T.fontSans,
};

function WhereToWatchCard({ onWatchRegionTouched }) {
  const [hasTmdb, setHasTmdb] = useState(false);
  const [watchRegions, setWatchRegions] = useState([]);
  const [watchRegion, setWatchRegion]   = useState("US");
  const [regionSaved, setRegionSaved]   = useState(false);
  const [providerOptions, setProviderOptions]     = useState([]);
  const [providerSearch, setProviderSearch]       = useState("");
  const [selectedProviders, setSelectedProviders] = useState([]);
  const [availabilityTypes, setAvailabilityTypes] = useState(["flatrate", "rent", "buy"]);
  const providersInitialized = useRef(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      window.vault.settings.get("tmdb_api_key"),
      window.vault.settings.get("watch_region"),
      window.vault.movie.watchRegions(),
      window.vault.settings.get("watch_provider_options"),
      window.vault.settings.get("watch_availability_types"),
    ]).then(([tmdb, region, regions, savedProviders, savedTypes]) => {
      setHasTmdb(!!tmdb);
      if (region) setWatchRegion(region);
      setWatchRegions(regions || []);
      if (savedProviders) {
        try { setSelectedProviders(JSON.parse(savedProviders)); providersInitialized.current = true; } catch {}
      }
      if (savedTypes) {
        try { setAvailabilityTypes(JSON.parse(savedTypes)); } catch {}
      }
      // Only start fetching the region's provider list once the real saved
      // region is known, or this races the "US" default against it.
      setSettingsLoaded(true);
    });
  }, []);

  // Provider checklist is region-specific — re-fetch whenever the region changes.
  useEffect(() => {
    if (!settingsLoaded) return;
    window.vault.movie.providerOptions(watchRegion).then(list => setProviderOptions(list || []));
  }, [watchRegion, settingsLoaded]);

  // First time (no saved selection yet): default to the top few by TMDB's
  // own relevance ranking. On a later region switch, clear the selection
  // entirely rather than carrying over whatever still overlaps.
  const lastRegion = useRef(null);
  useEffect(() => {
    if (!providerOptions.length) return;
    if (!providersInitialized.current) {
      const defaults = providerOptions.slice(0, 6);
      setSelectedProviders(defaults);
      window.vault.settings.set("watch_provider_options", JSON.stringify(defaults));
      providersInitialized.current = true;
    } else if (lastRegion.current !== null && lastRegion.current !== watchRegion) {
      setSelectedProviders([]);
      window.vault.settings.set("watch_provider_options", JSON.stringify([]));
    }
    lastRegion.current = watchRegion;
  }, [providerOptions, watchRegion]);

  const handleRegionChange = async (value) => {
    setWatchRegion(value);
    // A check already running is for the region being switched away from —
    // stop it rather than let it keep burning API calls for a region about
    // to be irrelevant.
    window.vault.movie.cancelWatchCheck();
    if (onWatchRegionTouched) onWatchRegionTouched();
    await window.vault.settings.set("watch_region", value);
    setRegionSaved(true);
    setTimeout(() => setRegionSaved(false), 2000);
  };

  const toggleProvider = (name) => {
    setSelectedProviders(prev => {
      const next = prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name];
      window.vault.settings.set("watch_provider_options", JSON.stringify(next));
      return next;
    });
  };

  const toggleAvailabilityType = (key) => {
    setAvailabilityTypes(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      window.vault.settings.set("watch_availability_types", JSON.stringify(next));
      return next;
    });
  };

  const q = providerSearch.trim().toLowerCase();
  const visibleProviders = providerOptions.filter(name => name.toLowerCase().includes(q));

  return (
    <Card
      title="Where to Watch"
      tag="Uses TMDB"
      blurb="Pick your country and the services you use, then filter your library by what's streaming where."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <Label>Country {regionSaved && <span style={{ color: T.seen, marginLeft: 6 }}>✓ Saved</span>}</Label>
          <select value={watchRegion} onChange={e => handleRegionChange(e.target.value)} style={selectStyle}>
            {watchRegions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
        </div>

        <div>
          <Label>Services to show</Label>
          {providerOptions.length > 0 && (
            <input
              value={providerSearch}
              onChange={e => setProviderSearch(e.target.value)}
              placeholder="Search services…"
              style={{ ...selectStyle, marginBottom: 6 }}
            />
          )}
          <div style={{
            display: "flex", flexDirection: "column", gap: 4,
            maxHeight: 160, overflowY: "auto",
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5,
            padding: "8px 11px",
          }}>
            {providerOptions.length === 0 && (
              <div style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>
                {hasTmdb ? "Loading…" : "Add a TMDB key above to see services."}
              </div>
            )}
            {providerOptions.length > 0 && visibleProviders.length === 0 && (
              <div style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>No services match "{providerSearch}".</div>
            )}
            {visibleProviders.map(name => (
              <label key={name} style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 12, color: T.text, cursor: "pointer", fontFamily: T.fontSans,
              }}>
                <input type="checkbox" checked={selectedProviders.includes(name)} onChange={() => toggleProvider(name)} />
                {name}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label>Counts as available when it's…</Label>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {AVAILABILITY_TYPES.map(t => (
              <label key={t.key} style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 12, color: T.text, cursor: "pointer", fontFamily: T.fontSans,
              }}>
                <input type="checkbox" checked={availabilityTypes.includes(t.key)} onChange={() => toggleAvailabilityType(t.key)} />
                {t.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function ApiKeysTab({ onWatchRegionTouched, steam, gog, initialSection }) {
  return (
    <ServiceConnections
      steam={steam} gog={gog}
      includeCloudSync={false}
      initialSection={initialSection}
      movieExtras={<WhereToWatchCard onWatchRegionTouched={onWatchRegionTouched} />}
    />
  );
}
