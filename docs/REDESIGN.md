# Matka redesign

A ten-round redesign of the web app (and, in parallel, the phone app) towards
something that looks professional rather than assembled. Each round ends with
before/after screenshots and a changelog here; later rounds are driven by
independent critics who score the screens against
[DESIGN_REFERENCES.md](DESIGN_REFERENCES.md) section 5.

## Design principles (web)

1. **Content first, chrome quiet.** The map, the timeline and the numbers are
   the content. The sidebar, headers and filters stay neutral and recede.
2. **One accent.** Violet (`primary`) marks the primary action, selection,
   focus and links, and nothing else. A screen has at most one solid button.
3. **Colour is data.** Travel-mode colours appear only on data marks: route
   lines, bars, legend dots and the mode glyph itself. They never tint text,
   card backgrounds or chrome. Status colours (success, warn, danger) are only
   for status.
4. **Hierarchy from weight and tone, not size.** One type scale, used strictly.
   Two weights (400 and 500/600). Three text colours.
5. **One icon set.** Lucide, outline, stroke 1.75, at 16/20/24 px. No emoji
   anywhere in the UI.
6. **Tone before lines before shadows.** Surfaces separate by tone and a
   hairline border. Shadows are only for things that float (popovers, dialogs,
   map overlays).
7. **Every list has four states.** Loading (a skeleton in the final shape),
   empty (an icon, one sentence, one action), error (what failed, plus retry),
   and partial data shown honestly (dashed gaps, "Right place?").

## Tokens

All tokens live in `web/src/app/globals.css` as `--mk-*` CSS variables (dark by
default; light follows the OS or `?theme=light`). They are exposed as Tailwind
utilities through `@theme`.

| Role | Utility | Notes |
|---|---|---|
| Page background | `bg-bg` | level 0 |
| Card / sidebar | `bg-surface` | level 1 |
| Control fill, hover, tile | `bg-surface-2` | component background, not elevation |
| Switch track | `bg-surface-3` | |
| Hairline border | `border-border` | dividers, card edges |
| Hover border | `border-strong` | also the timeline rail |
| Input outline | `border-outline` | ≥3:1 against the surfaces (WCAG 1.4.11) |
| Primary text | `text-text` | |
| Secondary text | `text-secondary` | values next to labels, button text |
| Muted text | `text-muted` | meta lines, captions; ≥4.5:1 on bg, surface and surface-2 in both themes |
| Accent | `primary`, `primary-strong` (hover), `on-primary` | |
| Status | `success`, `warn`, `danger` | use `/8`–`/14` tints for backgrounds |
| Travel modes | `--mk-walk`, `--mk-car`, … via `MODE_META[mode].color` | data marks only |
| Radii | `rounded-control` 8 px, `rounded-card` 12 px, `rounded-full` for chips and badges only | |
| Shadows | `shadow-card` (none), `shadow-pop` | pop is for overlays and dialogs |

**Type scale** (Tailwind `text-*` utilities defined in `@theme`):

| Utility | Size / line | Weight | Use |
|---|---|---|---|
| `text-title` | 24/32 | 600 | page title (h1) |
| `text-heading` | 16/24 | 600 | section title (h2), dialog title |
| `text-label` | 14/20 | 500 | card and row titles |
| `text-sm` | 14/20 | 400 | body (the `<body>` default) |
| `text-meta` | 13/18 | 400 | second lines, hints, trailing values |
| `text-caption` | 12/16 | 400 | axis labels, badges, tab-bar labels |
| `text-stat` | 24/30 | 600 | big numbers; the unit is rendered smaller and muted |

Cover titles over photos use 32. Nothing in the UI is below 12 px. Every
number uses `tabular-nums`.

**Spacing:** Tailwind's 4 px grid. Page gutters are 16 px on phones, 24 px on
small tablets and 40 px on desktop. Cards are 16 to 20 px inside with 12 to
16 px between them, and sections are 32 px apart.

## Primitives (`web/src/components/ui/`)

Import from `@/components/ui`. They work in both server and client components
(only `CopyField` is a client component).

