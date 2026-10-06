# Movies & TV in The Media Vault

What the app can do with a movie or TV item, how it gets its data, and where the sharp edges are. Describes current behaviour, not history.

## Orientation

The Media Vault tracks a personal media library across many types (movies, TV, books, games, music, board games…). Movies and TV are the most built-out: they're the only types with cast, streaming availability, and a recommendations engine.

**One external source powers everything here**, free, needing a key set in Settings → API Keys:

| | Role | Cost / limits |
|---|---|---|
| **TMDB** | Search, metadata, cast, trailers, collections, streaming availability, Discover. | Free, no daily cap |

Without a TMDB key, search, metadata fetch, ratings, Discover, and Where to Watch are all unavailable. (OMDB was the original fallback source here — backed by IMDb, the only source of IMDb / Rotten Tomatoes / Metacritic scores — but was removed 2026-09-23 in favor of TMDB alone; see BACKLOG.md. Items added while OMDB was still active keep whatever it fetched, covered under *Legacy OMDB items* below.)

**An item's lifecycle:** get it in (search / manual / CSV) → enrich it with metadata → track it via status and rating → find it again via filters → export or delete.

**Status values:** Wishlist · Not Started · In Progress · Consumed · Dropped. Toggling "Owned Locally" on auto-promotes Wishlist → Not Started (and reverses when toggled off). Rating (−10 to +10) only appears once status is Consumed or Dropped.

---

## 1. Getting items in

**Search Online** — the Search modal's Movies/TV tabs. Queries TMDB. Result cards show a thumbnail, "Title (Year)", and a type badge — no rating, since that only arrives with full details after you pick a result. Selecting one pre-fills the Add modal; nothing saves until you confirm.

**Manual entry** — every field is a plain input. A title alone is enough; enrich or fill in the rest later.

**CSV import** — IMDb's own ratings/watchlist export is auto-detected and mapped:

| IMDb column | → Media Vault field |
|---|---|
| `Title Type` | `media_type` — `movie`/`tv movie`/`short`/`video` → Movie; `tv series`/`tv mini series`/`tv short`/`tv episode`/`tv special` → TV |
| `Your Rating` (1–10) | `rating`, as `stored = imdb × 2 + 1` (IMDb 5 → neutral, 10 → +10, 1 → −8) |
| `Date Rated` | `date_consumed` (rated items only) |
| `Directors` | `creator` |
| `Genres` | `genre` — **first genre only** |
| `Const` (`tt…` id) | builds `imdb_url` |
| `Title` · `Year` · `Runtime (mins)` | `title` · `year` · `runtime` |

Rated rows import as Consumed, unrated as Wishlist. Everything else — cast, critic ratings, content rating, country, language, trailer, network, season count, cover art, platform id — arrives blank, waiting on a metadata fetch. Any other CSV goes through manual column mapping instead, which *can* carry those fields; IMDb's export simply doesn't include them.

Duplicates are detected by IMDb id → platform id + type → title + type, and **skipped rather than overwritten**. No metadata lookup runs during import itself (unlike Steam games, which enrich inline).

---

## 2. Metadata & enrichment

An item's `platform_id` is a plain TMDB numeric id. (A `tt1234567`-shaped id means the item is a **legacy OMDB item** — added before OMDB was removed — see below.) TMDB's payload: cast with name/character/photo (top 6), its own 0–10 critic score, trailer, collection/series (Movie only), network (TV), and a US-certification content rating.

TMDB has no Rotten Tomatoes or Metacritic score, and no IMDb rating of its own — `imdb_rating`, `rotten_tomatoes_rating`, and `metacritic_rating` simply stay blank for anything fetched via TMDB. Those columns still exist and still display when already populated, because legacy OMDB items have them.

**Three ways to refresh**, differing only in how aggressive they are:

| Control | Where | Behaviour |
|---|---|---|
| **Fetch Info** | Add/Edit modal | Fills **blank fields only** — never overwrites your typing |
| **Force Refresh** | Add/Edit modal | Overwrites everything the source returns. Confirmation-gated |
| **Force Resync (↻)** | Item Profile | Same overwrite, one click, no modal |

Fetch Info's "blank fields only" rule has three deliberate exceptions that always refresh: `platform_id` (a system identifier, never hand-edited), `cast_list` (so items on the old names-only format upgrade to the photo format automatically), and the derived rating numbers plus `metadata_checked_date`. Everything else — including a Force Refresh/Resync — never blanks a field the source doesn't have data for; a fetch degrades to "leaves it alone," not "wipes it."

**Legacy OMDB items.** Any item added while OMDB was still the fallback source (before 2026-09-23) may hold an IMDb-shaped `tt1234567` id instead of a TMDB numeric one, and may already have IMDb/Rotten Tomatoes/Metacritic ratings OMDB supplied at the time. Nothing fetches new OMDB data anymore, but a Fetch Info/Force Refresh/Force Resync on one of these items still resolves that legacy id to a real TMDB id first — via TMDB's own `/find` endpoint, an exact lookup, not a fuzzy title match — and swaps it in silently before fetching TMDB's details. This is what retroactively unlocks *Similar To* and *Where to Watch*, both of which require a TMDB id, and it needs only a TMDB key (never an OMDB one). If TMDB can't resolve the legacy id (rare — it means TMDB has no record linking that specific IMDb id), the fetch fails with an explicit error rather than silently doing nothing.

**Provenance** is shown on the Item Profile's Library Info card: *Last enriched* (stamped by every real fetch path) and *Source* (derived from the id shape, not stored — a legacy `tt…` id still displays as "OMDB" here, since that's factually where it came from). Both stay blank for an item that's never been fetched.

---

## 3. Viewing & editing an item

The Item Profile page, top to bottom:

