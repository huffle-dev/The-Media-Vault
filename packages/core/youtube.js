// YouTube Data API v3 integration. Split out of main.js as part of the
// code-organization plan. Factory (createYoutubeService(storage)) — see
// packages/core/movie.js's header comment for why.
//
// A "Web Video" item is one of three kinds, told apart by its platform_id
// (no schema column): a channel keeps the bare channel id it always had
// ("UC…"), a single video is "video-<id>", a playlist is "playlist-<id>".
//
// API quota (10,000 units/day): search costs 100, everything else here costs
// 1 — so pasting a link (parseYoutubeInput + a by-id lookup) is the cheap
// way in, and search results are enriched with ONE batched by-id call.

const { formatCount } = require("@media-vault/core/format");
const { fetchWithTimeout: fetch } = require("@media-vault/core/fetchWithTimeout");

const API = "https://www.googleapis.com/youtube/v3";
const VIDEO_PREFIX = "video-";
const PLAYLIST_PREFIX = "playlist-";

// "channel" | "video" | "playlist" for a stored platform_id.
function youtubeKind(platformId) {
  const p = String(platformId || "");
  if (p.startsWith(VIDEO_PREFIX)) return "video";
  if (p.startsWith(PLAYLIST_PREFIX)) return "playlist";
  return "channel";
}

// The page a platform_id lives at.
function youtubeUrl(platformId) {
  const p = String(platformId || "");
  const kind = youtubeKind(p);
  if (kind === "video") return `https://www.youtube.com/watch?v=${p.slice(VIDEO_PREFIX.length)}`;
  if (kind === "playlist") return `https://www.youtube.com/playlist?list=${p.slice(PLAYLIST_PREFIX.length)}`;
  return `https://www.youtube.com/channel/${p}`;
}

// Anything a person might paste: a video / shorts / live / embed / youtu.be
// link, a playlist link, a channel link (/channel/UC…, /@handle, legacy
// /c/ and /user/ names) or a bare @handle. Returns
//   { kind: "video"|"playlist"|"channel", id }   — id known
//   { kind: "handle", handle } / { kind: "name", name } — needs a lookup
// or null when it isn't a YouTube reference. A watch link that also carries
// &list= is the video (the thing actually being looked at).
function parseYoutubeInput(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const bareHandle = /^@([\w.-]{3,})$/.exec(text);
  if (bareHandle) return { kind: "handle", handle: bareHandle[1] };
  if (/^UC[\w-]{22}$/.test(text)) return { kind: "channel", id: text };

  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|music)\./i, "").toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return /^[\w-]{11}$/.test(parts[0] || "") ? { kind: "video", id: parts[0] } : null;
  if (host !== "youtube.com") return null;

  const v = url.searchParams.get("v");
  if (parts[0] === "watch" && /^[\w-]{11}$/.test(v || "")) return { kind: "video", id: v };
  if (["shorts", "live", "embed", "v"].includes(parts[0]) && /^[\w-]{11}$/.test(parts[1] || "")) return { kind: "video", id: parts[1] };
  if (parts[0] === "playlist" && url.searchParams.get("list")) return { kind: "playlist", id: url.searchParams.get("list") };
  if (parts[0] === "channel" && /^UC[\w-]{22}$/.test(parts[1] || "")) return { kind: "channel", id: parts[1] };
  const handle = parts[0] && /^@([\w.-]+)$/.exec(parts[0]);
  if (handle) return { kind: "handle", handle: handle[1] };
  if ((parts[0] === "c" || parts[0] === "user") && parts[1]) return { kind: "name", name: parts[1] };
  return null;
}

