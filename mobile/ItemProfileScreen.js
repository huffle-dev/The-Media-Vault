// Item profile — the phone counterpart of desktop's Item Profile
// (views/ItemProfile.jsx), sections stacked vertically: hero (art, title,
// status, your rating, reference ratings, genres, links), cast, description,
// tracklist, details, then the side cards (playtime, time to beat, where to
// watch, your notes, library info).
//
// Fetches the item's full row on open (the library list only selects a lean
// column set) and saves a copy on the phone, so an item opened before still
// shows — read-only — with no connection. Edits (status, rating, your notes)
// write straight to Supabase by sync_id; desktop picks them up on its next
// pull by comparing updated_at like any other device's edit.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "./Text";
import TextInput from "./TextInput";
import { supabase } from "./supabase";
import { statusLabel } from "./format";
import { useApiKeys } from "./useApiKeys";
import { useCoverArt } from "./Tile";
import RelatedRows from "./RelatedRows";
import ItemLists from "./ItemLists";
import { saveItemCache, loadItemCache } from "./libraryCache";
import { deleteItem } from "./itemActions";
import { useLibrary } from "./LibraryContext";
import { deletedMessage, previousValues, savedMessage } from "./itemUndo";
import BottomSheet from "./BottomSheet";
import UndoBar from "./UndoBar";
import AppButton from "./AppButton";
import { externalRatingStats, externalLinks, sourceLabel, parseTracklist } from "./profileData";
import WhereToWatchCard from "./WhereToWatchCard";
import { reportCoverError } from "./coverHealing";
import { fetchOwnership, ownedText } from "./ownership";
import { fetchRefreshDetails, buildRefreshPatch, saveRefresh } from "./refreshItem";
import { refreshServicesFor } from "./mediaServices";
import { getCoverArtSourceUrl } from "./coverArtStorage";
import { SYNCED_DETAIL_FIELDS } from "./addToLibrary";
import { bulkSetOwned, bulkSetHidden } from "./bulkActions";
import { getEffectiveTypeConfig, TYPE_FIELDS } from "@media-vault/core/tokens/mediaTypes.js";
import { customValueText, parseCustomFields, withCustomTypeId } from "./customTypes";
import { formatRating, ratingColor, ratingToDisplay, ratingToStored, buildStatusChangePatch } from "@media-vault/core/tokens/ratings.js";
import { parseCastList, isSquareArt, isWideArt } from "@media-vault/core/tokens/itemHelpers.js";
import { STATUS_WHEEL_ORDER } from "@media-vault/core/tokens/constants.js";
import { DEFAULT_STATUS_COLORS } from "@media-vault/core/tokens/theme.js";
import { C, F } from "./colors";

// STATUS_WHEEL_ORDER's values -> DEFAULT_STATUS_COLORS' keys (this mapping
// only exists inline in desktop's PosterCard). Uses the fixed defaults
// rather than a user's customized colors — mobile has no Appearance
// settings yet.
const STATUS_COLOR_KEY = {
  wishlist: "blue", "not-started": "notStarted", "in-progress": "progress",
  consumed: "seen", dropped: "dropped",
};
const statusColor = (status) => DEFAULT_STATUS_COLORS[STATUS_COLOR_KEY[status]] || DEFAULT_STATUS_COLORS.blue;
const RATABLE = ["consumed", "dropped"];

const Section = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const Card = ({ title, children }) => (
  <View style={styles.card}>
    <Text style={styles.cardTitle}>{title}</Text>
    {children}
  </View>
);

const KeyValue = ({ label, value }) => (
  <View style={styles.kv}>
    <Text style={styles.kvLabel}>{label}</Text>
    <Text style={styles.kvValue}>{value}</Text>
  </View>
);

