#!/usr/bin/env node
// DEV ONLY. Measures how fast the phone app's day map (/embed/day) appears,
// as the app loads it: an embed ticket from POST /api/device/embed-ticket,
// then /embed/start?ticket=…&to=day&date=…&theme=… in a fresh page. Emulates
// a mid-range Android: 4x CPU slowdown and DevTools' "Fast 4G" (165 ms
// request latency, 9 Mbit/s down, 1.5 Mbit/s up, both × 0.9), a 412×300 view
// at 2.625x. Cold = empty HTTP cache; repeat = the same browser context
// (HTTP cache kept) opening the page again with a new ticket, like the app
// on its next start; third = once more (V8's code cache is warm by then).
// The worker row's duration includes the worker starting up. Results: docs/redesign/daymap-perf.md.
//
// Needs the standalone server from scripts/screens.mjs's recipe on
// 127.0.0.1:3200 (APP_URL=http://localhost:3200) and a paired device whose
// token is passed with --token (insert one into `devices` with
// token_hash = sha256(token)). Milestones come from the page's
// performance marks (DayMap.tsx: matka:first-tile, matka:route-drawn, …).
//
//   node scripts/daymap-perf.mjs --token mtk_… --date 2026-10-27 [--runs 3] [--json out.json]

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const { values: o } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3200" },
    token: { type: "string" },
    date: { type: "string", default: "2026-10-27" },
    scheme: { type: "string", default: "light" },
    runs: { type: "string", default: "3" },
    json: { type: "string" },
    "no-throttle": { type: "boolean", default: false },
  },
});
if (!o.token) throw new Error("--token mtk_… is required");
const CHROME =
  process.env.CHROME_PATH ?? "/opt/playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell";
const NET = { offline: false, latency: 165, downloadThroughput: (9e6 / 8) * 0.9, uploadThroughput: (1.5e6 / 8) * 0.9 };

async function throttle(page) {
  const cdp = await page.context().newCDPSession(page);
  if (!o["no-throttle"]) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", NET);
  } else await cdp.send("Network.enable");
  return cdp;
}

