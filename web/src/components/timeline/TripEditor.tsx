"use client";

import { useEffect, useId, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { MODE_META } from "@/lib/modes";
import { ArrowUp, Search, X } from "lucide-react";
import { Button, IconButton, ModeGlyph, cx, inputClass } from "@/components/ui";
import { formatDistance, formatTime } from "@/lib/format";
import { KIND_LABEL, badgeColors } from "@/lib/transit/colors";
import type { TrackSummary, TransitLeg } from "@/lib/types";

// "Fix this trip": the mode, and optionally the public transport lines ridden,
// in order, with where you changed. Saved by time range (POST /api/corrections),
// so it survives the trip being rebuilt; Undo removes it again.
// The same editor adds a trip where none was recorded ("Missing travel" →
// "Add travel"): track.added, with the ends it went between.

const MODES = ["walking", "running", "cycling", "driving", "bus", "tram", "metro", "train", "boat", "flying"] as const;
type Mode = (typeof MODES)[number];
type Kind = TransitLeg["kind"];
const TRANSIT = new Set<string>(["bus", "tram", "metro", "train", "boat"]);

type DraftLeg = { kind: Kind; line: string; transferStop: string };
type Route = { line: string; kind: Kind; name: string | null };

const json = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

function initialLegs(track: TrackSummary): DraftLeg[] {
  return (track.legs ?? []).map((l, i, all) => ({
    kind: l.kind,
    line: l.lines[0],
    transferStop: i < all.length - 1 ? (l.toStop ?? "") : "",
  }));
}

/** How a detected mode reads in a sentence: "detected: cycling". */
const DETECTED: Partial<Record<string, string>> = {
  walking: "walking",
  running: "running",
  cycling: "cycling",
  driving: "driving",
  flying: "flight",
  boat: "ferry",
  motorcycle: "motorbike",
  unknown: "unclear",
};

export function TripEditor({ track, onClose }: { track: TrackSummary; onClose: () => void }) {
  const { mutate } = useSWRConfig();
  const [mode, setMode] = useState<Mode>((MODES as readonly string[]).includes(track.mode) ? (track.mode as Mode) : "bus");
  const [legs, setLegs] = useState<DraftLeg[]>(() => initialLegs(track));
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  const term = search.trim();
  const { data: found } = useSWR<{ routes: Route[] }>(term ? `/api/transit/routes?q=${encodeURIComponent(term)}` : null, json, {
    keepPreviousData: true,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const transit = TRANSIT.has(mode);
  const refresh = () => mutate((k) => typeof k === "string" && /^\/api\/(timeline|day-summary)/.test(k));

  async function send(req: Promise<Response>) {
    setBusy(true);
    setError(null);
    try {
      const r = await req;
      if (!r.ok) {
        const b = await r.json().catch(() => null);
        throw new Error(b?.error ?? `Server answered ${r.status}`);
      }
      await refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    send(
      fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startedAt: track.startedAt,
          endedAt: track.endedAt,
          mode,
          legs: transit ? legs.map((l) => ({ kind: l.kind, line: l.line, transferStop: l.transferStop || null })) : [],
          ...(track.added && track.from && track.to ? { added: true, from: track.from, to: track.to } : {}),
        }),
      }),
    );
  const undo = () => send(fetch(`/api/corrections/${track.correctionId}`, { method: "DELETE" }));

  const addLine = (r: Route) => {
    setLegs((ls) => [...ls, { kind: r.kind, line: r.line, transferStop: "" }]);
    if (!TRANSIT.has(mode)) setMode(r.kind);
    setSearch("");
    searchRef.current?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${ids}-title`}
      onClick={() => !busy && onClose()}
    >
      <div
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-pop sm:max-w-md sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-hidden className="mx-auto mt-2 h-1 w-8 shrink-0 rounded-full bg-strong sm:hidden" />
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 pb-3 pt-2 sm:pt-4">
          <div className="min-w-0">
            <h2 id={`${ids}-title`} className="text-heading text-text">
              {track.added ? (track.correctionId != null ? "Trip you added" : "Add travel") : "Fix this trip"}
            </h2>
            <p className="mt-0.5 text-meta tabular-nums text-muted">
              {formatTime(track.startedAt)} – {formatTime(track.endedAt)} · {formatDistance(track.distance)}
              {track.added
                ? " in a straight line"
                : track.correctionId != null
                  ? " · edited"
                  : ` · detected: ${DETECTED[track.mode] ?? MODE_META[track.mode].label.toLowerCase()}`}
            </p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2" />
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <fieldset>
            <legend className="mb-2 text-label text-text">How did you travel?</legend>
            <div className="grid grid-cols-5 gap-1.5">
              {MODES.map((m) => {
                const meta = MODE_META[m];
                const on = m === mode;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setMode(m)}
                    className={cx(
                      "flex flex-col items-center gap-1 rounded-control border px-1 py-2 text-caption transition-colors",
                      on
                        ? "border-primary bg-primary/10 font-medium text-text ring-1 ring-primary/40"
                        : "border-border text-muted hover:border-strong hover:text-text",
                    )}
                  >
                    <span style={on ? { color: meta.color } : undefined} aria-hidden>
                      <ModeGlyph mode={m} size={20} />
                    </span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {transit && (
            <section>
              <h3 className="text-label text-text">
                Lines, in order <span className="font-normal text-muted">(optional)</span>
              </h3>
              <p className="mb-2 mt-0.5 text-meta text-muted">Add each line you rode, e.g. bus 159 then metro M1, and where you changed.</p>
              {legs.length > 0 && (
                <ol className="mb-3 space-y-1.5">
                  {legs.map((l, i) => {
                    const c = badgeColors(l.kind);
                    return (
                      <li key={i}>
                        <div className="flex items-center gap-2">
                          <span className="w-4 text-right text-caption tabular-nums text-muted">{i + 1}</span>
                          <span className="rounded-[5px] px-1.5 py-px text-caption font-semibold" style={{ backgroundColor: c.bg, color: c.fg }}>
                            {KIND_LABEL[l.kind]} {l.line}
                          </span>
                          <span className="flex-1" />
                          <IconButton
                            icon={ArrowUp}
                            size="sm"
                            label={`Move ${l.line} up`}
                            disabled={i === 0}
                            onClick={() => setLegs((ls) => ls.map((x, k) => (k === i - 1 ? ls[i] : k === i ? ls[i - 1] : x)))}
                            className="h-7 w-7"
                          />
                          <IconButton
                            icon={X}
                            size="sm"
                            label={`Remove ${l.line}`}
                            onClick={() => setLegs((ls) => ls.filter((_, k) => k !== i))}
                            className="h-7 w-7"
                          />
                        </div>
                        {i < legs.length - 1 && (
                          <TransferInput
                            id={`${ids}-stop-${i}`}
                            value={l.transferStop}
                            onChange={(v) => setLegs((ls) => ls.map((x, k) => (k === i ? { ...x, transferStop: v } : x)))}
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
              <label className="relative block">
                <span className="sr-only">Find a line</span>
                <Search size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={legs.length ? "Add another line" : "Find a line, e.g. 159 or M1"}
                  className={cx(inputClass, "pl-9")}
                />
              </label>
              {term && (
                <ul className="mt-1.5 max-h-48 overflow-y-auto rounded-control border border-border">
                  {(found?.routes ?? []).length === 0 ? (
                    <li className="px-3 py-2 text-meta text-muted">{found ? "No lines found" : "Searching…"}</li>
                  ) : (
                    found!.routes.map((r) => {
                      const c = badgeColors(r.kind);
                      return (
                        <li key={`${r.kind}:${r.line}`}>
                          <button
                            type="button"
                            onClick={() => addLine(r)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
                          >
                            <span className="shrink-0 rounded-[5px] px-1.5 py-px text-caption font-semibold" style={{ backgroundColor: c.bg, color: c.fg }}>
                              {KIND_LABEL[r.kind]} {r.line}
                            </span>
                            <span className="truncate text-muted">{r.name}</span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </section>
          )}

          {error && (
            <p className="rounded-control border border-danger/35 bg-danger/8 px-3 py-2 text-meta text-danger" role="alert">
              Couldn&apos;t save: {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {track.correctionId != null && (
            <Button variant={track.added ? "danger" : "ghost"} disabled={busy} onClick={undo}>
              {track.added ? "Remove trip" : "Undo fix"}
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** "Changed at" stop between two rides, with stop name suggestions. */
function TransferInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const q = value.trim();
  const { data } = useSWR<{ stops: string[] }>(q.length >= 2 ? `/api/transit/stops?q=${encodeURIComponent(q)}` : null, json);
  return (
    <div className="my-1.5 ml-6 flex items-center gap-2 border-l-2 border-dashed border-border pl-3">
      <label htmlFor={id} className="shrink-0 text-meta text-muted">
        Changed at
      </label>
      <input
        id={id}
        list={`${id}-list`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Stop (optional)"
        className={cx(inputClass, "h-8 flex-1")}
      />
      <datalist id={`${id}-list`}>
        {(data?.stops ?? []).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
