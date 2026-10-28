import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { useStyles, useTheme } from "../design/theme";
import { count, fmtCompact, fmtDuration, fmtSpan, fmtWhen, greeting, isNamed, placeLabel } from "../format";
import { startTracking, stopTracking } from "../tracking";
import { Banner, Button, Card, EmptyState, ErrorState, IconTile, ListGroup, ListRow, SectionHeader, Skeleton, StatGrid } from "../ui";
import { MonthBars, ShareBar } from "../ui/charts";
import { Screen } from "../ui/Screen";
import { PairingLost, useSession, useViewerQuery } from "../ui/session";
import { Text } from "../ui/Text";
import type { CollectorState } from "../ui/useCollectorState";
import { uploadNow } from "../uploader";
import { getOverview } from "../viewer";

const EARTH_KM = 40_075;

/** Recording state as a dot: pulsing while recording, grey when off, red when it should run but doesn't. */
function StatusDot({ state }: { state: "on" | "off" | "problem" }) {
  const t = useTheme();
  const [v] = useState(() => new Animated.Value(0));
  const active = state === "on";
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active, v]);
  const color = state === "on" ? t.c.success : state === "problem" ? t.c.danger : t.c.textMuted;
  return (
    <View style={{ width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
      {active && (
        <Animated.View
          style={{
            position: "absolute",
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] }) }],
          }}
        />
      )}
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
    </View>
  );
}

