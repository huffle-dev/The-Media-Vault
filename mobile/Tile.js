// A library tile, drawn the way desktop's PosterCard draws one: cover art edge
// to edge in a 2:3 frame, a dark gradient across the bottom carrying the
// title (DM Serif Display), genre, runtime, ratings and year, the type icon
// top-right, a status dot top-left and a content-rating badge for Movie/TV.
// Square-art types (Music, Podcast, Audiobook, Board Game) fill a square tile
// when the Library is filtered to that one type; in the mixed "All" view they
// sit in the same 2:3 frame — the art at its natural 1:1 on top of a blurred,
// dimmed copy of itself, so the frame is never blank.
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Text from "./Text";
import { getCoverArtForItem, recentlyOffline } from "./mediaServices";
import { getEffectiveTypeConfig } from "@media-vault/core/tokens/mediaTypes.js";
import { useLibrary } from "./LibraryContext";
import { reportCoverError, onCoverHealed } from "./coverHealing";
import { diag } from "./diag";
import { formatRating, ratingColor } from "@media-vault/core/tokens/ratings.js";
import { isSquareArt, isWideArt } from "@media-vault/core/tokens/itemHelpers.js";
import { C, F, statusColor } from "./colors";
import { describeItem, selectHint } from "./a11y";

// Resolved cover-art paths (or null, for "looked, nothing available"), keyed
// by sync_id — lives for the app session only, not persisted. Skips even the
// source lookup on every re-render/re-scroll of an already-resolved tile.
const coverArtCache = new Map();

// Lazily resolves and downloads real cover art via getCoverArtForItem the
// first time it's used (a FlatList tile mounts as it scrolls into view),
// sharing the session cache above with every other screen showing the same
// item. undefined = still resolving; null = looked, nothing available.
export function useCoverArt(item, keys) {
  // Keyed by the item AND its cover link, so a replaced cover (new link) is looked up afresh.
  const key = `${item.sync_id}|${item.cover_art_url || ""}`;
  const cached = coverArtCache.get(key);
  const [artUri, setArtUri] = useState(cached !== undefined ? cached : undefined);
  const shownKey = useRef(key);
  const [tick, setTick] = useState(0); // bumped when this cover's saved file was found damaged and removed
  useEffect(() => onCoverHealed((url) => {
    if (url !== item.cover_art_url) return;
    coverArtCache.delete(key);
    setArtUri(undefined);
    setTick((t) => t + 1);
  }), [key]);

  useEffect(() => {
    if (shownKey.current !== key) { shownKey.current = key; setArtUri(coverArtCache.get(key)); }
    if (coverArtCache.get(key) !== undefined) return;
    // Wait for keys to finish loading — otherwise every keyed type would
    // resolve to "no art" and get cached as a miss before its key arrives.
    if (keys === undefined) return;
    let cancelled = false;
    getCoverArtForItem(item, keys, () => cancelled).then((path) => {
      if (path === undefined) return; // scrolled away before it got a turn
      // A miss on an item that HAS a synced link is probably a hiccup (no
      // signal, a slow CDN) — don't remember it, so it retries next time.
      if (path === null && item.cover_art_url && !recentlyOffline()) diag.add("warn", "cover", `No cover shown for ${item.title || "an item"} (${item.media_type}); it has a link but the picture could not be fetched`, item.cover_art_url);
      if (path !== null || !item.cover_art_url) coverArtCache.set(key, path);
      if (!cancelled) setArtUri(path);
    });
    return () => { cancelled = true; };
  }, [key, keys, tick]);

  return artUri;
}

// Desktop's PosterCard sizes.
const FONTS = {
  small: { title: 9, meta: 7, icon: 15 },
  medium: { title: 11, meta: 9, icon: 19 },
  large: { title: 13, meta: 10, icon: 22 },
};
// The shared `runtime` column means different units per type — Book stores
// page count, Game stores hours, everything else stores minutes.
const RUNTIME_UNIT = { Book: "p", Game: "h" };

