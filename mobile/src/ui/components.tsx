// Collector building blocks (Recorder, Settings, Pairing) on top of the design
// system in src/design + src/ui/primitives.

import type { ReactNode } from "react";
import { Pressable, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { useStyles, useTheme, type Theme } from "../design/theme";
import { Icon, type IconName } from "./Icon";
import { Button, Card } from "./primitives";
import { Text } from "./Text";

export type Tone = "ok" | "warn" | "bad" | "dim";

export function toneColor(t: Theme, tone?: Tone): string {
  switch (tone) {
    case "ok":
      return t.c.success;
    case "warn":
      return t.c.tint.amber.fg;
    case "bad":
      return t.c.danger;
    case "dim":
      return t.c.textMuted;
    default:
      return t.c.text;
  }
}

/** A card with an overline title; children are stacked with a gap. */
export function Panel({ title, children, style }: { title?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <Card style={[{ gap: t.space.md }, style]}>
      {title ? (
        <Text variant="overline" color="textMuted">
          {title}
        </Text>
      ) : null}
      {children}
    </Card>
  );
}

/** Label on the left, value on the right. */
export function Row({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: t.space.md }}>
      <Text variant="callout" color="textSecondary">
        {label}
      </Text>
      <Text
        variant="callout"
        tabular
        numberOfLines={2}
        style={{ fontWeight: "700", flexShrink: 1, textAlign: "right", color: toneColor(t, tone) }}
      >
        {value}
      </Text>
    </View>
  );
}

/** Tinted notice with an icon, a message and optional actions underneath. */
export function Banner({
  tone,
  icon,
  message,
  children,
}: {
  tone: "warn" | "bad" | "info";
  icon?: IconName;
  message: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  const { fg, bg } =
    tone === "bad"
      ? { fg: t.c.danger, bg: t.c.dangerSoft }
      : tone === "warn"
        ? t.c.tint.amber
        : { fg: t.c.primary, bg: t.c.primarySoft };
  const glyph = icon ?? (tone === "info" ? "information-outline" : "alert-circle-outline");
  return (
    <View style={{ backgroundColor: bg, borderRadius: t.radius.md, padding: t.space.md, gap: t.space.md }}>
      <View style={{ flexDirection: "row", gap: t.space.sm, alignItems: "flex-start" }}>
        <Icon name={glyph} size={20} color={fg} />
        <Text variant="callout" style={{ flex: 1, color: fg, fontWeight: "600" }}>
          {message}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** Shown on every tab after a 401: the token was revoked or is invalid. */
export function PairingLostBanner({ onPair }: { onPair: () => void }) {
  return (
    <Banner
      tone="bad"
      icon="link-variant-off"
      message="Pairing lost — the server rejected this device's token (revoked?). Uploads are paused; queued points are kept. Pair again from the web app's Devices page."
    >
      <Button label="Re-pair" icon="qrcode-scan" variant="danger" onPress={onPair} />
    </Banner>
  );
}

/** Themed single-line text input. */
export function Field(props: TextInputProps) {
  const t = useTheme();
  const s = useStyles((th) => ({
    input: {
      backgroundColor: th.c.surfaceAlt,
      borderColor: th.c.border,
      borderWidth: 1,
      borderRadius: th.radius.sm,
      color: th.c.text,
      paddingHorizontal: th.space.md,
      paddingVertical: th.space.sm + 2,
      fontSize: 15,
    },
  }));
  return <TextInput placeholderTextColor={t.c.textMuted} {...props} style={[s.input, props.style]} />;
}

/** Text link (header actions like "Settings" / "Done"). */
export function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text variant="callout" color="primary" style={{ fontWeight: "700" }} onPress={onPress} accessibilityRole="button" suppressHighlighting>
      {label}
    </Text>
  );
}

/** Labelled segmented control: one choice out of a few short options. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.xs }}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: "row", backgroundColor: t.c.surfaceAlt, borderRadius: t.radius.sm, padding: 3, gap: 3 }}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              disabled={disabled}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled }}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: t.space.sm,
                borderRadius: t.radius.sm - 3,
                backgroundColor: on ? t.c.surface : "transparent",
                borderWidth: 1,
                borderColor: on ? t.c.primary : "transparent",
              }}
            >
              <Text variant="caption" numberOfLines={1} style={{ color: on ? t.c.primary : t.c.textSecondary, fontWeight: "800" }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
