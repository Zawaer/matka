import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Linking, Pressable, View } from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemeProvider, useStyles, useTheme } from "./src/design/theme";
import type { Pairing } from "./src/pairing";
import MapScreen from "./src/screens/MapScreen";
import OverviewScreen from "./src/screens/OverviewScreen";
import PairScreen from "./src/screens/PairScreen";
import PlacesScreen from "./src/screens/PlacesScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import StatusScreen from "./src/screens/StatusScreen";
import TimelineScreen from "./src/screens/TimelineScreen";
import { resumeTracking } from "./src/tracking";
import { Icon, iconFont, Skeleton, type IconName } from "./src/ui";
import { SessionContext, type Session, type Tab } from "./src/ui/session";
import { Text } from "./src/ui/Text";
import { useCollectorState, type CollectorState } from "./src/ui/useCollectorState";
import { markPairingLost, refreshServerStatus, uploadNow } from "./src/uploader";

const isPairLink = (url: string | null | undefined): url is string => !!url && /^matka:\/\/pair\b/i.test(url);

const TABS: { key: Tab; label: string; icon: IconName; iconOn: IconName }[] = [
  { key: "overview", label: "Overview", icon: "view-dashboard-outline", iconOn: "view-dashboard" },
  { key: "map", label: "Map", icon: "map-outline", iconOn: "map" },
  { key: "timeline", label: "Timeline", icon: "timeline-clock-outline", iconOn: "timeline-clock" },
  { key: "places", label: "Places", icon: "map-marker-multiple-outline", iconOn: "map-marker-multiple" },
  { key: "recorder", label: "Recorder", icon: "record-circle-outline", iconOn: "record-circle" },
];

export default function App() {
  const [fontsReady] = useFonts(iconFont);
  return (
    <SafeAreaProvider>
      <ThemeProvider>{fontsReady ? <Root /> : null}</ThemeProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const t = useTheme();
  // Pairing screen shown over everything (deep link, "Pair again", "Re-pair").
  const [pairing, setPairing] = useState<{ link: string | null } | null>(null);
  // When not paired: pairing flow first, the recorder only if the user backs out of it.
  const [unpairedView, setUnpairedView] = useState<"pair" | "status" | "settings">("pair");
  const { state, refresh } = useCollectorState();

  // Launch + every return to the foreground: make sure tracking runs, flush
  // the queue, refresh the server status.
  const onForeground = useCallback(async () => {
    await resumeTracking().catch(() => null);
    await uploadNow("foreground").catch(() => null);
    await refreshServerStatus().catch(() => null);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    onForeground();
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") onForeground();
    });
    return () => sub.remove();
  }, [onForeground]);

  // matka://pair?server=…&token=… deep links (cold start and while running).
  useEffect(() => {
    const open = (url: string | null | undefined) => {
      if (isPairLink(url)) setPairing({ link: url });
    };
    Linking.getInitialURL().then(open).catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => open(url));
    return () => sub.remove();
  }, []);

  const goPair = useCallback(() => setPairing({ link: null }), []);
  const pairDone = useCallback(() => {
    setPairing(null);
    setUnpairedView("pair");
    refresh();
  }, [refresh]);

  let body;
  if (!state) {
    body = (
      <View style={{ padding: t.layout.gutter, gap: t.space.lg }}>
        <Skeleton height={40} radius={12} width="60%" />
        <Skeleton height={208} radius={28} />
      </View>
    );
  } else if (pairing) {
    body = (
      <PairScreen
        key={pairing.link ?? "manual"}
        initialLink={pairing.link}
        currentServer={state.pairing?.server ?? null}
        onDone={pairDone}
        onCancel={() => {
          setPairing(null);
          if (!state.pairing) setUnpairedView("status");
        }}
      />
    );
  } else if (!state.pairing) {
    body =
      unpairedView === "pair" ? (
        <PairScreen initialLink={null} currentServer={null} onDone={pairDone} onCancel={() => setUnpairedView("status")} />
      ) : (
        <Recorder state={state} refresh={refresh} onPair={goPair} view={unpairedView} setView={setUnpairedView} />
      );
  } else {
    // key: pairing with another server starts the viewer afresh.
    body = <Tabs key={state.pairing.server} pairing={state.pairing} state={state} refresh={refresh} goPair={goPair} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.c.bg }} edges={["top", "left", "right"]}>
      <StatusBar style={t.scheme === "dark" ? "light" : "dark"} />
      {body}
    </SafeAreaView>
  );
}

