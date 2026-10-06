import { describe, it, expect } from "vitest";
import { createCloudSyncClient } from "../lib/cloudSyncClient.js";

// Regression: supabase-js's background auto-refresh rotated the refresh token
// behind main.js's back, so the stored token went stale about an hour after
// login and the next Sync Now failed with "Invalid Refresh Token: Already Used".
describe("createCloudSyncClient", () => {
  it("never refreshes the session in the background", () => {
    const client = createCloudSyncClient({ url: "https://example.supabase.co", key: "sb_publishable_test" });
    expect(client.auth.autoRefreshToken).toBe(false);
    expect(client.auth.persistSession).toBe(false);
  });
});
