// Building blocks shared by the Insights views.

import { useCallback, useState } from "react";
import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import { modeMeta } from "../../design/modes";
import { assetSource, type ModeTotal } from "../../insights";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useSession } from "../../ui/session";

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

/**
 * Bottom-heavy darkening so white text over any photo stays legible: a real
 * gradient (react-native-svg), clear over the top 45 %, then black 0 → 65 %
 * over the bottom 55 % (eased, no visible bands).
 */
export function Scrim({ to = 0.65 }: { to?: number }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.45" stopColor="#000" stopOpacity={0} />
            <Stop offset="0.7" stopColor="#000" stopOpacity={to * 0.45} />
            <Stop offset="1" stopColor="#000" stopOpacity={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrim)" />
      </Svg>
    </View>
  );
}

export const onPhotoText = { color: "#FFFFFF" } as const;

/** "Bus, Walk": the top modes by distance as words (for a muted meta line, not chips). */
export function modeWords(modes: ModeTotal[], max = 3): string {
  return [...modes]
    .filter((m) => m.distance > 0 && m.mode !== "stationary")
    .sort((a, b) => b.distance - a.distance)
    .slice(0, max)
    .map((m) => modeMeta(m.mode).label)
    .join(", ");
}
