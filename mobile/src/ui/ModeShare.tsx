// Mode share: one stacked bar of each travel mode's share of the distance, and
// its legend as a two-column list. The same component everywhere mode share
// shows (Insights → Travel, Trip detail, the Timeline's day), so the data
// always looks the same.

import { View } from "react-native";
import { modeMeta } from "../design/modes";
import { useTheme } from "../design/theme";
import { fmtPercent } from "../format";
import { Icon } from "./Icon";
import { Text } from "./Text";

export type ModeShare = { mode: string; share: number };

/** 10 dp stacked bar, 2 dp gaps, each segment in its mode colour. */
export function ModeShareBar({ shares }: { shares: ModeShare[] }) {
  const t = useTheme();
  const used = shares.filter((m) => m.share > 0);
  return (
    <View
      accessible
      accessibilityLabel={used.map((m) => `${modeMeta(m.mode).label} ${fmtPercent(m.share)}`).join(", ")}
      style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", gap: 2, backgroundColor: t.c.surfaceAlt }}
    >
      {used.map((m) => (
        <View key={m.mode} style={{ flex: m.share, minWidth: 2, backgroundColor: t.mode(m.mode) }} />
      ))}
    </View>
  );
}

/**
 * Legend: two columns of "Walk ……… 52%" after the mode glyph in its colour (label, right-aligned tabular
 * share). `percents` overrides the rounding (e.g. largest-remainder shares).
 */
export function ModeLegend({ shares, percents }: { shares: ModeShare[]; percents?: number[] }) {
  const t = useTheme();
  const used = shares.map((m, i) => ({ ...m, pct: percents?.[i] })).filter((m) => m.share > 0);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: t.space.sm, columnGap: t.space.xl }}>
      {used.map((m) => (
        <View key={m.mode} style={{ width: "45%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: t.space.sm }}>
          {/* The mode's glyph in its colour, not a dot: Train and Metro (Bus and Tram) share a hue family. */}
          <Icon name={modeMeta(m.mode).icon} size={16} color={t.mode(m.mode)} />
          <Text variant="callout" numberOfLines={1} style={{ flex: 1 }}>
            {modeMeta(m.mode).label}
          </Text>
          <Text variant="callout" color="textSecondary" tabular>
            {m.pct != null ? (m.pct === 0 ? "<1%" : `${m.pct}%`) : fmtPercent(m.share)}
          </Text>
        </View>
      ))}
    </View>
  );
}
