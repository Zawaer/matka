// "Go to a day": a month calendar in a sheet (weeks start on Monday). Days
// with something recorded can be picked; the rest are muted.

import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "../design/theme";
import { MONTHS, localDay } from "../format";
import { IconButton } from "./primitives";
import { Sheet } from "./Sheet";
import { Text } from "./Text";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const iso = (y: number, m0: number, d: number) => `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function DayPicker({
  visible,
  dates,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** Days with data (YYYY-MM-DD). */
  dates: string[];
  selected: string | null;
  onPick: (date: string) => void;
  onClose: () => void;
}) {
  return visible ? <Body dates={dates} selected={selected} onPick={onPick} onClose={onClose} /> : null;
}

function Body({ dates, selected, onPick, onClose }: { dates: string[]; selected: string | null; onPick: (d: string) => void; onClose: () => void }) {
  const t = useTheme();
  const start = (selected && localDay(selected)) || new Date();
  const [month, setMonth] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const have = new Set(dates);
  const sorted = [...dates].sort();
  const first = sorted[0]?.slice(0, 7) ?? null;
  const last = sorted[sorted.length - 1]?.slice(0, 7) ?? null;
  const key = `${month.y}-${String(month.m + 1).padStart(2, "0")}`;
  const step = (n: number) => setMonth(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));

  const days = new Date(month.y, month.m + 1, 0).getDate();
  const lead = (new Date(month.y, month.m, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = new Date();
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <Sheet visible onClose={onClose} title="Go to a day">
      <View style={{ gap: t.space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: -t.space.sm }}>
          <IconButton icon="back" label="Previous month" disabled={!first || key <= first} onPress={() => step(-1)} />
          <Text variant="title3" style={{ flex: 1, textAlign: "center" }} tabular>
            {MONTHS[month.m]} {month.y}
          </Text>
          <IconButton icon="forward" label="Next month" disabled={!last || key >= last} onPress={() => step(1)} />
        </View>
        <View style={{ flexDirection: "row" }}>
          {WEEK.map((w) => (
            <Text key={w} variant="caption" color="textMuted" style={{ flex: 1, textAlign: "center" }}>
              {w}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cells.map((d, i) => {
            if (d == null) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 44 }} />;
            const date = iso(month.y, month.m, d);
            const on = date === selected;
            const can = have.has(date);
            return (
              <View key={date} style={{ width: `${100 / 7}%`, height: 44, alignItems: "center", justifyContent: "center" }}>
                <Pressable
                  disabled={!can}
                  onPress={() => {
                    onPick(date);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={date}
                  accessibilityState={{ selected: on, disabled: !can }}
                  hitSlop={2}
                  style={({ pressed }) => ({
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: on ? t.c.primary : pressed ? t.c.surfaceAlt : "transparent",
                    borderWidth: date === todayIso && !on ? 1 : 0,
                    borderColor: t.c.borderStrong,
                  })}
                >
                  <Text
                    variant={can ? "label" : "callout"}
                    tabular
                    style={{ fontSize: 15, color: on ? t.c.onPrimary : can ? t.c.text : t.c.textMuted, opacity: can ? 1 : 0.6 }}
                  >
                    {d}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        <Text variant="caption" color="textMuted">
          Days with something recorded can be opened.
        </Text>
      </View>
    </Sheet>
  );
}
