import { toWire, type QueuedPoint } from "../points";
import {
  backoffMs,
  classifyStatus,
  isIngestReceipt,
  runUpload,
  shouldUploadFromTask,
  splitInHalf,
  takeBatch,
  TRIGGER_INTERVAL_MS,
  TRIGGER_POINTS,
  type PostResult,
} from "../upload-logic";

const pt = (id: number): QueuedPoint => ({
  id,
  ts: 1760781600000 + id * 1000,
  lat: 60 + id / 1e5,
  lon: 24,
  accuracy: 10,
  altitude: null,
  speed: null,
  battery: 80,
  activity: null,
});

const receipt = (n: number) => ({ received: n, inserted: n, duplicates: 0, rejected: 0 });

describe("classifyStatus", () => {
  it.each([
    [200, "ok"],
    [400, "drop"],
    [401, "unauthorized"],
    [413, "split"],
    [500, "retry"],
    [502, "retry"],
    [503, "retry"],
    [null, "retry"],
    [404, "retry"],
    [403, "retry"],
    [429, "retry"],
    [204, "retry"],
    [302, "retry"],
  ] as const)("%p → %p", (s, o) => expect(classifyStatus(s)).toBe(o));
});

describe("isIngestReceipt", () => {
  it("requires the four counters", () => {
    expect(isIngestReceipt(receipt(3))).toBe(true);
    expect(isIngestReceipt({ received: 3 })).toBe(false);
    expect(isIngestReceipt("<html>")).toBe(false);
    expect(isIngestReceipt(null)).toBe(false);
  });
});

describe("takeBatch / splitInHalf", () => {
  const rows = Array.from({ length: 1200 }, (_, i) => pt(i + 1));
  it("caps by point count", () => {
    expect(takeBatch(rows, 500).length).toBe(500);
    expect(takeBatch(rows.slice(0, 10), 500).length).toBe(10);
  });
  it("caps by encoded size, but always takes at least one", () => {
    const b = takeBatch(rows, 500, 2000);
    expect(b.length).toBeGreaterThan(1);
    expect(b.length).toBeLessThan(500);
    expect(JSON.stringify({ points: b.map(toWire) }).length).toBeLessThanOrEqual(2000);
    expect(takeBatch(rows, 500, 1).length).toBe(1);
  });
  it("500 realistic points are far below 1 MB", () => {
    expect(JSON.stringify({ points: takeBatch(rows).map(toWire) }).length).toBeLessThan(100_000);
  });
  it("splits odd lengths", () => {
    expect(splitInHalf([1, 2, 3])).toEqual([[1, 2], [3]]);
  });
});

describe("backoffMs", () => {
  it("doubles from 30 s and caps at 1 h", () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(50)).toBe(3_600_000);
  });
});

describe("shouldUploadFromTask", () => {
  const now = 1_000_000_000;
  const base = { queued: 5, now, lastAttemptAt: now - 1000, nextRetryAt: null, paired: true, authLost: false };
  it("waits for enough points or enough time", () => {
    expect(shouldUploadFromTask(base)).toBe(false);
    expect(shouldUploadFromTask({ ...base, queued: TRIGGER_POINTS })).toBe(true);
    expect(shouldUploadFromTask({ ...base, lastAttemptAt: now - TRIGGER_INTERVAL_MS })).toBe(true);
    expect(shouldUploadFromTask({ ...base, lastAttemptAt: null })).toBe(true);
  });
  it("respects backoff, pairing and auth state", () => {
    const due = { ...base, queued: 1000 };
    expect(shouldUploadFromTask({ ...due, nextRetryAt: now + 1 })).toBe(false);
    expect(shouldUploadFromTask({ ...due, nextRetryAt: now })).toBe(true);
    expect(shouldUploadFromTask({ ...due, paired: false })).toBe(false);
    expect(shouldUploadFromTask({ ...due, authLost: true })).toBe(false);
    expect(shouldUploadFromTask({ ...due, queued: 0, lastAttemptAt: null })).toBe(false);
  });
});

type Wire = { ts: number };

/** In-memory queue + scripted server for runUpload. */
function harness(n: number, respond: (pts: Wire[], call: number) => PostResult) {
  let queue = Array.from({ length: n }, (_, i) => pt(i + 1));
  const calls: number[] = [];
  const deps = {
    peek: async (limit: number) => queue.slice(0, limit),
    remove: async (ids: number[]) => {
      const s = new Set(ids);
      queue = queue.filter((p) => !s.has(p.id!));
    },
    post: async (body: string) => {
      const pts = JSON.parse(body).points as Wire[];
      calls.push(pts.length);
      return respond(pts, calls.length);
    },
  };
  return { deps, calls, left: () => queue.length, ids: () => queue.map((p) => p.id) };
}

