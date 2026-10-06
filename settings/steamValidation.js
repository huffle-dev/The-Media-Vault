// Format checks for the Steam ID / API key fields, so a bad value is caught
// on Save instead of surfacing later as a failed sync. Blank is always valid
// (it's how credentials get cleared).

// Accepts a bare SteamID64 or a steamcommunity.com/profiles/<id> URL. A
// /id/<vanity> URL can't be resolved to a number without an API call, so it
// gets a specific hint rather than a generic error.
export function checkSteamId(input) {
  const raw = (input || "").trim();
  if (!raw) return { value: "", error: null };

  if (/^7656\d{13}$/.test(raw)) return { value: raw, error: null };

  const profile = raw.match(/steamcommunity\.com\/profiles\/(7656\d{13})/i);
  if (profile) return { value: profile[1], error: null };

  if (/steamcommunity\.com\/id\//i.test(raw)) {
    return {
      value: raw,
      error: "That's a custom profile name, not the ID. Look up your 17-digit Steam ID (starts with 7656) at steamid.io.",
    };
  }
  return { value: raw, error: "Steam ID is a 17-digit number starting with 7656." };
}

export function checkSteamKey(input) {
  const raw = (input || "").trim();
  if (!raw) return { value: "", error: null };
  if (/^[0-9a-f]{32}$/i.test(raw)) return { value: raw, error: null };
  return { value: raw, error: "Steam API key is 32 letters/numbers (0–9, A–F)." };
}
