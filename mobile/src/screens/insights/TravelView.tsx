import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { modeMeta } from "../../design/modes";
import { useTheme } from "../../design/theme";
import { fmtDuration, fmtLongDuration, group } from "../../format";
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
} from "../../insights-logic";
import type { Pairing } from "../../pairing";
import { Card, Divider, EmptyState, ErrorState, IconTile, ListGroup, ListRow, ModeIcon, SectionHeader, Skeleton, StatGrid } from "../../ui";
import { ModeLegend, ModeShareBar } from "../../ui/ModeShare";
import { Pager, Screen } from "../../ui/Screen";
import { useSession, useViewerQuery } from "../../ui/session";
import { Text } from "../../ui/Text";
import { useRefresh } from "./parts";

const SPARK_H = 32;

/**
 * Six months of one mode on the scale shared by every mode (so a tall bar is
 * a long distance, wherever it is): the shown month in the mode's colour, the
 * others neutral. Tap a bar to open that month.
 */
function Sparkline({ mode, history, selected, max, onPick }: { mode: string; history: MonthPoint[]; selected: string; max: number; onPick: (m: string) => void }) {
  const t = useTheme();
  const color = t.mode(mode);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: SPARK_H }}>
      {history.map((p) => {
        const on = p.month === selected;
        const h = p.distance > 0 && max > 0 ? Math.max(3, Math.round((p.distance / max) * SPARK_H)) : 2;
        return (
          <Pressable
            key={p.month}
            onPress={() => onPick(p.month)}
            hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
            accessibilityRole="button"
            accessibilityLabel={`${fmtMonth(p.month)}: ${fmtKm(p.distance)}`}
            accessibilityState={{ selected: on }}
            style={{ width: 10, height: SPARK_H, justifyContent: "flex-end" }}
          >
            <View
              style={{
                height: h,
                borderTopLeftRadius: 2,
                borderTopRightRadius: 2,
                backgroundColor: p.distance === 0 ? t.c.grid : on ? color : t.c.barMuted,
              }}
            />
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
  // One scale for every sparkline.
  const sparkMax = Math.max(0, ...used.flatMap((m) => m.history.map((p) => p.distance)));
  const pick = (mm: string) => months.includes(mm) && setWant(mm);
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
        <View style={{ gap: t.space.lg }}>
          <Skeleton height={70} />
          <Skeleton height={96} />
          <Skeleton height={240} />
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

          {used.length > 0 || quiet.length > 0 ? <SectionHeader title="By mode" trailing="Last 6 months" /> : null}
          {used.length > 0 ? (
            <Card padded={false}>
              {used.map((m, i) => (
                <View key={m.mode}>
                  {i > 0 ? <Divider inset={t.space.lg + 40 + t.space.md} /> : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.md, paddingHorizontal: t.space.lg, paddingVertical: t.space.md, minHeight: 72 }}>
                    <ModeIcon mode={m.mode} size={40} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="headline" numberOfLines={1}>
                        {modeMeta(m.mode).label}
                      </Text>
                      <Text variant="callout" color="textSecondary" tabular numberOfLines={1}>
                        {m.count > 0 ? plural(m.count, "journey") : fmtDuration(m.duration)}
                      </Text>
                    </View>
                    <Sparkline mode={m.mode} history={m.history} selected={data.month} max={sparkMax} onPick={pick} />
                    <Text variant="headline" tabular numberOfLines={1} style={{ minWidth: 64, textAlign: "right" }}>
                      {fmtKm(m.distance)}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}
          {quiet.length > 0 ? (
            <Text variant="callout" color="textSecondary" style={{ paddingHorizontal: t.space.lg }}>
              Also: {quiet.map((m) => modeMeta(m.mode).label).join(", ")} — none in {fmtMonth(data.month).split(" ")[0]}
            </Text>
          ) : null}

          <Text variant="caption" color="textMuted" style={{ paddingHorizontal: t.space.lg }}>
            Tap a bar to see that month.
          </Text>
        </View>
      )}
    </Screen>
  );
}