// PT1H2M3S -> seconds.
function parseIsoDuration(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ""));
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => (x ? parseInt(x, 10) : 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

// "12:34" / "1:02:03" for a result row.
function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

module.exports = function createYoutubeService(storage) {

const NO_KEY = "No YouTube Data API key set — add one in Settings ⚙ to search YouTube.";

async function api(path, params, apiKey, failMsg) {
  if (!apiKey) throw new Error(NO_KEY);
  const qs = new URLSearchParams({ ...params, key: apiKey });
  const res = await fetch(`${API}/${path}?${qs}`);
  const data = await res.json();
  if (!res.ok) {
    const reason = data.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") throw new Error("YouTube's daily quota is used up — it resets at midnight Pacific time.");
    throw new Error(data.error?.message || failMsg);
  }
  return data;
}

// Largest first. maxres only exists for some videos and a listed size can
// still 404, so callers try each in turn (saveThumb) rather than trusting the
// first.
const thumbCandidates = (t) => ["maxres", "standard", "high", "medium", "default"].map((k) => t?.[k]?.url).filter(Boolean);
const smallThumb = (t) => t?.medium?.url || t?.default?.url || null;

// Search. kind: "channel" (default) or "video". Results are enriched with one
// batched by-id call (1 unit) so a row can say "412K subscribers" or
// "12:34 · Some Channel" and show a real picture.
async function searchYoutube(query, apiKey, kind = "channel") {
  const type = kind === "video" ? "video" : "channel";
  const data = await api("search", { part: "snippet", type, maxResults: 24, q: query }, apiKey, "YouTube search failed.");
  const items = data.items || [];
  if (!items.length) return [];
  const ids = items.map((i) => (type === "video" ? i.id.videoId : i.id.channelId)).filter(Boolean);

  let stats = new Map();
  try {
    const detail = type === "video"
      ? await api("videos", { part: "contentDetails,statistics", id: ids.join(",") }, apiKey, "")
      : await api("channels", { part: "statistics", id: ids.join(",") }, apiKey, "");
    stats = new Map((detail.items || []).map((d) => [d.id, d]));
  } catch { /* the plain results still work without the extra detail */ }

  return items.map((item) => {
    const id = type === "video" ? item.id.videoId : item.id.channelId;
    const d = stats.get(id);
    let detailText = null;
    if (type === "video") {
      const dur = formatDuration(parseIsoDuration(d?.contentDetails?.duration));
      detailText = [dur, item.snippet.channelTitle].filter(Boolean).join(" · ") || null;
    } else if (d?.statistics) {
      detailText = d.statistics.hiddenSubscriberCount ? null : `${formatCount(d.statistics.subscriberCount)} subscribers`;
    }
    const platformId = type === "video" ? `${VIDEO_PREFIX}${id}` : id;
    return {
      platformId,
      title:        item.snippet.title,
      type,
      storeUrl:     youtubeUrl(platformId),
      storeLabel:   "YouTube ↗",
      thumbnailUrl: smallThumb(item.snippet.thumbnails),
      detail:       detailText,
    };
  });
}

// Back-compat name (coverArtLookup, older callers).
const searchYoutubeChannels = (query, apiKey) => searchYoutube(query, apiKey, "channel");

async function saveThumb(thumbnails, name) {
  const destPath = storage.joinPath(storage.coverArtDir(), name);
  for (const url of thumbCandidates(thumbnails)) {
    try {
      await storage.ensureImage(url, destPath);
      return destPath;
    } catch { /* try the next size */ }
  }
  return null; // no art
}

// One channels.list item -> the fields we store (art is saved separately).
function channelFields(channel, cover_art_path) {
  return {
    title:         channel.snippet.title,
    media_type:    "Web Video",
    platform_id:   channel.id,
    creator:       channel.snippet.title,
    platform:      "YouTube",
    language:      channel.snippet.defaultLanguage || null,
    subscribers:   channel.statistics?.hiddenSubscriberCount ? "Hidden" : formatCount(channel.statistics?.subscriberCount),
    video_count:   channel.statistics?.videoCount ? parseInt(channel.statistics.videoCount, 10) : null,
    year:          channel.snippet.publishedAt ? parseInt(channel.snippet.publishedAt.slice(0, 4), 10) : null,
    notes:         channel.snippet.description || null,
    url:           youtubeUrl(channel.id),
    cover_art_path,
  };
}

async function getYoutubeChannelDetails(platformId, apiKey) {
  const data = await api("channels", { part: "snippet,statistics", id: platformId }, apiKey, "YouTube lookup failed.");
  const channel = data.items?.[0];
  if (!channel) throw new Error("Channel not found on YouTube.");
  const cover_art_path = await saveThumb(channel.snippet.thumbnails, `youtube-${channel.id}.jpg`);
  return channelFields(channel, cover_art_path);
}

// Many channels at once: ONE request per 50 ids (1 quota unit), not one each.
// Returns Map(channel id -> fields). `artFor` lists the ids whose picture
// should be downloaded too (only those missing one); the rest come back with
// cover_art_path null. A channel that no longer exists is simply absent.
async function getYoutubeChannelsBatch(ids, apiKey, { artFor = [] } = {}) {
  const wantArt = new Set(artFor);
  const out = new Map();
  const unique = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += 50) {
    const data = await api("channels", { part: "snippet,statistics", id: unique.slice(i, i + 50).join(",") }, apiKey, "YouTube lookup failed.");
    for (const channel of data.items || []) {
      const art = wantArt.has(channel.id) ? await saveThumb(channel.snippet.thumbnails, `youtube-${channel.id}.jpg`) : null;
      out.set(channel.id, channelFields(channel, art));
    }
  }
  return out;
}

async function getYoutubeVideoDetails(platformId, apiKey) {
  const id = String(platformId).slice(VIDEO_PREFIX.length);
  const data = await api("videos", { part: "snippet,contentDetails,statistics", id }, apiKey, "YouTube lookup failed.");
  const v = data.items?.[0];
  if (!v) throw new Error("Video not found on YouTube (it may be private or removed).");

  const seconds = parseIsoDuration(v.contentDetails?.duration);
  const cover_art_path = await saveThumb(v.snippet.thumbnails, `youtube-${VIDEO_PREFIX}${id}.jpg`);
  return {
    title:       v.snippet.title,
    media_type:  "Web Video",
    platform_id: `${VIDEO_PREFIX}${id}`,
    creator:     v.snippet.channelTitle || null,
    platform:    "YouTube",
    language:    v.snippet.defaultAudioLanguage || v.snippet.defaultLanguage || null,
    runtime:     seconds ? Math.max(1, Math.round(seconds / 60)) : null, // minutes, like every other type
    year:        v.snippet.publishedAt ? parseInt(v.snippet.publishedAt.slice(0, 4), 10) : null,
    subscribers: v.statistics?.viewCount ? `${formatCount(v.statistics.viewCount)} views` : null,
    notes:       v.snippet.description || null,
    url:         youtubeUrl(`${VIDEO_PREFIX}${id}`),
    cover_art_path,
  };
}

async function getYoutubePlaylistDetails(platformId, apiKey) {
  const id = String(platformId).slice(PLAYLIST_PREFIX.length);
  const data = await api("playlists", { part: "snippet,contentDetails", id }, apiKey, "YouTube lookup failed.");
  const p = data.items?.[0];
  if (!p) throw new Error("Playlist not found on YouTube (it may be private or removed).");

  const cover_art_path = await saveThumb(p.snippet.thumbnails, `youtube-${PLAYLIST_PREFIX}${id}.jpg`);
  return {
    title:       p.snippet.title,
    media_type:  "Web Video",
    platform_id: `${PLAYLIST_PREFIX}${id}`,
    creator:     p.snippet.channelTitle || null,
    platform:    "YouTube",
    video_count: p.contentDetails?.itemCount ?? null,
    year:        p.snippet.publishedAt ? parseInt(p.snippet.publishedAt.slice(0, 4), 10) : null,
    notes:       p.snippet.description || null,
    url:         youtubeUrl(`${PLAYLIST_PREFIX}${id}`),
    cover_art_path,
  };
}

// Full details for any stored/search platform_id — the one entry point the
// details and cover-art lookups call.
function getYoutubeDetails(platformId, apiKey) {
  const kind = youtubeKind(platformId);
  if (kind === "video") return getYoutubeVideoDetails(platformId, apiKey);
  if (kind === "playlist") return getYoutubePlaylistDetails(platformId, apiKey);
  return getYoutubeChannelDetails(platformId, apiKey);
}

// A pasted link/handle -> one search-result row (or null if it isn't a
// YouTube reference). Costs 1 unit; a handle or legacy name needs one extra
// lookup to find its channel.
async function resolveYoutubeInput(raw, apiKey) {
  const ref = parseYoutubeInput(raw);
  if (!ref) return null;
  let platformId;
  if (ref.kind === "video") platformId = `${VIDEO_PREFIX}${ref.id}`;
  else if (ref.kind === "playlist") platformId = `${PLAYLIST_PREFIX}${ref.id}`;
  else if (ref.kind === "channel") platformId = ref.id;
  else {
    const data = await api("channels", ref.kind === "handle" ? { part: "id", forHandle: `@${ref.handle}` } : { part: "id", forUsername: ref.name }, apiKey, "YouTube lookup failed.");
    const found = data.items?.[0]?.id;
    if (!found) {
      if (ref.kind === "name") throw new Error("That older-style channel link can't be looked up — paste the channel's @handle link instead.");
      throw new Error("No YouTube channel found for that handle.");
    }
    platformId = found;
  }
  const d = await getYoutubeDetails(platformId, apiKey);
  return {
    platformId,
    title:        d.title,
    type:         youtubeKind(platformId),
    storeUrl:     youtubeUrl(platformId),
    storeLabel:   "YouTube ↗",
    thumbnailUrl: d.cover_art_path ? `file://${d.cover_art_path}` : null,
    detail:       d.creator && youtubeKind(platformId) !== "channel" ? d.creator : (d.subscribers || null),
  };
}

// ── New uploads from the channels in the library ──────────────────────────
// A channel's uploads playlist id is its channel id with the leading "UC"
// swapped for "UU" — no lookup needed — and playlistItems costs 1 unit, so
// checking N channels costs N units (+1 per 50 videos for their durations).
const uploadsPlaylistId = (channelId) => "UU" + String(channelId).slice(2);
const SHORTS_MAX_SECONDS = 60;

async function getChannelUploads(channelId, apiKey, max = 5) {
  const data = await api("playlistItems", { part: "snippet", playlistId: uploadsPlaylistId(channelId), maxResults: max }, apiKey, "YouTube lookup failed.");
  return (data.items || [])
    .filter((i) => i.snippet?.resourceId?.videoId && i.snippet.title !== "Private video" && i.snippet.title !== "Deleted video")
    .map((i) => ({
      videoId:     i.snippet.resourceId.videoId,
      title:       i.snippet.title,
      publishedAt: i.snippet.publishedAt || null,
      channelId,
      channelTitle: i.snippet.videoOwnerChannelTitle || i.snippet.channelTitle || null,
      thumbnailUrl: smallThumb(i.snippet.thumbnails),
    }));
}

// Discover's "New from your channels": the latest uploads of the channels in
// `items`, newest first, minus videos already in the library or dismissed,
// minus Shorts and not-yet-live premieres. Shaped like every other
// discovery work ({ id, title, year, mediaType, coverUrl, genre }) so the
// existing tiles, quick-add and dismiss work unchanged. Returns
// { items, reason } with reason "no_key" or "no_channels" when empty for
// that cause. Channels with no rating are checked too, but rated ones first;
// capped so a huge channel list can't burn the daily quota.
async function getYoutubeNewUploads(items, dismissals, apiKey, { maxChannels = 25, perChannel = 5, limit = 60, concurrency = 5 } = {}) {
  if (!apiKey) return { items: [], reason: "no_key" };
  const channels = (items || [])
    .filter((i) => i.media_type === "Web Video" && i.platform_id && youtubeKind(i.platform_id) === "channel" && !i.is_hidden)
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || (b.id ?? 0) - (a.id ?? 0))
    .slice(0, maxChannels);
  if (!channels.length) return { items: [], reason: "no_channels" };

  const owned = new Set((items || []).filter((i) => i.media_type === "Web Video").map((i) => String(i.platform_id)));
  const dismissed = new Set((dismissals || []).filter((d) => d.media_type === "Web Video").map((d) => String(d.tmdb_id)));

  const found = [];
  const queue = [...channels];
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const ch = queue.shift();
      try { found.push(...await getChannelUploads(ch.platform_id, apiKey, perChannel)); } catch { /* one channel failing shouldn't blank the rest */ }
    }
  }));

  const fresh = found
    .filter((v) => !owned.has(`${VIDEO_PREFIX}${v.videoId}`) && !dismissed.has(`${VIDEO_PREFIX}${v.videoId}`))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .slice(0, limit);

  // Durations in batches of 50 — drops Shorts and unstarted premieres.
  const keep = new Set();
  try {
    for (let i = 0; i < fresh.length; i += 50) {
      const batch = fresh.slice(i, i + 50);
      const d = await api("videos", { part: "contentDetails", id: batch.map((v) => v.videoId).join(",") }, apiKey, "");
      for (const v of d.items || []) {
        const secs = parseIsoDuration(v.contentDetails?.duration);
        if (secs && secs > SHORTS_MAX_SECONDS) keep.add(v.id);
      }
    }
  } catch { fresh.forEach((v) => keep.add(v.videoId)); /* durations are a nicety; show everything if they fail */ }

  return {
    items: fresh.filter((v) => keep.has(v.videoId)).map((v) => ({
      id: `${VIDEO_PREFIX}${v.videoId}`,
      title: v.title,
      year: v.publishedAt ? parseInt(v.publishedAt.slice(0, 4), 10) : null,
      mediaType: "Web Video",
      coverUrl: v.thumbnailUrl,
      genre: v.channelTitle,
      channelId: v.channelId,
      channelTitle: v.channelTitle,
      publishedAt: v.publishedAt,
    })),
    reason: null,
  };
}

