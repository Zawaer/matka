// The design system's building blocks (tokens in src/design). Every screen is
// made of these; a screen that needs a one-off style is a sign one is missing.

import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { describeError } from "../error-copy";
import { modeMeta } from "../design/modes";
import { useStyles, useTheme, type Theme } from "../design/theme";
import { FONT_FAMILY } from "../design/tokens";
import { Icon, type IconName, type IconSize } from "./Icon";
import { Text } from "./Text";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

/** Foreground and soft background of a tone. */
export function toneColors(t: Theme, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case "accent":
      return { fg: t.c.primary, bg: t.c.primarySoft };
    case "success":
      return { fg: t.c.success, bg: t.c.successSoft };
    case "warning":
      return { fg: t.c.warning, bg: t.c.warningSoft };
    case "danger":
      return { fg: t.c.danger, bg: t.c.dangerSoft };
    default:
      return { fg: t.c.textSecondary, bg: t.c.surfaceAlt };
  }
}

/* ---------------- surfaces ---------------- */

/**
 * The one card: a surface on the page, separated by tone and a hairline (no shadow).
 * With `onPress` the whole card is one button. `padded={false}` for lists and photos.
 */
export function Card({
  children,
  style,
  padded = true,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const s = useStyles((t) => ({
    card: {
      backgroundColor: t.c.surface,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.c.border,
    },
    padded: { padding: t.space.lg },
  }));
  if (!onPress) return <View style={[s.card, padded && s.padded, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [s.card, padded && s.padded, style, pressed && { opacity: 0.8 }]}
    >
      {children}
    </Pressable>
  );
}

/** Hairline between rows; `inset` lines it up with the text after a leading tile. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.border, marginLeft: inset }} />;
}

/* ---------------- icons in tiles ---------------- */

/** An icon on a soft square: one size per list (40), one tint strength. Neutral unless the tone means something. */
export function IconTile({ icon, tone = "neutral", size = 40 }: { icon: IconName; tone?: Tone; size?: 32 | 40 }) {
  const t = useTheme();
  const { fg, bg } = toneColors(t, tone);
  return (
    <View style={{ width: size, height: size, borderRadius: t.radius.sm, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={size >= 40 ? 20 : 16} color={fg} />
    </View>
  );
}

/** A travel mode's glyph in its data colour on the neutral rounded tile (the same shape as IconTile; colour stays on the glyph, a data mark). */
export function ModeIcon({ mode, size = 32 }: { mode: string; size?: 24 | 32 | 40 }) {
  const t = useTheme();
  const color = t.mode(mode);
  return (
    <View style={{ width: size, height: size, borderRadius: t.radius.sm, backgroundColor: toneColors(t, "neutral").bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name={modeMeta(mode).icon} size={size >= 32 ? 20 : 16} color={color} />
    </View>
  );
}

/* ---------------- actions ---------------- */

export type ButtonVariant = "primary" | "secondary" | "tonal" | "ghost" | "danger";

/**
 * One solid (primary) button per screen; everything else secondary (neutral
 * tonal), tonal (the accent's or a status tone's container), ghost (text) or
 * danger. 48 tall; `size="sm"` is 40 tall with the same 48 touch area.
 */
export function Button({
  label,
  icon,
  onPress,
  variant = "primary",
  size = "md",
  busy,
  disabled,
  stretch,
  tone,
  accessibilityLabel,
}: {
  label: string;
  icon?: IconName;
  /** With variant "tonal": whose container colour (accent by default; a status tone on a banner). */
  tone?: Tone;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  busy?: boolean;
  disabled?: boolean;
  /** Fill the width of the parent. */
  stretch?: boolean;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const tonal = !tone || tone === "accent" ? { bg: t.c.primarySoft, fg: t.c.primary } : { bg: t.alpha(toneColors(t, tone).fg, 0.16), fg: toneColors(t, tone).fg };
  const look = {
    primary: { bg: t.c.primary, fg: t.c.onPrimary },
    secondary: { bg: t.c.surfaceAlt, fg: t.c.text },
    tonal,
    ghost: { bg: "transparent", fg: t.c.primary },
    danger: { bg: t.c.dangerSoft, fg: t.c.danger },
  }[variant];
  const h = size === "sm" ? 40 : 48;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      hitSlop={size === "sm" ? 4 : 0}
      style={({ pressed }) => ({
        height: h,
        paddingHorizontal: variant === "ghost" ? t.space.md : size === "sm" ? t.space.lg : t.space.xl,
        borderRadius: t.radius.sm,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: t.space.sm,
        alignSelf: stretch ? "stretch" : "auto",
        // Pressed = dimmer, not a new background colour (swapping it drew square corners on Android).
        backgroundColor: look.bg,
        opacity: disabled || busy ? 0.5 : pressed ? 0.78 : 1,
      })}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 20} color={look.fg} />}
      <Text variant={size === "sm" ? "label" : "headline"} style={{ color: look.fg }} numberOfLines={1}>
        {busy ? "Working…" : label}
      </Text>
    </Pressable>
  );
}

/** A round icon-only button: 40 visible, 48 to touch. Always labelled. */
export function IconButton({
  icon,
  label,
  onPress,
  disabled,
  variant = "plain",
  color,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "plain" | "tonal";
  color?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: t.radius.pill,
        backgroundColor: variant === "tonal" ? t.c.surfaceAlt : pressed ? t.c.surfaceAlt : "transparent",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : pressed && variant === "tonal" ? 0.75 : 1,
      })}
    >
      <Icon name={icon} size={20} color={color ?? t.c.text} />
    </Pressable>
  );
}

