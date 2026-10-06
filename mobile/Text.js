// Drop-in for React Native's Text that uses the desktop's typeface (DM Sans).
// React Native has no inherited/global font, and each weight of a custom
// font is its own family, so this maps a style's fontWeight to the matching
// DM Sans file. A style that sets its own fontFamily (e.g. F.mono for the
// small uppercase labels, F.serif for titles) is left alone.
import { Text as RNText, StyleSheet } from "react-native";
import { F } from "./colors";

const BY_WEIGHT = {
  100: F.sans, 200: F.sans, 300: F.sans, 400: F.sans, normal: F.sans,
  500: F.sansMedium, 600: F.sansSemi, 700: F.sansBold, bold: F.sansBold, 800: F.sansBold, 900: F.sansBold,
};

export function fontFor(style) {
  const flat = StyleSheet.flatten(style) || {};
  return flat.fontFamily || BY_WEIGHT[String(flat.fontWeight ?? "400")] || F.sans;
}

export default function Text({ style, ...props }) {
  return <RNText {...props} style={[style, { fontFamily: fontFor(style), fontWeight: "normal" }]} />;
}
