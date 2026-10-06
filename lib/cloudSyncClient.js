// The desktop's Supabase client for Cloud Sync.
//
// autoRefreshToken is OFF on purpose. Supabase refresh tokens are single-use
// (every refresh rotates them), and main.js's restoreSupabaseSession() stores
// the newest one after each explicit refresh and uses it for the next sync.
// supabase-js's default background timer refreshes the in-memory session
// itself roughly an hour after login/sync — rotating the token behind our
// back, so the stored one goes stale and the next Sync Now fails with
// "Invalid Refresh Token: Already Used" (found live). Every operation here
// refreshes explicitly right before it runs, and an access token lasts far
// longer than any sync, so nothing needs the timer.
const { createClient } = require("@supabase/supabase-js");

// `config` is { url, key }: the user's own server (see main.js getSupabaseConfig).
function createCloudSyncClient({ url, key }) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

module.exports = { createCloudSyncClient };