/** Selectable filter chip (sort orders, answers). 32 tall, 48 to touch; a check when selected. */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const fg = selected ? t.c.primary : t.c.text;
  const glyph = selected ? "check" : icon;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      hitSlop={8}
      style={({ pressed }) => ({
        height: 32,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingLeft: glyph ? 10 : 14,
        paddingRight: 14,
        borderRadius: t.radius.pill,
        backgroundColor: selected ? t.c.primarySoft : t.c.surfaceAlt,
        opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
      })}
    >
      {glyph ? <Icon name={glyph} size={16} color={fg} /> : null}
      <Text variant="label" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Small static label ("Edited", "Most visited", "City"). */
export function Badge({ label, tone = "neutral", icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const t = useTheme();
  const { fg, bg } = toneColors(t, tone);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        height: 22,
        paddingHorizontal: 8,
        borderRadius: t.radius.xs,
        backgroundColor: bg,
        alignSelf: "flex-start",
      }}
    >
      {icon && <Icon name={icon} size={16} color={fg} />}
      <Text variant="micro" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * M3 segmented buttons: one choice out of two to five short options (a
 * setting, a scan/type switch). Outlined, 40 tall in a 48 target, the chosen
 * segment filled with the accent container and a check.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  showLabel,
  disabled,
  role = "radiogroup",
}: {
  options: readonly { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  /** Accessibility label; shown above with `showLabel`. */
  label: string;
  showLabel?: boolean;
  disabled?: boolean;
  /** "tablist" switches views; "radiogroup" picks a setting. */
  role?: "tablist" | "radiogroup";
}) {
  const t = useTheme();
  const track = (
    <View
      accessibilityRole={role}
      accessibilityLabel={label}
      style={{ flexDirection: "row", borderWidth: 1, borderColor: t.c.borderStrong, borderRadius: t.radius.pill, overflow: "hidden", height: 40 }}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        const glyph = on ? "check" : o.icon;
        return (
          <Pressable
            key={String(o.value)}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole={role === "tablist" ? "tab" : "radio"}
            accessibilityState={role === "tablist" ? { selected: on, disabled } : { checked: on, disabled }}
            accessibilityLabel={o.label}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: "row",
              gap: 6,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: t.space.xs,
              borderLeftWidth: i > 0 ? 1 : 0,
              borderLeftColor: t.c.borderStrong,
              backgroundColor: on ? t.c.primarySoft : pressed ? t.c.surfaceAlt : "transparent",
              opacity: disabled ? 0.5 : 1,
            })}
          >
            {glyph ? <Icon name={glyph} size={16} color={on ? t.c.primary : t.c.textSecondary} /> : null}
            <Text variant="label" numberOfLines={1} style={{ color: on ? t.c.primary : t.c.text }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
  if (!showLabel) return track;
  return (
    <View style={{ gap: t.space.sm }}>
      <Text variant="callout" color="textSecondary">
        {label}
      </Text>
      {track}
    </View>
  );
}

