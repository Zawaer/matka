# Day map: how fast it appears

The Timeline tab's day map is the web app's `/embed/day` page in a WebView
(`mobile/src/ui/DayMapCard.tsx`). On the user's OnePlus a grey placeholder
stayed up for about 5–6 s before the map appeared. This page has the
measurements, what changed, and what's left.

## How it was measured

`web/scripts/daymap-perf.mjs` (recipe in its header). It runs against the
production build on 127.0.0.1:3200 with the demo data (`docs/REDESIGN.md` →
"How to screenshot") and plays the app's part: it gets an embed ticket (POST
`/api/device/embed-ticket`, from a page already on the server, since the app's
connection is warm), then opens `/embed/start?ticket=…&to=day&date=…&theme=light`
in a fresh page.

- **Phone:** headless Chromium with CPU throttling ×4 (CDP), DevTools "Fast 4G"
  (165 ms per request, 9 Mbit/s down, 1.5 Mbit/s up, both ×0.9), a 412×300 view at
  2.625×, touch.
- **Cold:** a new browser context (empty HTTP cache). **Repeat:** the same
  context, a new ticket, a new page: the app's next start. **Third:** once more
  (V8's code cache is warm too, as on a phone used daily; after the change only).
- **Milestones** are User Timing marks in `DayMap.tsx` (`matka:map-created`,
  `matka:first-tile` = first frame after a basemap tile loaded,
  `matka:route-drawn` = first frame with the day's lines, `matka:idle` = the
  day's view complete) and the messages the page posts to the app
  (`matka:post:day`, `matka:post:drawn`). All times are ms from the ticket
  request, medians of 3 runs. Days: 2026-10-27 (an Espoo commute, below) and
  2026-09-04 (Helsinki–Tallinn by boat; same picture, within ±60 ms).
- **Caveats:** headless Chromium draws WebGL in software (SwiftShader), so
  "tiles → pixels" is slower here than on a phone's GPU. The real tile CDN is
  used (from this host, plus the emulated latency). The worker row's time
  includes the worker starting up. A request taking under 30 ms despite the
  165 ms latency is counted as cached.

## Before

The app first asked for the timeline, then mounted the card, then asked for a
ticket, then loaded the page. The Timeline tab only mounted on its first visit,
so all of that started when the tab was opened. The app's placeholder hid on
the page's `day` message (the day's data arrived), well before the map. After
that the page showed its own grey pulse.

| ms from ticket | cold | repeat |
|---|---|---|
| page's `day` message (the app's cover hides) | 1640 | 1236 |
| map created | 2919 | 1885 |
| first tile painted (z4: all of Finland) | 4152 | 2617 |
| route drawn | 4575 | 2758 |
| the day's view complete (idle) | 5094 | 3107 |

Waterfall, cold (2026-10-27):

| what | requests | KB | start | end |
|---|---|---|---|---|
| ticket API | 1 | – | 0 | 173 |
| /embed/start (303) | 1 | – | 223 | 391 |
| /embed/day HTML | 1 | 6.2 | 391 | 565 |
| fonts / CSS | 2 / 2 | 52 / 24 | 574 | 1826 |
| JS chunks | 10 + 3 lazy | 463 | 590 | 2319 |
| ↳ DayMap chunk (lazy, after the timeline answered) | 1 | 6.4 | 1638 | 1819 |
| ↳ MapLibre chunk (lazy, after DayMap ran) | 1 | 288 | 1857 | 2319 |
| /api/timeline (client) | 1 | 3.0 | 1456 | 1628 |
| /api/tracks/geojson | 1 | 1.3 | 1863 | 2037 |
| style JSON (OpenFreeMap) | 1 | 4.1 | 2586 | 2774 |
| MapLibre worker (`max-age=0`) | 1 | ~148 | 2882 | 3249 |
| TileJSON (OpenFreeMap) | 1 | 2.1 | 3025 | 3208 |
| sprites (json + png @2x) | 2 | 120 | 3027 | 3342 |
| tiles z4 (Finland, never meant to be seen) | 4 | ~510 | 3302 | 4040 |
| tiles z11 (the day) | 2 | ~180 | 4592 | 4944 |
| glyphs (Regular, Italic 0-255) | 2 | 89 | 3665 | 4376 |

On repeat, everything but the HTML, the timeline, the tracks (304) and the
worker (a 304 revalidation, 273 ms) came from the HTTP cache. That still took
3.1 s, because every step waited for the one before it: HTML → scripts →
hydrate → timeline → DayMap chunk → MapLibre chunk → style → map → worker →
TileJSON → z4 tiles → fit → z11 tiles → glyphs.

