// "Fix this trip" bottom sheet (Timeline): the mode, and optionally the public
// transport lines ridden, in order, with where you changed. Same editor as the
// web timeline; saved with POST /api/corrections, undone with DELETE. It also
// adds a trip where none was recorded ("Missing travel" → "Add travel").

import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { modeMeta } from "../design/modes";
import { useTheme } from "../design/theme";
import { LEG_BADGE } from "../design/transit";
import { fmtDistance, fmtTime } from "../format";
import {
  FIX_MODES,
  addLeg,
  correctionBody,
  draftFromMove,
  isTransit,
  moveUp,
  removeLeg,
  setTransfer,
  type Draft,
} from "../trip-fix-logic";
import { deleteCorrection, postCorrection, searchRoutes, searchStops, type Move, type Route } from "../viewer";
import { Field } from "./components";
import { Icon } from "./Icon";
import { Button } from "./primitives";
import { useSession } from "./session";
import { Text } from "./Text";

/** Debounced search: results for the latest term only. */
function useSearch<T>(term: string, run: (q: string) => Promise<{ ok: true; data: T[] } | { ok: false }>, min = 1): T[] | null {
  const [out, setOut] = useState<{ term: string; data: T[] } | null>(null);
  useEffect(() => {
    const q = term.trim();
    if (q.length < min) return;
    let live = true;
    const id = setTimeout(async () => {
      const r = await run(q);
      if (live) setOut({ term: q, data: r.ok ? r.data : [] });
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [term, run, min]);
  return term.trim().length >= min && out?.term === term.trim() ? out.data : null;
}

function LineBadge({ kind, line }: { kind: Route["kind"]; line: string }) {
  const b = LEG_BADGE[kind];
  return (
    <View style={{ backgroundColor: b.bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text variant="caption" style={{ color: b.fg, fontWeight: "800" }}>
        {b.label} {line}
      </Text>
    </View>
  );
}

function TransferField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  const { pairing } = useSession();
  const [focused, setFocused] = useState(false);
  const run = useState(() => (q: string) => searchStops(pairing, q))[0];
  const stops = useSearch(focused ? value : "", run, 2);
  const hints = (stops ?? []).filter((s) => s !== value).slice(0, 4);
  return (
    <View style={{ marginLeft: 22, paddingLeft: t.space.md, borderLeftWidth: 2, borderLeftColor: t.c.border, borderStyle: "dashed", paddingVertical: 6, gap: 6 }}>
      <Field
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Changed at… (stop, optional)"
        accessibilityLabel="Stop where you changed"
        style={{ paddingVertical: 6, fontSize: 14 }}
      />
      {hints.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {hints.map((s) => (
            <Pressable
              key={s}
              onPress={() => onChange(s)}
              accessibilityRole="button"
              style={{ borderRadius: 999, borderWidth: 1, borderColor: t.c.borderStrong, paddingHorizontal: 10, paddingVertical: 4 }}
            >
              <Text variant="caption" color="textSecondary">
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function TripFixSheet({ move, onClose, onSaved }: { move: Move | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal visible={move != null} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {move ? <Sheet key={`${move.id}-${move.startedAt}`} move={move} onClose={onClose} onSaved={onSaved} /> : null}
    </Modal>
  );
}

function Sheet({ move, onClose, onSaved }: { move: Move; onClose: () => void; onSaved: () => void }) {
  const t = useTheme();
  const { pairing, onUnauthorized } = useSession();
  const [draft, setDraft] = useState<Draft>(() => draftFromMove(move));
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useState(() => (q: string) => searchRoutes(pairing, q))[0];
  const routes = useSearch(term, run);
  const transit = isTransit(draft.mode);

  async function send(req: Promise<{ ok: true } | { ok: false; unauthorized: boolean; error: string }>) {
    setBusy(true);
    setError(null);
    const r = await req;
    setBusy(false);
    if (r.ok) {
      onSaved();
      onClose();
    } else {
      setError(r.error);
      if (r.unauthorized) onUnauthorized();
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} onPress={busy ? undefined : onClose} accessibilityLabel="Close" />
      <View
        style={{
          maxHeight: "88%",
          backgroundColor: t.c.surface,
          borderTopLeftRadius: t.radius.xl,
          borderTopRightRadius: t.radius.xl,
          borderTopWidth: 1,
          borderColor: t.c.border,
          paddingBottom: t.space.xl,
        }}
      >
        <View style={{ alignItems: "center", paddingTop: 8 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.c.borderStrong }} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: t.space.xl, paddingTop: t.space.md, gap: t.space.md }}>
          <View style={{ flex: 1 }}>
            <Text variant="title3">{move.added ? (move.correctionId != null ? "Trip you added" : "Add travel") : "Fix this trip"}</Text>
            <Text variant="caption" color="textSecondary">
              {fmtTime(move.startedAt)} – {fmtTime(move.endedAt)}
              {move.distance != null ? ` · ${fmtDistance(move.distance)}` : ""}
              {move.added ? " in a straight line" : move.correctionId != null ? " · edited" : ` · shown as ${modeMeta(move.mode).label}`}
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
            <Icon name="close" size={24} color={t.c.textMuted} />
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingTop: t.space.lg, gap: t.space.lg }}>
          <View style={{ gap: t.space.sm }}>
            <Text variant="overline" color="textMuted">
              How did you travel?
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} accessibilityRole="radiogroup">
              {FIX_MODES.map((m) => {
                const on = m === draft.mode;
                const meta = modeMeta(m);
                return (
                  <Pressable
                    key={m}
                    onPress={() => setDraft((d) => ({ ...d, mode: m }))}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={meta.label}
                    style={{
                      width: "18.4%",
                      alignItems: "center",
                      gap: 2,
                      paddingVertical: 8,
                      borderRadius: t.radius.sm,
                      borderWidth: 1,
                      borderColor: on ? t.c.primary : t.c.border,
                      backgroundColor: on ? t.c.primarySoft : "transparent",
                    }}
                  >
                    <Icon name={meta.icon} size={20} color={on ? t.c.primary : t.mode(m)} />
                    <Text variant="caption" numberOfLines={1} style={{ fontSize: 11, color: on ? t.c.text : t.c.textSecondary, fontWeight: on ? "800" : "500" }}>
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {transit ? (
            <View style={{ gap: t.space.sm }}>
              <Text variant="overline" color="textMuted">
                Lines, in order (optional)
              </Text>
              {draft.legs.map((l, i) => (
                <View key={i}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.sm }}>
                    <Text variant="caption" color="textMuted" tabular style={{ width: 14, textAlign: "right" }}>
                      {i + 1}
                    </Text>
                    <LineBadge kind={l.kind} line={l.line} />
                    <View style={{ flex: 1 }} />
                    {i > 0 ? (
                      <Pressable onPress={() => setDraft((d) => moveUp(d, i))} accessibilityRole="button" accessibilityLabel={`Move ${l.line} up`} hitSlop={8}>
                        <Icon name="arrow-up" size={20} color={t.c.textMuted} />
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => setDraft((d) => removeLeg(d, i))} accessibilityRole="button" accessibilityLabel={`Remove ${l.line}`} hitSlop={8}>
                      <Icon name="close" size={20} color={t.c.textMuted} />
                    </Pressable>
                  </View>
                  {i < draft.legs.length - 1 ? (
                    <TransferField value={l.transferStop} onChange={(v) => setDraft((d) => setTransfer(d, i, v))} />
                  ) : null}
                </View>
              ))}
              <Field
                value={term}
                onChangeText={setTerm}
                placeholder={draft.legs.length ? "Add another line" : "Find a line, e.g. 159 or M1"}
                accessibilityLabel="Find a line"
                autoCorrect={false}
                autoCapitalize="characters"
              />
              {term.trim() ? (
                <View style={{ borderWidth: 1, borderColor: t.c.border, borderRadius: t.radius.sm, overflow: "hidden" }}>
                  {routes == null ? (
                    <Text variant="caption" color="textMuted" style={{ padding: t.space.md }}>
                      Searching…
                    </Text>
                  ) : routes.length === 0 ? (
                    <Text variant="caption" color="textMuted" style={{ padding: t.space.md }}>
                      No lines found
                    </Text>
                  ) : (
                    routes.slice(0, 8).map((r) => (
                      <Pressable
                        key={`${r.kind}:${r.line}`}
                        onPress={() => {
                          setDraft((d) => addLeg(d, r.kind, r.line));
                          setTerm("");
                        }}
                        accessibilityRole="button"
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          gap: t.space.sm,
                          paddingHorizontal: t.space.md,
                          paddingVertical: 10,
                          backgroundColor: pressed ? t.c.surfaceAlt : "transparent",
                        })}
                      >
                        <LineBadge kind={r.kind} line={r.line} />
                        <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
                          {r.name ?? ""}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          {error ? (
            <Text variant="caption" style={{ color: t.c.danger }}>
              Couldn&apos;t save: {error}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: t.space.sm, justifyContent: "flex-end", paddingBottom: t.space.sm }}>
            {move.correctionId != null ? (
              <View style={{ flex: 1 }}>
                <Button label={move.added ? "Remove trip" : "Undo fix"} icon={move.added ? "delete-outline" : "undo"} variant="secondary" disabled={busy} onPress={() => send(deleteCorrection(pairing, move.correctionId!))} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button label="Save" icon="check" busy={busy} onPress={() => send(postCorrection(pairing, correctionBody(move, draft)))} />
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
