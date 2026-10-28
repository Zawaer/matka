import { View } from "react-native";
import { LEG_BADGE } from "../design/transit";
import type { LegKind } from "../viewer";
import { Text } from "./Text";

/** "Bus 550" as at the stop: the operator's line colour, 12/16 at 500, 4 radius (palette.md). */
export function LineBadge({ kind, text }: { kind: LegKind; text: string }) {
  const b = LEG_BADGE[kind];
  return (
    <View style={{ backgroundColor: b.bg, borderRadius: 4, paddingHorizontal: 6, height: 20, justifyContent: "center" }}>
      <Text variant="caption" style={{ color: b.fg, fontWeight: "500" }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}
