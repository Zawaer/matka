// Parts of the Timeline list beyond visits and moves (same as the web
// timeline's TimelineExtras): "Visited X?" with the names to pick from,
// "Missing travel" with "Add travel", and the photos taken during a visit or
// move with a simple full-screen viewer.

import { useState } from "react";
import { FlatList, Image, Linking, Modal, Pressable, View, useWindowDimensions } from "react-native";
import { categoryLabel } from "../design/categories";
import { useTheme } from "../design/theme";
import { assetSource } from "../insights";
import { fmtDistance, fmtDuration, fmtTime } from "../format";
import { Photo } from "../screens/insights/parts";
import type { MissingTravel } from "../timeline-logic";
import { immichPhotoUrl, postPlaceChoice, type PlaceCandidate, type Visit } from "../viewer";
import { Field } from "./components";
import { Icon } from "./Icon";
import { useSession } from "./session";
import { Text } from "./Text";

/* ---------------- "Visited X?" ---------------- */

/** "school", "library", "address": what a candidate is. */
export const candidateType = (c: PlaceCandidate) => (c.address ? "address" : c.category ? categoryLabel(c.category).toLowerCase() : "place");

function Chip({ label, onPress, on, disabled }: { label: string; onPress: () => void; on?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ expanded: on, disabled }}
      hitSlop={6}
      style={({ pressed }) => ({
        borderRadius: 999,
        borderWidth: 1,
        borderColor: on ? t.c.primary : t.c.borderStrong,
        paddingHorizontal: 12,
        paddingVertical: 5,
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <Text variant="caption" style={{ color: on ? t.c.primary : t.c.textSecondary, fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Under a visit whose name is a guess: "Yes · Pick another". The answer goes
 * to the place (POST /api/places/:id/confirm), so all its visits change.
 */
export function PlaceQuestion({ visit, shownName, onAnswered }: { visit: Visit; shownName: string; onAnswered: () => void }) {
  const t = useTheme();
  const { pairing, onUnauthorized } = useSession();
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = (visit.candidates ?? []).filter((c) => c.name.toLowerCase() !== shownName.toLowerCase());

  async function answer(choice: { confirm: true } | { name: string; category?: string | null }) {
    setBusy(true);
    setError(null);
    const r = await postPlaceChoice(pairing, visit.placeId, choice);
    setBusy(false);
    if (r.ok) onAnswered();
    else {
      setError(r.error);
      if (r.unauthorized) onUnauthorized();
    }
  }

  const rowStyle = { paddingHorizontal: t.space.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.c.border };
  return (
    <View style={{ marginTop: 8, gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Yes" disabled={busy} onPress={() => answer({ confirm: true })} />
        <Chip label="Pick another" on={open} disabled={busy} onPress={() => setOpen((o) => !o)} />
      </View>
      {open ? (
        <View style={{ borderWidth: 1, borderColor: t.c.border, borderRadius: t.radius.sm, overflow: "hidden", marginTop: -1 }}>
          {others.map((c, i) => (
            <Pressable
              key={c.name}
              onPress={() => answer({ name: c.name, category: c.category })}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ${candidateType(c)}`}
              style={({ pressed }) => [rowStyle, i === 0 ? { borderTopWidth: 0 } : null, { backgroundColor: pressed ? t.c.surfaceAlt : "transparent" }]}
            >
              <Text variant="callout" numberOfLines={1}>
                {c.name}
                <Text variant="caption" color="textMuted">
                  {"  "}· {candidateType(c)}
                </Text>
              </Text>
            </Pressable>
          ))}
          {typing ? (
            <View style={[rowStyle, others.length === 0 ? { borderTopWidth: 0 } : null, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
              <View style={{ flex: 1 }}>
                <Field
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  maxLength={120}
                  placeholder="Name of this place"
                  accessibilityLabel="Name of this place"
                  returnKeyType="done"
                  onSubmitEditing={() => name.trim() && answer({ name: name.trim() })}
                  style={{ paddingVertical: 6, fontSize: 14 }}
                />
              </View>
              <Pressable
                onPress={() => name.trim() && answer({ name: name.trim() })}
                disabled={busy || !name.trim()}
                accessibilityRole="button"
                accessibilityLabel="Save name"
                hitSlop={8}
                style={{ opacity: busy || !name.trim() ? 0.4 : 1 }}
              >
                <Icon name="check" size={22} color={t.c.primary} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setTyping(true)}
              accessibilityRole="button"
              style={({ pressed }) => [rowStyle, others.length === 0 ? { borderTopWidth: 0 } : null, { backgroundColor: pressed ? t.c.surfaceAlt : "transparent" }]}
            >
              <Text variant="callout" color="textSecondary">
                Other name…
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
      {error ? (
        <Text variant="caption" style={{ color: t.c.danger }}>
          Couldn&apos;t save: {error}
        </Text>
      ) : null}
    </View>
  );
}

/* ---------------- Missing travel ---------------- */

/** "Missing travel · 9.5 km · 17 min" between two rows that are far apart, with "Add travel". */
export function MissingTravelRow({ gap, rail, onAdd }: { gap: MissingTravel; rail: number; onAdd: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: t.space.md }}>
      <View style={{ width: rail, alignItems: "center", paddingVertical: 4, gap: 4 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={{ width: 2, height: 5, borderRadius: 1, backgroundColor: t.c.accent, opacity: 0.6 }} />
        ))}
      </View>
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: t.space.sm,
          marginVertical: 4,
          paddingHorizontal: t.space.md,
          paddingVertical: 8,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: t.c.accent,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="callout" style={{ color: t.c.accent, fontWeight: "800" }}>
            Missing travel
          </Text>
          <Text variant="caption" color="textSecondary">
            {fmtDistance(gap.distance)}
            {gap.secs >= 60 ? ` · ${fmtDuration(gap.secs)}` : ""}
          </Text>
          <Text variant="caption" color="textMuted">
            {gap.secs >= 30 * 60 ? "No location recorded" : "No trip recorded"} · {fmtTime(gap.from)} – {fmtTime(gap.to)}
          </Text>
        </View>
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add travel"
          hitSlop={6}
          style={({ pressed }) => ({
            borderRadius: 999,
            borderWidth: 1,
            borderColor: t.c.borderStrong,
            paddingHorizontal: 12,
            paddingVertical: 6,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text variant="caption" style={{ fontWeight: "800" }}>
            Add travel
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ---------------- Photos ---------------- */

/** How many thumbnails a row shows before "+N". */
const STRIP = 6;
const THUMB = 56;

export type PhotoSet = { ids: string[]; total: number };

/** A row of up to STRIP thumbnails; a tap opens the viewer at that photo. */
export function PhotoStrip({ set, onOpen }: { set: PhotoSet; onOpen: (index: number) => void }) {
  const t = useTheme();
  const shown = set.ids.slice(0, STRIP);
  const more = set.total - shown.length;
  return (
    <View style={{ flexDirection: "row", gap: 5, marginTop: 8 }}>
      {shown.map((id, i) => {
        const last = i === shown.length - 1 && more > 0;
        return (
          <Pressable
            key={id}
            onPress={() => onOpen(i)}
            accessibilityRole="button"
            accessibilityLabel={last ? `${more} more photos` : `Photo ${i + 1}`}
            // Six always fit: they shrink on a narrow card, up to THUMB wide.
            style={{ flexBasis: 0, flexGrow: 1, maxWidth: THUMB, aspectRatio: 1 }}
          >
            <Photo id={id} size="thumbnail" style={{ width: "100%", height: "100%", borderRadius: t.radius.sm }} />
            {last ? (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: t.radius.sm,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text variant="callout" style={{ color: "#FFFFFF", fontWeight: "800" }}>
                  +{more}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Full-screen photos of one visit or move: swipe between them, "Open in Immich" when its address is set. */
export function PhotoViewer({
  set,
  start,
  linkBase,
  onClose,
}: {
  set: PhotoSet | null;
  start: number;
  linkBase: string | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={set != null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {set ? <Viewer key={set.ids[0]} set={set} start={start} linkBase={linkBase} onClose={onClose} /> : null}
    </Modal>
  );
}

function Viewer({ set, start, linkBase, onClose }: { set: PhotoSet; start: number; linkBase: string | null; onClose: () => void }) {
  const { pairing } = useSession();
  const { width, height } = useWindowDimensions();
  const [i, setI] = useState(Math.min(start, set.ids.length - 1));
  const id = set.ids[i];
  return (
    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 48, paddingHorizontal: 16, paddingBottom: 10 }}>
        <Text variant="callout" tabular style={{ color: "#FFFFFFCC", flex: 1 }}>
          {i + 1} / {set.ids.length}
          {set.total > set.ids.length ? ` (of ${set.total})` : ""}
        </Text>
        {linkBase ? (
          <Pressable
            onPress={() => void Linking.openURL(immichPhotoUrl(linkBase, id))}
            accessibilityRole="link"
            accessibilityLabel="Open in Immich"
            style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "#FFFFFF22", paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text variant="caption" style={{ color: "#FFFFFF", fontWeight: "800" }}>
              Open in Immich
            </Text>
            <Icon name="open-in-new" size={14} color="#FFFFFF" />
          </Pressable>
        ) : null}
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
          <Icon name="close" size={26} color="#FFFFFF" />
        </Pressable>
      </View>
      <FlatList
        data={set.ids}
        keyExtractor={(x) => x}
        horizontal
        pagingEnabled
        initialScrollIndex={i}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, height: height - 140, alignItems: "center", justifyContent: "center" }}>
            <Image
              source={assetSource(pairing, item, "preview")}
              style={{ width: width - 16, height: height - 160 }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>
        )}
      />
    </View>
  );
}