On the phone, the first open of the Timeline tab was therefore: timeline
request (≈0.3–0.5 s) + ticket + this page (≈3.1 s warm, ≈5.1 s cold) + the
WebView starting. That matches the 5–6 s seen.

## What changed

**App (JS only, no native rebuild):**

- *Warm start.* `App.tsx` mounts the Timeline tab 1.5 s after the tabs appear,
  out of sight. It is laid out full size behind the shown tab with opacity 0, no
  touches, and hidden from screen readers. With `display: none` it would have no
  size, and the map would have nothing to draw at. It loads its day and the day
  map there, so by the time the tab is first opened the map is usually already
  drawn. The tab then becomes a normal tab: still mounted, hidden with
  `display: none` like the others.
- *Ticket in parallel.* `DayMapCard` mounts with the screen, not after the
  timeline answers. It asks for its ticket while the timeline loads, and the
  page opens on the server's latest day (or the asked-for day). The renewal
  logic is unchanged (11 h timer, foreground check, `expired` / 401 →
  renew, 30 s auto-renew guard).
- *No reloads.* Day changes were already sent over the bridge
  (`window.matkaDay.setDate`), and that's still the case. "Open this day" from
  Insights used to remount the whole TimelineScreen (`key={n}`), which reloaded
  the WebView. Now the screen follows the request itself, by adjusting state
  during render. Tab switches never reloaded it.
