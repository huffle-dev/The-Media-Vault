// Settings -> Problems & logs: what has gone wrong that the app would otherwise hide. A cover that
// would not load, a refresh that failed, an uncaught error (the last one before a crash is saved
// before the app closes, so it is here when you open it again). "Share log" sends the whole thing as
// text. The Covers card says, per type, how many items have a synced cover link at all.
import { useEffect, useState } from "react";
import { FlatList, Pressable, Share, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import { useRouter } from "expo-router";
import Screen from "../../../Screen";
import AppButton from "../../../AppButton";
import { useLibrary } from "../../../LibraryContext";
import { diag, markViewed } from "../../../diag";
import { buildHeader, sendLogToComputer } from "../../../diagSend";
import { coverSummary } from "../../../diagLog";
import { C, F } from "../../../colors";

const COLORS = { fatal: C.danger, error: C.danger, warn: C.accent, info: C.muted };
const header = buildHeader;

export default function DiagnosticsScreen() {
  const router = useRouter();
  const { items } = useLibrary();
  const [entries, setEntries] = useState(() => diag.entries());
  const [open, setOpen] = useState(null);
  const [sendStatus, setSendStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    try { await sendLogToComputer(); setSendStatus("Sent. On your computer: Settings → Cloud Sync → The phone's log."); }
    catch (e) { setSendStatus(`Couldn't send it: ${e.message}`); }
    setSending(false);
  };

  useEffect(() => {
    markViewed();
    return diag.subscribe(() => setEntries(diag.entries()));
  }, []);

  const rows = entries.slice().reverse();
  const covers = coverSummary(items);
  const missing = covers.reduce((n, r) => n + r.missing, 0);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.h2}>Problems & logs</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(e, i) => `${e.t}-${i}`}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Text style={styles.sub}>{header()}</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Covers</Text>
              <Text style={styles.sub}>
                {covers.length === 0 ? "No items loaded." : missing === 0 ? "Every item has a synced cover link." : `${missing} item${missing === 1 ? " has" : "s have"} no synced cover link (Settings → Library maintenance → Fetch missing covers).`}
              </Text>
              {covers.map((r) => (
                <Text key={r.type} style={styles.mono}>{r.type}: {r.linked} of {r.total} linked{r.missing ? `, ${r.missing} without` : ""}</Text>
              ))}
            </View>
            <View style={styles.actions}>
              <AppButton title={sending ? "Sending…" : "Send log to my computer"} variant="primary" disabled={sending} onPress={send} />
              <AppButton title="Share log" variant="action" onPress={() => Share.share({ message: diag.toText(header()) })} />
              <AppButton title="Clear" variant="action" onPress={() => diag.clear()} />
            </View>
            {sendStatus ? <Text style={styles.sub}>{sendStatus}</Text> : null}
            <Text style={styles.label}>{rows.length ? "Newest first. Tap one for details." : "Nothing has gone wrong yet."}</Text>
          </View>
        }
        renderItem={({ item: e, index }) => {
          const isOpen = open === index;
          return (
            <Pressable style={styles.entry} onPress={() => setOpen(isOpen ? null : index)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
              <Text style={[styles.level, { color: COLORS[e.level] || C.muted }]}>{e.level.toUpperCase()} · {e.source}{e.count > 1 ? ` · ×${e.count}` : ""} · {new Date(e.t).toLocaleTimeString()}</Text>
              <Text style={styles.msg} numberOfLines={isOpen ? undefined : 2}>{e.message}</Text>
              {isOpen && e.detail ? <Text style={styles.detail}>{e.detail}</Text> : null}
            </Pressable>
          );
        }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  back: { color: C.muted, fontSize: 15 },
  h2: { color: C.text, fontSize: 15, fontWeight: "700" },
  sub: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 14, gap: 6 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: "700" },
  mono: { color: C.text, fontFamily: F.mono, fontSize: 11.5 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  label: { fontFamily: F.mono, color: C.accent, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 4, marginBottom: 6 },
  entry: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, gap: 3 },
  level: { fontFamily: F.mono, fontSize: 10.5 },
  msg: { color: C.text, fontSize: 13, lineHeight: 18 },
  detail: { color: C.muted, fontFamily: F.mono, fontSize: 10.5, lineHeight: 15, marginTop: 4 },
});
