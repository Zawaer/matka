import type { ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useStyles, useTheme } from "../design/theme";
import { Icon } from "./Icon";
import { IconButton } from "./primitives";
import { Text } from "./Text";

/** A scrolling screen: 16 inset, 16 between blocks (sections add their own 8 on top). */
export function Screen({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const t = useTheme();
  const s = useStyles((th) => ({
    root: { flex: 1, backgroundColor: th.c.bg },
    content: { paddingHorizontal: th.layout.gutter, paddingTop: th.space.sm, paddingBottom: th.space.xxl, gap: th.space.lg },
  }));
  return (
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
}

/** Screen title (28), optional one-line subtitle, actions on the right. */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.md, minHeight: 48, paddingTop: t.space.xs }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="title1" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="callout" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** "‹ Trips": back to the view underneath (48 to touch). */
export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        alignSelf: "flex-start",
        height: 48,
        marginLeft: -t.space.sm,
        paddingRight: t.space.md,
        paddingLeft: t.space.xs,
        marginBottom: -t.space.sm,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name="back" size={24} color={t.c.primary} />
      <Text variant="headline" color="primary">
        {label}
      </Text>
    </Pressable>
  );
}

/** Title of a pushed view with its context line. */
export function DetailTitle({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <View style={{ gap: 4 }}>
      <Text variant="title1" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="callout" color="textSecondary">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** ‹ Saturday · 18 October › : steps through days or months. */
export function Pager({
  kicker,
  title,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
}: {
  kicker: string;
  title: string;
  onPrev?: () => void;
  onNext?: () => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.sm }}>
      <IconButton icon="back" label={prevLabel} onPress={() => onPrev?.()} disabled={!onPrev} variant="tonal" />
      <View style={{ flex: 1, alignItems: "center" }}>
        <Text variant="caption" color="textSecondary" style={{ fontWeight: "500" }}>
          {kicker}
        </Text>
        <Text variant="title2" tabular numberOfLines={1}>
          {title}
        </Text>
      </View>
      <IconButton icon="forward" label={nextLabel} onPress={() => onNext?.()} disabled={!onNext} variant="tonal" />
    </View>
  );
}
