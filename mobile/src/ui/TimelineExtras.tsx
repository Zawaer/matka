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
import { Icon } from "./Icon";
import { Button, Divider, Field, IconButton } from "./primitives";
import { useSession } from "./session";
import { Text } from "./Text";

/* ---------------- "Visited X?" ---------------- */

/** "school", "library", "address": what a candidate is. */
export const candidateType = (c: PlaceCandidate) => (c.address ? "address" : c.category ? categoryLabel(c.category).toLowerCase() : "place");

/**
 * Under a visit whose name is a guess: "Were you here?" with Yes and Pick
 * another. The answer goes to the place (POST /api/places/:id/confirm), so all
 * its visits change.
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

  const row = (pressed: boolean) => ({
    minHeight: 48,
    justifyContent: "center" as const,
    paddingHorizontal: t.space.md,
    backgroundColor: pressed ? t.c.surfaceAlt : "transparent",
  });
  return (
    <View style={{ marginTop: t.space.md, gap: t.space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.sm }}>
        <Text variant="callout" color="textSecondary" style={{ flex: 1 }}>
          Were you here?
        </Text>
        <Button label="Yes" size="sm" variant="secondary" disabled={busy} onPress={() => answer({ confirm: true })} />
        <Button label={open ? "Close" : "Pick another"} size="sm" variant="ghost" disabled={busy} onPress={() => setOpen((o) => !o)} />
      </View>
      {open ? (
        <View style={{ borderWidth: 1, borderColor: t.c.border, borderRadius: t.radius.sm, overflow: "hidden" }}>
          {others.map((c, i) => (
            <View key={c.name}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => answer({ name: c.name, category: c.category })}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`${c.name}, ${candidateType(c)}`}
                style={({ pressed }) => [row(pressed), { flexDirection: "row", alignItems: "center", gap: t.space.sm }]}
              >
                <Text variant="headline" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {c.name}
                </Text>
                <Text variant="callout" color="textSecondary">
                  {candidateType(c)}
                </Text>
              </Pressable>
            </View>
          ))}
          {others.length > 0 ? <Divider /> : null}
          {typing ? (
            <View style={[row(false), { flexDirection: "row", alignItems: "center", gap: t.space.sm, paddingVertical: t.space.sm }]}>
              <View style={{ flex: 1 }}>
                <Field
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  dense
                  maxLength={120}
                  placeholder="Name of this place"
                  accessibilityLabel="Name of this place"
                  returnKeyType="done"
                  onSubmitEditing={() => name.trim() && answer({ name: name.trim() })}
                />
              </View>
              <IconButton icon="check" label="Save name" color={t.c.primary} disabled={busy || !name.trim()} onPress={() => name.trim() && answer({ name: name.trim() })} />
            </View>
          ) : (
            <Pressable onPress={() => setTyping(true)} accessibilityRole="button" style={({ pressed }) => [row(pressed), { flexDirection: "row", alignItems: "center", gap: t.space.sm }]}>
              <Icon name="edit" size={16} color={t.c.primary} />
              <Text variant="headline" color="primary">
                Type a name
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
      {error ? (
        <Text variant="callout" color="danger">
          Couldn&apos;t save: {error}
        </Text>
      ) : null}
    </View>
  );
}

/* ---------------- Missing travel ---------------- */

/** Dashes down the rail where the timeline has no data. */
export function DashedRail({ rail, color, dashes = 6 }: { rail: number; color: string; dashes?: number }) {
  return (
    <View style={{ width: rail, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 4 }}>
      {Array.from({ length: dashes }, (_, i) => (
        <View key={i} style={{ width: 2, height: 6, borderRadius: 1, backgroundColor: color }} />
      ))}
    </View>
  );
}

/** "Missing travel · 9.5 km · 17 min" between two rows that are far apart, with "Add travel". */
export function MissingTravelRow({ gap, rail, onAdd }: { gap: MissingTravel; rail: number; onAdd: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: t.space.md }}>
      <DashedRail rail={rail} color={t.c.warning} />
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: t.space.md, paddingVertical: t.space.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline" color="warning">
            Missing travel
          </Text>
          <Text variant="callout" color="textSecondary" tabular>
            {fmtDistance(gap.distance)}
            {gap.secs >= 60 ? ` · ${fmtDuration(gap.secs)}` : ""}
          </Text>
          <Text variant="caption" color="textMuted" tabular>
            {fmtTime(gap.from)}–{fmtTime(gap.to)} · {gap.secs >= 30 * 60 ? "No location recorded" : "No trip recorded"}
          </Text>
        </View>
        <Button label="Add travel" icon="add" size="sm" variant="secondary" onPress={onAdd} />
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
    <View style={{ flexDirection: "row", gap: 4, marginTop: t.space.md }}>
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
            <Photo id={id} size="thumbnail" style={{ width: "100%", height: "100%", borderRadius: t.radius.xs }} />
            {last ? (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: t.radius.xs,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text variant="label" tabular style={{ color: "#FFFFFF" }}>
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 44, paddingHorizontal: 8, paddingLeft: 16, paddingBottom: 8 }}>
        <Text variant="label" tabular style={{ color: "#FFFFFFD9", flex: 1 }}>
          {i + 1} / {set.ids.length}
          {set.total > set.ids.length ? ` (of ${set.total})` : ""}
        </Text>
        {linkBase ? (
          <Pressable
            onPress={() => void Linking.openURL(immichPhotoUrl(linkBase, id))}
            accessibilityRole="link"
            accessibilityLabel="Open in Immich"
            hitSlop={6}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, height: 36, borderRadius: 999, backgroundColor: "#FFFFFF24", paddingHorizontal: 14, opacity: pressed ? 0.7 : 1 })}
          >
            <Text variant="label" style={{ color: "#FFFFFF" }}>
              Open in Immich
            </Text>
            <Icon name="external" size={16} color="#FFFFFF" />
          </Pressable>
        ) : null}
        <IconButton icon="close" label="Close" onPress={onClose} color="#FFFFFF" />
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
