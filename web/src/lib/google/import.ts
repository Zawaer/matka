import { createReadStream } from "node:fs";
import { appendFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { q, tx } from "../db";
import { insertIntoGaps } from "../gapFill";
import { JsonCollectionStream } from "./jsonStream";
import { COLLECTION_KEYS, Spans, fixesOf, spansOf, type GoogleFix } from "./timeline";

/**
 * Google Timeline upload and import (Settings → Import Google Timeline).
 *
 * The browser sends each file in chunks small enough for the proxy's body
 * buffer (CHUNK_MAX); they are appended to a private temp file. On finish the
 * files are read twice as streams (activity spans, then fixes), so memory
 * stays bounded whatever the size, and the temp files are deleted as soon as
 * the import ends, also when it fails. Nothing else of the file is kept: only
 * the fixes that fill gaps, and the counts in import_state.
 *
 * Gap-fill only (lib/gapFill.ts): a Google fix within 10 min of a fix Matka
 * recorded itself (device, Dawarich import) is skipped.
 *
 * The import runs in this server process; progress lives in import_state
 * (`google:<user>:<upload>`), so the page can poll it. Uploads are kept on
 * this replica's disk: with several replicas, route a user to one of them.
 */

export const CHUNK_MAX = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 ** 3;
const MAX_FILES = 500;
const BATCH = 5000;
/** A processing import not heard from for this long was cut off by a restart. */
const STALE_MS = 5 * 60_000;
/** Unfinished uploads (tab closed mid-upload) are deleted after this long without a chunk. */
const ABANDONED_MS = 3600_000;
const ROOT = path.join(os.tmpdir(), "matka-google-import");
/** points.source of everything a Google import adds (removable as a whole). */
export const GOOGLE_SOURCE = "google";
/** Existing points that don't count as "already recorded" for a Google fix. */
const NOT_RECORDED = [GOOGLE_SOURCE, "photo"];

export type ImportStatus = "uploading" | "processing" | "done" | "failed";

export type ImportDetail = {
  status: ImportStatus;
  files: { name: string; size: number }[];
  bytes: number;
  /** 0..1 while processing. */
  progress: number;
  parsed: number;
  inserted: number;
  covered: number;
  duplicate: number;
  /** Epoch seconds of the earliest/latest point added. */
  from: number | null;
  to: number | null;
  formats: string[];
  error?: string;
};

export type ImportSummary = ImportDetail & { id: string; startedAt: string; updatedAt: string };

const sourceKey = (userId: string, id: string) => `google:${userId}:${id}`;
const dirOf = (id: string) => path.join(ROOT, id);
const fileOf = (id: string, i: number) => path.join(dirOf(id), `${i}.json`);
const validId = (id: string) => /^[0-9a-f]{24}$/.test(id);

const FORMAT_NAMES: Record<string, string> = {
  semanticSegments: "Timeline (Android)",
  rawSignals: "Timeline (Android)",
  "": "Timeline (iPhone)",
  locations: "Records.json",
  timelineObjects: "Semantic Location History",
};

/** Users with an import running in this process. */
const running = new Set<string>();

async function setDetail(userId: string, id: string, d: ImportDetail, finished = false) {
  await q(
    `UPDATE import_state SET detail = $2, seen = $3, inserted = $4, updated_at = now(),
            finished_at = CASE WHEN $5 THEN now() ELSE finished_at END, note = $6
     WHERE source = $1`,
    [sourceKey(userId, id), d, d.parsed, d.inserted, finished, d.error ?? null],
  );
}

async function getRow(userId: string, id: string) {
  if (!validId(id)) return null;
  const [r] = await q<{ detail: ImportDetail; started_at: Date; updated_at: Date }>(
    `SELECT detail, started_at, updated_at FROM import_state WHERE source = $1 AND user_id = $2`,
    [sourceKey(userId, id), userId],
  );
  return r ?? null;
}

function summarize(id: string, r: { detail: ImportDetail; started_at: Date; updated_at: Date }): ImportSummary {
  const d = { ...r.detail };
  if (d.status === "processing" && Date.now() - r.updated_at.getTime() > STALE_MS && !running.has(id)) {
    d.status = "failed";
    d.error = "The import was interrupted (server restart). Points added so far were kept; upload the file again to finish.";
  }
  return { ...d, id, startedAt: r.started_at.toISOString(), updatedAt: r.updated_at.toISOString() };
}

/** Deletes temp files of uploads nobody finished, and their rows. Run by the worker too. */
export async function sweepAbandonedUploads(): Promise<void> {
  const names = await readdir(ROOT).catch(() => [] as string[]);
  for (const n of names) {
    if (running.has(n)) continue;
    // Last write: the newest file (appending doesn't touch the directory's mtime).
    const dir = path.join(ROOT, n);
    const files = await readdir(dir).catch(() => [] as string[]);
    const times = await Promise.all([dir, ...files.map((f) => path.join(dir, f))].map((f) => stat(f).then((s) => s.mtimeMs, () => 0)));
    if (Date.now() - Math.max(...times) > ABANDONED_MS) await rm(dir, { recursive: true, force: true });
  }
  await q(
    `DELETE FROM import_state WHERE source LIKE 'google:%' AND detail->>'status' = 'uploading'
       AND updated_at < now() - make_interval(secs => $1)`,
    [ABANDONED_MS / 1000],
  );
}

export async function startUpload(
  userId: string,
  files: { name: string; size: number }[],
): Promise<{ id: string } | { error: string }> {
  if (!Array.isArray(files) || files.length === 0) return { error: "No files." };
  if (files.length > MAX_FILES) return { error: `At most ${MAX_FILES} files at once.` };
  const clean = files.map((f) => ({ name: String(f?.name ?? "file").slice(0, 200), size: Number(f?.size) }));
  if (clean.some((f) => !Number.isSafeInteger(f.size) || f.size <= 0)) return { error: "Empty or invalid file." };
  const bytes = clean.reduce((s, f) => s + f.size, 0);
  if (bytes > MAX_TOTAL_BYTES) return { error: "That is more than 4 GB; upload the files in parts." };
  await sweepAbandonedUploads();
  const busy = (await listImports(userId)).some((i) => i.status === "processing");
  if (busy || running.has(userId)) return { error: "An import is already running; wait for it to finish." };

  const id = randomBytes(12).toString("hex");
  await mkdir(dirOf(id), { recursive: true, mode: 0o700 });
  const detail: ImportDetail = {
    status: "uploading",
    files: clean,
    bytes,
    progress: 0,
    parsed: 0,
    inserted: 0,
    covered: 0,
    duplicate: 0,
    from: null,
    to: null,
    formats: [],
  };
  await q(`INSERT INTO import_state (source, user_id, total, detail) VALUES ($1, $2, $3, $4)`, [
    sourceKey(userId, id),
    userId,
    bytes,
    detail,
  ]);
  return { id };
}

/**
 * Appends one chunk at `offset` of file `index`. A chunk at an offset already
 * written (a retry) is acknowledged without writing; a gap is refused.
 */
export async function appendChunk(
  userId: string,
  id: string,
  index: number,
  offset: number,
  data: Uint8Array,
): Promise<{ ok: true; size: number } | { ok: false; status: number; error: string; size?: number }> {
  const row = await getRow(userId, id);
  if (!row || row.detail.status !== "uploading") return { ok: false, status: 404, error: "No such upload." };
  const f = row.detail.files[index];
  if (!f || !Number.isInteger(index)) return { ok: false, status: 400, error: "No such file." };
  if (data.byteLength > CHUNK_MAX) return { ok: false, status: 413, error: "Chunk too large." };
  const file = fileOf(id, index);
  const size = (await stat(file).catch(() => null))?.size ?? 0;
  if (offset + data.byteLength <= size) return { ok: true, size };
  if (offset !== size) return { ok: false, status: 409, error: "Out of order.", size };
  if (size + data.byteLength > f.size) return { ok: false, status: 400, error: "More data than announced." };
  await appendFile(file, data, { mode: 0o600 });
  await q(`UPDATE import_state SET updated_at = now() WHERE source = $1`, [sourceKey(userId, id)]);
  return { ok: true, size: size + data.byteLength };
}

/** Checks every file arrived whole, then starts the import in the background. */
export async function finishUpload(userId: string, id: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const row = await getRow(userId, id);
  if (!row || row.detail.status !== "uploading") return { ok: false, status: 404, error: "No such upload." };
  for (let i = 0; i < row.detail.files.length; i++) {
    const size = (await stat(fileOf(id, i)).catch(() => null))?.size ?? 0;
    if (size !== row.detail.files[i].size) return { ok: false, status: 400, error: `File ${i + 1} is incomplete.` };
  }
  if (running.has(userId)) return { ok: false, status: 409, error: "An import is already running." };
  const detail: ImportDetail = { ...row.detail, status: "processing" };
  await setDetail(userId, id, detail);
  running.add(userId);
  running.add(id);
  void runImport(userId, id, detail).finally(() => {
    running.delete(userId);
    running.delete(id);
  });
  return { ok: true };
}

async function* records(file: string, onBytes: (n: number) => void) {
  const parser = new JsonCollectionStream(COLLECTION_KEYS);
  const stream = createReadStream(file, { encoding: "utf8", highWaterMark: 1024 * 1024 });
  for await (const chunk of stream as AsyncIterable<string>) {
    const els = parser.feed(chunk);
    onBytes(stream.bytesRead);
    yield els;
  }
}

async function runImport(userId: string, id: string, d: ImportDetail): Promise<void> {
  const t0 = Date.now();
  let lastSave = Date.now();
  const save = async (force = false) => {
    if (!force && Date.now() - lastSave < 2000) return;
    lastSave = Date.now();
    await setDetail(userId, id, d);
  };
  const formats = new Set<string>();
  let doneBytes = 0;
  try {
    for (let i = 0; i < d.files.length; i++) {
      const file = fileOf(id, i);
      const size = d.files[i].size;
      // Pass 1: which activity each stretch of time was (visits, moves).
      const spans = new Spans();
      for await (const els of records(file, (n) => (d.progress = (doneBytes + n / 2) / d.bytes))) {
        for (const e of els) {
          formats.add(FORMAT_NAMES[e.key] ?? e.key);
          spansOf(e.key, e.value, spans);
        }
        await save();
      }
      // Pass 2: the fixes, a batch at a time.
      let batch: GoogleFix[] = [];
      const flush = async () => {
        if (!batch.length) return;
        const fixes = batch;
        batch = [];
        const r = await tx((c) => insertIntoGaps(c, userId, GOOGLE_SOURCE, NOT_RECORDED, fixes));
        d.parsed += fixes.length;
        d.inserted += r.inserted;
        d.covered += r.covered;
        d.duplicate += r.duplicate;
        if (r.minTs != null) d.from = d.from == null ? r.minTs : Math.min(d.from, r.minTs);
        if (r.maxTs != null) d.to = d.to == null ? r.maxTs : Math.max(d.to, r.maxTs);
        await save();
      };
      for await (const els of records(file, (n) => (d.progress = (doneBytes + size / 2 + n / 2) / d.bytes))) {
        for (const e of els) {
          for (const f of fixesOf(e.key, e.value, spans)) batch.push(f);
        }
        if (batch.length >= BATCH) await flush();
      }
      await flush();
      doneBytes += size;
      // Done with this file: it goes right away.
      await rm(file, { force: true });
    }
    d.formats = [...formats].filter(Boolean);
    if (d.formats.length === 0) {
      d.status = "failed";
      d.error = "No Google location history found in that file. Pick Timeline.json (or location-history.json), Records.json or the Semantic Location History files.";
    } else {
      d.status = "done";
    }
    d.progress = 1;
    await setDetail(userId, id, d, true);
    console.log(
      `[google] user ${userId}: import ${id} ${d.status} in ${Math.round((Date.now() - t0) / 1000)} s: ` +
        `${d.parsed} points read, ${d.inserted} added, ${d.covered} skipped (already recorded), ${d.duplicate} duplicates`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    d.status = "failed";
    d.formats = [...formats].filter(Boolean);
    d.error = err instanceof SyntaxError ? `That file isn't valid JSON (${msg.slice(0, 120)}).` : `Import failed: ${msg.slice(0, 200)}`;
    console.error(`[google] user ${userId}: import ${id} failed:`, msg);
    await setDetail(userId, id, d, true).catch(() => {});
  } finally {
    await rm(dirOf(id), { recursive: true, force: true }).catch(() => {});
  }
}

export async function uploadStatus(userId: string, id: string): Promise<ImportSummary | null> {
  const r = await getRow(userId, id);
  return r ? summarize(id, r) : null;
}

/** This user's Google imports, newest first (unfinished uploads left out). */
export async function listImports(userId: string): Promise<ImportSummary[]> {
  const rows = await q<{ source: string; detail: ImportDetail; started_at: Date; updated_at: Date }>(
    `SELECT source, detail, started_at, updated_at FROM import_state
     WHERE user_id = $1 AND source LIKE 'google:%' AND detail IS NOT NULL AND detail->>'status' <> 'uploading'
     ORDER BY started_at DESC LIMIT 20`,
    [userId],
  );
  return rows.map((r) => summarize(r.source.split(":")[2], r));
}

/** Removes every point a Google import added, and the import records. */
export async function removeGooglePoints(userId: string): Promise<number> {
  if (running.has(userId)) throw new Error("An import is running; wait for it to finish.");
  return tx(async (c) => {
    await c.query(`SELECT pg_advisory_xact_lock_shared(hashtext('matka_ingest'), $1::int)`, [userId]);
    const { rows } = await c.query<{ n: string; min: Date | null }>(
      `WITH d AS (DELETE FROM points WHERE user_id = $1 AND source = $2 RETURNING ts)
       SELECT count(*) n, min(ts) min FROM d`,
      [userId, GOOGLE_SOURCE],
    );
    if (rows[0].min) {
      await c.query(
        `INSERT INTO processing_state (user_id, dirty_from) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE
           SET dirty_from = LEAST(COALESCE(processing_state.dirty_from, EXCLUDED.dirty_from), EXCLUDED.dirty_from)`,
        [userId, rows[0].min],
      );
    }
    await c.query(`DELETE FROM import_state WHERE user_id = $1 AND source LIKE 'google:%'`, [userId]);
    return Number(rows[0].n);
  });
}
