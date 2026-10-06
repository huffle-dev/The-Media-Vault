# Desktop and phone: what each can do

*Written 2026-10-05 from the code as it stands. **Where** says which app has it: **Both**, **Desktop only** or **Phone only**. "Both" can still differ in depth, and the notes say how. The phone changes since the last installable build have been checked by the Metro bundle and unit tests only, not on a device. Kept by hand: update a row when a feature moves.*

How to read the columns: ✔ has it · ◐ has part of it (see the note) · — does not.

## Library and browsing

| Feature | Desktop | Phone | Where | Notes |
|---|---|---|---|---|
| Tile grid | ✔ | ✔ | Both | |
| List view | ✔ | ✔ | Both | |
| Tile size, spacing and overlay options | ✔ | ✔ | Both | Desktop also has list row size and scroll speed |
| Sort (21 options) | ✔ | ✔ | Both | Same shared sort code; desktop is one drop-down, the phone picks a field then a direction |
| Tabs for each media type, including custom types | ✔ | ✔ | Both | |
| Status quick filters (Wishlist, Not Started, In Progress, Completed, Dropped) | ✔ | ✔ | Both | |
| Filters: genre, age rating, platform, OS and console, your rating, critic rating | ✔ | ✔ | Both | |
| Filters: Rated, Owned, Hidden, List, Web Video kind | ✔ | ✔ | Both | See Ownership |
| Filter by where to stream (a provider) | ✔ | ✔ | Both | Phone downloads each country's providers once and keeps a short copy |
| Search by title, creator and tags | ✔ | ✔ | Both | |
| Search by cast | ✔ | — | Desktop only | Decided: skipped on the phone |
| Reset all filters | ✔ | ✔ | Both | |
| Select several items; bulk status, hide, add to list, delete (with Undo) | ✔ | ✔ | Both | Long-press a tile on the phone |
| Bulk "owned" flag | ✔ | ✔ | Both | Phone: the Owned action in multi-select |
| Export the selected items | ✔ | — | Desktop only | |
| One-tap actions on a tile (status, favourite, owned, hide) | ✔ | ✔ | Both | Desktop: hover buttons; phone: tap the status dot |
| Stats (status, ratings, critic scores, most played, top genres) | ✔ | ✔ | Both | |
| Tap a Stats bar to see those items | ✔ | ✔ | Both | |
| History (what you finished) | ✔ | ✔ | Both | |
| Menus and keyboard shortcuts | ✔ | — | Desktop only | |

## Item profile

| Feature | Desktop | Phone | Where | Notes |
|---|---|---|---|---|
| Cover, facts, ratings, links, description, cast, tracklist | ✔ | ✔ | Both | |
| Edit every field for its type | ✔ | ✔ | Both | Cast is not editable on the phone |
| Status, your rating, date finished, your notes | ✔ | ✔ | Both | |
| Favourites and lists | ✔ | ✔ | Both | |
| Undo for saves and deletes | ✔ | ✔ | Both | 10 seconds |
| Delete an item | ✔ | ✔ | Both | Desktop can also delete its cover file |
| Hide or unhide one item | ✔ | ✔ | Both | Desktop: from its profile; phone: the tile's quick sheet or multi-select |
| More from the creator, more in the series, similar titles | ✔ | ✔ | Both | |
| Where to Watch with country choice and re-check | ✔ | ✔ | Both | Needs a TMDB key to re-check |
| Time to beat (shown) | ✔ | ✔ | Both | |
| Fetch HowLongToBeat times | ✔ | — | Desktop only | |
| Re-fetch an item's details and cover (Force Resync) | ✔ | ✔ | Both | Phone: Refresh details and cover on the profile |
| Launch a game (Steam, GOG or a program) | ✔ | — | Desktop only | |
| Replace a cover by upload or crop | ✔ | ✔ | Both | Phone uploads to your own server's covers storage; desktop picks the new cover up after a sync |
| Preview a search result before adding it | ✔ | ✔ | Both | |
| Custom-type fields shown and edited | ✔ | ✔ | Both | |

## Ownership

| Feature | Desktop | Phone | Where | Notes |
|---|---|---|---|---|
| See what you own, from any of your devices | ✔ | ✔ | Both | Counts as owned if any device has it marked; desktop shows a phone's mark as "Owned (marked on phone)" |
| Mark an item owned (a physical copy, say) | ✔ | ✔ | Both | Either app can mark it; the other sees it after a sync. Marking also moves Wishlist ↔ Not Started. On the phone it is just a mark: no file or folder is linked and nothing opens |
| Mark several items owned at once | ✔ | ✔ | Both | |
| Link an owned item to a file or folder, or launch it | ✔ | — | Desktop only | Steam and GOG libraries and folder scans mark games owned automatically |

## Adding things

