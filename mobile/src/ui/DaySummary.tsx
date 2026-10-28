import { View } from "react-native";
import { stripModes, type DaySummary } from "../daySummary";
import { modeMeta } from "../design/modes";
import { useTheme } from "../design/theme";
import { fmtDistance, fmtDuration } from "../format";
import { Icon } from "./Icon";
import { ModeShareBar } from "./ModeShare";
import { Skeleton } from "./primitives";
import { Text } from "./Text";

/**
 * The day's travel by mode: the same stacked share bar as Insights, then a
 * wrapping line of "[glyph] 11.2 km 31 min" per mode, largest first (no pills:
 * these are facts, not filters). `summary` null = still loading.
 */
export function DayModes({ summary }: { summary: DaySummary | null }) {
  const t = useTheme();
  if (!summary) {
    return (
      <View style={{ gap: t.space.md }}>
        <Skeleton height={10} radius={5} />
        <Skeleton height={18} width="70%" radius={6} />
      </View>
    );
  }
  const modes = stripModes(summary);
  if (modes.length === 0) return null;
  const total = modes.reduce((a, m) => a + m.distance, 0);
  return (
    <View style={{ gap: t.space.md }}>
      {total > 0 ? <ModeShareBar shares={modes.map((m) => ({ mode: m.mode, share: m.distance / total }))} /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: t.space.lg, rowGap: t.space.sm }}>
        {modes.map((m) => {
          const meta = modeMeta(m.mode);
          const parts = [m.distance > 0 ? fmtDistance(m.distance) : null, m.duration > 0 ? fmtDuration(m.duration) : null];
          return (
            <View key={m.mode} accessible accessibilityLabel={[meta.label, ...parts].filter(Boolean).join(", ")} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name={meta.icon} size={16} color={t.mode(m.mode)} />
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
      </View>
    </View>
  );
}