| Primitive | What it is |
|---|---|
| `Page` | The content column: `width="narrow" \| "default" \| "wide"` (3xl / 5xl / 6xl), with the same gutters everywhere |
| `PageHeader` | h1, a subtitle line, optional `back` link, a `leading` tile and `actions` on the right |
| `BackLink` | "‹ Places" |
| `SectionHeader` | h2, an optional description and an action on the right |
| `Card`, `CardHeader`, `cardClass()` | The one container. Padding `none/sm/md/lg`; `interactive` adds hover |
| `CardList`, `ListRow` | Divided rows: leading tile, title, meta, trailing value, chevron when it links |
| `Button`, `ButtonLink`, `buttonClass()` | `primary / secondary / ghost / danger`, sizes `sm` 32, `md` 36, `lg` 44 px, optional Lucide `icon` / `iconRight` |
| `IconButton`, `iconButtonClass()` | A square icon-only button; `label` is its accessible name and tooltip |
| `Badge` | A small status label in a tone: `neutral / primary / success / warn / danger` |
| `Chip` | A compact value pill ("● 412 km") |
| `Segmented` | Mutually exclusive options as links (server) or buttons (client) |
| `Stat` | Label on top, a tabular figure below, optional hint |
| `EmptyState` | Icon, title, one sentence, one action |
| `Skeleton` | A loading block |
| `Callout` | Inline info, success, warning or error message with an icon |
| `Input`, `Select`, `Textarea`, `Field`, `Toggle`, `inputClass`, `checkClass` | Form controls with one look. `Toggle` is a native checkbox styled as a switch (`.mk-switch`) |
| `IconTile` | An icon on a quiet square (sm 28, md 36, lg 48). `color` tints only the glyph |
| `CopyField` | A label, the value in monospace, and a Copy button |
| `icons.tsx` | The icon layer: `MODE_ICONS`, `PLACE_GROUP_ICONS`, `KIND_ICONS`, `NAV_ICONS`, `placeIconFor(kind, category, osmKey)` (saved kind, then the OSM category, then the icon group, then a pin), `ModeGlyph`, `PlaceGlyph`, `Icon` |