/** POST for a ticket from a page already on the server (the app's connection is warm too). */
async function ticket(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${o.base}/api/health`);
  await throttle(page);
  const r = await page.evaluate(async (token) => {
    const t0 = performance.timeOrigin + performance.now();
    const res = await fetch("/api/device/embed-ticket", { method: "POST", headers: { authorization: `Bearer ${token}` } });
    const body = await res.json();
    return { t0, ms: performance.timeOrigin + performance.now() - t0, url: body.url };
  }, o.token);
  await page.close();
  return r;
}

function kind(url) {
  if (/embed-ticket/.test(url)) return "ticket";
  if (/\/embed\/start/.test(url)) return "redirect";
  if (/\/embed\/day/.test(url)) return "html";
  if (/maplibre-gl-worker/.test(url)) return "worker";
  if (/\/_next\/static\/.*\.js/.test(url)) return "js";
  if (/\/_next\/static\/.*\.css/.test(url)) return "css";
  if (/\/_next\/static\/media|\.woff2/.test(url)) return "font";
  if (/\/api\/timeline\/photos/.test(url)) return "photos";
  if (/\/api\/timeline/.test(url)) return "timeline";
  if (/\/api\/tracks/.test(url)) return "tracks";
  if (/\/api\/map\/style|openfreemap\.org\/styles/.test(url)) return "style";
  if (/sprite/.test(url)) return "sprite";
  if (/fonts?\/|glyphs|\.pbf$/.test(url) && !/tiles\/|planet/.test(url)) return "glyphs";
  if (/openfreemap\.org\/(planet|tiles)|\.pbf/.test(url)) return url.includes("/planet") && !/\/\d+\/\d+\/\d+/.test(url) ? "tilejson" : "tile";
  return "other";
}

async function open(ctx, label) {
  const tk = await ticket(ctx);
  const page = await ctx.newPage();
  // Stand in for the app: what the page tells it becomes a mark too
  // ("matka:post:day", "matka:post:drawn": when the app would show the map).
  await page.addInitScript(() => {
    window.ReactNativeWebView = {
      postMessage(d) {
        try {
          const m = JSON.parse(d);
          if (m.type === "matka-day" && !performance.getEntriesByName(`matka:post:${m.event}`).length) performance.mark(`matka:post:${m.event}`);
        } catch {
          // not ours
        }
      },
    };
  });
  const cdp = await throttle(page);
  const reqs = new Map();
  cdp.on("Network.requestWillBeSent", (e) => {
    reqs.set(e.requestId, { url: e.request.url, start: e.timestamp, wall: e.wallTime * 1000, cached: false, size: 0 });
  });
  cdp.on("Network.requestServedFromCache", (e) => {
    const r = reqs.get(e.requestId);
    if (r) r.cached = true;
  });
  cdp.on("Network.responseReceived", (e) => {
    const r = reqs.get(e.requestId);
    if (r) {
      r.status = e.response.status;
      if (e.response.fromDiskCache || e.response.fromPrefetchCache) r.cached = true;
      r.cc = e.response.headers["cache-control"] ?? e.response.headers["Cache-Control"];
    }
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = reqs.get(e.requestId);
    if (r) {
      r.end = e.timestamp;
      r.size = e.encodedDataLength;
    }
  });
  // Requests made from MapLibre's worker (tiles) don't reach the page's CDP
  // session; Playwright sees them. Timed on the wall clock; a response in
  // under 30 ms despite the 165 ms latency came from the cache.
  const wreqs = [];
  const onFinished = async (req) => {
    const t = req.timing();
    let size = 0;
    try {
      size = (await req.sizes()).responseBodySize;
    } catch {
      // gone
    }
    wreqs.push({ url: req.url(), wallStart: t.startTime, wallEnd: t.startTime + t.responseEnd, size });
  };
  page.on("requestfinished", onFinished);

  const url = `${tk.url}&to=day&date=${o.date}&theme=${o.scheme}`;
  await page.goto(url, { waitUntil: "commit" });
  const marks = await page
    .waitForFunction(
      () => {
        const g = (n) => performance.getEntriesByName(`matka:${n}`)[0]?.startTime;
        if (g("route-drawn") == null || g("first-tile") == null || g("idle") == null) return null;
        const names = ["map-created", "style-loaded", "first-tile", "route-drawn", "idle", "post:day", "post:drawn"];
        return { origin: performance.timeOrigin, ...Object.fromEntries(names.map((n) => [n, g(n)])) };
      },
      null,
      { timeout: 60_000, polling: 100 },
    )
    .then((h) => h.jsonValue())
    .catch(() => null);
  await page.waitForTimeout(300);
  const list = [...reqs.values()];
  const t0 = tk.t0;
  const rows = [
    { kind: "ticket", url: "/api/device/embed-ticket", start: 0, end: tk.ms, size: 0, cached: false },
    ...list.map((r) => ({
      kind: kind(r.url),
      url: r.url,
      // CDP's clock is monotonic seconds; each request's wallTime anchors it.
      start: r.wall - t0,
      end: r.end != null ? r.wall + (r.end - r.start) * 1000 - t0 : null,
      size: r.size,
      cached: r.cached,
      cc: r.cc,
    })),
  ];
  const byUrl = new Map(rows.map((r) => [r.url, r]));
  for (const w of wreqs) {
    const r = byUrl.get(w.url);
    if (r && r.end == null) {
      // The worker script itself: CDP saw it start, not finish.
      Object.assign(r, { end: w.wallEnd - t0, size: Math.max(0, w.size) });
      continue;
    }
    if (!r)
      rows.push({
        kind: kind(w.url),
        url: w.url,
        start: w.wallStart - t0,
        end: w.wallEnd - t0,
        size: Math.max(0, w.size),
        cached: w.wallEnd - w.wallStart < (o["no-throttle"] ? 5 : 30),
      });
  }
  rows.sort((a, b) => a.start - b.start);
  const ms = marks ? Object.fromEntries(Object.entries(marks).filter(([k]) => k !== "origin").map(([k, v]) => [k, marks.origin + v - t0])) : null;
  await page.close();
  return { label, marks: ms, rows };
}

const fmt = (n) => (n == null ? "—" : `${Math.round(n)}`);
const kb = (n) => (n ? `${(n / 1024).toFixed(1)}` : "0");

function summary(run) {
  const by = new Map();
  for (const r of run.rows) {
    const g = by.get(r.kind) ?? { n: 0, cached: 0, bytes: 0, start: Infinity, end: 0 };
    g.n++;
    if (r.cached) g.cached++;
    g.bytes += r.size || 0;
    g.start = Math.min(g.start, r.start);
    g.end = Math.max(g.end, r.end ?? r.start);
    by.set(r.kind, g);
  }
  return by;
}

const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const mkctx = () =>
  browser.newContext({ viewport: { width: 412, height: 300 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: "en-GB", timezoneId: "Europe/Helsinki" });
const runs = Number(o.runs);
const out = { cold: [], repeat: [], third: [] };
for (let i = 0; i < runs; i++) {
  const ctx = await mkctx();
  out.cold.push(await open(ctx, "cold"));
  out.repeat.push(await open(ctx, "repeat"));
  // By the third load V8 has the scripts' compiled code cached too, as on a phone used daily.
  out.third.push(await open(ctx, "third"));
  await ctx.close();
}
await browser.close();

for (const label of ["cold", "repeat", "third"]) {
  const rs = out[label];
  const med = (k) => {
    const v = rs.map((r) => r.marks?.[k]).filter((x) => x != null).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };
  console.log(`\n## ${label} (${rs.length} runs; ms from the ticket request; median)`);
  console.log(
    `map created ${fmt(med("map-created"))} · style loaded ${fmt(med("style-loaded"))} · first tile painted ${fmt(med("first-tile"))} · route drawn ${fmt(med("route-drawn"))} · idle ${fmt(med("idle"))} · "day" posted ${fmt(med("post:day"))} · "drawn" posted ${fmt(med("post:drawn"))}`,
  );
  console.log(`per run: ${rs.map((r) => `${fmt(r.marks?.["first-tile"])}/${fmt(r.marks?.["route-drawn"])}`).join(", ")} (first tile/route)`);
  // The median run's waterfall by kind.
  const sorted = [...rs].sort((a, b) => (a.marks?.["route-drawn"] ?? 1e9) - (b.marks?.["route-drawn"] ?? 1e9));
  const run = sorted[Math.floor(sorted.length / 2)];
  console.log("| what | requests (cached) | KB transferred | start | end |");
  console.log("|---|---|---|---|---|");
  for (const [k, g] of summary(run)) console.log(`| ${k} | ${g.n} (${g.cached}) | ${kb(g.bytes)} | ${fmt(g.start)} | ${fmt(g.end)} |`);
  const zooms = new Map();
  for (const r of run.rows.filter((r) => r.kind === "tile")) {
    const z = /\/(\d+)\/\d+\/\d+\.pbf/.exec(r.url)?.[1] ?? "?";
    const g = zooms.get(z) ?? { n: 0, start: Infinity, end: 0 };
    g.n++;
    g.start = Math.min(g.start, r.start);
    g.end = Math.max(g.end, r.end ?? 0);
    zooms.set(z, g);
  }
  console.log(`\ntiles by zoom: ${[...zooms].map(([z, g]) => `z${z} ×${g.n} ${fmt(g.start)}–${fmt(g.end)}`).join(" · ")}`);
  console.log("\nJS chunks:");
  for (const r of run.rows.filter((r) => r.kind === "js" || r.kind === "worker" || r.kind === "style"))
    console.log(`  ${fmt(r.start)}–${fmt(r.end)} ms  ${kb(r.size)} KB${r.cached ? " (cache)" : ""}  ${r.url.replace(/^https?:\/\/[^/]+/, "")}  [${r.cc ?? ""}]`);
}
if (o.json) await writeFile(o.json, JSON.stringify(out, null, 1));
