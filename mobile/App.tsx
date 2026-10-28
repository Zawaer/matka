import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Linking, Pressable, View } from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppFonts } from "./src/design/fonts";
import { ThemeProvider, useStyles, useTheme } from "./src/design/theme";
import { isPairingLink, type Pairing } from "./src/pairing";
import MapScreen from "./src/screens/MapScreen";
import OverviewScreen from "./src/screens/OverviewScreen";
import PairScreen from "./src/screens/PairScreen";
import InsightsScreen from "./src/screens/InsightsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import StatusScreen from "./src/screens/StatusScreen";
import TimelineScreen from "./src/screens/TimelineScreen";
import { resumeTracking } from "./src/tracking";
import { Icon, Skeleton, type IconName } from "./src/ui";
import { SessionContext, type InsightsSegment, type Session, type Tab } from "./src/ui/session";
import { Text } from "./src/ui/Text";
import { useCollectorState, type CollectorState } from "./src/ui/useCollectorState";
import { markPairingLost, refreshServerStatus, uploadNow } from "./src/uploader";
import { runWatchdog, sendHeartbeat } from "./src/watchdog";


/** How long after the tabs appear the Timeline starts loading out of sight (the first screen goes first). */
const PREWARM_DELAY_MS = 1500;

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: "overview", label: "Overview", icon: "tabOverview" },
  { key: "map", label: "Map", icon: "tabMap" },
  { key: "timeline", label: "Timeline", icon: "tabTimeline" },
  { key: "insights", label: "Insights", icon: "tabInsights" },
  { key: "recorder", label: "Recorder", icon: "tabRecorder" },
];

export default function App() {
  // Native: Inter is embedded at build time, so this is true from the first frame.
  // Web preview: hold the first render until the faces are loaded (no fallback flash).
  const fontsReady = useAppFonts();
  if (!fontsReady) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
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

  // Launch + every return to the foreground: make sure tracking runs (and
  // hasn't gone silent), flush the queue, check in with the server, refresh
  // the server status.
  const onForeground = useCallback(async () => {
    await resumeTracking().catch(() => null);
    await runWatchdog("foreground").catch(() => null);
    await uploadNow("foreground").catch(() => null);
    await sendHeartbeat().catch(() => null);
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

  // Pairing deep links (cold start and while running): matka://pair?… and,
  // should the OS ever route them here, https://<server>/pair#… links.
  useEffect(() => {
    const open = (url: string | null | undefined) => {
      if (url && isPairingLink(url)) setPairing({ link: url });
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
        <Skeleton height={34} width="55%" />
        <Skeleton height={168} />
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
  // The Timeline mounts a moment after the app opens, out of sight, so its day
  // map (a WebView) is loaded and drawn by the time the tab is first opened.
  // Kept laid out at full size (not display: none), or the map would have no
  // size to draw at (docs/redesign/daymap-perf.md).
  const [prewarm, setPrewarm] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setPrewarm(true), PREWARM_DELAY_MS);
    return () => clearTimeout(id);
  }, []);
  const [recorderView, setRecorderView] = useState<"status" | "settings">("status");
  const [insightsSegment, setInsightsSegment] = useState<InsightsSegment>("travel");
  const [timelineDate, setTimelineDate] = useState<{ date: string; n: number } | null>(null);

  const s = useStyles((th) => ({
    bar: {
      flexDirection: "row",
      backgroundColor: th.c.surface,
      borderTopWidth: 1,
      borderTopColor: th.c.border,
      paddingTop: th.space.md,
      paddingHorizontal: th.space.xs,
    },
    tab: { flex: 1, alignItems: "center", gap: th.space.xs, minHeight: 56 },
    pill: { width: 56, height: 32, alignItems: "center", justifyContent: "center" },
    pillBg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, backgroundColor: th.c.primarySoft },
    dot: { position: "absolute", top: 3, right: 13, width: 8, height: 8, borderRadius: 4, backgroundColor: th.c.danger, borderWidth: 1.5, borderColor: th.c.surface },
  }));

  const goTab = useCallback((tab: Tab) => {
    setActive(tab);
    setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab)));
  }, []);

  const openInsights = useCallback(
    (segment: InsightsSegment) => {
      setInsightsSegment(segment);
      goTab("insights");
    },
    [goTab],
  );

  const openDay = useCallback(
    (date: string) => {
      setTimelineDate((r) => ({ date, n: (r?.n ?? 0) + 1 }));
      goTab("timeline");
    },
    [goTab],
  );

  const onUnauthorized = useCallback(() => {
    markPairingLost()
      .catch(() => {})
      .finally(() => refresh());
  }, [refresh]);

  const session = useMemo<Session>(
    () => ({ pairing, authLost: state.authLost, onUnauthorized, goPair, goTab, openInsights, openDay, timelineDate }),
    [pairing, state.authLost, onUnauthorized, goPair, goTab, openInsights, openDay, timelineDate],
  );

  const screen = (tab: Tab) => {
    switch (tab) {
      case "overview":
        return <OverviewScreen collector={state} refreshCollector={refresh} />;
      case "timeline":
        // Follows each "open this day" request (Insights → trip → day) itself, without a remount.
        return <TimelineScreen />;
      case "insights":
        return <InsightsScreen segment={insightsSegment} onSegment={setInsightsSegment} active={active === "insights"} />;
      case "map":
        return <MapScreen />;
      case "recorder":
        return <Recorder state={state} refresh={refresh} onPair={goPair} view={recorderView} setView={setRecorderView} />;
    }
  };

  return (
    <SessionContext.Provider value={session}>
      <View style={{ flex: 1 }}>
        {TABS.filter((tab) => visited.has(tab.key) || (tab.key === "timeline" && prewarm)).map((tab) =>
          visited.has(tab.key) ? (
            <View key={tab.key} style={{ flex: 1, display: active === tab.key ? "flex" : "none" }}>
              {screen(tab.key)}
            </View>
          ) : (
            // Warming up: full size behind the shown tab, invisible, untouchable and hidden from screen readers.
            <View
              key={tab.key}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0, zIndex: -1 }}
              pointerEvents="none"
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              {screen(tab.key)}
            </View>
          ),
        )}
      </View>
      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, t.space.sm) }]} accessibilityRole="tablist">
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
              <View style={s.pill}>
                {/* Own layer, mounted only when active: toggling the container's background
                    drew a square on Android. */}
                {on && <View style={s.pillBg} />}
                {/* Own View: on the web an absolutely placed layer paints over a bare SVG. */}
                <View>
                  <Icon name={tab.icon} size={24} color={on ? t.c.primary : t.c.textSecondary} />
                </View>
                {alert ? <View style={s.dot} /> : null}
              </View>
              <Text variant="caption" numberOfLines={1} style={{ color: on ? t.c.text : t.c.textSecondary, fontWeight: "500" }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SessionContext.Provider>
  );
}
