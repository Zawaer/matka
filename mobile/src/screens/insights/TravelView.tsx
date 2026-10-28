import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { modeMeta } from "../../design/modes";
import { useTheme } from "../../design/theme";
import { fmtDuration, fmtLongDuration, group } from "../../format";
import { getMonthModes, getSavedMonth, type MonthModes, type MonthPoint } from "../../insights";
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
} from "../../insights-logic";
import type { Pairing } from "../../pairing";
import { Card, Divider, EmptyState, ErrorState, Icon, IconTile, ListGroup, ListRow, ModeIcon, RowsSkeleton, SectionHeader, Sheet, Skeleton, StatGrid } from "../../ui";
import { ModeLegend, ModeShareBar } from "../../ui/ModeShare";
import { Pager, Screen } from "../../ui/Screen";
import { useSession, useViewerQuery } from "../../ui/session";
import { Text } from "../../ui/Text";
import { useRefresh } from "./parts";

const SPARK_H = 28;

/**
 * Six months of one mode, scaled to the mode's own busiest month (the row's
 * number says how much; the bars say how it went over time): the shown month
 * in the mode's colour, the others neutral. Not a control: the row is.
 */
function Sparkline({ mode, history, selected }: { mode: string; history: MonthPoint[]; selected: string }) {
  const t = useTheme();
  const color = t.mode(mode);
  const max = Math.max(0, ...history.map((p) => p.distance));
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: SPARK_H }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {history.map((p) => {
        const on = p.month === selected;
        const h = p.distance > 0 && max > 0 ? Math.max(3, Math.round((p.distance / max) * SPARK_H)) : 2;
        return (
          <View
            key={p.month}
            style={{
              width: 8,
              height: h,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
              backgroundColor: p.distance === 0 ? t.c.grid : on ? color : t.c.barMuted,
            }}
          />
        );
      })}
    </View>
  );
}