| Feature | Desktop | Phone | Where | Notes |
|---|---|---|---|---|
| Search online and add: Movie, TV, Book, Audiobook, Podcast, Music, Web Video | ✔ | ✔ | Both | |
| Search online and add: Game | ✔ | ◐ | Both | Steam and IGDB on both; desktop adds a GOG store switch |
| Search online and add: Board Game (BoardGameGeek) | ✔ | ✔ | Both | Unofficial (a hidden browser window / web view); both apps explain this and ask before the first search. If BGG refuses the details, the phone still adds the game from the search result |
| Add a Website from its address | ✔ | ✔ | Both | Reads the page's own title, description, picture; the same code on both |
| Add by hand, any type | ✔ | ✔ | Both | Includes Board Game, Website and custom types |
| Paste a YouTube link, @handle or playlist | ✔ | ✔ | Both | |
| Channels / Videos picker for Web Video search | ✔ | ✔ | Both | |
| Warning if it is already in the library | ✔ | ✔ | Both | |
| Scan a book barcode (ISBN) | — | ✔ | Phone only | Open Library |
| Scan a CD or record barcode | — | ✔ | Phone only | Discogs |
| Share a page from IMDb, Steam, GOG, Audible, Goodreads, Discogs or YouTube | — | ✔ | Phone only | Android share button |
| Browser extension and `vault://` links | ✔ | — | Desktop only | |
| Scan a photo of a shelf (Gemini) | ✔ | ✔ | Both | Needs your own Gemini key; the same request code on both |
| Import IMDb, any CSV, Libation (Audible), Steam, GOG, YouTube subscriptions, a folder | ✔ | — | Desktop only | Decided: import stays on desktop |
| Export (CSV, full backup) | ✔ | — | Desktop only | Decided: export stays on desktop |

## Discover

| Feature | Desktop | Phone | Where | Notes |
|---|---|---|---|---|
| Recommended for you and Trending | ✔ | ✔ | Both | |
| New videos from your YouTube channels | ✔ | ✔ | Both | |
| Add straight from a suggestion | ✔ | ✔ | Both | |
| "Not interested", and managing dismissed ones | ✔ | ✔ | Both | Desktop: Settings → Hidden Items; phone: Settings → Dismissed suggestions |
| Hidden items screen | ✔ | ✔ | Both | Desktop: Settings → Hidden Items; phone: Settings → Hidden items, or the Hidden filter |

## Sync, data and offline

| Feature | Desktop | Phone | Where | Notes |
|---|---|---|---|---|
| Sync through your own Supabase project | ✔ | ✔ | Both | Desktop runs the sync; the phone reads and writes the project directly |
| Set up your own server (address, key, setup SQL) | ✔ | ◐ | Both | Phone takes the address and key; the SQL is copied on desktop |
| Phone setup by QR code (scan or paste the setup code) | ✔ | ✔ | Both | Desktop shows the code; the phone scans it |
| Create your account from inside the app | ✔ | ✔ | Both | No dashboard step needed |
| Automatic sync about a minute after an edit | ✔ | ◐ | Both | Desktop schedules its own sync; phone edits save immediately, and while the app is open the phone checks for changes about once a minute |
| Works with no connection | ✔ | ◐ | Both | Desktop fully; phone shows a saved copy, read-only |
| Save the whole library for offline use | — | ✔ | Phone only | Settings → Offline use |
| Covers sync as links, with uploaded copies for ones with no link | ✔ | ✔ | Both | Desktop uploads; phone downloads |
| Encrypted API-key sync | ✔ | ✔ | Both | |
| Appearance carried across (accent, status colours, type colours and icons) | ✔ | ◐ | Both | Set on desktop; the phone follows. Not light mode, fonts or text colours |
| Backup copy made before a database upgrade | ✔ | — | Desktop only | |

## Settings and customising

| Feature | Desktop | Phone | Where | Notes |
|---|---|---|---|---|
| Appearance: accent, status colours, type colours and icons, fonts, light/dark | ✔ | — | Desktop only | |
| Create or change custom types | ✔ | ✔ | Both | |
| Enter API keys | ✔ | ◐ | Both | Phone gets them by encrypted sync, or paste for single-string keys |
| Steam and GOG sign-in and library import | ✔ | ◐ | Both | GOG is opt-in with a warning on both. Phone: fetch, review and add; desktop also syncs on launch and finds installed games to Launch |
| Fetch missing covers, fill missing Movie/TV info, refresh YouTube channels | ✔ | ✔ | Both | Phone: Settings → Library maintenance |
| About, credits, licences, privacy notice | ✔ | ✔ | Both | |
| Welcome screen, error report and feature request links | ✔ | ✔ | Both | |
| Screen-reader labels | ◐ | ✔ | Both | Added across the phone's screens; desktop not audited |
| Forgot-password link to your Supabase dashboard | — | ✔ | Phone only | |
| Problems & logs screen (errors, failed covers, what happened before a crash) | — | ✔ | Phone only | Desktop writes to its console; the phone needs this because there is no console |
| Recovery screen after a crash, and sending the phone's log to the desktop | ✔ | ✔ | Both | The phone sends; the desktop shows it (Settings → Cloud Sync → The phone's log) |

## How each is delivered

| Feature | Desktop | Phone | Where | Notes |
|---|---|---|---|---|
| Windows installer (unsigned) | ✔ | — | Desktop only | |
| Android app | — | ✔ | Phone only | Built with EAS; not yet installed or tested on a device |
| Open-source licence (MIT), published on GitHub | ✔ | ✔ | Both | Public repository created after the mobile work is finished |

## Decided not to do

- **Phone:** search by cast, import and export of files (CSV, IMDb and the rest), app lock, an in-app password-reset screen, Android game detection, barcodes for films, TV and games.
- **Desktop and phone:** Playnite CSV importer, Mac build, Chrome Web Store, Personal/Public split, "sync without server costs", live updates.

See the backlog's Deliberately Skipped section for each reason.
