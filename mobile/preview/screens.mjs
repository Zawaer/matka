#!/usr/bin/env node
// Screenshots of every tab, sub-view and sheet of the app, from the browser
// preview (preview/README.md), at a phone viewport in light and dark.
//
//   node preview/screens.mjs [outDir] [--base http://localhost:3127] [--only timeline,places] [--scheme light|dark]
//
// Needs the preview dev server running and playwright-core (npm i --no-save
// playwright-core). Chromium comes from PLAYWRIGHT_CHROMIUM or the headless
// shell under /opt/playwright. Long screens are captured page by page
// (name-1.png, name-2.png, …) by scrolling their scroll view.

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const OUT = path.resolve(positional[0] ?? "/tmp/shots/app");
const BASE = opt("base", "http://localhost:3127");
const ONLY = opt("only", "")?.split(",").filter(Boolean) ?? [];
const SCHEMES = opt("scheme", "") ? [opt("scheme")] : ["light", "dark"];
const CHROME =
  process.env.PLAYWRIGHT_CHROMIUM ??
  "/opt/playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell";

// ---- helpers ---------------------------------------------------------------

const settle = (page, ms = 900) => page.waitForLoadState("networkidle").then(() => page.waitForTimeout(ms));
const tab = async (page, name) => {
  await page.getByRole("tab", { name, exact: false }).first().click();
  await settle(page);
};
const press = async (page, name, role = "button") => {
  await page.getByRole(role, { name }).first().click();
  await settle(page);
};

/** The visible vertical scroll view with the most content (the screen's own). */
async function scroller(page) {
  return page.evaluateHandle(() => {
    let best = null;
    for (const el of document.querySelectorAll("div")) {
      const st = getComputedStyle(el);
      if (!/(auto|scroll)/.test(st.overflowY) || el.scrollHeight <= el.clientHeight + 4) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 200 || r.height < 200 || r.bottom <= 0 || r.top >= innerHeight) continue;
      if (!best || el.clientHeight > best.clientHeight) best = el;
    }
    return best;
  });
}

/** Viewport shots down the screen's scroll view, up to `max` pages. */
async function shootPages(page, file, max = 5) {
  const el = await scroller(page);
  const has = await el.evaluate((e) => !!e);
  if (!has) return void (await page.screenshot({ path: `${file}-1.png` }));
  for (let i = 0; i < max; i++) {
    await page.screenshot({ path: `${file}-${i + 1}.png` });
    const moved = await el.evaluate((e) => {
      const before = e.scrollTop;
      e.scrollTop = before + Math.round(e.clientHeight * 0.82);
      return e.scrollTop > before + 2;
    });
    if (!moved) break;
    await page.waitForTimeout(350);
  }
  await el.evaluate((e) => (e.scrollTop = 0));
}

