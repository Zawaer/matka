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
import { Card, EmptyState, ErrorState, IconChip, RoundButton, Skeleton } from "../../ui";
import { Screen } from "../../ui/Screen";
import { useSession, useViewerQuery } from "../../ui/session";
import { Text } from "../../ui/Text";
import { ModeIcon, StatRow, StatTile, useRefresh } from "./parts";

/** Six months of one mode: the shown month in the mode's colour, tap a bar to open that month. */
function MiniBars({ mode, history, selected, onPick }: { mode: string; history: MonthPoint[]; selected: string; onPick: (m: string) => void }) {
  const t = useTheme();
  const color = t.mode(mode);
  const h = scaled(history.map((p) => p.distance));
  return (
    <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
      {history.map((p, i) => {
        const on = p.month === selected;
        return (
          <Pressable
            key={p.month}
            onPress={() => onPick(p.month)}
            accessibilityRole="button"
            accessibilityLabel={`${fmtMonth(p.month)}: ${fmtKm(p.distance)}`}
            style={{ flex: 1, alignItems: "center", gap: 4 }}
          >
            <View style={{ height: 40, width: "100%", justifyContent: "flex-end", alignItems: "center" }}>
              <View
                style={{
                  width: "70%",
                  maxWidth: 22,
                  height: p.distance > 0 ? Math.max(3, Math.round(h[i] * 40)) : 2,
                  borderTopLeftRadius: 3,
                  borderTopRightRadius: 3,
                  backgroundColor: p.distance > 0 ? color : t.c.grid,
                  opacity: on || p.distance === 0 ? 1 : 0.38,
                }}
              />
            </View>
            <Text variant="caption" color={on ? "text" : "textMuted"} style={[{ fontSize: 11 }, on && { fontWeight: "800" }]}>
              {fmtMonth(p.month, true)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SavedPlacesCard({ month, version }: { month: string; version: number }) {
  const t = useTheme();
  // `version` changes on pull-to-refresh, which makes a new fetcher and reloads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetcher = useCallback((p: Pairing) => getSavedMonth(p, month), [month, version]);
  const { data, error } = useViewerQuery(fetcher);
  return (
    <Card style={{ gap: 12 }}>
      <Text variant="title3">Saved places</Text>
      {!data ? (
        error ? (
          <Text variant="callout" color="textSecondary">
            Couldn&apos;t load your saved places.
          </Text>
        ) : (
          <Skeleton height={56} radius={14} />
        )
      ) : data.saved === 0 ? (
        <Text variant="callout" color="textSecondary">
          Save your homes, school or work on the Places page of the web app to see how much time you spend at each.
        </Text>
      ) : data.rows.length === 0 ? (
        <Text variant="callout" color="textSecondary">
          No time at your saved places this month.
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {data.rows.map((r) => {
            const x = savedRowText(r);
            return (
              <View
                key={r.placeId}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: t.c.surfaceAlt, borderRadius: t.radius.md, padding: 10 }}
              >
                <IconChip icon={KIND_META[r.kind].icon} tint={r.kind === "home" || r.kind === "family" ? "coral" : "violet"} size={36} />
                <View style={{ flex: 1 }}>
                  <Text variant="headline" numberOfLines={1}>
                    {x.title}
                  </Text>
                  {x.subtitle ? (
                    <Text variant="caption" color="textSecondary">
                      {x.subtitle}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text variant="callout" tabular style={{ fontWeight: "800" }}>
                    {x.primary}
                  </Text>
                  {x.secondary ? (
                    <Text variant="caption" color="textMuted" tabular>
                      {x.secondary}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
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
    nav: { flexDirection: "row", alignItems: "center", gap: th.space.md },
    shareBar: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: th.c.surfaceAlt, gap: 2 },
    legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6 },
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
      <View style={s.nav}>
        <RoundButton icon="chevron-left" label="Previous month" onPress={() => go(-1)} disabled={idx <= 0} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text variant="overline" color="primary">
            {month ? month.slice(0, 4) : " "}
          </Text>
          <Text variant="title2">{month ? fmtMonth(month).split(" ")[0] : "…"}</Text>
        </View>
        <RoundButton icon="chevron-right" label="Next month" onPress={() => go(1)} disabled={idx < 0 || idx >= months.length - 1} />
      </View>

      {authLost && !data ? null : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Skeleton height={76} radius={20} style={{ flex: 1, width: undefined }} />
            <Skeleton height={76} radius={20} style={{ flex: 1, width: undefined }} />
          </View>
          <Skeleton height={110} radius={20} />
          <Skeleton height={120} radius={20} />
          <Skeleton height={120} radius={20} />
        </View>
      ) : data.modes.length === 0 ? (
        <Card>
          {data.firstMonth ? (
            <EmptyState icon="sleep" title="A quiet stretch" body="No journeys in this month or the five before it. Use the arrows to browse other months." />
          ) : (
            <EmptyState icon="chart-box-outline" title="No travel yet" body="Your travel shows up here once your phone has logged a few journeys." />
          )}
        </Card>
      ) : (
        <View style={{ gap: t.space.lg, opacity: loading ? 0.5 : 1 }}>
          {error ? (
            <Text variant="caption" style={{ color: t.c.danger }}>
              {error}
            </Text>
          ) : null}
          <StatRow>
            <StatTile label="Distance" value={fmtKm(data.distance)} accent />
            <StatTile label="Time on the move" value={fmtDuration(data.duration)} />
            <StatTile label="Journeys" value={journeys.toLocaleString()} style={{ flexBasis: "100%" }} />
          </StatRow>

          {shares.length > 0 && (
            <Card style={{ gap: 12 }}>
              <Text variant="title3">Distance by mode</Text>
              <View style={s.shareBar}>
                {shares.map((m) =>
                  m.share > 0 ? <View key={m.mode} style={{ flex: m.share, backgroundColor: t.mode(m.mode) }} /> : null,
                )}
              </View>
              <View style={s.legend}>
                {shares.map((m, i) => (
                  <View key={m.mode} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.mode(m.mode) }} />
                    <Text variant="caption">{modeMeta(m.mode).label}</Text>
                    <Text variant="caption" color="textMuted" tabular>
                      {pct[i]}%
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          )}

          <SavedPlacesCard month={data.month} version={version} />

          {cards.map(({ mode: m, quiet }) => (
            <Card key={m.mode} style={{ opacity: quiet ? 0.7 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <ModeIcon mode={m.mode} />
                <View style={{ flex: 1 }}>
                  <Text variant="headline">{modeMeta(m.mode).label}</Text>
                  <Text variant="caption" color="textSecondary">
                    {m.count === 0 ? "None this month" : plural(m.count, "journey")}
                  </Text>
                </View>
                {m.count > 0 || m.distance > 0 ? (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text variant="callout" tabular style={{ fontWeight: "800" }}>
                      {fmtKm(m.distance)}
                    </Text>
                    <Text variant="caption" color="textSecondary" tabular>
                      {fmtDuration(m.duration)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <MiniBars mode={m.mode} history={m.history} selected={data.month} onPick={(mm) => months.includes(mm) && setWant(mm)} />
            </Card>
          ))}

          <Text variant="caption" color="textMuted">
            Months follow your account&apos;s time zone; a journey across a month boundary is split by time. Tap a bar to open that
            month.
          </Text>
        </View>
      )}
    </Screen>
  );
}
