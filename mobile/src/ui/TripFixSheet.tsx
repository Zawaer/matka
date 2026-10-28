// "Fix this trip" bottom sheet (Timeline): the mode, and optionally the public
// transport lines ridden, in order, with where you changed. Same editor as the
// web timeline; saved with POST /api/corrections, undone with DELETE. It also
// adds a trip where none was recorded ("Missing travel" → "Add travel").

import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
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
import { Icon } from "./Icon";
import { Button, Chip, Divider, Field, IconButton } from "./primitives";
import { Sheet } from "./Sheet";
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
    <View style={{ backgroundColor: b.bg, borderRadius: 6, paddingHorizontal: 8, height: 22, justifyContent: "center" }}>
      <Text variant="micro" style={{ color: b.fg }}>
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
    <View style={{ marginLeft: 11, paddingLeft: t.space.lg, borderLeftWidth: 2, borderLeftColor: t.c.border, paddingVertical: t.space.sm, gap: t.space.sm }}>
      <Field
        dense
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Changed at… (stop, optional)"
        accessibilityLabel="Stop where you changed"
      />
      {hints.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {hints.map((s) => (
            <Chip key={s} label={s} onPress={() => onChange(s)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function TripFixSheet({ move, onClose, onSaved }: { move: Move | null; onClose: () => void; onSaved: () => void }) {
  return move ? <FixSheet key={`${move.id}-${move.startedAt}`} move={move} onClose={onClose} onSaved={onSaved} /> : null;
}

function FixSheet({ move, onClose, onSaved }: { move: Move; onClose: () => void; onSaved: () => void }) {
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

  const title = move.added ? (move.correctionId != null ? "Trip you added" : "Add travel") : "Fix this trip";
  const subtitle = `${fmtTime(move.startedAt)}–${fmtTime(move.endedAt)}${move.distance != null ? ` · ${fmtDistance(move.distance)}` : ""}${
    move.added ? " in a straight line" : move.correctionId != null ? " · edited" : ` · shown as ${modeMeta(move.mode).label}`
  }`;

  return (
    <Sheet
      visible
      onClose={onClose}
      dismissable={!busy}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          {move.correctionId != null ? (
            <View style={{ flex: 1 }}>
              <Button
                label={move.added ? "Remove trip" : "Undo fix"}
                icon={move.added ? "delete" : "undo"}
                variant="secondary"
                disabled={busy}
                onPress={() => send(deleteCorrection(pairing, move.correctionId!))}
              />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button label="Save" icon="check" busy={busy} onPress={() => send(postCorrection(pairing, correctionBody(move, draft)))} />
          </View>
        </>
      }
    >
      <View style={{ gap: t.space.md }}>
        <Text variant="overline" color="textSecondary">
          How did you travel?
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }} accessibilityRole="radiogroup">
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
                style={({ pressed }) => ({
                  width: "18%",
                  height: 64,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  borderRadius: t.radius.sm,
                  borderWidth: on ? 2 : 0,
                  borderColor: t.c.primary,
                  backgroundColor: on ? t.c.primarySoft : t.c.surfaceAlt,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Icon name={meta.icon} size={20} color={t.mode(m)} />
                <Text variant="caption" numberOfLines={1} style={{ color: on ? t.c.primary : t.c.textSecondary, fontWeight: "500" }}>
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {transit ? (
        <View style={{ gap: t.space.md }}>
          <Text variant="overline" color="textSecondary">
            Lines, in order (optional)
          </Text>
          {draft.legs.map((l, i) => (
            <View key={i}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.sm }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
                  <Text variant="micro" color="textSecondary" tabular>
                    {i + 1}
                  </Text>
                </View>
                <LineBadge kind={l.kind} line={l.line} />
                <View style={{ flex: 1 }} />
                {i > 0 ? <IconButton icon="moveUp" label={`Move ${l.line} up`} color={t.c.textSecondary} onPress={() => setDraft((d) => moveUp(d, i))} /> : null}
                <IconButton icon="close" label={`Remove ${l.line}`} color={t.c.textSecondary} onPress={() => setDraft((d) => removeLeg(d, i))} />
              </View>
              {i < draft.legs.length - 1 ? <TransferField value={l.transferStop} onChange={(v) => setDraft((d) => setTransfer(d, i, v))} /> : null}
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
                <Text variant="callout" color="textMuted" style={{ padding: t.space.md }}>
                  Searching…
                </Text>
              ) : routes.length === 0 ? (
                <Text variant="callout" color="textMuted" style={{ padding: t.space.md }}>
                  No lines found
                </Text>
              ) : (
                routes.slice(0, 8).map((r, i) => (
                  <View key={`${r.kind}:${r.line}`}>
                    {i > 0 ? <Divider /> : null}
                    <Pressable
                      onPress={() => {
                        setDraft((d) => addLeg(d, r.kind, r.line));
                        setTerm("");
                      }}
                      accessibilityRole="button"
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: t.space.md,
                        paddingHorizontal: t.space.md,
                        minHeight: 48,
                        backgroundColor: pressed ? t.c.surfaceAlt : "transparent",
                      })}
                    >
                      <LineBadge kind={r.kind} line={r.line} />
                      <Text variant="callout" color="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
                        {r.name ?? ""}
                      </Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <Text variant="callout" color="danger">
          Couldn&apos;t save: {error}
        </Text>
      ) : null}
    </Sheet>
  );
}