- *Something useful at once.* Until the page says the map is drawn, the card
  shows a sketch of the day: the moves in their mode colours with a casing,
  added trips dashed, and stops as rings. It is drawn with react-native-svg
  from the timeline the app already has, with each trip's new simplified
  `path`. It is framed exactly like the web map (`mobile/src/day-sketch.ts`:
  Web Mercator, 512 px tiles, DayMap's phone padding, max zoom 16). The map
  then fades in over it in 220 ms. Checked by drawing the sketch over
  screenshots of the real map: the lines and stops sit on the map's.
- `cacheEnabled` and `cacheMode="LOAD_DEFAULT"` are now spelled out on the
  WebView (they were the defaults already).

**Server / page:**

- `/embed/day` renders its first day into the HTML: the timeline day, the
  day's lines and the tamed basemap style, with the TileJSON's tile URLs inlined
  (`web/src/lib/basemap.ts`). The style is fetched from OpenFreeMap by the
  server, run through `transformStyle`, kept in memory for an hour and refreshed
  in the background. If OpenFreeMap can't be reached, the server waits at most
  1.5 s, doesn't retry for 10 min, and the page fetches the style itself.
  This removes three requests from the phone: timeline, tracks and TileJSON
  (and the style request on a cold start).
- DayMap and MapLibre are part of the embed page's own scripts, no longer a
  lazy chunk behind the timeline request, so they download with the HTML. On
  /timeline, DayMap itself is still lazy.
- The MapLibre worker starts (`prewarm()`) as soon as DayMap's module runs,
  while the page hydrates. Its URL is now `/maplibre-gl-worker.mjs?v=<version>`
  and is served `public, max-age=31536000, immutable` (`next.config.ts`).
  Before it was `max-age=0`, so every load revalidated it.
- `<link rel=preconnect>` to tiles.openfreemap.org, and `<link rel=preload
  as=fetch>` for the labels' glyphs (Noto Sans Regular / Italic 0-255). MapLibre
  only asks for those once the first tiles are parsed.
- The map opens on the day's bounds (exact when the lines came with the page)
  instead of all of Finland at z4 followed by a fit. That's no wasted z4 tiles
  (≈510 KB cold) and no second wave.
- The lines and stops go on at `style.load`, not `load` (which waits for the
  first tiles).
- The page posts a new `drawn` message once the day's lines and the basemap
  under them are on screen (the map goes idle, or 3 s at most). `ready` says
  `drawn: true` so the app knows to wait for it. With an older server the app
  falls back to `day`. Documented in `docs/API.md`.
- `/api/timeline` trips carry `path`: the line simplified to 1/100 of its
  extent (`ST_Simplify`, 4 decimals), a few dozen points per trip.
- Next's static chunks were already `public, max-age=31536000, immutable`.
  The OpenFreeMap style (`max-age=86400`), TileJSON (3600), sprites, glyphs and
  tiles come from the WebView's HTTP cache on repeat opens, as the "repeat"
  rows show.

## After

| ms from ticket | cold | repeat | third |
|---|---|---|---|
| page's `day` message | 2094 | 1478 | 1472 |
| map created | 2089 | 1473 | 1467 |
| route drawn | **2443** (was 4575) | **1906** (was 2758) | 1888 |
| first tile painted (the day's view) | 3048 (z11, was z4 at 4152) | 2248 (was z4 at 2617) | 2225 |
| the day's view complete (idle) = `drawn` posted, map fades in | **3089** (was 5094) | **2308** (was 3107) | 2242 |

Waterfall, cold (2026-10-27):

| what | requests | KB | start | end |
|---|---|---|---|---|
| ticket API | 1 | – | 0 | 173 |
| /embed/start (303) | 1 | – | 222 | 391 |
| /embed/day HTML (day, lines and style inside) | 1 | 9.8 | 390 | 568 |
| fonts / CSS | 2 / 2 | 52 / 24 | 574 | 822 |
| JS chunks (MapLibre included) | 11 | 459 | 594 | 1649 |
| glyphs (preloaded) | 2 | 89 | 1320 | 1645 |
| MapLibre worker (prewarmed) | 1 | ~148 | 1942 | 2336 |
| sprites | 2 | 120 | 2276 | 2581 |
| tiles z11 (the day, only) | 2 | 181 | 2486 | 2841 |
| no timeline / tracks / style / TileJSON / z4 requests | | | | |

Repeat (third open): HTML at 570, scripts from cache by 639, glyphs (cache)
922, worker running by 1377, tiles (cache) 1778, route on screen 1888, day
complete 2242. Over the network, only the ticket, the redirect, the HTML and
the photos lookup remain. The rest of the time is the CPU: parsing and running
MapLibre, hydrating, and parsing and drawing tiles. On ×4 throttling and with
software GL that is ≈1.6 s.

### What the user sees in the app

- **Timeline opened a few seconds after the app started** (the usual case):
  the warmed-up page has already drawn the map. It is there at once (0 s).
- **Timeline opened straight away:** the sketch of the day appears as soon as
  the timeline answers (≈0.3–0.5 s, the same time as the list). The ticket was
  fetched alongside, and the map fades in over the sketch ≈2.2 s (repeat) /
  ≈3 s (cold) after that. On a phone's GPU it should be quicker than this
  software-GL measurement.
- **Day changes** go through the bridge, as before: one timeline request and
  one tracks request in the page, with no reload.

Not reached in the page alone: "under 1 s" on a repeat open is CPU-bound (about
1.6 s of script and drawing at ×4). In the app, the warm start and the sketch
cover it.

## Native map instead? (@maplibre/maplibre-react-native) — evaluated, not done

For:
- No WebView, no page, no ticket, no cookie: the map would start in the app's
  own process at once. No HTML, scripts, hydration or worker boot (that's the
  ≈1.6 s CPU above). Tiles and glyphs go through the native MapLibre cache.
- Native gestures inside the ScrollView, native markers and accessibility.
- The data is already in the app (the timeline with the new `path`; the full
  lines via `/api/tracks/geojson` with the device token).

Against:
- A native module: a new APK (dev client), and the config plugin to keep up
  with each Expo SDK. It adds ≈10–15 MB to the APK (per ABI), plus maintenance.
- Everything the web DayMap does would be written twice: the style tweaks
  (`transformStyle`, dark fills), mode colours and the casing, stop markers
  with category icons, order badges and clustering, photo thumbnails with
  clustering, selection and pan-to, tap targets, and the "whole day" button.
  The web map is shared with the browser's /timeline today. A second
  implementation would drift.
- The Map tab is the same kind of WebView. For consistency it would want the
  same treatment.

Verdict: not worth it now. With the warm start and the sketch, the user rarely
waits for the page, and the remaining cost is a one-off per app start. Look at
it again if the WebView's memory, or its start-up on cold phone boots, becomes
the complaint, or if the Map tab gets rewritten anyway.

## Reproduce

```sh
# server as in docs/REDESIGN.md "How to screenshot" (127.0.0.1:3200), then a
# device token for the script:
psql … -c "insert into devices (user_id, name, token_hash)
  select id, 'perf', sha256(convert_to('mtk_<43 chars>', 'UTF8')) from users order by id limit 1"
node scripts/daymap-perf.mjs --token mtk_<43 chars> --date 2026-10-27 --runs 3
```
