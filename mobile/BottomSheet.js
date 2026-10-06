// A simple bottom sheet built on React Native's own Modal (rather than a
// navigation-level sheet) — it can't break with a navigation-library
// update.
//
// It is kept to 90% of the screen's height and its content scrolls when it is taller than that (the Sort,
// Filters and View options sheets are), and it leaves room for the phone's own navigation buttons or gesture
// bar underneath, so the last row is never hidden behind them.
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Text from "./Text";
import { C } from "./colors";

export default function BottomSheet({ visible, title, onClose, children }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {/* The dark backdrop fills the whole screen and the sheet sits ON it, so the sheet's rounded top corners
          show the dimmed screen behind them, not a lighter patch of the unshaded app. */}
      <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={[styles.sheet, { maxHeight: height * 0.9, paddingBottom: Math.max(24, insets.bottom + 16) }]}>
        <View style={styles.grabber} />
        <Text style={styles.title}>{title}</Text>
        <ScrollView style={styles.body} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000a" },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, gap: 12,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  title: { color: C.muted, fontSize: 12, fontWeight: "600", textTransform: "uppercase", textAlign: "center" },
  body: { flexGrow: 0 },
  content: { gap: 12 },
});
