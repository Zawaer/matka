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
