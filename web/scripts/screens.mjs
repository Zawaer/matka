#!/usr/bin/env node
// DEV ONLY. Screenshots every page (and a few states) of a running Matka web
// app at phone (390x844) and desktop (1440x900) sizes, light and dark, for
// design review. Used by the docs/REDESIGN.md rounds; keep it in step with
// the pages.
//
// Recipe (from web/, as root in a dev container; ~10 min the first time):
//
//   # 1. Throwaway Postgres + PostGIS on 127.0.0.1:5556 (apt-get install
//   #    postgresql-15 postgresql-15-postgis-3 if /usr/lib/postgresql/15 is missing)
//   B=/usr/lib/postgresql/15/bin; mkdir -p /tmp/mkpg && chown postgres /tmp/mkpg
//   su postgres -s /bin/bash -c "$B/initdb -D /tmp/mkpg/data -U postgres --auth=trust"
//   su postgres -s /bin/bash -c "$B/pg_ctl -D /tmp/mkpg/data -l /tmp/mkpg/log \
//       -o '-p 5556 -k /tmp/mkpg -c listen_addresses=127.0.0.1' start"
//   $B/psql -h 127.0.0.1 -p 5556 -U postgres -c "create database matka_qa"
//
//   # 2. Schema and ~3 months of demo history (prints the trip dates)
//   export DATABASE_URL=postgresql://postgres@127.0.0.1:5556/matka_qa
//   node scripts/migrate.mjs
//   node scripts/seed-demo.mjs --reset --save
//
//   # 3. Production build, run standalone on 127.0.0.1:3200 (never 0.0.0.0:
//   #    the login key below is public). The worker turns the seed into visits
//   #    and trips within a few seconds of start.
//   env NODE_ENV=development npm install --no-save playwright-core   # if missing
//   env NODE_ENV=production npm run build
//   cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/
//   (cd .next/standalone && NODE_ENV=production PORT=3200 HOSTNAME=127.0.0.1 \
//     MATKA_AUTH=key MATKA_LOGIN_KEY=test-login-key-0123456789abcdefghijklmnop \
//     MATKA_SECRET=test-secret-0123456789abcdefghijklmnopqrstuvwxyz \
//     APP_URL=http://localhost:3200 MATKA_TRANSIT_FEEDS=off \
//     DATABASE_URL=$DATABASE_URL node server.js > /tmp/mk-server.log 2>&1 &)
//
//   # 4. Shoot. Then stop the server: it renames itself "next-server", so
//   #    kill $(ss -ltnp | grep 3200 | grep -o 'pid=[0-9]*' | cut -d= -f2)
//   #    After a rebuild, restart it and copy .next/static again, or the old
//   #    server keeps serving old HTML against the new CSS.
//   node scripts/screens.mjs /tmp/shots/some-dir
//
// Options:
//   --base URL       app URL (default http://127.0.0.1:3200)
//   --key KEY        login key (default the test key above, or MATKA_LOGIN_KEY)
//   --only a,b       only states whose name contains one of these
//   --sizes m,d      phone (m) and/or desktop (d) (default both)
//   --schemes l,d    light (l) and/or dark (d) (default both)
//   --dates a,b      extra /timeline?date= days (YYYY-MM-DD); by default the
//                    harness picks the days of the first trip it finds
//
// Files are named <state>-<m|d>-<light|dark>.png. Pages that need ids (a
// place, a trip, a city) are found by following the first matching link.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const CHROME =
  process.env.CHROME_PATH ??
  "/opt/playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string", default: "http://127.0.0.1:3200" },
    key: { type: "string", default: process.env.MATKA_LOGIN_KEY ?? "test-login-key-0123456789abcdefghijklmnop" },
    only: { type: "string" },
    sizes: { type: "string", default: "m,d" },
    schemes: { type: "string", default: "l,d" },
    dates: { type: "string" },
  },
});
const out = positionals[0];
if (!out) {
  console.error("usage: node scripts/screens.mjs <output dir> [--base URL] [--only a,b] [--sizes m,d] [--schemes l,d]");
  process.exit(1);
}
const BASE = args.base.replace(/\/$/, "");
const SIZES = { m: { width: 390, height: 844 }, d: { width: 1440, height: 900 } };
const sizes = args.sizes.split(",").filter((s) => s in SIZES);
const schemes = args.schemes.split(",").map((s) => (s.startsWith("l") ? "light" : "dark"));
const only = args.only?.split(",").filter(Boolean);

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });

