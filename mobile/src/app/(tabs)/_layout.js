// The bottom tab bar — mirrors desktop's main sections. Five tabs fit one
// row with no scrolling; anything more granular (type/status filters) lives
// in bottom sheets inside each screen instead of more tabs.
import Text from "../../../Text";
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
        tabBarStyle: { backgroundColor: C.topbar, borderTopColor: C.border },
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