// critic_rating is a display string like "IMDb 8.4/10 · RT 87% · Metacritic 74"
// or "TMDB 7.9/10 (12,345 votes)" — shorten to just the leading source+score.
const shortCriticRating = (criticRating) =>
  criticRating ? criticRating.split(" · ")[0].replace(/\s*\(.*?\)\s*/, "").trim() : null;

// A type's gradient is a CSS string; pull its stops out for LinearGradient.
const gradientStops = (css) => css.match(/#[0-9a-fA-F]{6}/g) || [C.surface, C.bg];

export function TypeGradient({ type, style }) {
  return <LinearGradient colors={gradientStops(type.gradient)} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={style} />;
}

// `squareTile`: the Library is filtered to a single square-art type, so the
// whole tile is 1:1 and the art fills it. `overlay`: "full" | "no-icon" | "none".
// `onStatusPress`: tapping the status dot (the Library's quick status change).
// `selectMode`/`selected`: the Library's multi-select. A selected tile is dimmed with a tick; while
// selecting, the rest show an empty ring.
export default function Tile({ item, keys, width, tileSize = "medium", overlay = "full", squareTile = false, onPress, onLongPress, selectMode = false, selected = false, onStatusPress }) {
  const artUri = useCoverArt(item, keys);
  const { customTypes } = useLibrary();
  const type = getEffectiveTypeConfig(item, customTypes);
  const fs = FONTS[tileSize] || FONTS.medium;
  const hasArt = !!artUri;
  const squareArt = isSquareArt(item.media_type);
  // A video/playlist thumbnail is 16:9: always shown whole over the blurred
  // copy (even in a square tile) instead of cropped to the middle.
  const wide = isWideArt(item);
  const letterbox = wide || (squareArt && !squareTile);
  const height = squareTile ? width : width * 1.5;

  const showBadges = overlay === "full" || !hasArt;
  const showInfo = overlay !== "none" || !hasArt;
  // A tile with no art yet fades its overlays back unless they're wanted.
  const dimmed = !hasArt && overlay !== "full";

  return (
    <Pressable
      onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={{ width, height, overflow: "hidden", backgroundColor: C.surface }}
      accessibilityRole="button" accessibilityLabel={describeItem(item)} accessibilityHint={selectHint(selectMode, selected)}
      accessibilityState={{ selected }}
    >
      {/* ── Art ── */}
      {letterbox ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: `${type.color}33` }]}>
          {hasArt ? (
            <>
              <Image source={{ uri: artUri }} blurRadius={16} resizeMode="cover" style={styles.blurred} onError={() => reportCoverError(item)} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} />
              <Image source={{ uri: artUri }} resizeMode="cover" style={[styles.sharpSquare, { width, height: wide ? (width * 9) / 16 : width }]} onError={() => reportCoverError(item)} />
            </>
          ) : (
            <TypeGradient type={type} style={{ width, height: wide ? (width * 9) / 16 : width }} />
          )}
        </View>
      ) : hasArt ? (
        <Image source={{ uri: artUri }} resizeMode="cover" style={StyleSheet.absoluteFill} onError={() => reportCoverError(item)} />
      ) : (
        <TypeGradient type={type} style={StyleSheet.absoluteFill} />
      )}

      {/* ── Status dot, top-left ── */}
      {showBadges && (onStatusPress && !selectMode ? (
        // Tap the dot to change the status without opening the item.
        <Pressable onPress={onStatusPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Change status of ${item.title}, now ${item.status}`} style={[styles.dot, { backgroundColor: statusColor(item.status), opacity: dimmed ? 0.35 : 1 }]} />
      ) : (
        <View style={[styles.dot, { backgroundColor: statusColor(item.status), opacity: dimmed ? 0.35 : 1 }]} />
      ))}

      {/* ── Type icon, top-right ── */}
      {showBadges && (
        <Text style={[styles.icon, { fontSize: fs.icon, opacity: dimmed ? 0.35 : 1 }]}>{type.icon}</Text>
      )}

      {/* ── Bottom info ── */}
      {showInfo && (
        <View style={[StyleSheet.absoluteFill, { opacity: !hasArt && overlay === "none" ? 0.35 : 1 }]} pointerEvents="none">
          <LinearGradient
            colors={["transparent", "rgba(5,5,10,0.3)", "rgba(5,5,10,0.96)"]}
            locations={[0, 0.55, 1]}
            style={styles.info}
          >
            <Text style={[styles.title, { fontSize: fs.title }]} numberOfLines={3}>{item.title}</Text>
            {item.genre ? (
              <Text style={[styles.meta, { fontSize: fs.meta, color: type.color }]} numberOfLines={1}>{item.genre}</Text>
            ) : null}
            {item.runtime ? (
              <Text style={[styles.meta, { fontSize: fs.meta, color: C.dim }]}>{item.runtime}{RUNTIME_UNIT[item.media_type] || "m"}</Text>
            ) : null}
            {(item.critic_rating || item.rating != null) && (
              <Text style={[styles.meta, { fontSize: fs.meta, color: C.dim }]} numberOfLines={1}>
                {item.critic_rating ? shortCriticRating(item.critic_rating) : ""}
                {item.critic_rating && item.rating != null ? <Text style={{ color: C.muted }}> - </Text> : ""}
                {item.rating != null ? <Text style={{ color: ratingColor(item.rating) }}>{formatRating(item.rating)}</Text> : ""}
              </Text>
            )}
            {item.year ? <Text style={[styles.meta, { fontSize: fs.meta, color: C.muted }]}>{item.year}</Text> : null}
          </LinearGradient>
        </View>
      )}

      {/* ── Multi-select: dim + tick when selected, an empty ring while selecting ── */}
      {selected && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.selectedWash]} />}
      {(selectMode || selected) && (
        <View pointerEvents="none" style={[styles.ring, selected && styles.ringOn]}>
          {selected && <Text style={styles.tick}>✓</Text>}
        </View>
      )}

      {/* ── Content-rating badge, Movie/TV, bottom-right ── */}
      {showBadges && (item.media_type === "Movie" || item.media_type === "TV") && item.content_rating ? (
        <Text style={[styles.badge, tileSize === "small" ? { top: fs.icon + 10 } : { bottom: 5 }, { opacity: dimmed ? 0.35 : 1 }]}>
          {item.content_rating}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  selectedWash: { backgroundColor: "rgba(227,170,38,0.28)", borderWidth: 2, borderColor: C.accent },
  ring: { position: "absolute", top: 6, left: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(255,255,255,0.8)", backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", zIndex: 5 },
  ringOn: { backgroundColor: C.accent, borderColor: C.accent },
  tick: { color: "#09090e", fontSize: 13, fontWeight: "800", lineHeight: 15 },
  center: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  blurred: { position: "absolute", left: -10, right: -10, top: -10, bottom: -10 },
  sharpSquare: {
    elevation: 8, shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 9, shadowOffset: { width: 0, height: 6 },
  },
  dot: {
    position: "absolute", top: 6, left: 6, width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.35)",
  },
  icon: { position: "absolute", top: 4, right: 5, textShadowColor: "rgba(0,0,0,0.9)", textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  info: { position: "absolute", left: 0, right: 0, bottom: 0, top: 0, justifyContent: "flex-end", paddingHorizontal: 5, paddingTop: 6, paddingBottom: 5, gap: 1 },
  title: {
    fontFamily: F.serif, color: "#fff", marginBottom: 2,
    textShadowColor: "rgba(0,0,0,0.9)", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  meta: { fontFamily: F.mono, letterSpacing: 0.3, textShadowColor: "rgba(0,0,0,0.9)", textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  badge: {
    position: "absolute", right: 5, fontFamily: F.mono, fontSize: 8, color: C.text, letterSpacing: 0.3,
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: C.border,
  },
});
