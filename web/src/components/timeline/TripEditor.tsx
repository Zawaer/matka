"use client";

import { useEffect, useId, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { MODE_META } from "@/lib/modes";
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
        className="mk-card flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-b-none shadow-[var(--mk-shadow)] sm:max-w-md sm:rounded-b-[var(--mk-radius)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 id={`${ids}-title`} className="text-lg font-semibold">
              {track.added ? (track.correctionId != null ? "Trip you added" : "Add travel") : "Fix this trip"}
            </h2>
            <p className="text-sm text-muted">
              {formatTime(track.startedAt)} – {formatTime(track.endedAt)} · {formatDistance(track.distance)}
              {track.added
                ? " in a straight line"
                : track.correctionId != null
                  ? " · edited"
                  : ` · shown as ${MODE_META[track.mode].label}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-muted hover:bg-surface-2 hover:text-text"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">How did you travel?</legend>
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
                    className={`flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 text-xs transition-colors ${
                      on ? "border-primary bg-primary/15 font-semibold text-text" : "border-border text-muted hover:border-primary/50 hover:text-text"
                    }`}
                  >
                    <span className="text-lg leading-none" aria-hidden>
                      {meta.icon}
                    </span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {transit && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Lines, in order (optional)</h3>
              <p className="mb-2 text-xs text-muted">Add each line you rode, e.g. bus 159 then metro M1, and where you changed.</p>
              {legs.length > 0 && (
                <ol className="mb-3 space-y-1.5">
                  {legs.map((l, i) => {
                    const c = badgeColors(l.kind);
                    return (
                      <li key={i}>
                        <div className="flex items-center gap-2">
                          <span className="w-4 text-right text-xs tabular-nums text-muted">{i + 1}</span>
                          <span className="rounded-md px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: c.bg, color: c.fg }}>
                            {KIND_LABEL[l.kind]} {l.line}
                          </span>
                          <span className="flex-1" />
                          <button
                            type="button"
                            aria-label={`Move ${l.line} up`}
                            disabled={i === 0}
                            onClick={() => setLegs((ls) => ls.map((x, k) => (k === i - 1 ? ls[i] : k === i ? ls[i - 1] : x)))}
                            className="h-7 w-7 rounded-full text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${l.line}`}
                            onClick={() => setLegs((ls) => ls.filter((_, k) => k !== i))}
                            className="h-7 w-7 rounded-full text-muted hover:bg-surface-2 hover:text-text"
                          >
                            ×
                          </button>
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
                <input
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={legs.length ? "Add another line" : "Find a line, e.g. 159 or M1"}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none"
                />
              </label>
              {term && (
                <ul className="mt-1.5 max-h-48 overflow-y-auto rounded-xl border border-border">
                  {(found?.routes ?? []).length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted">{found ? "No lines found" : "Searching…"}</li>
                  ) : (
                    found!.routes.map((r) => {
                      const c = badgeColors(r.kind);
                      return (
                        <li key={`${r.kind}:${r.line}`}>
                          <button
                            type="button"
                            onClick={() => addLine(r)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                          >
                            <span className="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: c.bg, color: c.fg }}>
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
            <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm text-accent" role="alert">
              Couldn&apos;t save: {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {track.correctionId != null && (
            <button
              type="button"
              disabled={busy}
              onClick={undo}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text disabled:opacity-50"
            >
              {track.added ? "Remove trip" : "Undo fix"}
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-strong disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
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
      <label htmlFor={id} className="shrink-0 text-xs text-muted">
        Changed at
      </label>
      <input
        id={id}
        list={`${id}-list`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Stop (optional)"
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none"
      />
      <datalist id={`${id}-list`}>
        {(data?.stops ?? []).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