/** Signs in through /auth/key and returns a logged-in context. */
async function context(size, scheme) {
  const ctx = await browser.newContext({
    viewport: SIZES[size],
    deviceScaleFactor: size === "m" ? 2 : 1,
    colorScheme: scheme,
    timezoneId: "Europe/Helsinki",
    locale: "en-GB",
    isMobile: size === "m",
    hasTouch: size === "m",
  });
  return ctx;
}

async function signIn(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/key`);
  await page.fill("#key", args.key);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/auth/")), page.click("button[type=submit]")]);
  await page.close();
}

/** The first href on `url` matching `re`, or null. */
async function firstLink(ctx, url, re) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  await page.close();
  return hrefs.filter((h) => h && re.test(h));
}

// ------------------------------------------------------------------ discovery
const probe = await context("d", "dark");
await signIn(probe);
const place = (await firstLink(probe, "/places", /^\/places\/\d+/))[0] ?? null;
const trip = (await firstLink(probe, "/insights/trips", /^\/insights\/trips\/\d+/))[0] ?? null;
const city = (await firstLink(probe, "/insights/world?view=cities", /^\/insights\/world\/city\?/))[0] ?? null;
const tripDays = trip ? await firstLink(probe, trip, /^\/timeline\?date=/) : [];
await probe.close();
const dates = args.dates ? args.dates.split(",").map((d) => `/timeline?date=${d}`) : tripDays.slice(0, 2);

/** name, url, and optionally `auth: false`, `act(page)` for a state after load, `full: false` for the viewport only. */
const STATES = [
  { name: "auth-key", url: "/auth/key", auth: false },
  { name: "auth-key-error", url: "/auth/key", auth: false, act: async (p) => {
      await p.fill("#key", "wrong-key-wrong-key-wrong-key-wrong-key");
      await p.click("button[type=submit]");
      await p.waitForSelector("[role=alert]", { timeout: 5000 }).catch(() => {});
    } },
  { name: "pair", url: "/pair", auth: false },
  { name: "overview", url: "/" },
  { name: "timeline", url: "/timeline" },
  ...dates.map((u, i) => ({ name: `timeline-day${i + 1}`, url: u })),
  { name: "map", url: "/map", wait: 2500, full: false },
  { name: "places", url: "/places" },
  ...(place ? [{ name: "place", url: place, wait: 1500 }] : []),
  { name: "insights", url: "/insights" },
  { name: "insights-trips", url: "/insights/trips" },
  ...(trip ? [{ name: "insights-trip", url: trip }] : []),
  { name: "insights-world", url: "/insights/world" },
  { name: "insights-world-cities", url: "/insights/world?view=cities" },
  ...(city ? [{ name: "insights-city", url: city }] : []),
  { name: "devices", url: "/devices" },
  { name: "settings", url: "/settings" },
  { name: "not-found", url: "/no-such-page" },
].filter((s) => !only || only.some((o) => s.name.includes(o)));

let n = 0;
for (const size of sizes) {
  for (const scheme of schemes) {
    const authed = await context(size, scheme);
    await signIn(authed);
    const anon = await context(size, scheme);
    for (const s of STATES) {
      const page = await (s.auth === false ? anon : authed).newPage();
      try {
        await page.goto(`${BASE}${s.url}`, { waitUntil: "networkidle", timeout: 30000 });
      } catch {
        // Long-polling or slow tiles: shoot what is there.
      }
      if (s.act) await s.act(page);
      // Maps, charts and fonts settle after network idle.
      await page.waitForTimeout(s.wait ?? 800);
      const file = path.join(out, `${s.name}-${size}-${scheme}.png`);
      if (s.full === false) {
        await page.screenshot({ path: file });
      } else {
        // Full page, by growing the viewport to the page's height: fixed and
        // sticky parts (the phone tab bar, the sidebar) then sit where a
        // reader would see them, not stamped mid-page as fullPage leaves them.
        const h = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.setViewportSize({ width: SIZES[size].width, height: Math.min(Math.max(h, SIZES[size].height), 12000) });
        await page.waitForTimeout(300);
        await page.screenshot({ path: file });
      }
      await page.close();
      n++;
    }
    await authed.close();
    await anon.close();
  }
}
await browser.close();
console.log(`\nscreens: ${n} screenshots in ${out}`);
