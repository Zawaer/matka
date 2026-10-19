// Building blocks shared by the Insights views.

import { useCallback, useState, type ReactNode } from "react";
import { Image, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useStyles, useTheme } from "../../design/theme";
import { modeMeta } from "../../design/modes";
import { assetSource, type ModeTotal } from "../../insights";
import { Card, Icon } from "../../ui";
import type { IconName } from "../../ui/Icon";
import { useSession } from "../../ui/session";
import { Text } from "../../ui/Text";

/** Behind (or instead of) a photo: dark in both themes, like the web covers. */
export const PHOTO_BACKDROP = "#1d2036";

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

/** One choice out of a few short options, without a label (Insights segments, Countries/Cities). */
export function SegmentBar<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{ flexDirection: "row", backgroundColor: t.c.surfaceAlt, borderRadius: t.radius.md, padding: 3, gap: 3 }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: t.space.sm,
              borderRadius: t.radius.md - 3,
              backgroundColor: on ? t.c.surface : "transparent",
              borderWidth: 1,
              borderColor: on ? t.c.primary : "transparent",
            }}
          >
            <Text variant="callout" numberOfLines={1} style={{ color: on ? t.c.primary : t.c.textSecondary, fontWeight: "800" }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small round pill choice (sort orders). */
export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: t.radius.pill,
        borderWidth: 1,
        borderColor: on ? t.c.primary : t.c.border,
        backgroundColor: on ? t.c.primarySoft : t.c.surface,
      }}
    >
      <Text variant="caption" style={{ color: on ? t.c.primary : t.c.textSecondary, fontWeight: "800" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A number with a caption, in a card; `accent` puts it in the brand colour. */
export function StatTile({ label, value, accent, style }: { label: string; value: string; accent?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Card style={[{ flexBasis: "40%", flexGrow: 1, padding: 14, gap: 2 }, style]}>
      <Text variant="stat" color={accent ? "primary" : "text"} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 22, lineHeight: 26 }}>
        {value}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
    </Card>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>{children}</View>;
}

/** "← Trips" at the top of a detail view. */
export function BackRow({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      hitSlop={8}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 4 }}
    >
      <Icon name="chevron-left" size={22} color={t.c.primary} />
      <Text variant="callout" color="primary" style={{ fontWeight: "800" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Mode icon in a tinted circle of the mode's colour (as on the timeline). */
export function ModeIcon({ mode, size = 34 }: { mode: string; size?: number }) {
  const t = useTheme();
  const color = t.mode(mode);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}26`, alignItems: "center", justifyContent: "center" }}>
      <Icon name={modeMeta(mode).icon} size={size * 0.56} color={color} />
    </View>
  );
}

/** The top few modes as small "icon label" pills. */
export function ModeChips({ modes, max = 3 }: { modes: ModeTotal[]; max?: number }) {
  const t = useTheme();
  const top = [...modes].filter((m) => m.distance > 0).sort((a, b) => b.distance - a.distance).slice(0, max);
  if (top.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {top.map((m) => {
        const color = t.mode(m.mode);
        return (
          <View
            key={m.mode}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: t.radius.pill, backgroundColor: `${color}22` }}
          >
            <Icon name={modeMeta(m.mode).icon} size={14} color={color} />
            <Text variant="caption" style={{ color: t.c.text }}>
              {modeMeta(m.mode).label}
            </Text>
          </View>
        );
      })}
    </View>
  );
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
  const bands = [0, 0.08, 0.18, 0.32, 0.5, 0.66];
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

/** A tappable list row inside a card: leading element, two lines, trailing column, chevron. */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  trailingSub,
  onPress,
  last,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string | null;
  trailing?: string;
  trailingSub?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const t = useTheme();
  const s = useStyles((th) => ({
    row: { flexDirection: "row", alignItems: "center", gap: th.space.md, paddingVertical: th.space.md, paddingHorizontal: th.space.lg },
    sep: { borderBottomWidth: 1, borderBottomColor: th.c.border },
  }));
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={[title, subtitle, trailing, trailingSub].filter(Boolean).join(", ")}
      style={({ pressed }) => [s.row, !last && s.sep, pressed && { backgroundColor: t.c.surfaceAlt }]}
    >
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing != null && (
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Text variant="callout" tabular style={{ fontWeight: "800" }}>
            {trailing}
          </Text>
          {trailingSub ? (
            <Text variant="caption" color="textMuted" tabular>
              {trailingSub}
            </Text>
          ) : null}
        </View>
      )}
      {onPress ? <Icon name="chevron-right" size={20} color={t.c.textMuted} /> : null}
    </Pressable>
  );
}

/** Rounded tile with an icon, for list rows without a photo. */
export function IconTile({ icon, size = 44 }: { icon: IconName; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: t.c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={size * 0.48} color={t.c.textMuted} />
    </View>
  );
}
