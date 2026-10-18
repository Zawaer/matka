import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useStyles, useTheme } from "../design/theme";
import type { Colors } from "../design/tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

/** Raised surface: the one card style. */
export function Card({ children, style, flat }: { children: ReactNode; style?: StyleProp<ViewStyle>; flat?: boolean }) {
  const s = useStyles((t) => ({
    card: {
      backgroundColor: t.c.surface,
      borderRadius: t.radius.lg,
      borderWidth: 1,
      borderColor: t.c.border,
      padding: t.space.lg,
      boxShadow: t.elev.e1,
    },
    flat: { boxShadow: t.elev.e0 },
  }));
  return <View style={[s.card, flat && s.flat, style]}>{children}</View>;
}

/** Tinted rounded tile holding an icon. */
export function IconChip({ icon, tint, size = 40 }: { icon: IconName; tint: keyof Colors["tint"]; size?: number }) {
  const t = useTheme();
  const { fg, bg } = t.c.tint[tint];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.34,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={size * 0.52} color={fg} />
    </View>
  );
}

export function Button({
  label,
  icon,
  onPress,
  variant = "primary",
  busy,
  disabled,
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger";
  busy?: boolean;
  disabled?: boolean;
}) {
  const t = useTheme();
  const s = useStyles((th) => ({
    base: {
      minHeight: 44,
      paddingHorizontal: th.space.lg,
      borderRadius: th.radius.pill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: th.space.sm,
    },
  }));
  const look = {
    primary: { bg: t.c.primary, pressed: t.c.primaryPressed, fg: t.c.onPrimary, border: "transparent" },
    secondary: { bg: t.c.surface, pressed: t.c.surfaceAlt, fg: t.c.text, border: t.c.borderStrong },
    danger: { bg: t.c.dangerSoft, pressed: t.c.surfaceAlt, fg: t.c.danger, border: "transparent" },
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        s.base,
        { backgroundColor: pressed ? look.pressed : look.bg, borderColor: look.border, borderWidth: 1, opacity: disabled || busy ? 0.6 : 1 },
      ]}
    >
      {icon && <Icon name={icon} size={18} color={look.fg} />}
      <Text variant="callout" style={{ color: look.fg, fontWeight: "700" }}>
        {busy ? "Working…" : label}
      </Text>
    </Pressable>
  );
}

/** Small rounded label. */
export function Pill({ label, icon, tint = "slate" }: { label: string; icon?: IconName; tint?: keyof Colors["tint"] }) {
  const t = useTheme();
  const { fg, bg } = t.c.tint[tint];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: t.radius.pill,
        backgroundColor: bg,
        alignSelf: "flex-start",
      }}
    >
      {icon && <Icon name={icon} size={14} color={fg} />}
      <Text variant="caption" style={{ color: fg, fontWeight: "700" }}>
        {label}
      </Text>
    </View>
  );
}

export function SectionTitle({ title, trailing }: { title: string; trailing?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 }}>
      <Text variant="title3">{title}</Text>
      {trailing ? (
        <Text variant="caption" color="textMuted">
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}

/** Pulsing placeholder block for loading states. */
export function Skeleton({ height, width, radius: r = 12, style }: { height: number; width?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const [v] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ height, width: width ?? "100%", borderRadius: r, backgroundColor: t.c.skeleton, opacity: v }, style]} />;
}

/** Concentric "location ping" rings behind an icon: the app's recurring motif. */
export function PingRings({ size = 120, color, children }: { size?: number; color: string; children?: ReactNode }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {[1, 0.72, 0.46].map((k, i) => (
        <View
          key={k}
          style={{
            position: "absolute",
            width: size * k,
            height: size * k,
            borderRadius: size,
            borderWidth: 1.5,
            borderColor: color,
            opacity: 0.32 + i * 0.28,
          }}
        />
      ))}
      {children}
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 36, paddingHorizontal: 12, gap: 8 }}>
      <PingRings size={132} color={t.c.primary}>
        <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: t.c.primarySoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={30} color={t.c.primary} />
        </View>
      </PingRings>
      <Text variant="title3" style={{ textAlign: "center", marginTop: 8 }}>
        {title}
      </Text>
      <Text variant="body" color="textSecondary" style={{ textAlign: "center", maxWidth: 280 }}>
        {body}
      </Text>
      {action ? <View style={{ marginTop: 12 }}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <Card style={{ alignItems: "center", gap: 8, paddingVertical: 28 }}>
      <IconChip icon="cloud-off-outline" tint="coral" size={52} />
      <Text variant="title3" style={{ marginTop: 6 }}>
        Can&apos;t reach Matka
      </Text>
      <Text variant="callout" color="textSecondary" style={{ textAlign: "center", maxWidth: 280 }}>
        Check your connection and try again. Nothing is lost; your phone keeps what it recorded.
      </Text>
      <Text variant="caption" color="textMuted" numberOfLines={1} style={{ maxWidth: 280, color: t.c.textMuted }}>
        {message}
      </Text>
      {onRetry ? (
        <View style={{ marginTop: 10 }}>
          <Button label="Try again" icon="refresh" onPress={onRetry} />
        </View>
      ) : null}
    </Card>
  );
}
