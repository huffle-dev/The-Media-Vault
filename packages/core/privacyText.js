// The privacy notice as the phone shows it (Settings -> About -> Privacy notice).
// The full notice for the desktop app is docs/privacy.html; this is the same
// statement written for the phone. Keep the two in step when either changes.

const PRIVACY_UPDATED = "5 October 2026";

const PRIVACY_SECTIONS = [
  {
    title: "The short version",
    paragraphs: [
      "The Media Vault is a personal library for the things you watch, read, play and listen to. Your library stays on your own devices and on a server you set up yourself. The people who make the app run no server, collect nothing about you, and cannot see your library.",
    ],
  },
  {
    title: "What is stored, and where",
    paragraphs: [
      "On this phone: a short log of problems the app ran into (a cover that would not load, an error), which stays on the phone unless you press Send log to my computer (it then goes to your own server, nowhere else) or Share log; your sign-in (encrypted at rest), a saved copy of your library list so it opens with no connection, the details and cover pictures you have looked at, the API keys you pasted or unlocked, and a few settings such as your country for Where to Watch. If you turn on Offline use, it also keeps the details and cover of every item.",
      "On your server: if you set up sync, the library, lists, custom media types, \"not interested\" choices, which items you own, the name of each device you sync from, your API keys (encrypted, so the server only ever holds scrambled text), the colours you chose on desktop, and the cover pictures you upload from the phone. All of it is in a Supabase project that you own and can delete at any time.",
    ],
  },
  {
    title: "What leaves this phone",
    paragraphs: [
      "The app asks other services for information only when you ask it to: TMDB (films and TV), IGDB and Steam (games; Steam also gets your Steam ID and key when you import your library), GOG (only if you turn on its unofficial import and sign in on GOG's own page), Open Library (books and barcodes), BoardGameGeek (board games, read through a hidden web page that only loads when you search for one), Audible and Apple (audiobooks, podcasts), Discogs (music and barcodes), YouTube (videos). If you scan a photo of a shelf, the photo (shrunk) goes to Google Gemini with your own key, and to no one else. Each receives the title, id or barcode you looked up and, where you set one, your key for that service. Picture hosts see your phone's address, as with any web page.",
      "The camera is used only to read a barcode, or to take a photo of a shelf, when you ask. Nothing from the camera is recorded or uploaded except a shelf photo you choose to scan, which goes to Google Gemini as described above. Photos you pick for a cover are shrunk on the phone and uploaded only to your own server.",
      "The app has no analytics, advertising, tracking or crash reporting. \"Send an error report\" and \"Feature request\" only open a pre-filled page in your browser; nothing is sent unless you submit it.",
    ],
  },
  {
    title: "Your choices",
    paragraphs: [
      "Sign out in Settings at any time. Delete your server copy by deleting your Supabase project or its rows. Every key is optional; without one, the part of the app that needs it stays off.",
    ],
  },
];

module.exports = { PRIVACY_UPDATED, PRIVACY_SECTIONS };
