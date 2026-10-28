import type { ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useStyles, useTheme } from "../design/theme";
import { Icon } from "./Icon";
import { IconButton, Skeleton } from "./primitives";
import { Text } from "./Text";

/** App bar height: the same on every tab and pushed view. */
export const APP_BAR = 56;

/**
 * A scrolling screen: 16 inset, 16 between blocks (sections add their own on top).
 * `appBar` stays put above the scrolling content (ScreenHeader or AppBar).
 */
export function Screen({
  children,
  refreshing,
  onRefresh,
  appBar,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  appBar?: ReactNode;
}) {
  const t = useTheme();
  const s = useStyles((th) => ({
    root: { flex: 1, backgroundColor: th.c.bg },
    content: { paddingHorizontal: th.layout.gutter, paddingTop: th.space.sm, paddingBottom: th.space.xxl, gap: th.space.lg },
  }));
  const body = (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.c.primary} colors={[t.c.primary]} progressBackgroundColor={t.c.surface} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
  if (!appBar) return body;
  return (
    <View style={s.root}>
      {appBar}
      {body}
    </View>
  );
}

/**
 * The top app bar of a tab: the title (22/600) on the 16 inset, 56 tall, up to
 * a few trailing icon buttons. Every tab uses this one, so the anatomy is the
 * same wherever you are.
 */
export function ScreenHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: t.space.xs,
        minHeight: APP_BAR,
        paddingLeft: t.layout.gutter,
        paddingRight: t.space.xs,
        backgroundColor: t.c.bg,
      }}
    >
      <View style={{ flex: 1, gap: 0 }}>
        {typeof title === "string" ? (
          <Text variant="title1" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
        ) : (
          title
        )}
        {subtitle ? (
          <Text variant="callout" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={{ flexDirection: "row", alignItems: "center" }}>{right}</View> : null}
    </View>
  );
}

/**
 * The top app bar of a pushed view (M3 small app bar): a back arrow in a 48
 * target, then the title inline. Replaces a "‹ Trips" link row plus a big title.
 */
export function AppBar({
  title,
  subtitle,
  onBack,
  backLabel,
  right,
}: {
  title: string | null;
  subtitle?: string | null;
  onBack: () => void;
  /** Where back goes, for screen readers ("Back to Trips"). */
  backLabel: string;
  right?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: APP_BAR, paddingHorizontal: t.space.xs, gap: t.space.xs, backgroundColor: t.c.bg }}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={`Back to ${backLabel}`}
        hitSlop={4}
        style={({ pressed }) => ({
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? t.c.surfaceAlt : "transparent",
        })}
      >
        <Icon name="arrowBack" size={24} color={t.c.text} />
      </Pressable>
      <View style={{ flex: 1, paddingRight: right ? 0 : t.space.md }}>
        {title == null ? (
          <Skeleton height={20} width={160} radius={6} />
        ) : (
          <Text variant="title1" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
        )}
        {subtitle ? (
          <Text variant="callout" color="textSecondary" numberOfLines={1} tabular>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={{ flexDirection: "row", alignItems: "center" }}>{right}</View> : null}
    </View>
  );
}

/**
 * ‹ October 2026 › on one line: steps through months (or days). The label is
 * 17/600; while it loads a skeleton bar holds its place (never a literal "…").
 */
export function Pager({
  title,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
}: {
  title: string | null;
  onPrev?: () => void;
  onNext?: () => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.sm, marginHorizontal: -t.space.sm }}>
      <IconButton icon="back" label={prevLabel} onPress={() => onPrev?.()} disabled={!onPrev} />
      <View style={{ flex: 1, alignItems: "center" }}>
        {title ? (
          <Text variant="title3" tabular numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <Skeleton height={20} width={120} radius={6} />
        )}
      </View>
      <IconButton icon="forward" label={nextLabel} onPress={() => onNext?.()} disabled={!onNext} />
    </View>
  );
}
