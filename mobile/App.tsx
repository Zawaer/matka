import "./src/collector"; // registers the background-location task at startup
import { useState } from "react";
import { Platform, Pressable, StatusBar as RNStatusBar, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { ThemeProvider, useStyles, useTheme } from "./src/design/theme";
import { Icon, iconFont, type IconName } from "./src/ui";
import { Text } from "./src/ui/Text";
import OverviewScreen from "./src/screens/OverviewScreen";
import MapScreen from "./src/screens/MapScreen";
import TimelineScreen from "./src/screens/TimelineScreen";
import PlacesScreen from "./src/screens/PlacesScreen";

const TABS: { key: string; label: string; icon: IconName; iconOn: IconName; Screen: () => React.JSX.Element }[] = [
  { key: "overview", label: "Overview", icon: "view-dashboard-outline", iconOn: "view-dashboard", Screen: OverviewScreen },
  { key: "map", label: "Map", icon: "map-outline", iconOn: "map", Screen: MapScreen },
  { key: "timeline", label: "Timeline", icon: "timeline-clock-outline", iconOn: "timeline-clock", Screen: TimelineScreen },
  { key: "places", label: "Places", icon: "map-marker-multiple-outline", iconOn: "map-marker-multiple", Screen: PlacesScreen },
];

// The app draws edge to edge: inset below the status bar. (Web preview fakes one.)
const TOP_INSET = RNStatusBar.currentHeight ?? (Platform.OS === "web" ? 28 : 0);

function Shell() {
  const t = useTheme();
  const [active, setActive] = useState("overview");
  const s = useStyles((th) => ({
    root: { flex: 1, backgroundColor: th.c.bg },
    bar: { flexDirection: "row", backgroundColor: th.c.tabBar, borderTopWidth: 1, borderTopColor: th.c.border, paddingTop: th.space.sm, paddingBottom: th.space.lg + 4, paddingHorizontal: th.space.sm },
    tab: { flex: 1, alignItems: "center", gap: 4 },
    // Fixed radius (half the height) and an always-present background: on Android a
    // background added after mount dropped an oversized radius and drew a square.
    pill: { width: 60, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  }));
  return (
    <View style={s.root}>
      <StatusBar style={t.scheme === "dark" ? "light" : "dark"} />
      {/* Keep every screen mounted; just show/hide so state + the Map WebView persist. */}
      <View style={{ flex: 1, paddingTop: TOP_INSET }}>
        {TABS.map((tab) => (
          <View key={tab.key} style={{ flex: 1, display: active === tab.key ? "flex" : "none" }}>
            <tab.Screen />
          </View>
        ))}
      </View>
      <View style={s.bar}>
        {TABS.map((tab) => {
          const on = active === tab.key;
          return (
            <Pressable key={tab.key} style={s.tab} onPress={() => setActive(tab.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={tab.label}>
              <View style={[s.pill, on && { backgroundColor: t.c.primarySoft }]}>
                <Icon name={on ? tab.iconOn : tab.icon} size={24} color={on ? t.c.primary : t.c.textMuted} />
              </View>
              <Text variant="caption" style={{ color: on ? t.c.primary : t.c.textMuted, fontWeight: on ? "700" : "500" }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  const [fontsReady] = useFonts(iconFont);
  return <ThemeProvider>{fontsReady ? <Shell /> : null}</ThemeProvider>;
}
