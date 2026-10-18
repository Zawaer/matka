import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useStyles, useTheme } from "../design/theme";
import { Text } from "./Text";

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
    content: { paddingHorizontal: th.layout.gutter, paddingTop: th.space.md, paddingBottom: th.space.xxxl, gap: th.space.lg },
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

export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingTop: 4 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="title1">{title}</Text>
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