const ok = (pts: Wire[]): PostResult => ({ status: 200, body: receipt(pts.length) });

describe("runUpload", () => {
  it("200: deletes each batch and drains the queue in ≤500-point batches", async () => {
    const h = harness(1234, ok);
    const r = await runUpload(h.deps, { maxBatches: 10 });
    expect(r).toMatchObject({ result: "done", sent: 1234, dropped: 0 });
    expect(h.calls).toEqual([500, 500, 234]);
    expect(h.left()).toBe(0);
  });

  it("stops after maxBatches", async () => {
    const h = harness(1234, ok);
    const r = await runUpload(h.deps, { maxBatches: 1 });
    expect(r).toMatchObject({ result: "done", sent: 500 });
    expect(h.left()).toBe(734);
  });

  it("sends wire points in epoch seconds", async () => {
    let first: Wire | undefined;
    const h = harness(1, (pts) => {
      first = pts[0];
      return ok(pts);
    });
    await runUpload(h.deps, { maxBatches: 1 });
    expect(first?.ts).toBe(1760781601);
  });

  it("200 without a receipt (e.g. a login page) keeps the batch", async () => {
    const h = harness(10, () => ({ status: 200, body: "<html>login</html>" }));
    const r = await runUpload(h.deps, { maxBatches: 5 });
    expect(r.result).toBe("retry");
    expect(h.left()).toBe(10);
  });

  it("400: drops the batch and carries on", async () => {
    const h = harness(700, (pts, call) => (call === 1 ? { status: 400, body: { error: "bad" } } : ok(pts)));
    const r = await runUpload(h.deps, { maxBatches: 5 });
    expect(r).toMatchObject({ result: "done", dropped: 500, sent: 200 });
    expect(r.error).toContain("400");
    expect(h.left()).toBe(0);
  });

  it("401: stops and keeps the whole queue", async () => {
    const h = harness(700, () => ({ status: 401, body: { error: "unauthorized" } }));
    const r = await runUpload(h.deps, { maxBatches: 5 });
    expect(r.result).toBe("unauthorized");
    expect(h.calls).toEqual([500]);
    expect(h.left()).toBe(700);
  });

  it("413: splits and retries until batches fit", async () => {
    const h = harness(500, (pts) => (pts.length > 120 ? { status: 413, body: { error: "too large" } } : ok(pts)));
    const r = await runUpload(h.deps, { maxBatches: 5 });
    expect(r).toMatchObject({ result: "done", sent: 500, dropped: 0 });
    expect(h.calls.slice(0, 3)).toEqual([500, 250, 125]);
    expect(h.left()).toBe(0);
  });

  it("413 on a single point drops just that point", async () => {
    // The first point is "too large" on its own; everything else fits alone.
    const h = harness(3, (pts) =>
      pts.length > 1 || pts[0].ts === 1760781601 ? { status: 413, body: {} } : ok(pts),
    );
    const r = await runUpload(h.deps, { maxBatches: 5 });
    expect(r).toMatchObject({ result: "done", sent: 2, dropped: 1 });
    expect(h.left()).toBe(0);
  });

  it("5xx: keeps the batch and stops for backoff", async () => {
    const h = harness(700, () => ({ status: 503, body: null }));
    const r = await runUpload(h.deps, { maxBatches: 5 });
    expect(r.result).toBe("retry");
    expect(r.error).toContain("503");
    expect(h.left()).toBe(700);
  });

  it("network error: keeps everything not yet acknowledged", async () => {
    const h = harness(700, (pts, call) => (call === 1 ? ok(pts) : { status: null, body: null, error: "timeout" }));
    const r = await runUpload(h.deps, { maxBatches: 5 });
    expect(r).toMatchObject({ result: "retry", sent: 500 });
    expect(r.error).toContain("timeout");
    expect(h.ids()[0]).toBe(501);
  });

  it("5xx in the middle of a 413 split keeps the unsent half", async () => {
    const h = harness(500, (pts, call) =>
      call === 1 ? { status: 413, body: {} } : call === 2 ? ok(pts) : { status: 500, body: {} },
    );
    const r = await runUpload(h.deps, { maxBatches: 5 });
    expect(r).toMatchObject({ result: "retry", sent: 250 });
    expect(h.left()).toBe(250);
  });

  it("empty queue does nothing", async () => {
    const h = harness(0, ok);
    const r = await runUpload(h.deps, { maxBatches: 5 });
    expect(r).toMatchObject({ result: "done", sent: 0, batches: 0 });
    expect(h.calls).toEqual([]);
  });
});
