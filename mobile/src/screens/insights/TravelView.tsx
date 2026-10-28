import { useCallback, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { modeMeta } from "../../design/modes";
import { useStyles, useTheme } from "../../design/theme";
import { fmtDuration } from "../../format";
import { getMonthModes, getSavedMonth, type MonthPoint } from "../../insights";
import {
  KIND_META,
  addMonths,
  fmtKm,
  fmtMonth,
  modeShares,
  monthRange,
  orderModeCards,
  plural,
  roundShares,
  savedRowText,
  scaled,
} from "../../insights-logic";
import type { Pairing } from "../../pairing";
import { Card, Divider, EmptyState, ErrorState, IconTile, ListGroup, ListRow, ModeIcon, SectionHeader, Skeleton, StatGrid } from "../../ui";
import { Pager, Screen } from "../../ui/Screen";
import { useSession, useViewerQuery } from "../../ui/session";
import { Text } from "../../ui/Text";
import { useRefresh } from "./parts";

/** Six months of one mode: the shown month in the mode's colour, tap a bar to open that month. */
function MiniBars({ mode, history, selected, onPick }: { mode: string; history: MonthPoint[]; selected: string; onPick: (m: string) => void }) {
  const t = useTheme();
  const color = t.mode(mode);
  const h = scaled(history.map((p) => p.distance));
  return (
    <View style={{ flexDirection: "row", gap: 6, marginTop: t.space.md }}>
      {history.map((p, i) => {
        const on = p.month === selected;
        return (
          <Pressable
            key={p.month}
            onPress={() => onPick(p.month)}
            accessibilityRole="button"
            accessibilityLabel={`${fmtMonth(p.month)}: ${fmtKm(p.distance)}`}
            accessibilityState={{ selected: on }}
            style={{ flex: 1, alignItems: "center", gap: 4 }}
          >
            <View style={{ height: 36, width: "100%", justifyContent: "flex-end", alignItems: "center" }}>
              <View
                style={{
                  width: "70%",
                  maxWidth: 20,
                  height: p.distance > 0 ? Math.max(3, Math.round(h[i] * 36)) : 2,
                  borderTopLeftRadius: 3,
                  borderTopRightRadius: 3,
                  // The shown month in the mode's colour, the others neutral.
                  backgroundColor: p.distance === 0 ? t.c.grid : on ? color : t.c.barMuted,
                }}
              />
            </View>
            <Text variant="micro" color={on ? "text" : "textMuted"} style={{ fontWeight: on ? "500" : "400" }}>
              {fmtMonth(p.month, true)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SavedPlacesCard({ month, version }: { month: string; version: number }) {
  // `version` changes on pull-to-refresh, which makes a new fetcher and reloads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetcher = useCallback((p: Pairing) => getSavedMonth(p, month), [month, version]);
  const { data, error } = useViewerQuery(fetcher);
  return (
    <>
      <SectionHeader title="Saved places" />
      {!data ? (
        error ? (
          <Card>
            <Text variant="callout" color="textSecondary">
              Couldn&apos;t load your saved places.
            </Text>
          </Card>
        ) : (
          <Skeleton height={136} />
        )
      ) : data.saved === 0 ? (
        <Card>
          <Text variant="callout" color="textSecondary">
            Save your home, school or work on the Places page of the web app to see how much time you spend at each.
          </Text>
        </Card>
      ) : data.rows.length === 0 ? (
        <Card>
          <Text variant="callout" color="textSecondary">
            No time at your saved places this month.
          </Text>
        </Card>
      ) : (
        <ListGroup>
          {data.rows.map((r) => {
            const x = savedRowText(r);
            return (
              <ListRow
                key={r.placeId}
                leading={<IconTile icon={KIND_META[r.kind].icon} tone="accent" />}
                title={x.title}
                subtitle={x.subtitle}
                trailing={x.primary}
                trailingSub={x.secondary}
              />
            );
          })}
        </ListGroup>
      )}
    </>
  );
}

export default function TravelView({ header }: { header: ReactNode }) {
  const t = useTheme();
  const { authLost } = useSession();
  // null = the latest month with travel (server default)
  const [want, setWant] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const fetcher = useCallback((p: Pairing) => getMonthModes(p, want), [want]);
  const { data, error, loading, reload } = useViewerQuery(fetcher);
  const { refreshing, onRefresh } = useRefresh(
    useCallback(async () => {
      setVersion((v) => v + 1);
      await reload();
    }, [reload]),
  );

  const s = useStyles((th) => ({
    shareBar: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: th.c.surfaceAlt, gap: 2 },
    legend: { flexDirection: "row", flexWrap: "wrap", columnGap: th.space.lg, rowGap: th.space.sm },
  }));

  // The picked month shows at once; its numbers follow when they arrive.
  const month = want ?? data?.month ?? null;
  const months = data ? monthRange(data.firstMonth, data.lastMonth, data.month) : [];
  const idx = month ? months.indexOf(month) : -1;
  const go = (delta: number) => {
    if (!month) return;
    const next = addMonths(month, delta);
    if (months.includes(next)) setWant(next);
  };

  const shares = data ? modeShares(data.modes) : [];
  const pct = roundShares(shares.map((m) => m.share));
  const cards = data ? orderModeCards(data.modes) : [];
  const journeys = shares.reduce((a, m) => a + m.count, 0);

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {header}
      <Pager
        kicker={month ? month.slice(0, 4) : " "}
        title={month ? fmtMonth(month).split(" ")[0] : "…"}
        onPrev={idx > 0 ? () => go(-1) : undefined}
        onNext={idx >= 0 && idx < months.length - 1 ? () => go(1) : undefined}
        prevLabel="Previous month"
        nextLabel="Next month"
      />

      {authLost && !data ? null : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <View style={{ gap: t.space.lg }}>
          <Skeleton height={70} />
          <Skeleton height={120} />
          <Skeleton height={200} />
        </View>
      ) : data.modes.length === 0 ? (
        <Card>
          {data.firstMonth ? (
            <EmptyState icon="quiet" title="A quiet stretch" body="No journeys in this month or the five before it. Use the arrows to browse other months." />
          ) : (
            <EmptyState icon="tabInsights" title="No travel yet" body="Your travel shows up here once your phone has logged a few journeys." />
          )}
        </Card>
      ) : (
        <View style={{ gap: t.space.lg, opacity: loading ? 0.5 : 1 }}>
          {error ? (
            <Text variant="callout" color="danger">
              {error}
            </Text>
          ) : null}
          <StatGrid
            size="sm"
            columns={3}
            items={[
              { label: "Distance", value: fmtKm(data.distance) },
              { label: "On the move", value: fmtDuration(data.duration) },
              { label: "Journeys", value: journeys.toLocaleString() },
            ]}
          />

          {shares.length > 0 && (
            <>
              <SectionHeader title="Distance by mode" />
              <Card style={{ gap: t.space.lg }}>
                <View style={s.shareBar}>
                  {shares.map((m) => (m.share > 0 ? <View key={m.mode} style={{ flex: m.share, backgroundColor: t.mode(m.mode) }} /> : null))}
                </View>
                <View style={s.legend}>
                  {shares.map((m, i) => (
                    <View key={m.mode} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.mode(m.mode) }} />
                      <Text variant="callout">{modeMeta(m.mode).label}</Text>
                      <Text variant="callout" color="textSecondary" tabular>
                        {pct[i]} %
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            </>
          )}

          <SavedPlacesCard month={data.month} version={version} />

          <SectionHeader title="By mode" trailing="Last 6 months" />
          <Card padded={false}>
            {cards.map(({ mode: m, quiet }, i) => (
              <View key={m.mode}>
                {i > 0 ? <Divider /> : null}
                <View style={{ padding: t.space.lg, opacity: quiet ? 0.6 : 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.md }}>
                    <ModeIcon mode={m.mode} size={40} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="headline">{modeMeta(m.mode).label}</Text>
                      <Text variant="callout" color="textSecondary" tabular>
                        {m.count === 0 ? "None this month" : plural(m.count, "journey")}
                      </Text>
                    </View>
                    {m.count > 0 || m.distance > 0 ? (
                      <View style={{ alignItems: "flex-end", gap: 2 }}>
                        <Text variant="headline" tabular>
                          {fmtKm(m.distance)}
                        </Text>
                        <Text variant="callout" color="textSecondary" tabular>
                          {fmtDuration(m.duration)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <MiniBars mode={m.mode} history={m.history} selected={data.month} onPick={(mm) => months.includes(mm) && setWant(mm)} />
                </View>
              </View>
            ))}
          </Card>

          <Text variant="caption" color="textMuted" style={{ paddingHorizontal: t.space.lg }}>
            Months follow your account&apos;s time zone; a journey across a month boundary is split by time. Tap a bar to open that
            month.
          </Text>
        </View>
      )}
    </Screen>
  );
}
