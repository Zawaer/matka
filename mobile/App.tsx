import "./src/collector"; // registers the background-location task at startup
import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { C } from "./src/theme";
import OverviewScreen from "./src/screens/OverviewScreen";
import MapScreen from "./src/screens/MapScreen";
import TimelineScreen from "./src/screens/TimelineScreen";
import PlacesScreen from "./src/screens/PlacesScreen";

const TABS = [
  { key: "overview", label: "Overview", icon: "📊", Screen: OverviewScreen },
  { key: "map", label: "Map", icon: "🗺️", Screen: MapScreen },
  { key: "timeline", label: "Timeline", icon: "🕑", Screen: TimelineScreen },
  { key: "places", label: "Places", icon: "📍", Screen: PlacesScreen },
] as const;

export default function App() {
  const [active, setActive] = useState<string>("overview");

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />

      {/* Keep every screen mounted; just show/hide so state + the Map WebView persist. */}
      <View style={{ flex: 1 }}>
        {TABS.map((t) => (
          <View
            key={t.key}
            style={{ flex: 1, display: active === t.key ? "flex" : "none" }}
          >
            <t.Screen />
          </View>
        ))}
      </View>

      <View style={styles.tabbar}>
        {TABS.map((t) => {
          const on = active === t.key;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setActive(t.key)}>
              <Text style={[styles.tabIcon, { opacity: on ? 1 : 0.5 }]}>{t.icon}</Text>
              <Text style={[styles.tabLabel, { color: on ? C.primary : C.muted }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabbar: {
    flexDirection: "row",
    backgroundColor: C.surface,
    borderTopColor: C.border,
    borderTopWidth: 1,
    paddingBottom: 22,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: "center", gap: 2 },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 11, fontWeight: "600" },
});
