# Release checklist

Everything between "it works on my computer" and "someone else downloads it".
Items marked **you** need a decision or an account only you have; the rest is
mechanical and is spelled out so it can be done in one sitting.

## 0. Before any build leaves your machine

- [ ] **Run the whole test suite:** `npm test`, then `npm run test:e2e`.
- [ ] **Run the setup SQL on a throwaway Supabase project** (Settings → Cloud Sync → Your
      server → Copy setup SQL) and walk through `docs/setup-your-server.md` as a stranger
      would: sign up, create the user, enter the URL and key, Test connection, sign in, Sync Now,
      then sign in on the phone. The SQL has been run on one real project but never from a blank one.
- [ ] **Use it for a while** on your real library. Bugs found now are cheap.

## 1. The one-way steps (do these last, in this order)

These cannot be repeated once a build is in someone else's hands.

1. **Collapse the database migrations into one baseline.** Today `database.js` has a real
   migration chain (v26 → v51) and `test/schemaParity.test.js` proves a fresh install and an
   upgraded one match. Once other people have databases, never delete or edit a step — add a new
   one. So, while only your own database exists:
   - make `_createSchema()` the only source of truth at the current version, delete the
     `if (version < N)` steps from `_migrate()`, and keep `LATEST_SCHEMA_VERSION`;
   - regenerate `test/fixtures/` to the new baseline and keep the parity test pointing at it;
   - delete the tests that wind a database back to v46–v50 and re-run a single migration
     (`dismissalsSync`, `listTombstones`, `itemTombstones`);
   - this also drops `'MTG'` from the `media_type` CHECK lists.
   Details and reasoning: `docs/database-migrations.md`.
2. **Empty the built-in server.** In `lib/supabaseConfig.js` and `mobile/supabase.js` set both
   `LEGACY` strings to `""`. A downloaded build then starts with no server and asks for one.
   (Your own already-signed-in installs keep working: they saved their server to settings.)
3. **Bump the version** in `package.json` (and `mobile/app.json` for the phone).

## 2. Build the Windows installer

```bash
npm run dist          # licences + renderer + installer  -> release/TheMediaVault-Setup-<version>.exe
npm run test:e2e:packed   # the end-to-end suite against the packaged program
```

`npm run pack` makes just the unpacked program (`release/win-unpacked/`), which is quicker for testing.
The installer is per-user, lets people choose the folder, and **keeps the library when uninstalled or updated**
(`deleteAppDataOnUninstall` is off).

- **Do not add a top-level `productName` to `package.json`.** Electron derives the data folder
  (`%APPDATA%\the-vault`, where the real library lives) from the package name; changing it would make the
  app look empty. The installer's display name is set under `build.productName` instead.
- **Copy setup SQL** reads `supabase/schema_current.sql` from inside the app; the build config includes it.

## 3. Code signing — **you** (planned after the first release, decided 2026-10-06: ship unsigned with a SmartScreen note in the README, then apply for free open-source signing)

An unsigned installer works but Windows SmartScreen warns "unknown publisher", which costs downloads.

- Get a code-signing certificate (an OV certificate from a certificate authority, or Azure Trusted Signing).
- Give electron-builder the certificate through its documented environment variables or `build.win` signing
  options, then rebuild; verify with `Get-AuthenticodeSignature release\TheMediaVault-Setup-<version>.exe`
  (Status should be `Valid`).

## 4. Auto-update — **you**

Needs somewhere to host releases. The usual choice is GitHub Releases through `electron-updater` (add the
dependency, a `build.publish` entry, and an update check in `main.js`). A private repository needs a read
token baked into the app, so this wants a public releases location. Not started because it depends on that decision.

## 5. Legal and naming — **you**

- [ ] **Name and trademark — worth taking seriously.** A quick web search (October 2026) found several existing products called "Media Vault" or "MediaVault" in this same area: a hosted personal tracker for movies, TV, books and games; a self-hosted open-source catalog for physical media; an Obsidian plugin that tracks movies and TV. (An older MEDIA VAULT software trademark was cancelled in 2017.) That is not a legal opinion, but it means a proper trademark search and a possible rename should come BEFORE signing, a listing or any marketing. Also check "The Media Vault" is free to use for software in the countries you will sell in
      (a trademark search, not just a web search). Check the vault icon can be owned and protected (an AI-generated
      image may not be).
- [x] **TMDB logo:** done 2026-10-05 — `assets/tmdb-logo.svg` is shown with the attribution in About & Credits.
- [ ] **Data-source terms:** TMDB and IGDB's free tiers are for non-commercial use; BoardGameGeek needs a commercial
      licence; Audible, GOG and HowLongToBeat are unofficial endpoints. Decide what ships if the app is **paid** versus
      free (see "Public Release" in `BACKLOG.md`).
- [x] **Privacy notice:** contact is the repository's Issues page (done 2026-10-05); a lawyer review is optional for a free project. The notice describes what the app actually does today; keep it true when features change.
- [ ] **Licensing / purchase** (free, donations or one-time price) and the merchant-of-record account if you charge.

## 6. Support and presentation

- [ ] Screenshots and a short demo for the README and any listing.
- [ ] Somewhere for bug reports (the Help menu already opens a pre-filled GitHub issue; point it at a public repository).
- [ ] The Android release: release signing key, Play Console listing, data-safety form, privacy policy URL.

## 7. Publishing on GitHub (the plan: free, open source)

Decided 2026-10-05 — see the backlog row "Release: publish on GitHub". In order:

- [x] **Licence:** MIT, `LICENSE` added.
- [x] **The old server's address and key** stay out of the public repository: `scripts/make-public-copy.js` empties `LEGACY` in both apps, and refuses to finish if it finds the old address, key, a private email or a local folder name anywhere in the copy (those patterns live in the gitignored `scripts/private-strings.local.json`). Nothing needs rotating or switching off, as long as the old repository stays private (decided 2026-10-06).
- [ ] **New public repository `huffle-dev/The-Media-Vault` with one clean first commit** (decided 2026-10-06): `node scripts/make-public-copy.js --out ../The-Media-Vault --repo huffle-dev/The-Media-Vault --name "…" --email "…@users.noreply.github.com"`. The copy leaves out `BACKLOG.md` (it stays private), strips the maker's Expo account from `mobile/app.json`, and adds `CHANGELOG.md` as the public record. Keep the current repository private as the archive.
- [ ] **Commit identity:** `git config user.email` to the GitHub no-reply address (or a personal email you're happy to show).
- [x] README as the front page; `SECURITY.md`; `CONTRIBUTING.md`; issue and pull-request templates; the "not affiliated with…" disclaimer (done 2026-10-05; add screenshots to the README).
- [x] GitHub Actions: `ci.yml` runs the tests on every push and pull request; `release.yml` builds the installer on a `v*` tag and attaches it to a release (written 2026-10-05, not yet run — it first runs when the repository exists).
- [ ] Auto-update from GitHub Releases (`electron-updater`).
- [x] Privacy notice contact → the repository's Issues page.
