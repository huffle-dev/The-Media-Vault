// GOG sign-in and library fetch, with no Node or Electron in it, so desktop
// (services/gog.js) and the phone (mobile/) share one copy. GOG has no way for another app
// to register: GOG_CLIENT_ID/SECRET are the long-standing values GOG's own Galaxy client and
// community tools use, so this is unofficial and opt-in in both apps.
const { fetchWithTimeout: fetch } = require("./fetchWithTimeout");
const { isPlausibleToken, cleanUsername, cleanNumericIds } = require("./authValidation");

const GOG_CLIENT_ID     = "46899977096215655";
const GOG_CLIENT_SECRET = "9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9";
const GOG_REDIRECT_URI  = "https://embed.gog.com/on_login_success?origin=client";
// The redirect target bounces through to a plain homepage with no code
// visible to a human, so main.js watches navigation events instead.
const GOG_AUTH_URL = `https://auth.gog.com/auth?client_id=${GOG_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOG_REDIRECT_URI)}&response_type=code&layout=client2`;

// gog:login — exchanges the OAuth code main.js's login window captured for
// a refresh token, then best-effort resolves the account's username.
async function exchangeGogCode(code) {
  const tokenUrl = `https://auth.gog.com/token?client_id=${GOG_CLIENT_ID}&client_secret=${GOG_CLIENT_SECRET}&grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(GOG_REDIRECT_URI)}`;
  const res = await fetch(tokenUrl);
  if (!res.ok) throw new Error("GOG rejected the login — try again.");
  const data = await res.json();
  if (!isPlausibleToken(data?.refresh_token)) throw new Error("GOG didn't return a valid token — try again.");
  return {
    refreshToken: data.refresh_token,
    accessToken: isPlausibleToken(data.access_token) ? data.access_token : null,
  };
}

async function fetchGogUsername(accessToken) {
  if (!accessToken) return null;
  try {
    const res = await fetch("https://embed.gog.com/userData.json", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) return cleanUsername((await res.json()).username);
  } catch { /* not essential — connection itself already succeeded */ }
  return null;
}

// Resolves GOG product IDs to titles/years, mirroring steam.js's wishlist
// resolve loop — same concurrency, skips anything that fails.
async function resolveGogProducts(ids) {
  const out = [];
  const concurrency = 20;
  for (let i = 0; i < ids.length; i += concurrency) {
    const chunk = ids.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(async (id) => {
      try {
        const res = await fetch(`https://api.gog.com/products/${id}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.title) return null;
        const year = data.release_date ? new Date(data.release_date).getFullYear() || null : null;
        return { id, title: data.title, year };
      } catch { return null; }
    }));
    results.forEach(r => { if (r) out.push(r); });
  }
  return out;
}

// gog:fetch — refreshes the token (GOG rotates it every use; main.js must
// persist newRefreshToken or the next sync fails), then resolves owned +
// wishlist ids to titles/years.
async function fetchGogLibrary(refreshToken) {
  const refreshUrl = `https://auth.gog.com/token?client_id=${GOG_CLIENT_ID}&client_secret=${GOG_CLIENT_SECRET}&grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;
  const refreshRes = await fetch(refreshUrl);
  if (!refreshRes.ok) throw new Error("Your GOG session expired — log in again.");
  const tokenData = await refreshRes.json();
  if (!isPlausibleToken(tokenData?.access_token)) throw new Error("GOG returned an unexpected response — try again, or log in again.");

  const authHeaders = { Authorization: `Bearer ${tokenData.access_token}` };
  const [ownedRes, wishlistRes] = await Promise.all([
    fetch("https://embed.gog.com/user/data/games", { headers: authHeaders }),
    fetch("https://embed.gog.com/user/wishlist.json", { headers: authHeaders }),
  ]);
  if (!ownedRes.ok) throw new Error(`GOG API error: ${ownedRes.status}`);
  const ownedIds = cleanNumericIds((await ownedRes.json())?.owned);

  let wishlistIds = [];
  let wishlistError = null;
  if (wishlistRes.ok) {
    const wl = await wishlistRes.json();
    const wlMap = wl?.wishlist && typeof wl.wishlist === "object" && !Array.isArray(wl.wishlist) ? wl.wishlist : {};
    wishlistIds = cleanNumericIds(Object.keys(wlMap));
  } else {
    wishlistError = `Wishlist fetch failed (${wishlistRes.status}).`;
  }

  const [owned, wishlist] = await Promise.all([
    resolveGogProducts(ownedIds),
    resolveGogProducts(wishlistIds),
  ]);

  return {
    owned:    owned.map(g => ({ productId: g.id, title: g.title, year: g.year })),
    wishlist: wishlist.map(g => ({ productId: g.id, title: g.title, year: g.year })),
    wishlistError,
    newRefreshToken: isPlausibleToken(tokenData.refresh_token) ? tokenData.refresh_token : null,
  };
}

module.exports = {
  GOG_AUTH_URL, GOG_REDIRECT_URI, exchangeGogCode, fetchGogUsername, resolveGogProducts, fetchGogLibrary,
};
