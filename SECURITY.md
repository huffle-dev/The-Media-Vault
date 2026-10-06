# Security

## Reporting a problem

If you find a security problem (for example a way to read someone else's library, to get a key out of the app, or to
make the app fetch something it shouldn't), please **do not post it in a public issue**.

Use GitHub's private reporting instead: on the repository page choose **Security → Report a vulnerability**. Say what
you found, how to reproduce it, and what you think the impact is. I'll answer as soon as I can; this is a free
project maintained in spare time, so please allow some days.

## How the app is designed to keep your data safe

- **Your data stays with you.** The library is on your own computer; sync, if you set it up, goes only to a Supabase
  project that **you** own. The makers run no server and cannot see your library.
- **Sync is locked down by the database itself.** Every table has row-level security so an account can read and
  change only its own rows. The key the apps carry is Supabase's *publishable* key, which is designed to be public;
  what it can reach is limited by those rules. The app refuses to accept a secret (`service_role`) key.
- **Your sign-ins and secrets** (Steam, GOG, Gemini, IGDB, your Supabase sign-in) are stored encrypted on your computer with
  Windows' own protection. Keys you paste for TMDB, Discogs and YouTube are stored on your computer. If you turn on key
  sync, an encrypted copy goes to your own server; the passphrase never leaves your devices.
- **Web addresses you add** (the Website type) are checked so they can't point at your own network.
- **The phone's sign-in** is kept encrypted on the phone.

## What is not covered

- The installer and APK are **not signed with a paid certificate**, so Windows and Android will warn before
  installing. Download only from this repository's Releases page, or build from source.
- GOG import uses the same app credentials GOG's own launcher uses. That is unofficial; it is off until you turn it on.

## Supported versions

Only the latest release is supported.
