// Lists: rows in a card with inset hairlines (places, cities, days), and
// grouped key-value lists with a label above (Recorder, Settings).

import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "../design/theme";
import { Icon } from "./Icon";
import { Card, Divider } from "./primitives";
import { Text } from "./Text";

const LEAD_GAP = 12;

/** Children as rows: fragments opened up, so rows passed in a <>…</> still get dividers. */
function rowsOf(children: ReactNode): ReactElement[] {
  const out: ReactElement[] = [];
  for (const c of Children.toArray(children)) {
    if (!isValidElement(c)) continue;
    if (c.type === Fragment) out.push(...rowsOf((c.props as { children?: ReactNode }).children));
    else out.push(c);
  }
  return out;
}

/**
 * A list row: leading tile (pinned to the first line), title (15/500) and one
 * muted line, a trailing value (13, tabular, secondary) with an optional
 * second line, chevron when it navigates. 56 tall with one line, 68 with two.
 * Put rows in a <ListGroup>.
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
  // Several lines: the tile and the trailing value line up with the first one.
  const multi = !!subtitle || titleLines > 1 || !!below;
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
      {leading ? <View style={{ alignSelf: multi ? "flex-start" : "center" }}>{leading}</View> : null}
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
        <View style={{ alignItems: "flex-end", gap: 2, maxWidth: "40%", alignSelf: multi ? "flex-start" : "center" }}>
          <Text variant="callout" color="textSecondary" tabular numberOfLines={1} style={{ lineHeight: 20 }}>
            {trailing}
          </Text>
          {trailingSub ? (
            <Text variant="caption" color="textMuted" tabular numberOfLines={1}>
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
  const rows = rowsOf(children);
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
export function Group({ title, footer, children, right }: { title?: string; footer?: ReactNode; children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  const rows = rowsOf(children);
  return (
    <View style={{ gap: t.space.sm }}>
      {title ? (
        // The one section-header style (same as SectionHeader): sentence case, 17/600.
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28, marginTop: t.space.sm }}>
          <Text variant="title3" accessibilityRole="header">
            {title}
          </Text>
          {right}
        </View>
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

/**
 * Label on the left, value on the right (tabular), in a Group. 48 tall. A
 * status shows as a 16 px icon before the value; the value itself stays in
 * text colour (status colour is for icons and banners only).
 */
export function InfoRow({ label, value, tone, note }: { label: string; value: string; tone?: ValueTone; note?: string | null }) {
  const t = useTheme();
  const glyph = tone === "ok" ? { name: "ok" as const, color: t.c.success } : tone === "warn" ? { name: "warning" as const, color: t.c.warning } : tone === "bad" ? { name: "error" as const, color: t.c.danger } : null;
  return (
    <View style={{ minHeight: 48, paddingHorizontal: t.space.lg, paddingVertical: t.space.md, justifyContent: "center", gap: 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: t.space.lg }}>
        <Text variant="body" color="textSecondary" style={{ lineHeight: 20, flexShrink: 1 }}>
          {label}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, flexShrink: 1 }}>
          {glyph ? (
            <View style={{ height: 20, justifyContent: "center" }}>
              <Icon name={glyph.name} size={16} color={glyph.color} />
            </View>
          ) : null}
          <Text variant="body" tabular numberOfLines={2} color={tone === "dim" ? "textMuted" : "text"} style={{ flexShrink: 1, textAlign: "right", lineHeight: 20, fontWeight: "500" }}>
            {value}
          </Text>
        </View>
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
