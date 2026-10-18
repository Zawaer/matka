import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { useStyles, useTheme } from "../design/theme";
import { getJSON, type Overview } from "../api";
import { fmtCompact, fmtDuration, fmtWhen, greeting } from "../format";
import { flushQueue, isTracking, queuedCount, requestPermissions, startTracking, stopTracking } from "../collector";
import { Button, Card, EmptyState, ErrorState, Icon, IconChip, SectionTitle, Skeleton } from "../ui";
import { ShareBar, MonthBars } from "../ui/charts";
import { Screen } from "../ui/Screen";
import { Text } from "../ui/Text";

const EARTH_KM = 40_075;

function PulseDot({ active }: { active: boolean }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0)).current;
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

export default function OverviewScreen() {
  const t = useTheme();
  const [data, setData] = useState<Overview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadErr(null);
      setData(await getJSON<Overview>("/api/overview"));
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
    isTracking().then(setTracking);
    // Upload anything recorded while the server was unreachable.
    flushQueue().finally(() => setQueued(queuedCount()));
    const id = setInterval(() => {
      isTracking().then(setTracking);
      setQueued(queuedCount());
    }, 4000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      if (tracking) {
        await stopTracking();
        setTracking(false);
      } else {
        const p = await requestPermissions();
        if (p.fg !== "granted" || p.bg !== "granted") {
          setNotice("Matka needs location set to “Allow all the time” to record in the background.");
        } else {
          await startTracking();
          setTracking(true);
        }
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }, [tracking]);

  const s = useStyles((th) => ({
    topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    brand: { flexDirection: "row", alignItems: "center", gap: 10 },
    logo: { width: 34, height: 34, borderRadius: 11, backgroundColor: th.c.primary, alignItems: "center", justifyContent: "center" },
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
    tile: { flex: 1, gap: th.space.sm, padding: th.space.md + 2 },
    notice: { flexDirection: "row", gap: th.space.sm, alignItems: "flex-start", backgroundColor: th.c.dangerSoft, borderRadius: th.radius.md, padding: th.space.md },
    list: { gap: th.space.lg },
    listRow: { flexDirection: "row", alignItems: "center", gap: th.space.md },
  }));

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), flushQueue()]);
    setQueued(queuedCount());
    setRefreshing(false);
  };

  const totals = data?.totals;
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
  const earth = totals ? (totals.totalKm / EARTH_KM) * 100 : 0;
  const maxCity = Math.max(1, ...(data?.cities ?? []).map((c) => c.count));
  const empty = totals != null && totals.points === 0;

  const recording = (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <PulseDot active={tracking} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline">{tracking ? "Recording your journey" : "Recording is off"}</Text>
        <Text variant="caption" color="textSecondary">
          {queued > 0 ? `${queued.toLocaleString()} points waiting to upload` : tracking ? "Collecting in the background" : "Tap Start to log new places"}
        </Text>
      </View>
      <Button label={tracking ? "Stop" : "Start"} icon={tracking ? "stop" : "play"} variant={tracking ? "danger" : "primary"} onPress={toggle} busy={busy} />
    </Card>
  );

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={s.topBar}>
        <View style={s.brand}>
          <View style={s.logo}>
            <Icon name="compass-outline" size={20} color={t.c.onPrimary} />
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
          {!data ? (loadErr ? "We couldn't load your journeys" : "Loading your journeys…") : totals!.days > 0 ? `${totals!.days.toLocaleString()} days of journeys so far` : "Here is where your travels will show up"}
        </Text>
      </View>

      {notice && (
        <View style={s.notice}>
          <Icon name="alert-circle-outline" size={20} color={t.c.danger} />
          <Text variant="callout" style={{ flex: 1, color: t.c.danger }}>
            {notice}
          </Text>
        </View>
      )}

      {loadErr && !data ? (
        <>
          {recording}
          <ErrorState message={loadErr} onRetry={load} />
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
                <Text variant="caption" color="onHero" style={{ fontWeight: "700" }}>
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
                {totals!.totalKm.toLocaleString()}
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

          <View style={s.row3}>
            {[
              { icon: "map-marker-check-outline", tint: "coral", label: "Visits", value: totals!.visits },
              { icon: "calendar-check-outline", tint: "amber", label: "Days tracked", value: totals!.days },
              { icon: "crosshairs-gps", tint: "mint", label: "GPS points", value: totals!.points },
            ].map((x) => (
              <Card key={x.label} style={s.tile}>
                <IconChip icon={x.icon as never} tint={x.tint as never} size={34} />
                <View>
                  <Text variant="stat" numberOfLines={1} adjustsFontSizeToFit>
                    {fmtCompact(x.value)}
                  </Text>
                  <Text variant="caption" color="textSecondary">
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

          {data.cities.length > 0 && (
            <>
              <SectionTitle title="Where you spend time" trailing="by GPS points" />
              <Card style={s.list}>
                {data.cities.slice(0, 5).map((c) => (
                  <ShareBar key={c.city} label={c.city} value={c.count} max={maxCity} display={fmtCompact(c.count)} />
                ))}
              </Card>
            </>
          )}

          {data.recent.length > 0 && (
            <>
              <SectionTitle title="Recent visits" />
              <Card style={s.list}>
                {data.recent.map((v) => {
                  const named = v.name && v.name !== "Unknown Location";
                  return (
                    <View key={v.id} style={s.listRow}>
                      <IconChip icon={named ? "map-marker-outline" : "help-circle-outline"} tint={named ? "violet" : "slate"} size={38} />
                      <View style={{ flex: 1 }}>
                        <Text variant="headline" numberOfLines={1}>
                          {named ? v.name : "Unnamed place"}
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