/** One mode's last six months as rows; a row opens that month. */
function ModeMonthsSheet({ mode, selected, onPick, onClose }: { mode: MonthModes["modes"][number] | null; selected: string; onPick: (m: string) => void; onClose: () => void }) {
  const t = useTheme();
  if (!mode) return null;
  const max = Math.max(0, ...mode.history.map((p) => p.distance));
  return (
    <Sheet visible onClose={onClose} title={`${modeMeta(mode.mode).label} by month`} subtitle="Last 6 months">
      <View style={{ marginHorizontal: -t.space.xl, marginTop: -t.space.md }}>
        {[...mode.history].reverse().map((p) => {
          const on = p.month === selected;
          return (
            <Pressable
              key={p.month}
              onPress={() => {
                onPick(p.month);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${fmtMonth(p.month)}: ${fmtKm(p.distance)}. Show this month`}
              style={({ pressed }) => ({ minHeight: 56, paddingHorizontal: t.space.xl, justifyContent: "center", gap: 6, backgroundColor: on ? t.c.surfaceAlt : pressed ? t.c.surfaceAlt : "transparent" })}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: t.space.md }}>
                <Text variant="headline" color={on ? "primary" : "text"}>
                  {fmtMonth(p.month)}
                </Text>
                <Text variant="callout" color="textSecondary" tabular>
                  {p.distance > 0 ? fmtKm(p.distance) : "–"}
                </Text>
              </View>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: t.c.surfaceAlt }}>
                <View style={{ height: 4, borderRadius: 2, width: `${max > 0 ? Math.max(p.distance > 0 ? 2 : 0, (p.distance / max) * 100) : 0}%`, backgroundColor: on ? t.mode(mode.mode) : t.c.barMuted }} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

/** The loading shape: the pager's stat strip, the share bar and legend, then mode rows. */
function TravelSkeleton() {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.lg }}>
      <Card padded={false} style={{ flexDirection: "row" }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flex: 1, gap: 6, padding: t.space.md, borderLeftWidth: i ? 1 : 0, borderLeftColor: t.c.border }}>
            <Skeleton height={12} width="55%" radius={6} />
            <Skeleton height={18} width="50%" radius={6} />
          </View>
        ))}
      </Card>
      <Skeleton height={18} width={150} radius={6} style={{ marginTop: t.space.lg }} />
      <Card style={{ gap: t.space.lg }}>
        <Skeleton height={10} radius={5} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: t.space.sm, columnGap: t.space.xl }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: "45%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: t.space.sm }}>
              <Skeleton height={16} width={16} radius={4} />
              <Skeleton height={12} width="50%" radius={6} />
            </View>
          ))}
        </View>
      </Card>
      <Skeleton height={18} width={120} radius={6} style={{ marginTop: t.space.lg }} />
      <RowsSkeleton rows={3} />
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
            return <ListRow key={r.placeId} leading={<IconTile icon={KIND_META[r.kind].icon} />} title={x.title} titleLines={2} subtitle={x.subtitle} trailing={x.primary} />;
          })}
        </ListGroup>
      )}
    </>
  );
}

export default function TravelView() {
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
  const used = cards.filter((c) => !c.quiet).map((c) => c.mode);
  const quiet = cards.filter((c) => c.quiet).map((c) => c.mode);
  const journeys = shares.reduce((a, m) => a + m.count, 0);
  const pick = (mm: string) => months.includes(mm) && setWant(mm);
  const [modeOpen, setModeOpen] = useState<string | null>(null);
  const failed = !!error && !data;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {failed || (data && !data.firstMonth) ? null : (
        <Pager
          title={month ? fmtMonth(month) : null}
          onPrev={idx > 0 ? () => go(-1) : undefined}
          onNext={idx >= 0 && idx < months.length - 1 ? () => go(1) : undefined}
          prevLabel="Previous month"
          nextLabel="Next month"
        />
      )}

      {authLost && !data ? null : failed ? (
        <ErrorState message={error!} onRetry={reload} />
      ) : !data ? (
        <TravelSkeleton />
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
              { label: "On the move", value: fmtLongDuration(data.duration) },
              { label: "Journeys", value: group(journeys) },
            ]}
          />

          {shares.length > 0 && (
            <>
              <SectionHeader title="Distance by mode" />
              <Card style={{ gap: t.space.lg }}>
                <ModeShareBar shares={shares} />
                <ModeLegend shares={shares} percents={pct} />
              </Card>
            </>
          )}

          <SavedPlacesCard month={data.month} version={version} />

          {used.length > 0 || quiet.length > 0 ? (
            <SectionHeader title={`By mode in ${fmtMonth(data.month).split(" ")[0]}`} trailing={used.length > 0 ? "Bars: last 6 months" : undefined} />
          ) : null}
          {used.length > 0 ? (
            <Card padded={false}>
              {used.map((m, i) => (
                <View key={m.mode}>
                  {i > 0 ? <Divider inset={t.space.lg + 40 + t.space.md} /> : null}
                  {/* The whole row is the target: it opens the mode's months. */}
                  <Pressable
                    onPress={() => setModeOpen(m.mode)}
                    accessibilityRole="button"
                    accessibilityLabel={`${modeMeta(m.mode).label}, ${fmtKm(m.distance)} in ${fmtMonth(data.month)}. Show the last 6 months`}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: t.space.md, paddingHorizontal: t.space.lg, paddingVertical: t.space.md, minHeight: 72, backgroundColor: pressed ? t.c.surfaceAlt : "transparent" })}
                  >
                    <ModeIcon mode={m.mode} size={40} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="headline" numberOfLines={1}>
                        {modeMeta(m.mode).label}
                      </Text>
                      <Text variant="callout" color="textSecondary" tabular numberOfLines={1}>
                        {m.count > 0 ? plural(m.count, "journey") : fmtDuration(m.duration)}
                      </Text>
                    </View>
                    <Sparkline mode={m.mode} history={m.history} selected={data.month} />
                    <Text variant="headline" tabular numberOfLines={1} style={{ minWidth: 64, textAlign: "right" }}>
                      {fmtKm(m.distance)}
                    </Text>
                    <Icon name="chevronRight" size={20} color={t.c.textMuted} />
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : null}
          {quiet.length > 0 ? (
            <Text variant="callout" color="textSecondary" style={{ paddingHorizontal: t.space.lg }}>
              Also: {quiet.map((m) => modeMeta(m.mode).label).join(", ")} — none in {fmtMonth(data.month).split(" ")[0]}
            </Text>
          ) : null}

          <ModeMonthsSheet mode={used.find((m) => m.mode === modeOpen) ?? null} selected={data.month} onPick={pick} onClose={() => setModeOpen(null)} />
        </View>
      )}
    </Screen>
  );
}
