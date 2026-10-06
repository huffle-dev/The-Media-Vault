// Settings -> Steam & GOG libraries: bring the games you own (and your wishlist) from Steam or
// GOG into the library, review them, and add the ones you want. Desktop's Import -> Steam and
// GOG, on the phone. Steam's ID and key sync from desktop (vault unlocked) or can be pasted
// here. GOG is unofficial, so it stays off until switched on behind a warning.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import TextInput from "../../../TextInput";
import { useRouter } from "expo-router";
import Screen from "../../../Screen";
import AppButton from "../../../AppButton";
import GogLogin from "../../../GogLogin";
import { useLibrary } from "../../../LibraryContext";
import { useApiKeys } from "../../../useApiKeys";
import { steam } from "../../../mediaServices";
import { gameRows, reviewGameRows } from "../../../libraryImport";
import { ReviewList, addReviewedGames } from "../../../GameReview";
import { gogEnabled, setGogEnabled, getGogToken, saveGogToken, clearGogToken } from "../../../gogAccount";
import { exchangeGogCode, fetchGogUsername, fetchGogLibrary } from "@media-vault/core/gogLibrary.js";
import { GOG_WARNING } from "@media-vault/core/gogWarning.js";
import { C, F } from "../../../colors";

const MODES = [["both", "Owned + wishlist"], ["owned", "Owned"], ["wishlist", "Wishlist"]];

const Modes = ({ mode, setMode }) => (
  <View style={styles.modes}>
    {MODES.map(([value, label]) => (
      <Pressable key={value} onPress={() => setMode(value)} style={[styles.pill, mode === value && styles.pillOn]} accessibilityRole="radio" accessibilityState={{ selected: mode === value }}>
        <Text style={[styles.pillText, mode === value && { color: C.accent }]}>{label}</Text>
      </Pressable>
    ))}
  </View>
);

