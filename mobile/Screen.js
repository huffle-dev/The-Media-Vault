// Wrapper for stack screens (item, add) that sit outside the tab bar: keeps
// content clear of the phone's bottom navigation inset. The tab screens
// don't need it — the tab bar handles that inset itself.
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "./colors";

export default function Screen({ children }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.fill, { paddingBottom: insets.bottom }]}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.bg },
});