export default function OverviewScreen({
  collector,
  refreshCollector,
}: {
  collector: CollectorState | null;
  refreshCollector: () => Promise<void>;
}) {
  const t = useTheme();
  const { authLost, goTab, openInsights } = useSession();
  const { data, error: loadErr, reload } = useViewerQuery(getOverview);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);

  const tracking = !!collector?.trackingEnabled;
  const running = tracking && !!collector?.trackingRunning;
  const queued = collector?.queued ?? 0;

  const toggle = async () => {
    setBusy(true);
    setNotice(null);
    try {
      if (tracking) {
        await stopTracking();
      } else {
        const r = await startTracking();
        if (!r.ok) setNotice(r.error);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      await refreshCollector();
      setBusy(false);
    }
  };

  const s = useStyles((th) => ({
    recording: { flexDirection: "row", alignItems: "center", gap: th.space.md, paddingVertical: th.space.md },
    hero: { gap: th.space.xs },
  }));

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([reload(), uploadNow("manual").catch(() => null)]);
    await refreshCollector();
    setRefreshing(false);
  };

  const totals = data?.totals;
  const km = totals ? Math.round(totals.distance / 1000) : 0;
  const months = (data?.months ?? []).map((m) => ({
    key: `${m.year}-${m.month}`,
    label: new Date(m.year, m.month - 1, 1).toLocaleDateString([], { month: "short" }),
    long: new Date(m.year, m.month - 1, 1).toLocaleDateString([], { month: "long", year: "numeric" }),
    value: Math.round(m.distance / 1000),
  }));
  const peak = months.reduce((b, m) => (m.value > b.value ? m : b), months[0] ?? { key: "", label: "", long: "", value: 0 });
  const chosen = picked != null ? months[picked] : peak;
  const range = totals?.first && totals?.last ? fmtSpan(totals.first, totals.last) : "";
  const earth = (km / EARTH_KM) * 100;
  const topPlaces = (data?.topPlaces ?? []).slice(0, 5);
  const maxHours = Math.max(0.01, ...topPlaces.map((p) => p.hours));
  const empty = totals != null && totals.points === 0;

  const recording = (
    <Card style={s.recording}>
      <Pressable
        onPress={() => goTab("recorder")}
        accessibilityRole="button"
        accessibilityLabel="Open recorder"
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: t.space.md, minHeight: 48 }}
      >
        <StatusDot state={running ? "on" : tracking ? "problem" : "off"} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline">{running ? "Recording" : tracking ? "Recording isn't running" : "Recording is off"}</Text>
          <Text variant="callout" color="textSecondary" tabular>
            {queued > 0
              ? `${count(queued)} points waiting to upload`
              : running
                ? "Collecting in the background"
                : tracking
                  ? "Open the recorder to see why"
                  : "Start to log places and routes"}
          </Text>
        </View>
      </Pressable>
      <Button
        label={tracking ? "Stop" : "Start"}
        icon={tracking ? "stop" : "start"}
        variant={tracking ? "secondary" : "primary"}
        size="sm"
        onPress={toggle}
        busy={busy}
      />
    </Card>
  );

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: 2, paddingTop: t.space.xs }}>
        <Text variant="callout" color="textSecondary">
          {new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {greeting()}
        </Text>
      </View>

      {authLost ? <PairingLost /> : null}
      {notice ? <Banner tone="danger" message={notice} /> : null}

      {authLost && !data ? (
        recording
      ) : loadErr && !data ? (
        <>
          {recording}
          <ErrorState message={loadErr} onRetry={reload} />
        </>
      ) : !data ? (
        <>
          {recording}
          <Skeleton height={124} />
          <Skeleton height={150} />
          <Skeleton height={240} />
        </>
      ) : empty ? (
        <>
          {recording}
          <Card>
            <EmptyState
              icon="route"
              title="Your journeys start here"
              body="Start recording and go about your day. Places, routes and trips appear here as the server processes them."
            />
          </Card>
        </>
      ) : (
        <>
          {recording}

          <Card style={s.hero}>
            <Text variant="callout" color="textSecondary">
              Total distance{range ? ` · ${range}` : ""}
            </Text>
            <Text variant="display" tabular>
              {km.toLocaleString()}
              <Text variant="title3" color="textSecondary">
                {" km"}
              </Text>
            </Text>
            <Text variant="callout" color="textSecondary">
              {earth >= 100 ? `${(earth / 100).toFixed(1)} times around the Earth` : `${Math.round(earth)} % of the way around the Earth`}
            </Text>
          </Card>

          <StatGrid
            items={[
              { label: "Visits", value: fmtCompact(totals!.visits) },
              { label: "Journeys", value: fmtCompact(totals!.trips) },
              { label: "Days recorded", value: fmtCompact(totals!.days) },
              { label: "GPS points", value: fmtCompact(totals!.points) },
            ]}
          />

          {months.length > 0 && (
            <>
              <SectionHeader title="Distance by month" />
              <Card style={{ gap: t.space.lg }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <View style={{ gap: 2 }}>
                    <Text variant="caption" color="textSecondary">
                      {chosen.long}
                      {chosen === peak ? " · most travelled" : ""}
                    </Text>
                    <Text variant="statSm" tabular>
                      {chosen.value.toLocaleString()}
                      <Text variant="callout" color="textSecondary">
                        {" km"}
                      </Text>
                    </Text>
                  </View>
                  <Text variant="caption" color="textMuted">
                    Tap a month
                  </Text>
                </View>
                <MonthBars data={months} unit="km" onSelect={setPicked} />
              </Card>
            </>
          )}

          {topPlaces.length > 0 && (
            <>
              <SectionHeader title="Where you spend time" action={{ label: "All places", onPress: () => openInsights("places") }} />
              <Card style={{ gap: t.space.lg }}>
                {topPlaces.map((p) => (
                  <ShareBar key={p.id} label={placeLabel(p.name)} value={p.hours} max={maxHours} display={fmtDuration(p.hours * 3600)} />
                ))}
              </Card>
            </>
          )}

          {data.recent.length > 0 && (
            <>
              <SectionHeader title="Recent visits" action={{ label: "Timeline", onPress: () => goTab("timeline") }} />
              <ListGroup>
                {data.recent.map((v) => {
                  const named = isNamed(v.name) ? v.name : null;
                  return (
                    <ListRow
                      key={v.id}
                      leading={<IconTile icon={named ? "place" : "unnamedPlace"} />}
                      title={named ?? "Unnamed place"}
                      subtitle={fmtWhen(v.startedAt)}
                      trailing={fmtDuration(v.duration)}
                    />
                  );
                })}
              </ListGroup>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
