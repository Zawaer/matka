import { ScrollView, View } from "react-native";
import { stripModes, type DaySummary } from "../daySummary";
import { modeMeta } from "../design/modes";
import { useTheme } from "../design/theme";
import { fmtDistance, fmtDuration } from "../format";
import { Icon } from "./Icon";
import { Skeleton } from "./primitives";
import { Text } from "./Text";


/** Row height, held while the numbers load so nothing below jumps. */
export const DAY_STRIP_HEIGHT = 32;

/**
 * "[car] 19.1 km 25 min  [walk] 1.2 km 18 min …": distance and time per travel mode,
 * largest first, scrolling sideways. Text stays in text colours; only the
 * icon carries the mode colour. `summary` null = still loading. Meant for
 * inside a Card: the row bleeds over the card's padding so chips scroll to its edges.
 */
export function DaySummaryStrip({ summary }: { summary: DaySummary | null }) {
  const t = useTheme();
  if (!summary) {
    return (
      <View style={{ flexDirection: "row", gap: 8, height: DAY_STRIP_HEIGHT }}>
        {[104, 92, 84].map((w) => (
          <Skeleton key={w} height={DAY_STRIP_HEIGHT} width={w} radius={t.radius.pill} />
        ))}
      </View>
    );
  }
  const modes = stripModes(summary);
  if (modes.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ height: DAY_STRIP_HEIGHT, flexGrow: 0, marginHorizontal: -t.space.lg }}
      contentContainerStyle={{ gap: 8, alignItems: "center", paddingHorizontal: t.space.lg }}
    >
      {modes.map((m) => {
        const meta = modeMeta(m.mode);
        const color = t.mode(m.mode);
        const parts = [m.distance > 0 ? fmtDistance(m.distance) : null, m.duration > 0 ? fmtDuration(m.duration) : null];
        return (
          <View
            key={m.mode}
            accessible
            accessibilityLabel={[meta.label, ...parts].filter(Boolean).join(", ")}
            style={{
              height: DAY_STRIP_HEIGHT,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingLeft: 10,
              paddingRight: 12,
              borderRadius: t.radius.pill,
              backgroundColor: t.c.surfaceAlt,
            }}
          >
            <Icon name={meta.icon} size={16} color={color} />
            {parts[0] ? (
              <Text variant="label" tabular>
                {parts[0]}
              </Text>
            ) : null}
            {parts[1] ? (
              <Text variant="callout" color="textSecondary" tabular>
                {parts[1]}
              </Text>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
