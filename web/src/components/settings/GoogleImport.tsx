"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Trash2, Upload } from "lucide-react";
import type { ImportSummary } from "@/lib/google/import";
import { formatDateCompact, formatTime } from "@/lib/format";
import { Button, Callout, buttonClass, cx } from "@/components/ui";
import { More } from "./Forms";

/** Below the proxy's 10 MB request body buffer, and small enough for smooth progress. */
const CHUNK = 4 * 1024 * 1024;

const nf = new Intl.NumberFormat("en-GB");

function day(ts: number, timeZone: string) {
  return formatDateCompact(new Date(ts * 1000), timeZone);
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

  const done = imports.filter((i) => i.status !== "processing");

  return (
    <div className="flex flex-col gap-4" id="google-import">
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-secondary marker:text-muted">
        <li>
          On Android, open Settings → Location → Location services → Timeline → Export Timeline data. On iPhone, open
          Google Maps → Settings → Personal content → Export Timeline data.
        </li>
        <li>Save the Timeline.json file it gives you (older Takeout files work too: Records.json and the monthly files).</li>
        <li>Choose the file here. Only times Matka didn&apos;t record itself are filled in.</li>
      </ol>
      <More summary="What happens to the file">
        Points within 10 minutes of one Matka recorded are skipped. The file is read on this server and deleted right
        after; only the added points are kept.
      </More>
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={cx(
            buttonClass({ variant: "secondary" }),
            "cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
            busy && "pointer-events-none opacity-50",
          )}
        >
          <Upload size={16} strokeWidth={1.75} aria-hidden />
          Choose Timeline files
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
          <Button variant="danger" icon={Trash2} onClick={() => void removeAll()} disabled={removing}>
            Remove imported points
          </Button>
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
      {phase.kind === "error" && (
        <Callout tone="danger" role="alert" title="Import failed">
          {phase.message}
        </Callout>
      )}
      {removed && (
        <Callout tone="success" role="status">
          {removed}
        </Callout>
      )}

      {done.length > 0 && (
        <div>
          <h3 className="mb-2 text-meta font-medium text-muted">Earlier imports</h3>
          <ul className="divide-y divide-border overflow-hidden rounded-control border border-border">
            {done.map((i) => {
              const failed = i.status === "failed";
              const I = failed ? CircleAlert : CircleCheck;
              return (
                <li key={i.id} className="flex gap-2.5 px-3 py-2.5">
                  <I
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden
                    className={cx("mt-0.5 shrink-0", failed ? "text-danger" : "text-success")}
                  />
                  <div className="min-w-0">
                    <p className={cx("text-sm", failed ? "text-danger" : "text-text")}>
                      {failed ? i.error ?? "Import failed." : importSentence(i, timeZone)}
                    </p>
                    <p className="mt-0.5 text-meta text-muted">
                      {formatDateCompact(i.startedAt, timeZone)} {formatTime(i.startedAt, timeZone)}
                      {" · "}
                      {i.files.length === 1 ? i.files[0].name : `${i.files.length} files`} ({mb(i.bytes)})
                      {i.formats.length > 0 && ` · ${i.formats.join(", ")}`}
                      {failed && i.inserted > 0 && ` · ${nf.format(i.inserted)} points were added before it stopped`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, value) * 100);
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-meta tabular-nums text-muted">{label}</p>
    </div>
  );
}
