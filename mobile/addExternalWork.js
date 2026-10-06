// Turning a "work" tile from Discover or an item profile's related rows —
// a title from a source's own catalog, not yet in the library — into a real
// library item. `work` is the shape the shared services return
// ({ id, mediaType, title, year, poster_path | coverId | coverUrl, ... }).
import { movie, openLibrary, audible, podcast, discogs, steam, igdb, youtube } from "./mediaServices";
import { addItemToLibrary } from "./addToLibrary";

// Best available poster for a work tile, whichever source it came from.
export function workPosterUrl(work) {
  if (work.poster_path) return `https://image.tmdb.org/t/p/w342${work.poster_path}`;
  if (work.coverId) return `https://covers.openlibrary.org/b/id/${work.coverId}-M.jpg`;
  return work.coverUrl || null;
}

// Full details for a work — the same detail-fetch Search & Add's preview uses
// for that type. `keys` is useApiKeys()'s resolved object. Throws if the
// source can't be reached or a needed key is missing.
export async function fetchWorkDetails(work, keys) {
  const type = work.mediaType;
  const id = String(work.id);
  switch (type) {
    case "Movie": case "TV":
      if (!keys.tmdb) throw new Error("Needs your TMDB key — unlock it in Settings → API keys & sync.");
      return movie.fetchTmdbMovieDetails(type, id, keys.tmdb);
    case "Book":
      return openLibrary.resolveOpenLibraryBookDetails({ platformId: id, mediaType: "Book", creator: work.creator, year: work.year });
    case "Audiobook":
      return audible.getAudibleBookDetails(id);
    case "Music":
      return discogs.fetchDiscogsReleaseDetails(id, keys.discogs);
    case "Podcast":
      return podcast.fetchApplePodcastDetails(id);
    case "Web Video":
      if (!keys.youtube) throw new Error("Needs your YouTube key — unlock it in Settings → API keys & sync.");
      return youtube.getYoutubeDetails(id, keys.youtube);
    case "Game": {
      if (work.source === "igdb") {
        if (!(keys.igdbId && keys.igdbSecret)) throw new Error("Needs your IGDB keys — unlock them in Settings → API keys & sync.");
        return igdb.getIgdbGameDetailsById(id, keys.igdbId, keys.igdbSecret);
      }
      const [base, cover] = await Promise.all([steam.getSteamGameDetailsById(id, "game"), steam.ensureSteamCover(id)]);
      return { ...base, cover_art_path: cover };
    }
    default:
      throw new Error(`Can't add a ${type} from here.`);
  }
}

export async function addWorkToLibrary(work, keys) {
  const details = await fetchWorkDetails(work, keys);
  await addItemToLibrary({ mediaType: work.mediaType, title: work.title, platformId: String(work.id), details });
}
