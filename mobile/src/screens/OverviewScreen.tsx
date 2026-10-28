import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { useStyles, useTheme } from "../design/theme";
import { count, fmtCompact, fmtDayHeading, fmtDuration, fmtLongDuration, fmtPercent, fmtSpan, fmtTime, group, isNamed, monthShort, MONTHS, placeLabel } from "../format";
import { startTracking, stopTracking } from "../tracking";
import { Banner, Button, Card, Divider, EmptyState, ErrorState, ListGroup, ListRow, SectionHeader, Skeleton } from "../ui";
import { MonthBars } from "../ui/charts";
import { Screen, ScreenHeader } from "../ui/Screen";
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
    label: monthShort(m.month - 1),
    year: m.year,
    long: `${MONTHS[m.month - 1]} ${m.year}`,
    value: Math.round(m.distance / 1000),
  }));
  const peak = months.reduce((b, m) => (m.value > b.value ? m : b), months[0] ?? { key: "", label: "", long: "", value: 0, year: 0 });
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

  // Recent visits under day headings ("Today", "Yesterday", "Sun 18 Oct") instead of a date on every row.
  const recentDays: { day: string; rows: NonNullable<typeof data>["recent"] }[] = [];
  for (const v of data?.recent ?? []) {
    const day = fmtDayHeading(new Date(v.startedAt));
    const last = recentDays[recentDays.length - 1];
    if (last && last.day === day) last.rows.push(v);
    else recentDays.push({ day, rows: [v] });
  }

  const stat = (label: string, value: string) => (
    <View style={{ flex: 1, gap: 2, paddingVertical: t.space.md, paddingHorizontal: t.space.lg }}>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="statSm" tabular numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} appBar={<ScreenHeader title="Overview" />}>
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
          {/* The loading shape: the hero line, the 2x2 grid, a chart baseline with bar stubs. */}
          <Card padded={false}>
            <View style={{ padding: t.space.lg, gap: t.space.sm }}>
              <Skeleton height={14} width="45%" radius={6} />
              <Skeleton height={28} width="40%" radius={6} />
            </View>
            <Divider />
            {[0, 1].map((r) => (
              <View key={r}>
                {r ? <Divider /> : null}
                <View style={{ flexDirection: "row" }}>
                  {[0, 1].map((c) => (
                    <View key={c} style={{ flex: 1, padding: t.space.lg, gap: 6, borderLeftWidth: c ? 1 : 0, borderLeftColor: t.c.border }}>
                      <Skeleton height={12} width="50%" radius={6} />
                      <Skeleton height={18} width="35%" radius={6} />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </Card>
          <Card style={{ gap: t.space.md }}>
            <Skeleton height={14} width="35%" radius={6} />
            <View style={{ height: 120, flexDirection: "row", alignItems: "flex-end", gap: 10, borderBottomWidth: 1, borderBottomColor: t.c.grid }}>
              {[40, 64, 30, 88, 52, 70, 46, 96, 58, 34, 76, 50].map((h, i) => (
                <Skeleton key={i} height={h} radius={4} style={{ flex: 1, width: undefined }} />
              ))}
            </View>
          </Card>
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

          {/* One card: the hero total, then the four supporting numbers. */}
          <Card padded={false}>
            <View style={{ padding: t.space.lg, gap: 2 }}>
              <Text variant="callout" color="textSecondary">
                Total distance{range ? ` · ${range}` : ""}
              </Text>
              <Text variant="display" tabular>
                {group(km)}
                <Text variant="title3" color="textSecondary" style={{ fontWeight: "400" }}>
                  {" km"}
                </Text>
              </Text>
              <Text variant="callout" color="textSecondary">
                {earth >= 100 ? `${(earth / 100).toFixed(1)} times around the Earth` : `${fmtPercent(earth / 100)} of the way around the Earth`}
              </Text>
            </View>
            <Divider />
            <View style={{ flexDirection: "row" }}>
              {stat("Visits", fmtCompact(totals!.visits))}
              <View style={{ width: 1, backgroundColor: t.c.border }} />
              {stat("Journeys", fmtCompact(totals!.trips))}
            </View>
            <Divider />
            <View style={{ flexDirection: "row" }}>
              {stat("Days recorded", fmtCompact(totals!.days))}
              <View style={{ width: 1, backgroundColor: t.c.border }} />
              {stat("GPS points", fmtCompact(totals!.points))}
            </View>
          </Card>

          {months.length > 0 && (
            <>
              <SectionHeader title="Distance by month" />
              <Card style={{ gap: t.space.lg }}>
                <View style={{ gap: 2 }}>
                  <Text variant="caption" color="textSecondary">
                    {chosen.long}
                    {chosen === peak ? " · most travelled" : ""}
                  </Text>
                  <Text variant="statSm" tabular>
                    {group(chosen.value)}
                    <Text variant="callout" color="textSecondary">
                      {" km"}
                    </Text>
                  </Text>
                </View>
                <MonthBars data={months} unit="km" onSelect={setPicked} />
              </Card>
            </>
          )}

          {topPlaces.length > 0 && (
            <>
              <SectionHeader title="Where you spend time" action={{ label: "All places", onPress: () => openInsights("places") }} />
              <ListGroup inset={0}>
                {topPlaces.map((p) => (
                  <ListRow
                    key={p.id}
                    title={placeLabel(p.name)}
                    trailing={fmtLongDuration(p.hours * 3600)}
                    below={
                      <View style={{ height: 4, borderRadius: 2, backgroundColor: t.c.surfaceAlt, marginTop: 6, overflow: "hidden" }}>
                        <View style={{ width: `${Math.max(3, (p.hours / maxHours) * 100)}%`, height: 4, borderRadius: 2, backgroundColor: t.c.barMuted }} />
                      </View>
                    }
                  />
                ))}
              </ListGroup>
            </>
          )}

          {recentDays.length > 0 && (
            <>
              <SectionHeader title="Recent visits" action={{ label: "Timeline", onPress: () => goTab("timeline") }} />
              {recentDays.map((g) => (
                <View key={g.day} style={{ gap: t.space.sm }}>
                  <Text variant="label" color="textSecondary" style={{ paddingHorizontal: t.space.lg }}>
                    {g.day}
                  </Text>
                  <ListGroup inset={0}>
                    {g.rows.map((v) => {
                      const named = isNamed(v.name);
                      const end = v.duration ? new Date(Date.parse(v.startedAt) + v.duration * 1000).toISOString() : null;
                      return (
                        <ListRow
                          key={v.id}
                          title={placeLabel(v.name)}
                          subtitle={end ? `${fmtTime(v.startedAt)}–${fmtTime(end)}` : `From ${fmtTime(v.startedAt)}`}
                          trailing={fmtDuration(v.duration)}
                          accessibilityLabel={`${named ? placeLabel(v.name) : "Unnamed place"}, ${g.day} ${fmtTime(v.startedAt)}, ${fmtDuration(v.duration)}`}
                        />
                      );
                    })}
                  </ListGroup>
                </View>
              ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