/**
 * M3 primary tabs: text tabs on a hairline, the current one in the accent
 * with a 3 dp indicator. 48 tall. For switching views (Insights segments,
 * Countries / Cities).
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
  inset = 0,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** Side padding (the tabs run edge to edge under an app bar). */
  inset?: number;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: t.c.border, paddingHorizontal: inset }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={({ pressed }) => ({ flex: 1, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? t.c.surfaceAlt : "transparent" })}
          >
            <Text variant="label" style={{ fontSize: 14, color: on ? t.c.primary : t.c.textSecondary }} numberOfLines={1}>
              {o.label}
            </Text>
            {on ? (
              <View style={{ position: "absolute", bottom: -1, height: 3, width: 40, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: t.c.primary }} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- numbers ---------------- */

const UNITS = new Set(["km", "m", "%", "d", "h", "min", "s"]);

/**
 * "1,148 km" → [["1,148", false], [" km", true]]; "1 d 21 h" → numbers and
 * units alternating. Null when the value isn't numbers with known units (a
 * date, a dash), which then shows whole.
 */
export function splitUnits(value: string): [string, boolean][] | null {
  const parts = value.split(/(\d[\d,.]*)/).filter((x) => x !== "");
  if (!parts.some((x) => /^\d/.test(x))) return null;
  const out: [string, boolean][] = [];
  for (const x of parts) {
    if (/^\d/.test(x)) out.push([x, false]);
    else if (UNITS.has(x.trim())) out.push([x, true]);
    else return null;
  }
  return out;
}

/** A stat: small label on top, big tabular number, every unit (km, d, h, min) smaller and muted. */
export function Stat({ label, value, size = "md", style }: { label: string; value: string; size?: "md" | "sm"; style?: StyleProp<ViewStyle> }) {
  const parts = splitUnits(value);
  return (
    <View style={[{ gap: 2 }, style]}>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant={size === "md" ? "stat" : "statSm"} tabular numberOfLines={1} adjustsFontSizeToFit>
        {parts
          ? parts.map(([x, unit], i) =>
              unit ? (
                <Text key={i} variant={size === "md" ? "title3" : "callout"} color="textSecondary">
                  {x.startsWith(" ") || x === "%" ? x : ` ${x}`}
                </Text>
              ) : (
                x
              ),
            )
          : value}
      </Text>
    </View>
  );
}

/** Stats in one card, `columns` per row with hairlines between (one card, not a card per number). */
export function StatGrid({ items, size = "md", columns = 2 }: { items: { label: string; value: string }[]; size?: "md" | "sm"; columns?: 2 | 3 }) {
  const t = useTheme();
  const rows: { label: string; value: string }[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <Card padded={false}>
      {rows.map((r, i) => (
        <View key={i}>
          {i > 0 ? <Divider /> : null}
          <View style={{ flexDirection: "row" }}>
            {r.map((x, j) => (
              <View key={x.label} style={{ flex: 1, flexDirection: "row" }}>
                {j > 0 ? <View style={{ width: 1, backgroundColor: t.c.border }} /> : null}
                <Stat label={x.label} value={x.value} size={size} style={{ flex: 1, paddingHorizontal: columns === 3 ? t.space.md : t.space.lg, paddingVertical: t.space.md }} />
              </View>
            ))}
            {Array.from({ length: rows.length > 1 ? columns - r.length : 0 }, (_, k) => (
              <View key={`pad${k}`} style={{ flex: 1, flexDirection: "row" }}>
                <View style={{ width: 1, backgroundColor: t.c.border }} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </Card>
  );
}

/* ---------------- structure ---------------- */

/** A section's header above its card(s): title, and a muted note or a text action on the right. */
export function SectionHeader({
  title,
  trailing,
  action,
}: {
  title: string;
  trailing?: string;
  action?: { label: string; onPress: () => void };
}) {
  const t = useTheme();
  return (
    // 32 above (16 screen gap + 16), 8 below: a header belongs to what follows it.
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.md, marginTop: t.space.lg, marginBottom: -t.space.sm, minHeight: 28 }}>
      <Text variant="title3" style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {action ? (
        // The label's right edge lines up with the cards' outer edge (the ghost button's padding hangs outside).
        <View style={{ marginRight: -t.space.md }}>
          <Button label={action.label} variant="ghost" size="sm" onPress={action.onPress} />
        </View>
      ) : trailing ? (
        <Text variant="caption" color="textMuted">
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}

/* ---------------- states ---------------- */

/** Placeholder block in the shape of what is loading. */
export function Skeleton({ height, width, radius: r, style }: { height: number; width?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const [v] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.6, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      style={[{ height, width: width ?? "100%", borderRadius: r ?? t.radius.md, backgroundColor: t.c.skeleton, opacity: v }, style]}
    />
  );
}

/** Nothing to show: a large muted icon, one title, one sentence, at most one action. */
export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: t.space.xl, paddingHorizontal: t.space.md, gap: t.space.sm }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.c.surfaceAlt, alignItems: "center", justifyContent: "center", marginBottom: t.space.xs }}>
        <Icon name={icon} size={32} color={t.c.textMuted} />
      </View>
      <Text variant="title3" style={{ textAlign: "center" }}>
        {title}
      </Text>
      <Text variant="callout" color="textSecondary" style={{ textAlign: "center", maxWidth: 300 }}>
        {body}
      </Text>
      {action ? <View style={{ marginTop: t.space.sm }}>{action}</View> : null}
    </View>
  );
}

/** A request failed: what went wrong in plain words, and a retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  const copy = describeError(message);
  return (
    <Card style={{ alignItems: "center", gap: t.space.sm, paddingVertical: t.space.xl }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.c.dangerSoft, alignItems: "center", justifyContent: "center", marginBottom: t.space.xs }}>
        <Icon name="offline" size={24} color={t.c.danger} />
      </View>
      <Text variant="title3" style={{ textAlign: "center" }}>
        {copy.title}
      </Text>
      <Text variant="callout" color="textSecondary" style={{ textAlign: "center", maxWidth: 300 }}>
        {copy.body}
      </Text>
      {onRetry ? (
        <View style={{ marginTop: t.space.sm }}>
          <Button label="Try again" icon="refresh" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * A notice in its tone's container colour (M3 card): the icon in the tone,
 * the title and message in text colours, actions as tonal buttons of the same
 * tone (pass `variant="tonal" tone=…` to Buttons inside).
 */
export function Banner({
  tone,
  icon,
  title,
  message,
  children,
}: {
  tone: "warning" | "danger" | "info";
  icon?: IconName;
  title?: string;
  message: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  const { fg, bg } = toneColors(t, tone === "info" ? "accent" : tone);
  const glyph = icon ?? (tone === "info" ? "info" : tone === "warning" ? "warning" : "error");
  return (
    <View style={{ backgroundColor: bg, borderRadius: t.radius.md, padding: t.space.lg, gap: t.space.md }}>
      <View style={{ flexDirection: "row", gap: t.space.md, alignItems: "flex-start" }}>
        <View style={{ height: 20, justifyContent: "center" }}>
          <Icon name={glyph} size={20} color={fg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          {title ? <Text variant="headline">{title}</Text> : null}
          <Text variant="callout" color={title ? "textSecondary" : "text"} style={{ lineHeight: 20 }}>
            {message}
          </Text>
        </View>
      </View>
      {children ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.sm, paddingLeft: 32 }}>{children}</View> : null}
    </View>
  );
}

/** Single-line text input: 48 tall, outlined. */
export function Field(props: TextInputProps & { dense?: boolean }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const { dense, style, onFocus, onBlur, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={t.c.textMuted}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        {
          height: dense ? 40 : 48,
          backgroundColor: t.c.surface,
          borderColor: focused ? t.c.primary : t.c.borderStrong,
          borderWidth: focused ? 2 : 1,
          borderRadius: t.radius.sm,
          color: t.c.text,
          paddingHorizontal: focused ? t.space.md - 1 : t.space.md,
          fontSize: 15,
          fontFamily: FONT_FAMILY,
        },
        style,
      ]}
    />
  );
}

/** Icon sized to sit on a text line (for "icon + text" rows). */
export function InlineIcon({ name, color, size = 16 }: { name: IconName; color?: string; size?: IconSize }) {
  return (
    <View style={{ height: size === 16 ? 18 : 20, justifyContent: "center" }}>
      <Icon name={name} size={size} color={color} />
    </View>
  );
}
