import { useState } from "react";
import { Pressable, View } from "react-native";
import { useStyles, useTheme } from "../design/theme";
import { fmtCompact, niceMax } from "../format";
import { Text } from "./Text";

const PLOT_H = 140;
/** Axis and tick labels: 11, regular, tabular. */
const AXIS = { fontSize: 11, lineHeight: 13, fontWeight: "400" as const };

/**
 * Single-series column chart (emphasis form): the selected column carries the
 * brand hue, the rest sit back in a muted tint. Columns are capped at 24px with a
 * 4px rounded tip and a square base; gridlines are hairlines; no legend (one series).
 */
export function MonthBars({
  data,
  unit,
  onSelect,
}: {
  data: { key: string; label: string; value: number }[];
  unit: string;
  onSelect?: (i: number) => void;
}) {
  const t = useTheme();
  const peak = Math.max(0, ...data.map((d) => d.value));
  const [sel, setSel] = useState(() => Math.max(0, data.findIndex((d) => d.value === peak)));
  const top = niceMax(peak);
  const ticks = [top, top / 2, 0];
  const s = useStyles((th) => ({
    wrap: { flexDirection: "row", gap: th.space.sm },
    axis: { width: 36, height: PLOT_H, justifyContent: "space-between", alignItems: "flex-end", marginTop: -6, marginBottom: 6 },
    plot: { flex: 1 },
    grid: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: th.c.grid },
    cols: { height: PLOT_H, flexDirection: "row", alignItems: "flex-end" },
    slot: { flex: 1, height: PLOT_H, alignItems: "center", justifyContent: "flex-end" },
    labels: { flexDirection: "row", marginTop: th.space.sm },
    label: { flex: 1, textAlign: "center" },
  }));
  if (data.length === 0) return null;
  const pick = (i: number) => {
    setSel(i);
    onSelect?.(i);
  };
  return (
    <View style={s.wrap}>
      <View style={s.axis}>
        {ticks.map((v, i) => (
          <Text key={i} variant="caption" color="textMuted" tabular style={AXIS}>
            {fmtCompact(v)}
          </Text>
        ))}
      </View>
      <View style={s.plot}>
        <View style={{ height: PLOT_H }}>
          {[0, 0.5, 1].map((p) => (
            <View key={p} style={[s.grid, { top: p * (PLOT_H - 1) }]} />
          ))}
          <View style={s.cols}>
            {data.map((d, i) => {
              const h = Math.max(4, Math.round((d.value / top) * PLOT_H));
              const on = i === sel;
              return (
                <Pressable
                  key={d.key}
                  style={s.slot}
                  onPress={() => pick(i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${d.label}: ${d.value.toLocaleString()} ${unit}`}
                >
                  <View
                    style={{
                      width: "64%",
                      maxWidth: 20,
                      height: h,
                      backgroundColor: on ? t.c.primary : t.c.barMuted,
                      borderTopLeftRadius: 4,
                      borderTopRightRadius: 4,
                    }}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={s.labels}>
          {data.map((d, i) => (
            <Text key={d.key} variant="caption" color={i === sel ? "text" : "textMuted"} style={[s.label, AXIS, i === sel && { fontWeight: "500" }]}>
              {d.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Horizontal share bar: label and value on one line, a thin bar beneath. */
export function ShareBar({ label, value, display, max }: { label: string; value: number; display: string; max: number }) {
  const t = useTheme();
  const pct = max > 0 ? Math.max(0.03, value / max) : 0;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <Text variant="headline" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </Text>
        <Text variant="callout" color="textSecondary" tabular>
          {display}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.c.surfaceAlt, overflow: "hidden" }}>
        <View style={{ width: `${pct * 100}%`, height: 6, borderRadius: 3, backgroundColor: t.c.primary }} />
      </View>
    </View>
  );
}
