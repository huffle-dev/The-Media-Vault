// A short welcome the first time someone signs in (and from About -> Show the welcome
// screen): what this app is, where the library lives, and the three things worth doing first.
import { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import Text from "./Text";
import AppButton from "./AppButton";
import { hasSeenWelcome, markWelcomeSeen, onShowWelcome } from "./welcome";
import { C, F } from "./colors";

const STEPS = [
  ["Your library", "Everything is kept in the Supabase project you set up, so it follows you between desktop and phone. Nothing goes to anyone else."],
  ["Unlock your keys", "In Settings → API keys & sync, unlock the keys your desktop synced (TMDB, Discogs, YouTube, IGDB). Search, Discover and Where to Watch use them."],
  ["Add something", "Tap + to search, scan a book or CD barcode, or share a page from IMDb, Steam, Audible, Goodreads or YouTube straight to this app."],
  ["Tap, hold, swipe", "Tap a tile's coloured dot to change its status, favourite or hide it. Long-press to select several. Pull down to refresh."],
];

export default function WelcomeSheet() {
  const [visible, setVisible] = useState(() => !hasSeenWelcome());
  useEffect(() => onShowWelcome(() => setVisible(true)), []);
  const close = () => { markWelcomeSeen(); setVisible(false); };
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close} transparent>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title}>Welcome to The Media Vault</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {STEPS.map(([head, body]) => (
              <View key={head} style={styles.step}>
                <Text style={styles.head}>{head}</Text>
                <Text style={styles.body}>{body}</Text>
              </View>
            ))}
          </ScrollView>
          <AppButton title="Get started" variant="primary" onPress={close} style={{ marginTop: 12 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(5,5,10,0.85)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 20 },
  title: { fontFamily: F.serif, color: C.text, fontSize: 21, marginBottom: 10 },
  step: { marginTop: 10 },
  head: { color: C.accent, fontFamily: F.mono, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" },
  body: { color: C.text, fontSize: 13.5, lineHeight: 20, marginTop: 3 },
});