/** Scrolls the element into the middle of its scroll view. */
async function reveal(page, locator) {
  await locator.first().evaluate((e) => e.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(350);
}

// ---- the shots -------------------------------------------------------------
// name, page query, steps before the shot, and whether to page through it.

const SHOTS = [
  { name: "overview", pages: true },
  { name: "map", steps: (p) => tab(p, "Map") },
  { name: "timeline", pages: true, steps: (p) => tab(p, "Timeline") },
  {
    name: "timeline-question",
    steps: async (p) => {
      await tab(p, "Timeline");
      await p.getByRole("button", { name: "Pick another" }).first().click();
      await reveal(p, p.getByRole("button", { name: "Type a name" }));
    },
  },
  {
    name: "timeline-missing",
    steps: async (p) => {
      await tab(p, "Timeline");
      await reveal(p, p.getByRole("button", { name: "Add travel" }));
    },
  },
  { name: "sheet-fix-trip", steps: async (p) => (await tab(p, "Timeline"), press(p, "Fix this trip")) },
  {
    name: "sheet-fix-transit",
    steps: async (p) => {
      await tab(p, "Timeline");
      await press(p, "Edit the fix of this trip");
    },
  },
  { name: "sheet-add-travel", steps: async (p) => (await tab(p, "Timeline"), press(p, "Add travel")) },
  { name: "sheet-photo", steps: async (p) => (await tab(p, "Timeline"), press(p, /^Photo 1$/)) },
  { name: "timeline-prev-day", pages: true, steps: async (p) => (await tab(p, "Timeline"), press(p, "Previous day")) },
  { name: "insights-travel", pages: true, steps: (p) => tab(p, "Insights") },
  { name: "insights-trips", pages: true, steps: async (p) => (await tab(p, "Insights"), tab(p, "Trips")) },
  {
    name: "insights-trip-detail",
    pages: true,
    steps: async (p) => (await tab(p, "Insights"), await tab(p, "Trips"), press(p, /^Lisbon and Sintra,/)),
  },
  {
    name: "insights-city",
    pages: true,
    steps: async (p) => {
      await tab(p, "Insights");
      await tab(p, "Trips");
      await press(p, /^Lisbon and Sintra,/);
      await press(p, /^Lisbon\b/);
    },
  },
  { name: "insights-world", pages: true, steps: async (p) => (await tab(p, "Insights"), tab(p, "World")) },
  { name: "insights-world-cities", steps: async (p) => (await tab(p, "Insights"), await tab(p, "World"), tab(p, "Cities")) },
  { name: "insights-country", pages: true, steps: async (p) => (await tab(p, "Insights"), await tab(p, "World"), press(p, /^Finland\b/)) },
  { name: "insights-places", pages: true, steps: async (p) => (await tab(p, "Insights"), tab(p, "Places")) },
  {
    name: "insights-places-search",
    steps: async (p) => {
      await tab(p, "Insights");
      await tab(p, "Places");
      await p.getByPlaceholder(/Search places/).fill("tampere");
      await settle(p, 1200);
    },
  },
  {
    name: "insights-places-nomatch",
    steps: async (p) => {
      await tab(p, "Insights");
      await tab(p, "Places");
      await p.getByPlaceholder(/Search places/).fill("zzqx");
      await settle(p, 1200);
    },
  },
  { name: "recorder", query: "tracking=1", pages: true, steps: (p) => tab(p, "Recorder") },
  {
    name: "recorder-problems",
    query: "tracking=1&queued=37412&failing=1&batteryOpt=1&perm=foreground&recovered=1",
    pages: true,
    steps: (p) => tab(p, "Recorder"),
  },
  { name: "recorder-auth-lost", query: "authLost=1", steps: (p) => tab(p, "Recorder") },
  { name: "settings", query: "preset=custom", pages: true, steps: async (p) => (await tab(p, "Recorder"), press(p, "Settings")) },
  { name: "pair", query: "paired=0" },
  {
    name: "pair-manual",
    query: "paired=0",
    steps: async (p) => {
      await press(p, /Enter manually/, "tab");
    },
  },
  { name: "empty-overview", query: "scenario=empty" },
  { name: "empty-timeline", query: "scenario=empty", steps: (p) => tab(p, "Timeline") },
  { name: "empty-trips", query: "scenario=empty", steps: async (p) => (await tab(p, "Insights"), tab(p, "Trips")) },
  { name: "error-overview", query: "scenario=error" },
  { name: "error-insights", query: "scenario=error", steps: (p) => tab(p, "Insights") },
  { name: "loading-overview", query: "scenario=slow", wait: 600 },
  { name: "loading-timeline", query: "scenario=slow", wait: 600, steps: (p) => tab(p, "Timeline") },
  // Round 3 review extras: pickers, menus, expanded sections and the remaining states.
  { name: "timeline-daypicker", steps: async (p) => (await tab(p, "Timeline"), press(p, "Go to a day")) },
  { name: "overview-recording", query: "tracking=1" },
  { name: "recorder-off" , pages: true, steps: (p) => tab(p, "Recorder") },
  {
    name: "recorder-details",
    query: "tracking=1&recovered=1",
    pages: true,
    steps: async (p) => {
      await tab(p, "Recorder");
      await p.getByText("Battery and server").first().click();
      await settle(p);
      await reveal(p, p.getByText("Battery today"));
    },
  },
  { name: "settings-distance", query: "preset=custom", steps: async (p) => (await tab(p, "Recorder"), await press(p, "Settings"), p.getByText("Distance between points").first().click(), settle(p)) },
  { name: "insights-world-sort", steps: async (p) => (await tab(p, "Insights"), await tab(p, "World"), p.getByText(/^Sort:/).first().click(), settle(p)) },
  { name: "error-timeline", query: "scenario=error", steps: (p) => tab(p, "Timeline") },
  { name: "loading-insights", query: "scenario=slow", wait: 600, steps: (p) => tab(p, "Insights") },
  { name: "loading-places", query: "scenario=slow", wait: 600, steps: async (p) => (await tab(p, "Insights"), tab(p, "Places")) },
  { name: "empty-places", query: "scenario=empty", steps: async (p) => (await tab(p, "Insights"), tab(p, "Places")) },
  { name: "empty-travel", query: "scenario=empty", steps: (p) => tab(p, "Insights") },
  // Round 3 (app): places open a sheet, a By mode row opens its months.
  { name: "insights-place-sheet", steps: async (p) => (await tab(p, "Insights"), await tab(p, "Places"), press(p, /Opens the place$/)) },
  { name: "insights-travel-mode", steps: async (p) => (await tab(p, "Insights"), press(p, /Show the last 6 months$/)) },
  { name: "loading-trips", query: "scenario=slow", wait: 600, steps: async (p) => (await tab(p, "Insights"), tab(p, "Trips")) },
  { name: "loading-world", query: "scenario=slow", wait: 600, steps: async (p) => (await tab(p, "Insights"), tab(p, "World")) },
];

// ---- run -------------------------------------------------------------------

const browser = await chromium.launch({ executablePath: CHROME });
let failed = 0;
for (const scheme of SCHEMES) {
  const dir = path.join(OUT, scheme);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    locale: "en-GB",
    timezoneId: "Europe/Helsinki",
  });
  for (const s of SHOTS) {
    if (ONLY.length && !ONLY.some((o) => s.name.startsWith(o))) continue;
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/?${s.query ?? ""}`, { waitUntil: "load" });
      if (s.wait) await page.waitForTimeout(s.wait + 1500);
      else {
        await page.getByRole("tablist").first().waitFor({ timeout: 60_000 }).catch(() => {});
        await settle(page, 1200);
      }
      if (s.steps) await s.steps(page);
      const file = path.join(dir, s.name);
      if (s.pages) await shootPages(page, file);
      else await page.screenshot({ path: `${file}.png` });
      console.log(`${scheme}/${s.name}`);
    } catch (e) {
      failed++;
      console.error(`${scheme}/${s.name} FAILED: ${String(e).split("\n")[0]}`);
      await page.screenshot({ path: path.join(dir, `${s.name}-FAILED.png`) }).catch(() => {});
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(`${failed ? `${failed} failed; ` : ""}screens in ${OUT}`);
process.exit(failed ? 1 : 0);
