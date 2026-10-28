// Building blocks shared by the Insights views.

import { useCallback, useState } from "react";
import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../design/theme";
import { modeMeta } from "../../design/modes";
import { assetSource, type ModeTotal } from "../../insights";
import { Icon } from "../../ui";
import { useSession } from "../../ui/session";
import { Text } from "../../ui/Text";

/** Behind (or instead of) a photo: dark in both themes, like the web covers. */
export const PHOTO_BACKDROP = "#24242A";

/** Pull-to-refresh state around a reload. */
export function useRefresh(reload: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);
  return { refreshing, onRefresh };
}

/** An Immich photo through the server, with the device token; dark backdrop while it loads or if it fails. */
export function Photo({ id, size = "preview", style }: { id: string; size?: "thumbnail" | "preview"; style?: StyleProp<ViewStyle> }) {
  const { pairing } = useSession();
  const [failed, setFailed] = useState(false);
  return (
    <View style={[{ backgroundColor: PHOTO_BACKDROP, overflow: "hidden" }, style]}>
      {!failed && (
        <Image
          source={assetSource(pairing, id, size)}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  );
}

/** Bottom-heavy darkening so white text over any photo stays legible (stacked bands; no gradient dependency). */
export function Scrim() {
  // Black 0 → 64 % over the lower part (eased), enough for white text at 4.5:1.
  const bands = Array.from({ length: 16 }, (_, i) => (i < 6 ? 0 : 0.64 * ((i - 5) / 10) ** 1.4));
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      {bands.map((o, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: `rgba(0,0,0,${o})` }} />
      ))}
    </View>
  );
}

export const onPhotoText = {
  color: "#FFFFFF",
  textShadowColor: "rgba(0,0,0,0.5)",
  textShadowRadius: 6,
  textShadowOffset: { width: 0, height: 1 },
} as const;

/** The top few modes as small "glyph label" pills (glyph in the mode's colour, text neutral). */
export function ModeChips({ modes, max = 3, onPhoto }: { modes: ModeTotal[]; max?: number; onPhoto?: boolean }) {
  const t = useTheme();
  const top = [...modes].filter((m) => m.distance > 0).sort((a, b) => b.distance - a.distance).slice(0, max);
  if (top.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.xs }}>
      {top.map((m) => (
        <View
          key={m.mode}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            height: 24,
            paddingHorizontal: 8,
            borderRadius: t.radius.pill,
            backgroundColor: onPhoto ? "rgba(0,0,0,0.45)" : t.c.surfaceAlt,
          }}
        >
          <Icon name={modeMeta(m.mode).icon} size={16} color={onPhoto ? "#FFFFFF" : t.mode(m.mode)} />
          <Text variant="micro" style={{ color: onPhoto ? "#FFFFFF" : t.c.textSecondary }}>
            {modeMeta(m.mode).label}
          </Text>
        </View>
      ))}
    </View>
  );
}
