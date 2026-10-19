"use client";

import { useEffect, useRef, useState } from "react";
import type { ImportSummary } from "@/lib/google/import";

/** Below the proxy's 10 MB request body buffer, and small enough for smooth progress. */
const CHUNK = 4 * 1024 * 1024;

const button = "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60";
const nf = new Intl.NumberFormat("en-GB");

function day(ts: number, timeZone: string) {
  return new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone });
}

function mb(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB` : `${Math.ceil(bytes / 1024)} kB`;
}

/** "Added 48,213 points from 12 Mar 2019 – 18 Oct 2026; 9,120 skipped because Matka already had that time." */
export function importSentence(i: ImportSummary, timeZone: string): string {
  const added =
    i.inserted > 0 && i.from != null && i.to != null
      ? `Added ${nf.format(i.inserted)} ${i.inserted === 1 ? "point" : "points"} from ${day(i.from, timeZone)} – ${day(i.to, timeZone)}`
      : "No new points added";
  const parts = [added];
  if (i.covered > 0) parts.push(`${nf.format(i.covered)} skipped because Matka already had that time`);
  if (i.duplicate > 0) parts.push(`${nf.format(i.duplicate)} duplicates left out`);
  return `${parts.join("; ")}.`;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; sent: number; total: number }
  | { kind: "processing"; progress: number; inserted: number }
  | { kind: "error"; message: string };

export function GoogleImport({ initial, timeZone }: { initial: ImportSummary[]; timeZone: string }) {
  const [imports, setImports] = useState(initial);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [removed, setRemoved] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = phase.kind === "uploading" || phase.kind === "processing";

  // An import started earlier (another tab, a reload) is still going: follow it.
  const runningId = imports.find((i) => i.status === "processing")?.id;
  useEffect(() => {
    if (!runningId || busy) return;
    void follow(runningId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningId]);

  async function refresh() {
    const r = await json<{ imports: ImportSummary[] }>(await fetch("/api/import/google", { cache: "no-store" }));
    setImports(r.imports);
  }

  async function follow(id: string) {
    for (;;) {
      const s = await json<ImportSummary>(await fetch(`/api/import/google/${id}`, { cache: "no-store" }));
      if (s.status !== "processing") break;
      setPhase({ kind: "processing", progress: s.progress, inserted: s.inserted });
      await new Promise((r) => setTimeout(r, 1000));
    }
    setPhase({ kind: "idle" });
    await refresh();
  }

  async function upload(files: File[]) {
    setRemoved(null);
    const total = files.reduce((s, f) => s + f.size, 0);
    try {
      const { id } = await json<{ id: string }>(
        await fetch("/api/import/google", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ files: files.map((f) => ({ name: f.name, size: f.size })) }),
        }),
      );
      let sent = 0;
      setPhase({ kind: "uploading", sent, total });
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        for (let off = 0; off < f.size; off += CHUNK) {
          const part = f.slice(off, Math.min(f.size, off + CHUNK));
          let tries = 0;
          for (;;) {
            try {
              await json(
                await fetch(`/api/import/google/${id}?file=${i}&offset=${off}`, {
                  method: "PUT",
                  headers: { "content-type": "application/octet-stream" },
                  body: part,
                }),
              );
              break;
            } catch (err) {
              if (++tries >= 3) throw err;
              await new Promise((r) => setTimeout(r, 1000 * tries));
            }
          }
          sent += part.size;
          setPhase({ kind: "uploading", sent, total });
        }
      }
      await json(await fetch(`/api/import/google/${id}`, { method: "POST" }));
      setPhase({ kind: "processing", progress: 0, inserted: 0 });
      await follow(id);
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  async function removeAll() {
    if (!confirm("Remove every point imported from Google? Your own recordings stay.")) return;
    setRemoving(true);
    try {
      const r = await json<{ removed: number }>(await fetch("/api/import/google", { method: "DELETE" }));
      setRemoved(`Removed ${nf.format(r.removed)} imported Google points. Visits and trips are updated shortly.`);
      setImports([]);
    } catch (err) {
      setRemoved(err instanceof Error ? err.message : String(err));
    } finally {
      setRemoving(false);
    }
  }

  const hasPoints = imports.some((i) => i.inserted > 0);

  return (
    <div className="flex flex-col gap-3" id="google-import">
      <p className="text-sm text-muted">
        Fill the gaps in your history from Google Maps Timeline. Export it on your phone: Android
        Settings → Location → Location services → Timeline → Export Timeline data (gives
        Timeline.json), or in Google Maps on iPhone: Settings → Personal content → Export Timeline
        data. Older Google Takeout files work too: Records.json and the Semantic Location History
        month files (select several at once).
      </p>
      <p className="text-xs text-muted">
        Only times Matka has no recording of its own are filled; points within 10 minutes of a
        recorded one are skipped. The file is read on this server and deleted right after; nothing
        but the added points is kept.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${button} cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
          Import Google Timeline
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length) void upload(files);
            }}
          />
        </label>
        {hasPoints && !busy && (
          <button
            type="button"
            onClick={() => void removeAll()}
            disabled={removing}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:border-red-500 hover:text-red-500 disabled:opacity-60"
          >
            Remove imported Google points
          </button>
        )}
      </div>

      {phase.kind === "uploading" && (
        <Progress
          value={phase.sent / Math.max(phase.total, 1)}
          label={`Uploading… ${mb(phase.sent)} of ${mb(phase.total)}`}
        />
      )}
      {phase.kind === "processing" && (
        <Progress
          value={phase.progress}
          label={`Importing… ${Math.round(phase.progress * 100)}%${phase.inserted ? `, ${nf.format(phase.inserted)} points added so far` : ""}`}
        />
      )}
      {phase.kind === "error" && <p className="text-sm text-red-500">{phase.message}</p>}
      {removed && <p className="text-sm text-primary">{removed}</p>}

      {imports.filter((i) => i.status !== "processing").length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {imports
            .filter((i) => i.status !== "processing")
            .map((i) => (
              <li key={i.id} className="rounded-lg border border-border px-3 py-2">
                <p className={i.status === "failed" ? "text-red-500" : ""}>
                  {i.status === "failed" ? i.error ?? "Import failed." : importSentence(i, timeZone)}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {new Date(i.startedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone })}
                  {" · "}
                  {i.files.length === 1 ? i.files[0].name : `${i.files.length} files`} ({mb(i.bytes)})
                  {i.formats.length > 0 && ` · ${i.formats.join(", ")}`}
                  {i.status === "failed" && i.inserted > 0 && ` · ${nf.format(i.inserted)} points were added before it stopped`}
                </p>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