The semantic mappings stay where they were: `lib/modes.ts` (mode → label and
colour), `lib/placeIcons.ts` (OSM → icon group; also the phone app's MCI name)
and `lib/savedPlaces.ts` (saved kinds). `icons.tsx` only decides how each one
is drawn.

## How to screenshot

`web/scripts/screens.mjs` signs in and captures every page and a few states
at 390×844 (2x) and 1440×900, in light and dark, with the time zone set to
Europe/Helsinki. Pages that need an id (a place, a trip, a city, trip days on
the timeline) are found by following the first matching link. Files are named
`<state>-<m|d>-<light|dark>.png`. The header comment of the script holds the
same recipe.

From `web/`, as root in a dev container:

```sh
# 1. Throwaway Postgres + PostGIS on 127.0.0.1:5556
#    (apt-get install postgresql-15 postgresql-15-postgis-3 if /usr/lib/postgresql/15 is missing)
B=/usr/lib/postgresql/15/bin; mkdir -p /tmp/mkpg && chown postgres /tmp/mkpg
su postgres -s /bin/bash -c "$B/initdb -D /tmp/mkpg/data -U postgres --auth=trust"
su postgres -s /bin/bash -c "$B/pg_ctl -D /tmp/mkpg/data -l /tmp/mkpg/log -o '-p 5556 -k /tmp/mkpg -c listen_addresses=127.0.0.1' start"
$B/psql -h 127.0.0.1 -p 5556 -U postgres -c "create database matka_qa"

# 2. Schema and about 3 months of demo history (it prints the trip dates)
export DATABASE_URL=postgresql://postgres@127.0.0.1:5556/matka_qa
node scripts/migrate.mjs
node scripts/seed-demo.mjs --reset --save

# 3. Build, then run the standalone server on 127.0.0.1 only (the key is public)
env NODE_ENV=development npm install --no-save playwright-core   # if missing
env NODE_ENV=production npm run build
cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/
(cd .next/standalone && NODE_ENV=production PORT=3200 HOSTNAME=127.0.0.1 \
  MATKA_AUTH=key MATKA_LOGIN_KEY=test-login-key-0123456789abcdefghijklmnop \
  MATKA_SECRET=test-secret-0123456789abcdefghijklmnopqrstuvwxyz \
  APP_URL=http://localhost:3200 MATKA_TRANSIT_FEEDS=off \
  DATABASE_URL=$DATABASE_URL node server.js > /tmp/mk-server.log 2>&1 &)
# The worker turns the seed into visits and trips within seconds of start.

# 4. Shoot
node scripts/screens.mjs /tmp/shots/redesign/rN/web/after
#   --only timeline,places   --sizes m   --schemes d   --dates 2026-09-04
```

Stop the server afterwards. It renames its process to `next-server`, so
`pkill -f server.js` misses it. Use
`kill $(ss -ltnp | grep 3200 | grep -o 'pid=[0-9]*' | cut -d= -f2)`.
After a rebuild, always restart the server and copy `.next/static` again;
otherwise the old server serves old HTML against new CSS.

Chromium is at
`/opt/playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`,
or wherever `CHROME_PATH` points.

## Changelog

### Round 1 (web)

Screenshots: `/tmp/shots/redesign/r1/web/before/` and `.../after/` (76 each).

- **Icons:** `lucide-react` replaces every emoji and pictographic glyph in the
  UI. That covers travel modes, place categories and groups, saved kinds, nav,
  empty states, the photo viewer, the trip editor, the map overlays and the
  search results. Text glyphs used as controls (‹ › × ✕ ↑ ↗ ←) are now icons.
  The emoji fields came out of `MODE_META`, `PLACE_ICONS` and `KIND_META`, and
  `categoryIcon()` was removed. Arrows remain only inside prose menu paths
  ("Settings → Location").
- **Design system:** the tokens were rebuilt as colour roles (surface levels,
  three text levels, border/strong/outline, one accent, status colours) with
  contrast checked in both themes. There is now a strict type scale and a
  control/card radius scale, and shadows are only for floating things. A
  global `:focus-visible` ring was added. Fourteen primitives were added in
  `components/ui/`.
- **Shell:** the sidebar is quieter (a neutral active state with an accent
  icon, and a full-height rail). The mobile top bar is 52 px and the tab bar
  is 56 px with safe-area padding.
- **Pages migrated:**
  - overview: stats with muted units, a month chart, a ranked "most time
    spent" list, and recent visits as a list.
  - timeline: day header with icon buttons, mode-glyph summary chips, visit
    cards with place glyphs, travel rows with mode-coloured glyphs only,
    "Missing travel" in the warn tone, gaps with an icon, and skeleton, empty
    and error states.
  - trip editor: dialog styling, mode grid with glyphs, and buttons.
  - day map: Lucide glyphs in the markers and a Lucide fit-the-day button.
  - places list and place page: cards with category tiles, saved-kind badges,
    a stats row, and a visits list linking to that day.
  - search; photo gallery; map overlays (floating panels and legend swatches).
  - insights: Segmented tabs, month picker, per-mode small multiples with a
    neutral tile, battery and quality cards restructured into figures, a grid
    and footnotes.
  - trips, trip detail, world, city.
  - devices; settings: sectioned cards with switches, and one style of save
    button.
  - auth key, pair landing and pairing, 404.
- **Harness:** `web/scripts/screens.mjs` (see above).


## How to screenshot (app)

The phone app is shot from the browser preview (`mobile/preview`, see its
README): the real screens, rendered by react-native-web with a mock API that
covers every state (timeline extras, corrections, photos, recorder problems,
battery stats, empty, error and loading).

```sh
cd mobile
# Node >= 22.13 (expo). Web-only extras, not in package.json:
npm i --no-save --include=dev react-native-web@~0.21.4 react-dom@19.3.0 @expo/metro-runtime@~58.0.14 playwright-core
# Start the preview (no CI=1: it turns off Metro's file watching)
MATKA_PREVIEW=1 npx expo start --web --port 3127 --host localhost
# In another shell: every tab, sub-view, sheet and state, light and dark
node preview/screens.mjs /tmp/shots/app
#   --only timeline,sheet   --scheme dark   --base http://localhost:3127
```

`screens.mjs` uses playwright-core with the headless shell in
`/opt/playwright` (or `PLAYWRIGHT_CHROMIUM`), a 390x844 viewport at 2x,
`en-GB` and Europe/Helsinki. Long screens are captured page by page
(`overview-1.png`, `overview-2.png`, …). Judge layout, hierarchy and
consistency there; fonts, shadows and the switch thumb are drawn by the
browser, not Android.

## Round 1 (app)

Screenshots: `/tmp/shots/redesign/r1/app/{before,after}/{light,dark}/`.

**Icons.** Every icon is now Lucide (`lucide-react-native` + `react-native-svg`,
added with `npx expo install`; react-native-svg is native, so the APK needs a
rebuild). Screens ask for semantic names from one map,
`mobile/src/design/icons.ts` (modes, place groups, saved kinds, tabs, actions,
status), imported per icon so the bundle only carries those glyphs.
`design/modes.ts`, `design/placeIcons.ts` (same groups as the web, emoji
column removed), `design/categories.ts` (now derived from placeIcons) and
`KIND_META` all use those names. Sizes 16 / 20 / 24 (32 for empty states),
stroke 2. No emoji in the app; MaterialCommunityIcons and the icon font load
are gone.

**Tokens** (`mobile/src/design/tokens.ts`):

- Colour: one cool neutral for surfaces, borders and text (`bg`, `surface`,
  `surfaceAlt`, `raised`; `border` hairline, `borderStrong` 3:1 for inputs and
  the rail; `text` / `textSecondary` / `textMuted`, all at least 4.5:1 on every
  surface in both themes). One indigo accent (`primary`, `primarySoft`) for the
  primary action, selection and links. Status `danger` / `warning` / `success`
  with soft backgrounds. The decorative tint palette and the violet "hero" are
  gone. Mode colours unchanged (validated data palette) and used only for marks
  and mode glyphs.
- Type: the iOS sizes only (11/12/13/15/17/22/28/34). `title1` 28 screen titles,
  `title2` 22 detail titles and pagers, `title3` 17/500 section and card titles,
  `headline` 15/500 row titles, `callout` 13 metadata, `caption` 12, `label`
  13/500 buttons and chips, `stat` 28 / `statSm` 17 numbers, `display` 34 for
  the one hero number. Weights 400, 500 and 800 (Android draws 600/700 as
  regular), at most two per row. Every number is tabular.
- Spacing 2/4/8/12/16/24/32/48, gutter 16. Radii: badge 6, control 10, card 14,
  sheet 28, pill. Cards are flat (tone + hairline); only sheets cast a shadow,
  and none in dark mode.

**Components** (`mobile/src/ui/`): `Card` (optionally pressable), `ListGroup` +
`ListRow` (56/68 rows, inset hairlines, trailing tabular values, chevron when
it navigates), `GroupedItem` (the same inside a FlatList), `Group` + `InfoRow` +
`GroupBlock` (settings-style grouped lists with an overline label and a
footnote), `SectionHeader` (32 above, 8 below), `Button` (primary, secondary
tonal, ghost, danger, surface; 48 tall or 36 with a 48 touch area),
`IconButton` (40 visible, 48 to touch, always labelled), `Chip` (32, check when
selected), `Badge`, `Segmented` (tabs or radio group), `Stat` / `StatGrid` (one
card with hairline cells, unit smaller and muted), `IconTile` (40, neutral or a
tone), `ModeIcon`, `EmptyState`, `ErrorState`, `Skeleton`, `Banner` (title,
message, actions), `Field` (48, outlined, 2 px accent focus), `Sheet` (bottom
sheet shell), `ScreenHeader`, `BackLink`, `DetailTitle`, `Pager`.

**Screens.** All migrated: Overview (status card with the one solid button, a
neutral hero card instead of the violet block with rings, stats in one grid,
month chart with a pinned readout, sections with text actions), Map (edge to
edge, quiet loading and error), Timeline (40 px rail with 32 px visit glyphs and
uncoloured tiles, mode glyph on a mode-coloured rail for travel, edit as a
labelled icon button, "Were you here?" with Yes / Pick another, missing travel
and no-data gaps as dashed rail segments, day stats in one card, photo strip
and viewer restyled), the "Fix this trip" sheet on the shared Sheet,
Insights (segmented control, Travel with month pager, 3-up stats, one
"By mode" card whose mini bars highlight only the shown month, Trips with
photo-led cards and a smoother scrim, Trip detail, World, Country, City and
Places with grouped rows, tonal search field and badges), Recorder (status card
with switch, banners with titles and surface buttons, grouped Recording /
Battery today / Upload / Server lists; battery stats as rows instead of one
long sentence), Settings (back link, radio rows, labelled segmented controls,
grouped toggles), Pair (segmented scan / manual, camera permission as an empty
state, confirm card). The tab bar uses Lucide at 24 with the M3 pill and
neutral labels.

**Preview and mocks.** The mock API now has realistic coordinates (so "Missing
travel" appears), a guessed visit with candidates, an edited and an added trip,
per-day photos, place search, transit routes and stops, and the corrections and
confirm endpoints; the db mock seeds today's battery/usage stats and watchdog
recoveries (`?recovered=1`), and queued points use epoch ms like the real
queue. The WebView mock passes a load event (the day map crashed the Timeline
in the preview before) and draws a quiet street-grid placeholder.

**Checklist (DESIGN_REFERENCES.md section 5), still failing or unverified:**

- One solid button per screen holds except where a banner, sheet or
  permission state adds its own primary action next to Overview's Start; the
  Pair confirm screen and the Fix sheet are fine.
- Touch targets: the transit line badges and the photo thumbnails in the strip
  are under 48 dp (thumbnails are up to 56 but shrink on narrow cards).
- Text on photos relies on the stacked-band scrim; contrast is not measured on
  real covers, and trips without a cover show a neutral backdrop with a route
  glyph rather than a map thumbnail.
- `adjustsFontSizeToFit` on stat values is native-only: on the web preview long
  durations in 3-up stats can still truncate.
- Muted text on `primarySoft` / `warningSoft` and mode-coloured glyphs on their
  12 % tints were not all measured; walking, bus and running mode colours are
  under 3:1 on white (each is always paired with a label, as before).
- Focus rings (keyboard / switch access) are not defined beyond the 2 px focus
  border on inputs.
- The Map tab and the day map are the web app's page; their chrome is the web
  redesign's.