- **Hero** — poster, type/ownership/status chips, inline-editable personal rating, critic scores, content rating, genre pills, and Favourite / Add to List / IMDB / Trailer actions.
- **Cast** — avatars with photo, initials as fallback. Clicking a name searches the whole library for it (not scoped to Movies/TV).
- **Description** (auto-filled synopsis) and **Personal Notes** (never auto-filled).
- **Details grid** — Director/Creator, Writer, Composer, Studio, Network (TV), Genre, Year, Runtime, Budget/Box Office (Movie), Country, Language, Critic Rating, Content Rating, IMDB/Trailer URLs, Series, Series Order, Tags. Blank fields are hidden rather than shown empty.
- **Where to Watch** — live TMDB streaming/rent/buy for your region, with its own refresh. Hidden when there's nothing to show.
- **Library Info** (added / completed / last enriched / source) and **Lists** membership.

**Critic scores** display conditionally: IMDb, Rotten Tomatoes, and Metacritic together when any exist; otherwise TMDB's own score alone as a fallback — never both sets at once. Your personal rating sits separately and is always shown.

**Three discovery rows** sit at the bottom, widening in scope:

| Row | Scope | Notes |
|---|---|---|
| More From [Director/Creator] | Same person | Movie uses the Director credit; TV uses Creator, which TMDB populates less reliably — so this can be legitimately empty |
| More In [Series] | TMDB collection | **Movie only** — TV has no collection concept. Release order |
| Similar To [Title] | TMDB's recommendations | Broadest of the three |

All three quick-add, and detect "already in your library" by **TMDB id first, title as fallback**. The id-first ordering exists because TMDB can rename a title after you've added it — a real case here: a show added as *The Black Adder* is now *Blackadder* upstream, which title-only matching would miss.

**Editing** covers the whole Details grid plus status, rating, dates, and — when Owned Locally is set — video quality and a local folder path. One subtlety: cast is edited as plain comma-separated names, and leaving it untouched preserves the richer photo/character data underneath. Editing that text downgrades it to names only.

---

## 4. Finding things

| Filter / sort | Notes |
|---|---|
| Genre | Shared comma-separated field, scoped to the active tab |
| Age Rating | Effectively Movies/TV-only — no other type has `content_rating` |
| **Where to Watch** | Movies/TV-only, and the only filter that does live network work |
| Sort: Critic Rating | Blanks always sort last, in either direction |
| Sort: Year, Runtime, Series | Runtime = minutes (Movie) / avg episode length (TV) |
| Tags | Searchable from the top bar alongside title/creator/cast |

**Where to Watch** deserves a note: it needs a region and at least one provider checked in Settings (the provider list comes from TMDB's real per-region catalogue). Selecting one triggers a live availability check across the current view only — not the whole library — with progress feedback. Results cache per item as a whole-country map, so changing regions later doesn't refetch anything already checked.

---

## 5. Discover

A dedicated tab with two independent toggles: **Movies/TV** and **Recommended/Trending**. The pair persists — switching type keeps your Recommended/Trending choice.

- **Recommended** — seeded from every movie/show you've rated positively, up to 40 *per type* (so up to 80 seeds; movies and TV don't compete for slots), each run through TMDB's per-title recommendations. A title's score is the sum of how much you liked each seed that recommends it, so titles several favourites point to — weighted by how much you liked each one — rank above ones only a lukewarm seed shares.
- **Trending** — TMDB's own weekly feed, not personalised.

Both pools exclude anything already in your library. Grids render whole rows only (measured against actual rendered columns, never ragged), with "Show More" revealing the rest of the already-fetched pool — no extra network call.

Adding from Discover leaves the tile in place with a permanent checkmark, linking through to the real item. The **−** button hides a title permanently across restarts; there's currently no in-app undo (a hidden-items settings page is backlogged).

---

## 6. Stats, export & housekeeping

**Stats** — five Movies/TV-exclusive charts, each rendered as a side-by-side pair: status breakdown, genre breakdown, personal-rating distribution, critic-rating distribution, and age-rating breakdown. Clicking any of them jumps back to the library pre-filtered to match. The remaining charts are cross-type and simply include Movies/TV.

**Organisation** — lists, favourites, tags, and bulk actions (status, owned flag, add to list, export, delete) are all fully generic; nothing here is Movies/TV-specific, and a single list can mix a film with a book with a board game.

**Export** — CSV covering every field above. Three things are excluded by policy: the local file path (not portable between machines), cached Where-to-Watch data (meaningless once stale), and created/updated timestamps (bookkeeping, not user data).

**Deletion** — optionally removes the cover art file too, guarded so a file still referenced by another item is never deleted out from under it. Two items can legitimately share one file when neither had an external id at fetch time.

---

## Gotchas & known gaps

- **Force Refresh/Force Resync can rename an item.** Title is included in the overwrite now, so if the source's title has changed since you added it (see the Blackadder case above), refreshing picks up the new one. Deliberate — most items arrive via Search Online or CSV, not hand-typed, so there's rarely a chosen title worth protecting.
- **No undo on a Discover dismissal.** Permanent, no UI to reverse it yet.
- **"More From Creator" resolves people by name each time** — no cached person id, so a very common name can occasionally surface the wrong person's filmography.
- **TV creator credits are patchy upstream.** An empty "More From" row on a TV show usually reflects TMDB's data, not a bug.
- **Top-bar counts ignore the Where to Watch filter** (they do respect Owned/Rated). Known and logged.
- **Not applicable to Movies/TV:** HowLongToBeat (games only). Fullscreen Scroll Mode works but has no type-specific behaviour. Recommendations are deliberately scoped to Movies/TV only — see BACKLOG.md's *Deliberately Skipped* table for the reasoning.