function Recorder({
  state,
  refresh,
  onPair,
  view,
  setView,
}: {
  state: CollectorState;
  refresh: () => Promise<void>;
  onPair: () => void;
  view: string;
  setView: (v: "status" | "settings") => void;
}) {
  return view === "settings" ? (
    <SettingsScreen state={state} refresh={refresh} onPair={onPair} onBack={() => setView("status")} />
  ) : (
    <StatusScreen state={state} refresh={refresh} onPair={onPair} onSettings={() => setView("settings")} />
  );
}

function Tabs({
  pairing,
  state,
  refresh,
  goPair,
}: {
  pairing: Pairing;
  state: CollectorState;
  refresh: () => Promise<void>;
  goPair: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<Tab>("overview");
  // Screens mount on first visit and then stay mounted (hidden), so lists keep
  // their state and the map WebView isn't reloaded on every tab switch.
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set(["overview"]));
  const [recorderView, setRecorderView] = useState<"status" | "settings">("status");

  const s = useStyles((th) => ({
    bar: {
      flexDirection: "row",
      backgroundColor: th.c.tabBar,
      borderTopWidth: 1,
      borderTopColor: th.c.border,
      paddingTop: th.space.sm,
      paddingHorizontal: th.space.xs,
    },
    tab: { flex: 1, alignItems: "center", gap: 4 },
    pill: { width: 56, height: 32, borderRadius: th.radius.pill, alignItems: "center", justifyContent: "center" },
    dot: { position: "absolute", top: 2, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: th.c.danger },
  }));

  const goTab = useCallback((tab: Tab) => {
    setActive(tab);
    setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab)));
  }, []);

  const onUnauthorized = useCallback(() => {
    markPairingLost()
      .catch(() => {})
      .finally(() => refresh());
  }, [refresh]);

  const session = useMemo<Session>(
    () => ({ pairing, authLost: state.authLost, onUnauthorized, goPair, goTab }),
    [pairing, state.authLost, onUnauthorized, goPair, goTab],
  );

  const screen = (tab: Tab) => {
    switch (tab) {
      case "overview":
        return <OverviewScreen collector={state} refreshCollector={refresh} />;
      case "timeline":
        return <TimelineScreen />;
      case "places":
        return <PlacesScreen />;
      case "map":
        return <MapScreen />;
      case "recorder":
        return <Recorder state={state} refresh={refresh} onPair={goPair} view={recorderView} setView={setRecorderView} />;
    }
  };

  return (
    <SessionContext.Provider value={session}>
      <View style={{ flex: 1 }}>
        {TABS.filter((tab) => visited.has(tab.key)).map((tab) => (
          <View key={tab.key} style={{ flex: 1, display: active === tab.key ? "flex" : "none" }}>
            {screen(tab.key)}
          </View>
        ))}
      </View>
      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, t.space.sm) + 4 }]} accessibilityRole="tablist">
        {TABS.map((tab) => {
          const on = active === tab.key;
          const alert = tab.key === "recorder" && (state.authLost || (state.trackingEnabled && !state.trackingRunning));
          return (
            <Pressable
              key={tab.key}
              style={s.tab}
              onPress={() => goTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={alert ? `${tab.label}, needs attention` : tab.label}
            >
              <View style={[s.pill, on && { backgroundColor: t.c.primarySoft }]}>
                <Icon name={on ? tab.iconOn : tab.icon} size={24} color={on ? t.c.primary : t.c.textMuted} />
                {alert ? <View style={s.dot} /> : null}
              </View>
              <Text variant="caption" numberOfLines={1} style={{ color: on ? t.c.primary : t.c.textMuted, fontWeight: on ? "700" : "500" }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SessionContext.Provider>
  );
}
