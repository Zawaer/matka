import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MapScreen from "./src/screens/MapScreen";
import OverviewScreen from "./src/screens/OverviewScreen";
import PairScreen from "./src/screens/PairScreen";
import PlacesScreen from "./src/screens/PlacesScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import StatusScreen from "./src/screens/StatusScreen";
import TimelineScreen from "./src/screens/TimelineScreen";
import type { Pairing } from "./src/pairing";
import { resumeTracking } from "./src/tracking";
import { SessionContext, type Session, type Tab } from "./src/ui/session";
import { C } from "./src/ui/theme";
import { useCollectorState, type CollectorState } from "./src/ui/useCollectorState";
import { markPairingLost, refreshServerStatus, uploadNow } from "./src/uploader";

const isPairLink = (url: string | null | undefined): url is string => !!url && /^matka:\/\/pair\b/i.test(url);

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "📊" },
  { key: "timeline", label: "Timeline", icon: "🕑" },
  { key: "places", label: "Places", icon: "📍" },
  { key: "map", label: "Map", icon: "🗺️" },
  { key: "recorder", label: "Recorder", icon: "⏺" },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
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
    body = <ActivityIndicator color={C.primary} style={{ marginTop: 80 }} />;
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
        <PairScreen
          initialLink={null}
          currentServer={null}
          onDone={pairDone}
          onCancel={() => setUnpairedView("status")}
        />
      ) : (
        <Recorder
          state={state}
          refresh={refresh}
          onPair={goPair}
          view={unpairedView}
          setView={setUnpairedView}
        />
      );
  } else {
    // key: pairing with another server starts the viewer afresh.
    body = (
      <Tabs key={state.pairing.server} pairing={state.pairing} state={state} refresh={refresh} goPair={goPair} />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["top", "left", "right"]}>
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
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<Tab>("overview");
  // Screens mount on first visit and then stay mounted (hidden), so lists keep
  // their state and the map WebView isn't reloaded on every tab switch.
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set(["overview"]));
  const [recorderView, setRecorderView] = useState<"status" | "settings">("status");

  const goTab = useCallback((t: Tab) => {
    setActive(t);
    setVisited((v) => (v.has(t) ? v : new Set(v).add(t)));
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

  const screen = (t: Tab) => {
    switch (t) {
      case "overview":
        return <OverviewScreen collector={state} />;
      case "timeline":
        return <TimelineScreen />;
      case "places":
        return <PlacesScreen />;
      case "map":
        return <MapScreen />;
      case "recorder":
        return (
          <Recorder state={state} refresh={refresh} onPair={goPair} view={recorderView} setView={setRecorderView} />
        );
    }
  };

  return (
    <SessionContext.Provider value={session}>
      <View style={{ flex: 1 }}>
        {TABS.filter((t) => visited.has(t.key)).map((t) => (
          <View key={t.key} style={{ flex: 1, display: active === t.key ? "flex" : "none" }}>
            {screen(t.key)}
          </View>
        ))}
      </View>
      <View style={[st.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = active === t.key;
          const alert = t.key === "recorder" && (state.authLost || (state.trackingEnabled && !state.trackingRunning));
          return (
            <Pressable
              key={t.key}
              style={st.tab}
              onPress={() => goTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
            >
              <Text style={[st.tabIcon, { opacity: on ? 1 : 0.5 }]}>{t.icon}</Text>
              <Text style={[st.tabLabel, { color: on ? C.primary : alert ? C.danger : C.muted }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SessionContext.Provider>
  );
}

const st = StyleSheet.create({
  tabbar: {
    flexDirection: "row",
    backgroundColor: C.surface,
    borderTopColor: C.border,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: "center", gap: 2 },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 11, fontWeight: "600" },
});
