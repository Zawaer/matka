import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { C, RADIUS } from "./theme";

export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[s.card, style]}>
      {title ? <Text style={s.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" | "dim" }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text
        style={[
          s.rowValue,
          tone === "ok" && { color: C.primary },
          tone === "warn" && { color: C.accent },
          tone === "bad" && { color: C.danger },
          tone === "dim" && { color: C.faint },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = "primary",
  busy,
  disabled,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "danger" | "ghost";
  busy?: boolean;
  disabled?: boolean;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        s.btn,
        kind === "primary" && { backgroundColor: C.primaryStrong },
        kind === "danger" && { backgroundColor: C.danger },
        kind === "ghost" && s.btnGhost,
        (pressed || off) && { opacity: 0.6 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === "ghost" ? C.muted : C.onPrimary} />
      ) : (
        <Text style={[s.btnText, kind === "ghost" && { color: C.text }, kind === "danger" && { color: "#fff" }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Banner({ tone, children }: { tone: "warn" | "bad" | "info"; children: ReactNode }) {
  const color = tone === "bad" ? C.danger : tone === "warn" ? C.accent : C.primary;
  return (
    <View style={[s.banner, { borderColor: color }]}>
      {typeof children === "string" ? <Text style={[s.bannerText, { color }]}>{children}</Text> : children}
    </View>
  );
}

/** Shown on every tab after a 401: the token was revoked or is invalid. */
export function PairingLostBanner({ onPair }: { onPair: () => void }) {
  return (
    <Banner tone="bad">
      <Text style={[s.bannerText, { color: C.danger }]}>
        Pairing lost — the server rejected this device&apos;s token (revoked?). Uploads are paused; queued points are
        kept. Pair again from the web app&apos;s Devices page.
      </Text>
      <Button title="Re-pair" kind="danger" onPress={onPair} />
    </Banner>
  );
}

export const s = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: RADIUS,
    padding: 16,
    gap: 10,
  },
  cardTitle: { color: C.muted, fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { color: C.muted, fontSize: 14 },
  rowValue: { color: C.text, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  btn: { borderRadius: RADIUS, paddingVertical: 15, paddingHorizontal: 16, alignItems: "center" },
  btnGhost: { borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  btnText: { color: C.onPrimary, fontSize: 16, fontWeight: "700" },
  banner: { borderWidth: 1, borderRadius: RADIUS, padding: 12, gap: 8, backgroundColor: C.surface },
  bannerText: { fontSize: 14, fontWeight: "600" },
  h1: { color: C.text, fontSize: 30, fontWeight: "700" },
  sub: { color: C.muted, fontSize: 14 },
  body: { color: C.text, fontSize: 14, lineHeight: 20 },
  hint: { color: C.faint, fontSize: 12, lineHeight: 17 },
  input: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    color: C.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  label: { color: C.muted, fontSize: 13, fontWeight: "600" },
  link: { color: C.primary, fontSize: 14, fontWeight: "600" },
});
