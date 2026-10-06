// Placeholder for a tab whose screen isn't built yet — the tab bar mirrors
// desktop's sections now, and each screen fills in as it's rebuilt for the
// phone.
import { StyleSheet, View } from "react-native";
import Text from "./Text";
import { C } from "./colors";

export default function ComingSoon({ title, note }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{note || "Coming soon to the phone app."}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  title: { color: C.text, fontSize: 20, fontWeight: "700" },
  note: { color: C.muted, fontSize: 14, textAlign: "center" },
});