// One channel's latest uploads, as works for the profile's "More from" row.
async function getYoutubeRecentUploads(channelId, items, apiKey, max = 12) {
  if (!apiKey) return [];
  const owned = new Set((items || []).filter((i) => i.media_type === "Web Video").map((i) => String(i.platform_id)));
  const vids = await getChannelUploads(channelId, apiKey, max);
  return vids.filter((v) => !owned.has(`${VIDEO_PREFIX}${v.videoId}`)).map((v) => ({
    id: `${VIDEO_PREFIX}${v.videoId}`, title: v.title, mediaType: "Web Video", coverUrl: v.thumbnailUrl, genre: v.channelTitle,
    publishedAt: v.publishedAt,
    year: v.publishedAt ? parseInt(v.publishedAt.slice(0, 4), 10) : null,
  }));
}

return {
  getYoutubeNewUploads, getYoutubeRecentUploads, getChannelUploads,
  searchYoutube, searchYoutubeChannels, getYoutubeDetails, getYoutubeChannelDetails,
  getYoutubeVideoDetails, getYoutubePlaylistDetails, getYoutubeChannelsBatch, resolveYoutubeInput,
  parseYoutubeInput, youtubeKind, youtubeUrl,
};

}; // end createYoutubeService

// The pure helpers need no storage — usable without building the service
// (tests, the profile's "Open on YouTube" link).
module.exports.parseYoutubeInput = parseYoutubeInput;
module.exports.youtubeKind = youtubeKind;
module.exports.youtubeUrl = youtubeUrl;
module.exports.parseIsoDuration = parseIsoDuration;
module.exports.formatDuration = formatDuration;
