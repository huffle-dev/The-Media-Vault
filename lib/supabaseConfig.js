// The Supabase project this install talks to is chosen by the user (Settings →
// Cloud Sync → Your server), stored in the `supabase_url` / `supabase_anon_key`
// settings, and resolved by main.js's getSupabaseConfig().
//
// LEGACY is the project this app used before the server became configurable.
// It is only ever used to keep an install that is ALREADY signed in working
// after the update (main.js copies it into the settings once); a brand-new
// install never sees it. Release step: empty both strings before publishing a
// build, so a downloaded app starts with no server at all.
//
// scripts/*.js (the developer's own sync tools) still read the SUPABASE_*
// names below. The publishable key is designed to ship inside apps — what it
// can reach is limited by row-level security. Never put the service-role /
// secret key anywhere in this repo.
const LEGACY = {
  url: "",
  key: "",
};

module.exports = { LEGACY, SUPABASE_URL: LEGACY.url, SUPABASE_KEY: LEGACY.key };
