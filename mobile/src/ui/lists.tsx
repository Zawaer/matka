// Lists: rows in a card with inset hairlines (places, cities, days), and
// grouped key-value lists with a label above (Recorder, Settings).

import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "../design/theme";
import { Icon } from "./Icon";
import { Card, Divider } from "./primitives";
import { Text } from "./Text";

const LEAD_GAP = 12;

/**
 * A list row: leading tile, title and one muted line, trailing value (tabular)
 * with an optional second line, chevron when it navigates. 56 tall with one
 * line, 68 with two. Put rows in a <ListGroup>.
 */
export function ListRow({
  leading,
  title,
  titleLines = 1,
  subtitle,
  trailing,
  trailingSub,
  below,
  onPress,
  accessibilityLabel,
}: {
  leading?: ReactNode;
  title: string;
  titleLines?: number;
  subtitle?: string | null;
  trailing?: string | null;
  trailingSub?: string | null;
  /** Extra content under the text (chips, badges). */
  below?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, trailing, trailingSub].filter(Boolean).join(", ")}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: LEAD_GAP,
        minHeight: subtitle ? t.layout.row2 : t.layout.row,
        paddingVertical: t.space.md,
        paddingHorizontal: t.space.lg,
        backgroundColor: pressed ? t.c.surfaceAlt : "transparent",
      })}
    >
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline" numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="callout" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {below}
      </View>
      {trailing != null ? (
        <View style={{ alignItems: "flex-end", gap: 2, maxWidth: "40%" }}>
          <Text variant="headline" tabular numberOfLines={1}>
            {trailing}
          </Text>
          {trailingSub ? (
            <Text variant="callout" color="textSecondary" tabular numberOfLines={1}>
              {trailingSub}
            </Text>
          ) : null}
        </View>
      ) : null}
      {onPress ? <Icon name="chevronRight" size={20} color={t.c.textMuted} /> : null}
    </Pressable>
  );
}

/** Rows in one card, with hairlines inset to the text (`inset`: the leading tile's width, 0 without). */
export function ListGroup({ children, inset = 40, dim }: { children: ReactNode; inset?: number; dim?: boolean }) {
  const t = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <Card padded={false} style={{ overflow: "hidden", opacity: dim ? 0.5 : 1 }}>
      {rows.map((r, i) => (
        <Fragment key={r.key ?? i}>
          {i > 0 ? <Divider inset={t.space.lg + (inset ? inset + LEAD_GAP : 0)} /> : null}
          {r}
        </Fragment>
      ))}
    </Card>
  );
}

/**
 * A grouped list (settings style): a label above, rows in a card, a footnote
 * under it. Children are rows (InfoRow, ToggleRow…) or any content block.
 */
export function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  const t = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={{ gap: t.space.sm }}>
      {title ? (
        <Text variant="overline" color="textSecondary" style={{ paddingHorizontal: t.space.lg }}>
          {title}
        </Text>
      ) : null}
      <Card padded={false} style={{ overflow: "hidden" }}>
        {rows.map((r, i) => (
          <Fragment key={r.key ?? i}>
            {i > 0 ? <Divider inset={t.space.lg} /> : null}
            {r}
          </Fragment>
        ))}
      </Card>
      {footer ? (
        typeof footer === "string" ? (
          <Text variant="caption" color="textMuted" style={{ paddingHorizontal: t.space.lg }}>
            {footer}
          </Text>
        ) : (
          footer
        )
      ) : null}
    </View>
  );
}

export type ValueTone = "ok" | "warn" | "bad" | "dim";

/** Label on the left, value on the right (tabular), in a Group. 48 tall. */
export function InfoRow({ label, value, tone, note }: { label: string; value: string; tone?: ValueTone; note?: string | null }) {
  const t = useTheme();
  const color =
    tone === "ok" ? t.c.success : tone === "warn" ? t.c.warning : tone === "bad" ? t.c.danger : tone === "dim" ? t.c.textMuted : t.c.text;
  return (
    <View style={{ minHeight: 48, paddingHorizontal: t.space.lg, paddingVertical: t.space.md, justifyContent: "center", gap: 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: t.space.lg }}>
        <Text variant="body" color="textSecondary" style={{ lineHeight: 20 }}>
          {label}
        </Text>
        <Text variant="body" tabular numberOfLines={2} style={{ flexShrink: 1, textAlign: "right", color, lineHeight: 20, fontWeight: "500" }}>
          {value}
        </Text>
      </View>
      {note ? (
        <Text variant="caption" color="textMuted">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/** Free content inside a Group, with the row padding. */
export function GroupBlock({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  const t = useTheme();
  return <View style={{ paddingHorizontal: t.space.lg, paddingVertical: t.space.md, gap }}>{children}</View>;
}

/**
 * One row of a grouped list rendered item by item (FlatList): the card's top
 * corners on the first, bottom corners on the last, inset hairlines between.
 */
export function GroupedItem({ first, last, inset = 40, children }: { first: boolean; last: boolean; inset?: number; children: ReactNode }) {
  const t = useTheme();
  const r = t.radius.md;
  return (
    <View
      style={{
        backgroundColor: t.c.surface,
        borderColor: t.c.border,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopWidth: first ? 1 : 0,
        borderBottomWidth: last ? 1 : 0,
        borderTopLeftRadius: first ? r : 0,
        borderTopRightRadius: first ? r : 0,
        borderBottomLeftRadius: last ? r : 0,
        borderBottomRightRadius: last ? r : 0,
        overflow: "hidden",
      }}
    >
      {first ? null : <Divider inset={t.space.lg + (inset ? inset + LEAD_GAP : 0)} />}
      {children}
    </View>
  );
}
