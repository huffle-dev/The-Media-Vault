// A simple bottom sheet built on React Native's own Modal (rather than a
// navigation-level sheet) — it can't break with a navigation-library
// update.
//
// The dark backdrop is on screen at once and fills the whole screen; only the sheet itself slides up from the
// bottom (the Modal's own "slide" animation moved the backdrop up with it). It is kept to 90% of the screen's
// height and its content scrolls when it is taller than that (the Sort, Filters and View options sheets are),
// and it leaves room for the phone's own navigation buttons or gesture bar underneath, so the last row is never
// hidden behind them.
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Text from "./Text";
import { C } from "./colors";

const OPEN_MS = 220;
const CLOSE_MS = 160;

export default function BottomSheet({ visible, title, onClose, children }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // The Modal stays up while the sheet slides away, so closing is animated too.
  const [mounted, setMounted] = useState(visible);
  const slide = useRef(new Animated.Value(visible ? 1 : 0)).current; // 0 = off the bottom, 1 = in place

  useEffect(() => {
    if (visible) {
      setMounted(true);
      slide.setValue(0);
      Animated.timing(slide, { toValue: 1, duration: OPEN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(slide, { toValue: 0, duration: CLOSE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <Animated.View style={[styles.sheet, { maxHeight: height * 0.9, paddingBottom: Math.max(24, insets.bottom + 16), transform: [{ translateY }] }]}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>
          <ScrollView style={styles.body} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
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
