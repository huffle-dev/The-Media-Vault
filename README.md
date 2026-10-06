# The Media Vault

A personal library for everything you watch, read, play and listen to: movies, TV, books,
audiobooks, games, music, podcasts, board games, web videos and more. A **Windows** app with an
**Android** companion. Your library lives on your own computer and works offline; syncing to your
phone runs through a free server you create yourself, so nobody else ever holds your data.

Free and open source ([MIT](LICENSE)). No account with the makers, no ads, no tracking.

**[Try it in your browser](https://huffle-dev.github.io/The-Media-Vault/)**: the real Windows and phone apps running on a sample library of public-domain and open-source works (nothing is saved).

## Download

Go to the [latest release](https://github.com/huffle-dev/The-Media-Vault/releases/latest) and take:

- **Windows:** `TheMediaVault-Setup-<version>.exe`. Run it; your library is kept when you update or uninstall.
  Windows may show *"Windows protected your PC"* because the installer is not signed with a paid
  certificate. Choose **More info → Run anyway**. (You can read the source and build it yourself if you prefer.)
- **Android:** `TheMediaVault-<version>.apk`. Allow installing from your browser or file manager when asked.

Your library is stored in `%APPDATA%\the-vault` (`vault.db`, plus `cover_art\`). **Settings → Export** makes a full backup.

## What it does

- **Every media type in one library.** Add by searching online, by pasting a link (YouTube), by scanning a
  barcode or sharing a page from your phone, by importing a file, by a photo of a shelf, or by hand.
  Type-specific fields, ratings (−10 to +10), statuses, notes, lists, favourites, and your own custom types.
- **Finds the details for you.** Posters, cast, genres, ratings, where to stream, similar titles, from TMDB, Steam,
  IGDB, Discogs, Open Library, Audible, Apple, BoardGameGeek, YouTube and others. Every key is optional; without
  one, that part simply stays off.
- **Imports (desktop).** IMDb, Audible (via Libation), Steam and GOG libraries, YouTube subscriptions (Google
  Takeout), any CSV with column mapping, a folder of files, or a photo of a shelf (Gemini).
- **Browse and filter.** Tiles or a list, sort, filters (including where to stream), stats, history, and a Discover
  page with recommendations, trending titles and new videos from your YouTube channels.
- **Sync to your phone** through a Supabase project **you** own. Automatic sync runs about a minute after you edit
  something. Setup takes a few minutes: [Setting up your own server](docs/setup-your-server.md).
- **A real phone app**, not a viewer: edit, add, lists, Discover, stats, owned marks, cover upload, and an offline copy.
  [What each app can do](docs/feature-comparison.md) lists every feature and where it lives.

## Your data and privacy

Nothing is sent anywhere except the lookups you ask for and, if you set it up, your own Supabase project. There is no
analytics, advertising or tracking. See [docs/privacy.html](docs/privacy.html) and, in the app, **Help → About & Credits**.

The Media Vault is not affiliated with or endorsed by TMDB, Steam (Valve), GOG, IGDB (Twitch), Discogs, Apple, Open
Library, Audible, BoardGameGeek, YouTube (Google), or Supabase. Their names and data belong to them; the in-app credits
carry the wording each asks for. GOG import is unofficial and off until you turn it on. Board Game search reads BoardGameGeek through a hidden browser window; that is unofficial too, and the app tells you so and asks before the first search.

## Build it yourself

```bash
npm install
npm start               # run the desktop app
npm test                # unit and component tests
npm run test:e2e        # end-to-end tests on the real app
npm run dist            # build the Windows installer into release/
```

The phone app is in `mobile/` (Expo / React Native). Build an APK with
[EAS](https://docs.expo.dev/build/introduction/): `cd mobile && npx eas-cli build --platform android --profile preview`
(you will need your own Expo account, and to change `owner` and the project id in `mobile/app.json`).

## For developers

| | |
|---|---|
| `main.js`, `preload.js` | Electron main process and the secure bridge to the window |
| `database.js` | SQLite schema, migrations, queries |
| `App.jsx`, `views/`, `components/`, `modals/`, `settings/`, `hooks/` | The React window |
| `packages/core/` | Logic shared with the phone app (filters, parsers, API clients) |
| `lib/`, `services/` | Desktop-only plumbing (sync, cover art, file import) |
| `mobile/` | The Expo / React Native phone app |
| `supabase/schema_current.sql` | Everything a new Supabase project needs, in one re-runnable file |

- **Tests:** [docs/testing.md](docs/testing.md)
- **Database changes:** [docs/database-migrations.md](docs/database-migrations.md)
- **How sync works:** [docs/cloud-sync-design.md](docs/cloud-sync-design.md)
- **What's new:** [CHANGELOG.md](CHANGELOG.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md). **Security:** [SECURITY.md](SECURITY.md).

Built with Electron, React and SQLite (desktop) and Expo / React Native (phone).

## Licence

The code is released under the [MIT licence](LICENSE). The cover pictures in the online demos are **not** part of that:
they are public-domain, Creative Commons or open-source images from Wikimedia Commons, each under its own licence, listed
in [demo/CREDITS.md](demo/CREDITS.md).