function openUrl(href) {
  if (/^https?:\/\//i.test(href)) Linking.openURL(href).catch(() => {});
}

// Long descriptions show a few lines with Show more / Show less.
function Description({ text }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 420 || text.split("\n").length > 6;
  return (
    <View>
      <Text style={styles.description} numberOfLines={long && !open ? 6 : undefined}>{text}</Text>
      {long && (
        <Pressable onPress={() => setOpen((o) => !o)} hitSlop={8}>
          <Text style={{ color: C.accent, fontSize: 13, marginTop: 8 }}>{open ? "Show less" : "Show more"}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Hero({ item, keys, type, genres, ownedControl }) {
  const artUri = useCoverArt(item, keys);
  const square = isSquareArt(item.media_type);
  return (
    <View style={styles.heroRow}>
      <View style={[styles.heroArt, square && styles.heroArtSquare]}>
        {artUri && isWideArt(item) ? (
          <>
            <Image source={{ uri: artUri }} blurRadius={16} resizeMode="cover" style={styles.heroBlur} onError={() => reportCoverError(item)} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} />
            <Image source={{ uri: artUri }} resizeMode="cover" style={styles.heroWide} onError={() => reportCoverError(item)} />
          </>
        ) : artUri
          ? <Image source={{ uri: artUri }} style={styles.heroImage} onError={() => reportCoverError(item)} />
          : <Text style={styles.heroIcon}>{type.icon}</Text>}
      </View>
      <View style={styles.heroText}>
        <Text style={[styles.typeBadge, { color: type.color }]}>{type.icon} {type.label}</Text>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.meta}>{[item.creator, item.year].filter(Boolean).join(" · ")}</Text>
        {(item.media_type === "Movie" || item.media_type === "TV") && item.content_rating
          ? <Text style={styles.contentRating}>{item.content_rating}</Text> : null}
        {genres.length > 0 && (
          <View style={styles.heroChips}>
            {genres.map((g) => <Text key={g} style={styles.chip}>{g}</Text>)}
          </View>
        )}
        {ownedControl}
      </View>
    </View>
  );
}

export default function ItemProfileScreen({ syncId, onClose, onSaved, onOpenItem, onAdded, onEdit, onDeleted, reloadKey, readOnly: offlineFlag }) {
  const { keys } = useApiKeys();
  const { offerUndo, undo, undoBusy, runUndo, dismissUndo, customTypes, deviceId, phoneOwnedIds, otherOwnedIds, refreshLists, reload } = useLibrary();
  const [item, setItem] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [status, setStatus] = useState(null);
  const [ratingDisplay, setRatingDisplay] = useState(null); // -10..+10, or null
  const [dateConsumed, setDateConsumed] = useState(null);
  const [personalNotes, setPersonalNotes] = useState("");
  const [saveError, setSaveError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Who has this marked owned: { mine: this phone, others: [device names] }.
  const [ownedOn, setOwnedOn] = useState(null);
  const [markingOwned, setMarkingOwned] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const readOnly = offlineFlag || fromCache;

  useEffect(() => {
    let cancelled = false;
    const apply = (data, cached) => {
      if (cancelled) return;
      setItem(withCustomTypeId(data));
      setFromCache(cached);
      setStatus(data.status);
      setRatingDisplay(data.rating != null ? ratingToDisplay(data.rating) : null);
      setDateConsumed(data.date_consumed || null);
      // personal_notes is the user's own notes — distinct from notes (the
      // fetched synopsis, refreshed by desktop's metadata fetch and never
      // typed into directly).
      setPersonalNotes(data.personal_notes || "");
    };
    supabase.from("items").select("*").eq("sync_id", syncId).single().then(async ({ data, error }) => {
      if (!error && data) { saveItemCache(data); apply(data, false); return; }
      // Couldn't reach the server (or the row's gone) — fall back to the
      // copy saved the last time this item opened online.
      const cached = await loadItemCache(syncId);
      if (cached) apply(cached, true);
      else if (!cancelled) setLoadError(error ? error.message : "Item not found.");
    });
    return () => { cancelled = true; };
  }, [syncId, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    setOwnedOn(null);
    fetchOwnership(supabase, syncId, deviceId).then((o) => { if (!cancelled) setOwnedOn(o); }).catch(() => {});
    return () => { cancelled = true; };
  }, [syncId, reloadKey, deviceId]);

  // Mark / unmark as owned on this phone, with the same Undo bar as other changes.
  async function toggleOwned() {
    if (readOnly || !ownedOn || markingOwned) return;
    setMarkingOwned(true);
    setSaveError(null);
    try {
      const next = !ownedOn.mine;
      const result = await bulkSetOwned(supabase, [item], [syncId], next, { deviceId, phoneOwnedIds, otherOwnedIds });
      if (result.failed) throw new Error("Could not save. Check your connection and try again.");
      setOwnedOn(await fetchOwnership(supabase, syncId, deviceId));
      const fresh = await supabase.from("items").select("status").eq("sync_id", syncId).single();
      if (fresh.data) { setItem((it) => ({ ...it, status: fresh.data.status })); setStatus(fresh.data.status); }
      offerUndo({ message: `${item.title}: ${result.message}`, failed: 0, undo: result.undo });
      refreshLists();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setMarkingOwned(false);
    }
  }

  // Desktop's "Force Resync": fetch this item's details and cover again from their source
  // and overwrite what is there (a blank never replaces a value), with Undo.
  async function refreshDetails() {
    if (readOnly || refreshing) return;
    setRefreshing(true);
    setSaveError(null);
    try {
      const details = await fetchRefreshDetails(item, keys || {}, refreshServicesFor(keys || {}));
      const patch = buildRefreshPatch(item, details, { allowed: SYNCED_DETAIL_FIELDS, sourceUrlFor: getCoverArtSourceUrl, overwrite: true });
      if (!Object.keys(patch).length) throw new Error("Nothing new found.");
      const before = item;
      const { undo } = await saveRefresh(supabase, item, patch);
      const next = { ...item, ...patch };
      setItem(next);
      saveItemCache(next);
      offerUndo({ message: `Refreshed ${item.title}`, failed: 0, undo: async () => { await undo(); saveItemCache(before); } });
      reload();
    } catch (e) {
      setSaveError(e.message || "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  // The profile has no Save button: a change is saved as it is made (with the Undo bar), so what you see is what
  // is stored. Status saves at once; the rating a moment after the last tap; your notes when you leave the box.
  const itemRef = useRef(null);
  itemRef.current = item;
  const pendingRating = useRef(undefined); // undefined = nothing waiting; otherwise { value }
  const ratingTimer = useRef(null);
  const notesRef = useRef("");
  notesRef.current = personalNotes;

  // Puts the screen's status / rating / date / notes back in line with a row (after an Undo).
  function syncFields(row) {
    setStatus(row.status);
    setRatingDisplay(row.rating != null ? ratingToDisplay(row.rating) : null);
    setDateConsumed(row.date_consumed || null);
    setPersonalNotes(row.personal_notes || "");
  }

  async function persist(patch) {
    if (readOnly || !itemRef.current) return false;
    setSaveError(null);
    const current = itemRef.current;
    const full = { ...patch, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("items").update(full).eq("sync_id", syncId);
    if (error) { setSaveError(error.message); return false; }
    const before = previousValues(current, patch);
    const next = { ...current, ...full };
    itemRef.current = next;
    setItem(next);
    saveItemCache(next);
    offerUndo({
      message: savedMessage(current), failed: 0,
      undo: async () => {
        const restore = { ...before, updated_at: new Date().toISOString() };
        const { error: e } = await supabase.from("items").update(restore).eq("sync_id", syncId);
        if (e) throw e;
        const restored = { ...itemRef.current, ...restore };
        itemRef.current = restored;
        setItem(restored);
        syncFields(restored);
        saveItemCache(restored);
        onSaved(restored);
      },
    });
    onSaved(next);
    return true;
  }

  function selectStatus(next) {
    if (readOnly || next === status) return;
    // Same rules as desktop's status wheel: leaving both ratable statuses
    // clears the rating; entering one defaults the date to today.
    const patch = buildStatusChangePatch({ ...itemRef.current, date_consumed: dateConsumed }, next);
    setStatus(next);
    if ("rating" in patch) setRatingDisplay(null);
    if (patch.date_consumed) setDateConsumed(patch.date_consumed);
    pendingRating.current = undefined; // a status change settles the rating itself
    clearTimeout(ratingTimer.current);
    persist({ ...patch, status: next });
  }

  function flushRating() {
    clearTimeout(ratingTimer.current);
    if (pendingRating.current === undefined) return;
    const { value } = pendingRating.current;
    pendingRating.current = undefined;
    persist({ rating: value != null ? ratingToStored(value) : null });
  }
  function changeRating(next) {
    if (readOnly) return;
    setRatingDisplay(next);
    pendingRating.current = { value: next };
    clearTimeout(ratingTimer.current);
    ratingTimer.current = setTimeout(flushRating, 700);
  }

  function saveNotes() {
    const current = itemRef.current;
    if (readOnly || !current) return;
    const text = notesRef.current || null;
    if (text === (current.personal_notes || null)) return;
    persist({ personal_notes: text });
  }

  // Leaving the screen with a change still waiting: save it now rather than lose it.
  useEffect(() => () => { flushRating(); saveNotes(); }, []);

  async function toggleHidden() {
    if (readOnly || !item) return;
    const hide = !(item.is_hidden === 1 || item.is_hidden === true);
    setSaveError(null);
    const result = await bulkSetHidden(supabase, [item], [syncId], hide);
    if (result.failed) { setSaveError("Could not save. Check your connection and try again."); return; }
    const next = { ...item, is_hidden: hide ? 1 : 0, updated_at: new Date().toISOString() };
    setItem(next);
    saveItemCache(next);
    offerUndo({ message: `${item.title} ${hide ? "hidden" : "shown again"}`, failed: 0, undo: async () => { await result.undo(); const back = { ...next, is_hidden: hide ? 0 : 1 }; setItem(back); saveItemCache(back); onSaved(back); } });
    onSaved(next);
  }

  async function handleDelete() {
    setDeleting(true);
    setSaveError(null);
    try {
      const undo = await deleteItem(syncId, item);
      offerUndo({ message: deletedMessage(item), failed: 0, undo });
      setConfirmDelete(false);
      onDeleted();
    } catch (e) {
      setSaveError(e.message);
      setConfirmDelete(false);
      setDeleting(false);
    }
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.back}>‹ Back</Text></Pressable>
      </View>
    );
  }
  if (!item) return <ActivityIndicator style={{ marginTop: 48 }} />;

  const type = getEffectiveTypeConfig(item, customTypes);
  // A custom type's own fields, with what this item holds for each.
  const customType = item.media_type === "Custom" ? customTypes.find((t) => t.id === item.custom_type_id) : null;
  const customValues = parseCustomFields(item.custom_fields);
  const customRows = customType
    ? customType.fields.map((f) => ({ f, text: customValueText(f, customValues[f.key]) })).filter((r) => r.text !== "")
    : [];
  const genres = (item.genre || "").split(",").map((g) => g.trim()).filter(Boolean);
  const isHidden = item.is_hidden === 1 || item.is_hidden === true;
  // Under the genres, in the top block: whether you own it, and the button to say so.
  const ownedControl = ownedOn ? (
    <View style={styles.ownedBox}>
      {!readOnly ? (
        <Pressable
          onPress={toggleOwned} disabled={markingOwned} accessibilityRole="button"
          accessibilityLabel={ownedOn.mine ? "Remove my owned mark" : "Mark as owned"}
          style={[styles.ownedBtn, ownedOn.mine && styles.ownedBtnOn]}
        >
          <Text style={[styles.ownedBtnText, ownedOn.mine && { color: C.accent }]}>{markingOwned ? "Saving…" : ownedOn.mine ? "✓ Owned" : "Mark as owned"}</Text>
        </Pressable>
      ) : null}
      {ownedOn.mine || ownedOn.others.length > 0 || readOnly
        ? <Text style={styles.ownedHint}>{ownedText(ownedOn)}</Text>
        : null}
    </View>
  ) : null;
  const stats = externalRatingStats(item);
  const links = externalLinks(item);
  const cast = parseCastList(item.cast_list);
  const tracks = item.media_type === "Music" ? parseTracklist(item.tracklist) : [];
  const showWatch = item.media_type === "Movie" || item.media_type === "TV";
  const timeToBeat = item.media_type === "Game"
    ? [["Main Story", item.hltb_main], ["Main + Extra", item.hltb_main_extra], ["Completionist", item.hltb_completionist]].filter(([, h]) => h != null)
    : [];
  const fmtHours = (h) => `${h % 1 === 0 ? h : h.toFixed(1)}h`;

  const fields = (TYPE_FIELDS[item.media_type] || []).filter((f) => {
    if (f.key === "cast_list" || f.key === "content_rating" || f.key === "genre") return false; // shown elsewhere (genre: under the title)
    const v = item[f.key];
    return v !== null && v !== undefined && v !== "";
  });

  const displayValue = (f) => {
    const v = item[f.key];
    if (f.key === "abridged") return v ? "Yes" : "No";
    return String(v);
  };

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.back}>‹ Back</Text></Pressable>
        {readOnly ? (
          <Text style={styles.readOnlyNote}>{fromCache ? "Offline · read-only" : "Read-only"}</Text>
        ) : (
          <View style={styles.actions}>
            {item.media_type !== "Custom" && (
              <Pressable onPress={refreshDetails} disabled={refreshing} hitSlop={8} accessibilityRole="button" accessibilityLabel="Refresh details and cover">
                <Text style={[styles.actionIcon, refreshing && styles.actionOff]}>{refreshing ? "…" : "↻"}</Text>
              </Pressable>
            )}
            <Pressable onPress={toggleHidden} hitSlop={8} accessibilityRole="button" accessibilityLabel={isHidden ? "Show this item again" : "Hide this item"}>
              <Text style={styles.actionText}>{isHidden ? "Unhide" : "Hide"}</Text>
            </Pressable>
            <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit this item"><Text style={[styles.actionText, styles.actionEdit]}>Edit</Text></Pressable>
            <Pressable onPress={() => setConfirmDelete(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete this item"><Text style={[styles.actionText, styles.actionDelete]}>Delete</Text></Pressable>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Hero item={item} keys={keys} type={type} genres={genres} ownedControl={ownedControl} />

        {saveError && <Text style={styles.error}>{saveError}</Text>}

        <Text style={styles.label}>Status</Text>
        <View style={styles.pillRow}>
          {STATUS_WHEEL_ORDER.map((s) => {
            const color = statusColor(s);
            const active = status === s;
            return (
              <Pressable
                key={s}
                onPress={() => selectStatus(s)}
                accessibilityRole="radio" accessibilityLabel={`Status ${statusLabel(s)}`} accessibilityState={{ selected: active }}
                style={[styles.pill, active && { borderColor: color, backgroundColor: color + "22" }]}
              >
                <Text style={[styles.pillText, active && { color, fontWeight: "700" }]}>{statusLabel(s)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Your rating</Text>
        {RATABLE.includes(status) ? (
          <View style={styles.ratingRow}>
            <Pressable
              onPress={() => changeRating(Math.max(-10, (ratingDisplay ?? 0) - 1))}
              style={styles.stepperBtn} accessibilityRole="button" accessibilityLabel="Lower your rating"
            ><Text style={styles.stepperBtnText}>–</Text></Pressable>
            <Text accessibilityLabel={`Your rating ${ratingDisplay != null ? formatRating(ratingToStored(ratingDisplay)) : "none"}`} style={[styles.ratingValue, { color: ratingDisplay != null ? ratingColor(ratingToStored(ratingDisplay)) : C.muted }]}>
              {ratingDisplay != null ? formatRating(ratingToStored(ratingDisplay)) : "—"}
            </Text>
            <Pressable
              onPress={() => changeRating(Math.min(10, (ratingDisplay ?? 0) + 1))}
              style={styles.stepperBtn} accessibilityRole="button" accessibilityLabel="Raise your rating"
            ><Text style={styles.stepperBtnText}>+</Text></Pressable>
            {ratingDisplay != null && !readOnly && (
              <Pressable onPress={() => changeRating(null)}><Text style={styles.clearText}>Clear</Text></Pressable>
            )}
          </View>
        ) : (
          <Text style={styles.hint}>You can rate this once it's Consumed or Dropped.</Text>
        )}

        {(stats.length > 0) && (
          <View style={styles.statsRow}>
            {stats.map((s) => (
              <View key={s.label} style={styles.stat}>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={styles.statValue}>{s.value}<Text style={styles.statSuffix}>{s.suffix}</Text></Text>
                {s.sub ? <Text style={styles.statSub}>{s.sub}</Text> : null}
              </View>
            ))}
          </View>
        )}

        {links.length > 0 && (
          <View style={styles.chipRow}>
            {links.map((l) => (
              <Pressable key={l.key} onPress={() => openUrl(l.href)} style={[styles.linkBtn, { borderColor: (l.color || C.muted) + "44" }]}>
                <Text style={[styles.linkText, { color: l.color || C.muted }]}>↗ {l.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Needs the network (lists live in Supabase) — hidden for an
            offline-cached profile. */}
        {!fromCache && <ItemLists itemSyncId={item.sync_id} readOnly={readOnly} />}

        {cast.length > 0 && (
          <Section title="Cast">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.castRow}>
              {cast.slice(0, 20).map((p, i) => (
                <View key={`${p.name}-${i}`} style={styles.castItem}>
                  {p.profile_path
                    ? <Image source={{ uri: `https://image.tmdb.org/t/p/w185${p.profile_path}` }} style={styles.castAvatar} />
                    : <View style={[styles.castAvatar, styles.castAvatarEmpty]}><Text style={styles.castInitial}>{p.name.slice(0, 1)}</Text></View>}
                  <Text style={styles.castName} numberOfLines={2}>{p.name}</Text>
                  {p.character ? <Text style={styles.castRole} numberOfLines={1}>{p.character}</Text> : null}
                </View>
              ))}
            </ScrollView>
          </Section>
        )}

        {item.notes ? (
          <Section title="Description">
            <Description text={item.notes} />
          </Section>
        ) : null}

        {tracks.length > 0 && (
          <Section title="Tracklist">
            {tracks.map((t, i) => (
              <View key={`${t.position}-${i}`} style={styles.trackRow}>
                <Text style={styles.trackPos}>{t.position || i + 1}</Text>
                <Text style={styles.trackTitle} numberOfLines={1}>{t.title}</Text>
                {t.duration ? <Text style={styles.trackDuration}>{t.duration}</Text> : null}
              </View>
            ))}
          </Section>
        )}

        <Section title="Details">
          {customRows.map(({ f, text }) => (
            f.field_type === "url"
              ? (
                <Pressable key={f.key} onPress={() => openUrl(text)} style={styles.kv}>
                  <Text style={styles.kvLabel}>{f.label}</Text>
                  <Text style={[styles.kvValue, styles.kvLink]} numberOfLines={1}>{text}</Text>
                </Pressable>
              )
              : <KeyValue key={f.key} label={f.label} value={text} />
          ))}
          {fields.length === 0 && customRows.length === 0
            ? <Text style={styles.hint}>No details filled in yet — add them with Edit.</Text>
            : fields.map((f) => (
              f.key.endsWith("_url") || f.key === "url"
                ? (
                  <Pressable key={f.key} onPress={() => openUrl(String(item[f.key]))} style={styles.kv}>
                    <Text style={styles.kvLabel}>{f.label}</Text>
                    <Text style={[styles.kvValue, styles.kvLink]} numberOfLines={1}>{String(item[f.key])}</Text>
                  </Pressable>
                )
                : <KeyValue key={f.key} label={f.label} value={displayValue(f)} />
            ))}
        </Section>

        {item.media_type === "Game" && item.runtime ? (
          <Card title="Playtime">
            <Text style={styles.bigNumber}>{item.runtime}<Text style={styles.statSuffix}> hour{item.runtime === 1 ? "" : "s"}</Text></Text>
          </Card>
        ) : null}

        {timeToBeat.length > 0 && (
          <Card title="Time to Beat">
            {timeToBeat.map(([label, h]) => <KeyValue key={label} label={label} value={fmtHours(h)} />)}
          </Card>
        )}

        {showWatch && (
          <WhereToWatchCard item={item} keys={keys} readOnly={readOnly} onChecked={(next) => setItem(next)} />
        )}

        <Card title="Your notes">
          <TextInput
            style={styles.notesInput}
            value={personalNotes}
            onChangeText={setPersonalNotes}
            onBlur={saveNotes}
            editable={!readOnly}
            placeholder="Add a personal note…"
            placeholderTextColor="#777"
            multiline
          />
        </Card>

        <Card title="Library info">
          <KeyValue label="Added" value={item.date_added || "—"} />
          {dateConsumed ? <KeyValue label="Consumed" value={dateConsumed} /> : null}
          {item.metadata_checked_date ? <KeyValue label="Last enriched" value={item.metadata_checked_date} /> : null}
          {sourceLabel(item) ? <KeyValue label="Source" value={sourceLabel(item)} /> : null}
        </Card>

        {/* Live catalog lookups — only when connected to the real item (an
            offline-cached profile has no network to look anything up). */}
        {!fromCache && keys !== undefined && (
          <RelatedRows item={item} keys={keys} offline={readOnly} onOpenItem={onOpenItem} onAdded={onAdded} />
        )}
      </ScrollView>

      {/* Changes are saved as you make them here, so the Undo bar shows on this screen too. */}
      {undo && <UndoBar message={undo.message} failed={undo.failed} busy={undoBusy} onUndo={runUndo} onDismiss={dismissUndo} />}

      <BottomSheet visible={confirmDelete} title="Delete this item?" onClose={() => !deleting && setConfirmDelete(false)}>
        <Text style={styles.confirmText}>
          "{item.title}" will be removed from your library on the phone and, once desktop syncs, on desktop too.
        </Text>
        <AppButton title={deleting ? "Deleting…" : "Delete"} variant="primary" color={C.danger} disabled={deleting} onPress={handleDelete} style={{ backgroundColor: C.danger }} />
        <AppButton title="Cancel" variant="action" disabled={deleting} onPress={() => setConfirmDelete(false)} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  dangerZone: { marginTop: 28, alignItems: "flex-start" },
  confirmText: { color: C.textSoft, fontSize: 14, lineHeight: 20 },
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  back: { color: C.muted, fontSize: 15 },
  readOnlyNote: { color: C.muted, fontSize: 13 },
  actions: { flexDirection: "row", alignItems: "center", gap: 18 },
  actionIcon: { color: C.muted, fontSize: 19 },
  actionOff: { opacity: 0.5 },
  actionText: { color: C.muted, fontSize: 15 },
  actionEdit: { color: C.accent, fontWeight: "700" },
  actionDelete: { color: C.danger, fontWeight: "700" },
  heroChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  ownedBox: { marginTop: 12, alignItems: "flex-start", gap: 6 },
  ownedBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  ownedBtnOn: { borderColor: C.accent, backgroundColor: "#e3aa2622" },
  ownedBtnText: { color: C.text, fontSize: 13, fontWeight: "600" },
  ownedHint: { color: C.muted, fontSize: 12 },
  body: { padding: 16, paddingBottom: 40 },
  error: { color: C.danger, marginTop: 12 },
  hint: { color: C.muted, fontSize: 13 },

  heroRow: { flexDirection: "row", gap: 14 },
  heroArt: {
    width: 120, aspectRatio: 2 / 3, borderRadius: 6, backgroundColor: C.surface,
    overflow: "hidden", alignItems: "center", justifyContent: "center",
  },
  heroArtSquare: { aspectRatio: 1, alignSelf: "flex-start" },
  heroImage: { width: "100%", height: "100%" },
  heroBlur: { position: "absolute", left: -10, right: -10, top: -10, bottom: -10 },
  heroWide: { width: "100%", aspectRatio: 16 / 9 },
  heroIcon: { fontSize: 36 },
  heroText: { flex: 1 },
  coverLink: { alignSelf: "center", paddingVertical: 8, marginTop: -4 },
  typeBadge: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  title: { fontFamily: F.serif, color: C.text, fontSize: 24 },
  meta: { color: C.muted, fontSize: 13, marginTop: 4 },
  contentRating: {
    alignSelf: "flex-start", marginTop: 8, color: C.textSoft, fontSize: 11,
    borderWidth: 1, borderColor: C.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },

  label: { fontFamily: F.mono,
    color: C.muted, fontSize: 11, fontWeight: "600", letterSpacing: 0.5,
    textTransform: "uppercase", marginTop: 22, marginBottom: 10,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  pillText: { color: C.textSoft, fontSize: 13 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  stepperBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  stepperBtnText: { color: C.text, fontSize: 20, lineHeight: 20 },
  ratingValue: { fontSize: 20, fontWeight: "700", minWidth: 44, textAlign: "center" },
  clearText: { color: C.muted, fontSize: 13, textDecorationLine: "underline", marginLeft: 8 },

  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 22, marginTop: 22 },
  stat: {},
  statLabel: { fontFamily: F.mono, color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  statValue: { fontFamily: F.mono, color: C.text, fontSize: 14 },
  statSuffix: { color: C.muted, fontSize: 11, fontWeight: "400" },
  statSub: { color: C.muted, fontSize: 10, marginTop: 2 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  chip: { color: C.text, fontSize: 11, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: "hidden" },
  linkBtn: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 12, paddingVertical: 5 },
  linkText: { fontSize: 11 },

  section: { marginTop: 26 },
  sectionTitle: { fontFamily: F.mono,
    color: C.accent, fontSize: 11, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, paddingBottom: 8, marginBottom: 12,
  },
  description: { color: C.text, fontSize: 14, lineHeight: 21 },

  castRow: { gap: 14 },
  castItem: { width: 76, alignItems: "center" },
  castAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.surface },
  castAvatarEmpty: { alignItems: "center", justifyContent: "center" },
  castInitial: { color: C.muted, fontSize: 22, fontWeight: "700" },
  castName: { color: C.text, fontSize: 11, textAlign: "center", marginTop: 6 },
  castRole: { color: C.muted, fontSize: 10, textAlign: "center" },

  trackRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  trackPos: { width: 26, color: C.muted, fontSize: 12, textAlign: "right" },
  trackTitle: { flex: 1, color: C.text, fontSize: 14 },
  trackDuration: { color: C.muted, fontSize: 12 },

  kv: { flexDirection: "row", justifyContent: "space-between", gap: 16, paddingVertical: 7 },
  kvLabel: { color: C.muted, fontSize: 13 },
  kvValue: { color: C.text, fontSize: 13, flexShrink: 1, textAlign: "right" },
  kvLink: { color: C.accent },

  card: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 14, marginTop: 16 },
  cardTitle: { fontFamily: F.mono, color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  bigNumber: { color: C.text, fontSize: 22, fontWeight: "600" },
  notesInput: { color: C.text, fontSize: 14, minHeight: 80, textAlignVertical: "top", padding: 0 },
});
