// Who supplies the data this app shows, and the wording each of them asks for.
// Shown in Help → About & credits (modals/AboutModal.jsx). Plain data so a test
// can check every entry is complete and the sources that REQUIRE a particular
// statement still carry it.
//
// Note for a public release (docs/release-checklist.md): TMDB also requires its
// logo to appear with this statement; the logo is a TMDB asset and is added
// from their brand page at that point.

const CREDITS = [
  {
    name: "TMDB", url: "https://www.themoviedb.org",
    text: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    uses: "Movie and TV search, posters, cast, streaming availability and recommendations.",
    required: true,
  },
  {
    name: "YouTube", url: "https://www.youtube.com",
    text: "Web Video search and channel details use YouTube API Services. By using them you are bound by the YouTube Terms of Service and the Google Privacy Policy.",
    uses: "Channels, videos and playlists.",
    links: [
      { label: "YouTube Terms of Service", url: "https://www.youtube.com/t/terms" },
      { label: "Google Privacy Policy", url: "https://policies.google.com/privacy" },
    ],
    required: true,
  },
  {
    name: "IGDB", url: "https://www.igdb.com",
    text: "Game details are powered by IGDB.com (a Twitch company).",
    uses: "Game search, details and similar games.",
    required: true,
  },
  {
    name: "Steam", url: "https://store.steampowered.com",
    text: "Powered by Steam. Steam and the Steam logo are trademarks of Valve Corporation.",
    uses: "Your Steam library, store search, game details and artwork.",
    required: true,
  },
  {
    name: "Discogs", url: "https://www.discogs.com",
    text: "Music data provided by Discogs. This application uses Discogs' API but is not affiliated with, sponsored or endorsed by Discogs. \"Discogs\" is a trademark of Zink Media, LLC.",
    uses: "Album search, details and tracklists.",
    required: true,
  },
  {
    name: "Apple", url: "https://www.apple.com",
    text: "Podcast, music and audiobook search results come from the iTunes Search API, provided by Apple.",
    uses: "Podcast search and details, music and audiobook artwork.",
  },
  {
    name: "Open Library", url: "https://openlibrary.org",
    text: "Book data from Open Library, a project of the Internet Archive.",
    uses: "Book search, details, covers and similar books.",
  },
  {
    name: "Audible", url: "https://www.audible.com",
    text: "Audiobook details and artwork come from Audible's public catalog. This app is not affiliated with or endorsed by Audible.",
    uses: "Audiobook search, details and covers.",
  },
  {
    name: "BoardGameGeek", url: "https://boardgamegeek.com",
    text: "Board game data from BoardGameGeek.",
    uses: "Board game search, details and covers.",
  },
  {
    name: "GOG", url: "https://www.gog.com",
    text: "Optional, unofficial GOG library import (off until you turn it on). It uses the same app credentials GOG's own Galaxy launcher uses; this app is not affiliated with or endorsed by GOG.",
    uses: "Your GOG library.",
  },
  {
    name: "Supabase", url: "https://supabase.com",
    text: "Syncing between your devices runs through a Supabase project that you create and own.",
    uses: "Sync, your encrypted API keys and cover thumbnails — all in your own project.",
  },
];

module.exports = { CREDITS };
