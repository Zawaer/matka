// The bottom sheet shell: scrim, 28 top corners, a handle, a title row with
// close, scrolling content and an optional footer of actions.

import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../design/theme";
import { IconButton } from "./primitives";
import { Text } from "./Text";

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  dismissable = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** False while saving: the scrim doesn't close it. */
  dismissable?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {visible ? (
        <Body onClose={onClose} title={title} subtitle={subtitle} footer={footer} dismissable={dismissable}>
          {children}
        </Body>
      ) : null}
    </Modal>
  );
}

function Body({
  onClose,
  title,
  subtitle,
  children,
  footer,
  dismissable,
}: {
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  dismissable: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <Pressable style={{ flex: 1, backgroundColor: t.c.scrim }} onPress={dismissable ? onClose : undefined} accessibilityLabel="Close" />
      <View
        accessibilityViewIsModal
        style={{
          maxHeight: "90%",
          backgroundColor: t.c.surface,
          borderTopLeftRadius: t.radius.xl,
          borderTopRightRadius: t.radius.xl,
          boxShadow: t.elev.overlay,
          paddingBottom: Math.max(insets.bottom, t.space.lg),
        }}
      >
        <View style={{ alignItems: "center", paddingTop: t.space.sm }}>
          <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: t.c.borderStrong, opacity: 0.6 }} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-start", paddingLeft: t.space.xl, paddingRight: t.space.md, paddingTop: t.space.md, gap: t.space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title2" accessibilityRole="header">
              {title}
            </Text>
            {typeof subtitle === "string" ? (
              <Text variant="callout" color="textSecondary" tabular>
                {subtitle}
              </Text>
            ) : (
              subtitle
            )}
          </View>
          {/* Centred on the title's line (28 tall), not on the title block. */}
          <View style={{ marginTop: -6 }}>
            <IconButton icon="close" label="Close" onPress={onClose} color={t.c.textSecondary} />
          </View>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingTop: t.space.xl, paddingBottom: t.space.lg, gap: t.space.xl }}
        >
          {children}
        </ScrollView>
        {footer ? (
          <View style={{ flexDirection: "row", gap: t.space.md, paddingHorizontal: t.space.xl, paddingTop: t.space.md, borderTopWidth: 1, borderTopColor: t.c.border }}>
            {footer}
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
