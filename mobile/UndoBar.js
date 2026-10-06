// A message with an Undo button along the bottom of the screen after a bulk
// change (set status, hide, add to list, delete). Gives itself up after ten
// seconds; the next action replaces it. `busy` greys it while an undo runs.
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Text from "./Text";
import { C } from "./colors";

export const UNDO_MS = 10_000;

export default function UndoBar({ message, failed = 0, busy = false, onUndo, onDismiss }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, UNDO_MS);
    return () => clearTimeout(id);
  }, [message, onDismiss]);
  return (
    <View style={styles.bar} accessibilityLiveRegion="polite">
      <Text style={styles.message} numberOfLines={2}>
        {message}{failed ? ` · ${failed} couldn't be saved` : ""}
      </Text>
      <Pressable onPress={busy ? undefined : onUndo} hitSlop={10} accessibilityRole="button" accessibilityLabel="Undo" style={[styles.undo, busy && { opacity: 0.5 }]}>
        <Text style={styles.undoText}>{busy ? "Undoing…" : "UNDO"}</Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss"><Text style={styles.x}>✕</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute", left: 12, right: 12, bottom: 12, flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 14, elevation: 8,
  },
  message: { flex: 1, color: C.text, fontSize: 13 },
  undo: { paddingHorizontal: 4 },
  undoText: { color: C.accent, fontSize: 13, fontWeight: "700", letterSpacing: 0.6 },
  x: { color: C.muted, fontSize: 14 },
});