export default function GameLibrariesScreen() {
  const router = useRouter();
  const { items, reload, refreshLists, offline, deviceId } = useLibrary();
  const { keys, sources, saveLocalKey } = useApiKeys();
  const [store, setStore] = useState("steam");
  const [steamId, setSteamId] = useState("");
  const [steamKey, setSteamKey] = useState("");
  const [mode, setMode] = useState("both");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  // GOG
  const [gogOn, setGogOn] = useState(gogEnabled());
  const [understood, setUnderstood] = useState(false);
  const [gogSignedIn, setGogSignedIn] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  useEffect(() => { getGogToken().then((t) => setGogSignedIn(!!t)); }, [gogOn]);

  const id = (keys && keys.steamId) || steamId.trim();
  const key = (keys && keys.steam) || steamKey.trim();

  const show = (found, wishlistError, source) => {
    if (wishlistError && mode === "wishlist") throw new Error(wishlistError);
    if (!found.length) throw new Error(wishlistError || `Nothing came back from ${source}.`);
    setRows(reviewGameRows(found, items));
    if (wishlistError) setError(wishlistError);
  };

  async function fetchSteam() {
    if (!id || !key) { setError("Both the Steam ID and the API key are needed."); return; }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      if (!(keys && keys.steamId) && steamId.trim()) await saveLocalKey("steamId", steamId.trim());
      if (!(keys && keys.steam) && steamKey.trim()) await saveLocalKey("steam", steamKey.trim());
      const library = await steam.fetchSteamLibrary(id, key);
      const { rows: found, wishlistError } = gameRows("steam", library, mode);
      show(found, wishlistError, "Steam");
    } catch (e) {
      setError(e.message || "Couldn't fetch the Steam library.");
    } finally {
      setBusy(false);
    }
  }

  async function gogCode(code) {
    setLoggingIn(false);
    setBusy(true);
    setError(null);
    try {
      const { refreshToken, accessToken } = await exchangeGogCode(code);
      await saveGogToken(refreshToken);
      setGogSignedIn(true);
      const name = await fetchGogUsername(accessToken);
      setDone(name ? `Signed in to GOG as ${name}.` : "Signed in to GOG.");
    } catch (e) {
      setError(e.message || "GOG login didn't complete — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function fetchGog() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const token = await getGogToken();
      if (!token) throw new Error("Sign in with GOG first.");
      const { owned, wishlist, wishlistError, newRefreshToken } = await fetchGogLibrary(token);
      // GOG replaces the token each time it is used; keep the new one or the next fetch fails.
      if (newRefreshToken) await saveGogToken(newRefreshToken);
      const { rows: found, wishlistError: wlErr } = gameRows("gog", { owned, wishlist, wishlistError }, mode);
      show(found, wlErr, "GOG");
    } catch (e) {
      setError(e.message || "Couldn't fetch the GOG library.");
      if (/expired|log in again/i.test(e.message || "")) { await clearGogToken(); setGogSignedIn(false); }
    } finally {
      setBusy(false);
    }
  }

  async function addChosen() {
    setAdding(true);
    setError(null);
    try {
      const n = await addReviewedGames({ rows, deviceId });
      await Promise.all([reload(), refreshLists()]);
      setRows(null);
      setDone(`Added ${n} game${n === 1 ? "" : "s"}. Covers fill in as you scroll; Library maintenance → Fetch missing covers saves them for desktop.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => (rows ? setRows(null) : router.back())} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2}>Steam & GOG libraries</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {offline ? <Text style={styles.error}>You're offline — importing needs a connection.</Text> : rows ? (
          <ReviewList rows={rows} setRows={setRows} onAdd={addChosen} adding={adding} error={error} />
        ) : (
          <>
            <View style={styles.modes}>
              {[["steam", "Steam"], ["gog", "GOG (unofficial)"]].map(([value, label]) => (
                <Pressable key={value} onPress={() => { setStore(value); setError(null); setDone(null); }} style={[styles.pill, store === value && styles.pillOn]} accessibilityRole="radio" accessibilityState={{ selected: store === value }}>
                  <Text style={[styles.pillText, store === value && { color: C.accent }]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {store === "steam" ? (
              <>
                <Text style={styles.p}>Your profile and game details must be Public in Steam's privacy settings. Get a key at steamcommunity.com/dev/apikey; your Steam ID is the 17-digit number on your profile.</Text>
                {keys && keys.steamId ? <Text style={styles.ok}>Steam ID: {keys.steamId} ({sources.steamId === "synced" ? "synced" : "this phone"})</Text> : (
                  <TextInput style={styles.input} value={steamId} onChangeText={setSteamId} placeholder="Steam ID (17 digits)" placeholderTextColor="#777" keyboardType="number-pad" />
                )}
                {keys && keys.steam ? <Text style={styles.ok}>API key: saved ({sources.steam === "synced" ? "synced" : "this phone"})</Text> : (
                  <TextInput style={styles.input} value={steamKey} onChangeText={setSteamKey} placeholder="Steam Web API key" placeholderTextColor="#777" autoCapitalize="none" autoCorrect={false} secureTextEntry />
                )}
                <Modes mode={mode} setMode={setMode} />
                <AppButton title={busy ? "Fetching…" : "Fetch my Steam library"} variant="primary" disabled={busy} onPress={fetchSteam} />
              </>
            ) : !gogOn ? (
              <>
                <View style={styles.warn} accessibilityRole="alert">
                  {GOG_WARNING.map((line) => <Text key={line} style={styles.warnText}>{line}</Text>)}
                </View>
                <Pressable style={styles.checkRow} onPress={() => setUnderstood((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: understood }}>
                  <View style={[styles.box, understood && styles.boxOn]}>{understood && <Text style={styles.tick}>✓</Text>}</View>
                  <Text style={styles.p}>I understand, and I want to use GOG import</Text>
                </Pressable>
                <AppButton title="Turn on GOG import" variant="primary" disabled={!understood} onPress={async () => { await setGogEnabled(true); setGogOn(true); }} />
              </>
            ) : (
              <>
                <Modes mode={mode} setMode={setMode} />
                {!gogSignedIn ? (
                  <AppButton title={busy ? "Signing in…" : "Sign in with GOG"} variant="primary" disabled={busy} onPress={() => setLoggingIn(true)} />
                ) : (
                  <AppButton title={busy ? "Fetching…" : "Fetch my GOG library"} variant="primary" disabled={busy} onPress={fetchGog} />
                )}
                <AppButton title="Turn off GOG import (signs you out of GOG)" variant="ghost" onPress={async () => { await setGogEnabled(false); setGogOn(false); setGogSignedIn(false); setUnderstood(false); }} />
              </>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
            {done && <Text style={styles.ok}>{done}</Text>}
          </>
        )}
      </ScrollView>
      <GogLogin visible={loggingIn} onCode={gogCode} onClose={() => setLoggingIn(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  back: { color: C.muted, fontSize: 15 },
  h2: { color: C.text, fontSize: 15, fontWeight: "700" },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  p: { color: C.muted, fontSize: 12.5, lineHeight: 18, flex: 1 },
  ok: { color: C.text, fontSize: 13 },
  input: { backgroundColor: C.surface2, color: C.text, borderRadius: 5, padding: 11, fontSize: 14, borderWidth: 1, borderColor: C.border },
  modes: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  pillOn: { borderColor: C.accent, backgroundColor: "#e3aa2622" },
  pillText: { color: C.muted, fontSize: 12.5 },
  error: { color: C.danger },
  warn: { borderWidth: 1, borderColor: "#e8b84b66", backgroundColor: "#e8b84b12", borderRadius: 8, padding: 12, gap: 8 },
  warnText: { color: C.text, fontSize: 12.5, lineHeight: 18 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  box: { width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: C.muted, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: C.accent, borderColor: C.accent },
  tick: { color: "#09090e", fontWeight: "800" },
});
