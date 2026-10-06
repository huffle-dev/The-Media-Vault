// The phone's buttons, in the desktop's three styles (settings/
// SettingsShared.jsx and views/ItemProfile.jsx):
//   primary — accent fill, dark text (desktop's saveBtnStyle)
//   action  — subtle raised fill with a border (desktop's actionBtnStyle)
//   ghost   — outlined link-style button (desktop's GhostLink)
// Replaces React Native's platform-styled <Button>.
import { Pressable, StyleSheet } from "react-native";
import Text from "./Text";
import { C } from "./colors";

export default function AppButton({ title, onPress, disabled, variant = "action", color, style }) {
  const v = STYLES[variant];
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }}
      style={[styles.base, v.box(color), disabled && styles.disabled, style]}
    >
      <Text style={[styles.text, v.text(color, disabled)]}>{title}</Text>
    </Pressable>
  );
}

const STYLES = {
  primary: {
    box: () => ({ backgroundColor: C.accent }),
    text: () => ({ color: C.bg, fontWeight: "700" }),
  },
  action: {
    box: () => ({ backgroundColor: C.hoverWashStrong, borderWidth: 1, borderColor: C.border }),
    text: (_c, disabled) => ({ color: disabled ? C.muted : C.text }),
  },
  ghost: {
    box: (color) => ({ borderWidth: 1, borderColor: (color || C.border) + (color ? "44" : "") }),
    text: (color) => ({ color: color || C.muted, fontSize: 11 }),
  },
};

const styles = StyleSheet.create({
  base: { borderRadius: 5, paddingHorizontal: 16, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 12 },
  disabled: { opacity: 0.5 },
});
