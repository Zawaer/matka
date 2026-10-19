import { useEffect, useState } from "react";
import { Animated, Easing, Image, Pressable, View } from "react-native";
import { useStyles, useTheme } from "../design/theme";
import { count, fmtCompact, fmtDuration, fmtWhen, greeting } from "../format";
import { startTracking, stopTracking } from "../tracking";
import { Button, Card, EmptyState, ErrorState, Icon, IconChip, SectionTitle, Skeleton } from "../ui";
import { MonthBars, ShareBar } from "../ui/charts";
import { Screen } from "../ui/Screen";
import { PairingLost, useSession, useViewerQuery } from "../ui/session";
import { Text } from "../ui/Text";
import type { CollectorState } from "../ui/useCollectorState";
import { uploadNow } from "../uploader";
import { getOverview } from "../viewer";

const EARTH_KM = 40_075;
const placeName = (n: string | null) => (n && n !== "Unknown Location" ? n : null);

function PulseDot({ active }: { active: boolean }) {
  const t = useTheme();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active, v]);
  const color = active ? t.c.accent : t.c.textMuted;
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
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.5] }) }],
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
    topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    brand: { flexDirection: "row", alignItems: "center", gap: 10 },
    logo: { width: 34, height: 34, borderRadius: 11, overflow: "hidden" },
    hero: {
      backgroundColor: th.c.hero,
      borderRadius: th.radius.xl,
      padding: th.space.xl,
      overflow: "hidden",
      minHeight: 208,
      justifyContent: "space-between",
      boxShadow: th.elev.glow,
    },
    heroPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.16)", borderRadius: th.radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
    ring: { position: "absolute", borderWidth: 1.5, borderColor: th.c.heroRing },
    row3: { flexDirection: "row", gap: th.space.md },
    tiles: { flexDirection: "row", flexWrap: "wrap", gap: th.space.md },
    tile: { flexBasis: "40%", flexGrow: 1, gap: th.space.sm, padding: th.space.md + 2 },
    notice: { flexDirection: "row", gap: th.space.sm, alignItems: "flex-start", backgroundColor: th.c.dangerSoft, borderRadius: th.radius.md, padding: th.space.md },
    list: { gap: th.space.lg },
    listRow: { flexDirection: "row", alignItems: "center", gap: th.space.md },
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
    value: Math.round(m.distance / 1000),
  }));
  const peak = months.reduce((b, m) => (m.value > b.value ? m : b), months[0] ?? { key: "", label: "", value: 0 });
  const chosen = picked != null ? months[picked] : peak;
  const range =
    totals?.first && totals?.last
      ? `${new Date(totals.first).toLocaleDateString([], { day: "numeric", month: "short" })} – ${new Date(totals.last).toLocaleDateString([], { day: "numeric", month: "short" })}`
      : "";
  const earth = (km / EARTH_KM) * 100;
  const topPlaces = (data?.topPlaces ?? []).slice(0, 5);
  const maxHours = Math.max(0.01, ...topPlaces.map((p) => p.hours));
  const empty = totals != null && totals.points === 0;

  const recording = (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Pressable onPress={() => goTab("recorder")} accessibilityRole="button" accessibilityLabel="Open recorder" style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <PulseDot active={running} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline">{running ? "Recording your journey" : tracking ? "Recording isn't running" : "Recording is off"}</Text>
          <Text variant="caption" color="textSecondary">
            {queued > 0
              ? `${count(queued)} points waiting to upload`
              : running
                ? "Collecting in the background"
                : tracking
                  ? "Open the recorder to see why"
                  : "Tap Start to log new places"}
          </Text>
        </View>
      </Pressable>
      <Button label={tracking ? "Stop" : "Start"} icon={tracking ? "stop" : "play"} variant={tracking ? "danger" : "primary"} onPress={toggle} busy={busy} />
    </Card>
  );

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={s.topBar}>
        <View style={s.brand}>
          <View style={s.logo}>
            <Image source={require("../../assets/icon.png")} style={{ width: 34, height: 34 }} />
          </View>
          <Text variant="title3">Matka</Text>
        </View>
        <Text variant="callout" color="textSecondary">
          {new Date().toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
        </Text>
      </View>

      <View style={{ gap: 2 }}>
        <Text variant="title1">{greeting()}</Text>
        <Text variant="callout" color="textSecondary">
          {!data
            ? loadErr
              ? "We couldn't load your journeys"
              : "Loading your journeys…"
            : totals!.days > 0
              ? `${totals!.days.toLocaleString()} days of journeys so far`
              : "Here is where your travels will show up"}
        </Text>
      </View>

      {authLost ? <PairingLost /> : null}

      {notice && (
        <View style={s.notice}>
          <Icon name="alert-circle-outline" size={20} color={t.c.danger} />
          <Text variant="callout" style={{ flex: 1, color: t.c.danger }}>
            {notice}
          </Text>
        </View>
      )}

      {authLost && !data ? (
        recording
      ) : loadErr && !data ? (
        <>
          {recording}
          <ErrorState message={loadErr} onRetry={reload} />
        </>
      ) : !data ? (
        <>
          <Skeleton height={208} radius={28} />
          <Skeleton height={76} radius={20} />
          <View style={s.row3}>
            <Skeleton height={112} radius={20} style={{ flex: 1, width: undefined }} />
            <Skeleton height={112} radius={20} style={{ flex: 1, width: undefined }} />
            <Skeleton height={112} radius={20} style={{ flex: 1, width: undefined }} />
          </View>
          <Skeleton height={250} radius={20} />
        </>
      ) : empty ? (
        <>
          {recording}
          <Card>
            <EmptyState icon="map-marker-path" title="Your journey starts here" body="Turn on recording and go for a walk. Places, routes and trips will appear as you move." />
          </Card>
        </>
      ) : (
        <>
          <View style={s.hero}>
            {[300, 210, 130].map((d, i) => (
              <View key={d} style={[s.ring, { width: d, height: d, borderRadius: d, right: -d / 3.2, top: -d / 2.6, opacity: 1 - i * 0.2 }]} />
            ))}
            {range ? (
              <View style={s.heroPill}>
                <Icon name="calendar-blank-outline" size={14} color={t.c.onHero} />
                <Text variant="caption" color="onHero" style={{ fontWeight: "800" }}>
                  {range}
                </Text>
              </View>
            ) : null}
            <View>
              <Text variant="overline" color="onHeroMuted">
                Total distance
              </Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                <Text variant="display" color="onHero">
                  {km.toLocaleString()}
                </Text>
                <Text variant="title2" color="onHeroMuted">
                  km
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <Icon name="earth" size={16} color={t.c.onHeroMuted} />
                <Text variant="callout" color="onHeroMuted">
                  {earth >= 100 ? `That is ${(earth / 100).toFixed(1)} laps around the Earth` : `That is ${Math.round(earth)}% of the way around the Earth`}
                </Text>
              </View>
            </View>
          </View>

          {recording}

          <View style={s.tiles}>
            {(
              [
                { icon: "map-marker-check-outline", tint: "coral", label: "Visits", value: totals!.visits },
                { icon: "routes", tint: "sky", label: "Trips", value: totals!.trips },
                { icon: "calendar-check-outline", tint: "amber", label: "Days tracked", value: totals!.days },
                { icon: "crosshairs-gps", tint: "mint", label: "GPS points", value: totals!.points },
              ] as const
            ).map((x) => (
              <Card key={x.label} style={s.tile}>
                <IconChip icon={x.icon} tint={x.tint} size={34} />
                <View>
                  <Text variant="stat" numberOfLines={1} adjustsFontSizeToFit>
                    {fmtCompact(x.value)}
                  </Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    {x.label}
                  </Text>
                </View>
              </Card>
            ))}
          </View>

          {months.length > 0 && (
            <Card style={{ gap: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View>
                  <Text variant="title3">Distance by month</Text>
                  <Text variant="caption" color="textSecondary">
                    Tap a bar for the exact distance
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text variant="stat" style={{ fontSize: 22, lineHeight: 26 }}>
                    {chosen.value.toLocaleString()} km
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {chosen.label}
                    {chosen === peak ? " · best month" : ""}
                  </Text>
                </View>
              </View>
              <MonthBars data={months} unit="km" onSelect={setPicked} />
            </Card>
          )}

          {topPlaces.length > 0 && (
            <>
              <SectionTitle title="Where you spend time" trailing="by hours there" />
              <Pressable onPress={() => openInsights("places")} accessibilityRole="button" accessibilityLabel="Open places">
                <Card style={s.list}>
                  {topPlaces.map((p) => (
                    <ShareBar key={p.id} label={placeName(p.name) ?? "Unnamed place"} value={p.hours} max={maxHours} display={fmtDuration(p.hours * 3600)} />
                  ))}
                </Card>
              </Pressable>
            </>
          )}

          {data.recent.length > 0 && (
            <>
              <SectionTitle title="Recent visits" />
              <Card style={s.list}>
                {data.recent.map((v) => {
                  const named = placeName(v.name);
                  return (
                    <View key={v.id} style={s.listRow}>
                      <IconChip icon={named ? "map-marker-outline" : "help-circle-outline"} tint={named ? "violet" : "slate"} size={38} />
                      <View style={{ flex: 1 }}>
                        <Text variant="headline" numberOfLines={2}>
                          {named ?? "Unnamed place"}
                        </Text>
                        <Text variant="caption" color="textSecondary">
                          {fmtWhen(v.startedAt)}
                        </Text>
                      </View>
                      <Text variant="callout" color="textSecondary" tabular>
                        {fmtDuration(v.duration)}
                      </Text>
                    </View>
                  );
                })}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
