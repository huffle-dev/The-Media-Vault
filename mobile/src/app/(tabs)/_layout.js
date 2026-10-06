// The bottom tab bar — mirrors desktop's main sections. Five tabs fit one
// row with no scrolling; anything more granular (type/status filters) lives
// in bottom sheets inside each screen instead of more tabs.
import Text from "../../../Text";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { C } from "../../../colors";
import { DiscoverIcon, GridIcon, HistoryIcon, StatsIcon } from "../../../Icons";

// The same glyphs desktop's top bar uses (Stats pie, Discover compass,
// History clock, ⚙ Settings), with Library shown as its ⊞ tile-view grid.
const svgIcon = (Icon) => ({ color }) => <Icon size={22} color={color} />;
const gearIcon = ({ color }) => <Text style={{ fontSize: 22, lineHeight: 24, color }}>⚙</Text>;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted,
        // On a phone the bar sizes itself (and clears the navigation buttons). In a browser (the online demo) there
        // is no such inset, and the default bar is too short for its labels, so the browser gets a taller one.
        tabBarStyle: { backgroundColor: C.topbar, borderTopColor: C.border, ...(Platform.OS === "web" ? { height: 68, paddingTop: 6, paddingBottom: 12 } : null) },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      {/* Same order as desktop's top-bar icons: Stats, Discover, History. */}
      <Tabs.Screen name="index" options={{ title: "Library", tabBarIcon: svgIcon(GridIcon) }} />
      <Tabs.Screen name="stats" options={{ title: "Stats", tabBarIcon: svgIcon(StatsIcon) }} />
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarIcon: svgIcon(DiscoverIcon) }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: svgIcon(HistoryIcon) }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: gearIcon }} />
    </Tabs>
  );
}
