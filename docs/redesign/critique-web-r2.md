# Web critique, round 2

An independent design review of the web app after round 1. The reviewer did
not build it. Every page was shot at 390 px (2x) and 1440 px, in light and
dark, against the seeded demo history (about 3 months, 3 trips). The pass also
covered states the demo data never reaches, by mocking API answers in the
browser: an uncertain "Right place?" visit, Missing travel, transit legs, a
very long place name, Immich photos, the photo viewer, the trip editor, Add
travel, the timeline skeleton and error, an empty day, a search with no
results, and a brand-new user with an empty database.

Screenshots: `/tmp/shots/redesign/r2/web/review/` (the empty-database user is
in `review/empty/`, crops are in `/tmp/shots/redesign/r2/web/crops/`). To
reproduce them, use the recipe in `docs/REDESIGN.md`, then run
`node scripts/screens.mjs <dir> --extras`. For the empty states, add a second
server on an empty database and use `--base`.

**Harness change:** `web/scripts/screens.mjs` gained `--extras` (mocked states
named `x-*`) plus per-state `before` and `waitUntil` hooks. No app code was
touched.

## Verdict in one paragraph

Round 1 fixed the vocabulary: one icon set, tokens, a type scale and
primitives. Nothing on screen says "emoji" or "Bootstrap" any more. It still
reads as **assembled rather than designed**, and the reasons are structural,
not cosmetic:

- **The layout.** Every desktop page is a centred column in a different width.
  The two map-centric products (the Timeline and the World view) don't use the
  1440 px they have. The place, trip and city pages have no map at all.
- **Card-everything.** Every row, stat and setting sits in its own bordered
  box, so nothing has hierarchy. The Places page is 12,600 px tall on a phone.
- **Engineer's copy and data dumps.** p90 accuracy, env var names, and
  `1110 h 51 min`.
- **Native controls in the most-used places.** The date input and the month
  and time-zone selects.

The detail work (glyphs, chips, sheets) is mostly good. The skeleton of the
pages is what now limits how professional it looks.

---

## Cross-cutting problems (apply to every page)

1. **No shared left edge between pages (desktop).** The content column starts
   at x=488 on Timeline, Devices and Settings (3xl), x=360 on Overview, Places
   and the place page (5xl), and x=296 on Insights, Trips, World and City
   (6xl). Switching tabs makes the page jump sideways by up to 190 px, and the
   sidebar to content gap ranges from 72 to 264 px. Also, the sidebar brand
   (y≈33) is not aligned with the page title baseline (y≈52).
   **Fix:** one left-anchored column at a fixed 40 px from the sidebar for
   every page. Let the *max width* differ, but never the left edge. Align the
   brand row to the h1 row (both 32 px boxes at y=40).
2. **Duration formatting is inconsistent and unreadable at scale.** The same
   app shows `1110 h 51 min` (no thousands separator, Places), `1,111 h`
   (Overview), `291 h 30 min`, `79 d 15 h`, `59 d 22 h` and `41 h 36 min`.
   **Fix:** one `formatLongDuration`. Up to 24 h, show `h min`. Up to 30 days,
   show `d h`. Beyond that, show `d` only (`46 d`). Always group thousands.
   Use it for Overview, Places, World, City and trip stats.
3. **Date formatting differs page to page.** You see `Wed, 28 Oct 2026` (the
   year on every row, even for this week), `Last 28 Oct 2026`, `30 Sept`
   versus `Sep` on the chart axis, and a native `10/28/2026` (US order in an
   en-GB locale) next to `Wednesday 28 October`.
   **Fix:** use relative dates for the last 7 days ("Today", "Yesterday",
   "Mon"). Drop the year inside the current year. Use one month abbreviation
   (`Sep`).
4. **Native form controls in key places.** These are the timeline's
   `<input type=date>`, the Insights month `<select>` and the Settings
   time-zone `<select>`. They look like the OS, differ per browser, and the
   date input shows mm/dd/yyyy. **Fix:** a styled `DateButton` ("28 Oct 2026",
   with a calendar icon) that opens a popover calendar with days marked where
   there is data, and a `Select` primitive (a button plus a listbox) for the
   month and the time zone. The time zone needs search.
5. **Card soup.** Stats, rows, list items, settings sections and even
   single-line nav links (Settings → Devices) are separate bordered cards with
   12 px gaps. The Insights "Saved places" card contains bordered cards, which
   is a fourth surface level. **Fix:** use cards for *groups*, not *items*.
   Places and visits become divided list rows inside one card (CardList). Put
   the four stat tiles in one card with internal dividers (a "stat strip").
   Nested items get no border, only a hover tint.
6. **Accent used as decoration.** Saved-kind badges ("Home", "School · 250 m")
   are violet text on a violet tint on the timeline, in the place grid, on the
   place header and on the city page. The "Most time spent" bars are violet.
   The Train / Transit mode colour `#6250d6` is the accent `#5144e8`
   (contrast 1.09:1), so the Aug train bar reads as "selected". The Flight
   colour `#e34948` sits next to danger `#bd2f25` (1.48:1). **Fix:** make
   kind badges neutral (surface-2 and secondary text). Draw the ranking bars
   in neutral `text-muted` at 40 % with the top one in `text-secondary`. Move
   Transit to a teal or slate that is not the accent, and Flight to a
   magenta-plum, then validate with the dataviz palette checker.
7. **Mode glyph contrast in light.** Bus `#eda100` is 2.2:1 on white, Walk
   2.8:1, and Run 2.7:1. They fail 3:1 for meaningful icons, including the
   chips, travel rows and legends. In dark, Ferry `#008300` is 3.4:1 on
   surface-2, but its *past-month* tint on Insights is essentially invisible.
   **Fix:** light-theme glyph variants one step darker (bus `#b87800`, walk
   `#128a5f`, run `#c94f7f`). Give dark mode its own lighter Ferry
   (`#35b04a`). Past-month bars use the same hue at 45 % opacity, not a
   darkened mix.
8. **Glyph spacing breaks on phone renders.** At 390@2x the text shows
   visible gaps inside words: "Ho tel Alexanderplatz", "pho tos from each
   visit", "Stand by quality", "Se ttings", "Over view" in the tab bar,
   "16 h 47 min". Desktop renders of the same strings are clean. The likely
   cause is that `body` sets `font-feature-settings: "cv11","ss01"`. Those
   are *Inter's* feature tags, but the font is Geist, whose `ss01` is a
   different alternate set. `tabular-nums` is also applied to whole rows,
   not just the numbers. **Fix:** remove the Inter-only features, scope
   `tabular-nums` to number spans, then re-shoot. If it persists on a real
   iPhone or Android, also check that the Geist subset loaded is the
   variable font. It is the single most "something's off" detail on the
   phone.
9. **Empty, error, and "connect Immich" all use the same dashed box.** The
   dashed border reads as a drop zone, and the 200 to 400 px boxes dominate
   short pages (Devices, Place → Photos, Timeline error). **Fix:** use the
   dashed box nowhere. An empty state is an icon, one line and one action,
   centred in the space, with no frame. Errors use a `Callout` (danger) with
   Retry. The Immich nudge is one muted line with a link inside the Photos
   header.
10. **The map controls mix three styles.** There is the stock MapLibre `+/−`
    group (desktop only), a custom fullscreen button, and the stock black
    `(i)` attribution disc. The disc is the darkest, most saturated element on
    every map, in both themes. The basemap shows bilingual Cyrillic labels
    ("Belarus / Беларусь"), and "Berlin" is set in heavy black. **Fix:** one
    control style (32 px surface buttons with a hairline, `shadow-pop`), stacked
    top-right. Make the attribution compact text-only, bottom-right, 11 px,
    muted. Use a Latin-only label layer. Reduce the city-label weight and
    saturation so routes win.
11. **Overlapping numbered markers.** When stops are close ("2·4" next to "3"
    on 28 Oct; 1, 2, 3, 4 in Helsinki on 4 Sep; 4, 5, 6 in Berlin on 30 Sep),
    the markers and badges overlap into an unreadable lump. **Fix:** cluster
    when the markers are under 36 px apart, showing one marker with "1–4" and
    zoom on click. Or fit the initial bounds to the *non-flight* part of the
    day when there's a flight.
12. **Tab bar (phone) has six items.** "Overview, Map, Timeline, Places,
    Insights, Settings" at 12 px means 65 px per item. The labels nearly touch
    the screen edges ("Overview" starts at x=4). Devices is in the desktop
    sidebar but not the tab bar. Settings is a tab, yet sign-out is also an
    icon in the top bar. **Fix:** five tabs (Timeline, Map, Places,
    Insights, More). Overview becomes the top of Timeline or Insights, or
    "More" holds Overview, Devices, Settings and Sign out. Keep 16 px side
    insets. Drop the top-bar sign-out icon, because a destructive action
    shouldn't be the only control in the header.
13. **Copy is written for the developer.** Examples are
    "Turned off for this server (MATKA_TRANSIT_FEEDS=off)", the 120-word AI
    privacy paragraph, "Quality counts only moving stretches (fixes ≤ 5 min
    apart at over 1 m/s…)", "calibrated on a OnePlus 13R (CPH2645)",
    "Signed in as Owner", "shown as Cycle", and "Unsave". **Fix:** one
    sentence per setting with a "Details" disclosure for the rest. Hide
    env-var names behind "Disabled by the server admin". Use "Remove from
    saved", and "Detected as cycling".

---

## Page by page

Checklist key, from DESIGN_REFERENCES section 5, in order:

- **Hierarchy and layout:** H1 one primary, H2 left edges, H3 spacing, H4
  type levels.
- **Type:** T1 weights and colours, T2 min size, T3 tabular nums, T4 no
  labels.
- **Icons and imagery:** I1 no emoji, I2 Lucide sizes and centring, I3 tile
  consistency, I4 photo scrim and covers.
- **Surfaces and colour:** S1 surface levels, S2 radii, S3 accent and colour
  use, S4 borders.
- **States:** St1 loading, St2 empty, St3 error and partial, St4 edge cases.
- **Accessibility and platform:** A1 contrast, A2 targets, A3 focus and hover,
  A4 safe area and row heights.

1 = pass, 0 = fail, – = not applicable.

### Overview (`/`)

| H1 | H2 | H3 | H4 | T1 | T2 | T3 | T4 | I1 | I2 | I3 | I4 | S1 | S2 | S3 | S4 | St1 | St2 | St3 | St4 | A1 | A2 | A3 | A4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | – | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 1 | 1 | 1 |

Score: 16 / 23 applicable. Loading and error were not observed: the page is server-rendered with no skeleton or error boundary.

- **Recent visits all use the same pin icon.** Eight identical
  `MapPin`-in-tile icons say nothing. Use `placeIconFor(kind, category)` as
  the timeline does (home, school, restaurant…), or drop the tile entirely.
- **Recent visits repeat the full date on every row** ("Wed, 28 Oct 2026 ·
  12:21" three times). Group by day with a sticky muted day label ("Today",
  "Yesterday", "Mon 26 Oct") and show only times in the rows.
- **The "Distance by month" chart spends 8 of 12 bars on nothing** (Nov–Jun
  are empty because the history starts in July). It has no values, so you
  can't read it: no y-axis, no label on the max or current bar. **Fix:** show
  months from the first data month (minimum 6). Label the current month's
  value above its bar ("1,529 km"). Make hover show the value.
- **Desktop chart card has about 60 px of dead space** under the axis
  because the row stretches to the "Most time spent" card's height. Either
  give the chart `flex-1` height, or don't stretch the grid row
  (`items-start`).
- **"Most time spent" shows `1,111 h`.** Write "46 days". The violet bars are
  decoration (see cross-cutting 6). Its "All places" link sits *inside* the
  card, while "Recent visits → Timeline" sits *outside* above its card. Pick
  one pattern: SectionHeader outside the card, everywhere.
- **"Open timeline" secondary button** under the subtitle (phone) floats
  alone and duplicates the Timeline tab. Remove it, or make the whole "Recent
  visits" header the link.
- **Phone: four stat cards take about 220 px for four numbers.** Use a single
  2×2 stat card with hairline dividers, label and value at 12/24, and 16 px
  padding.
- **Subtitle "Wed, 29 Jul 2026 – Wed, 28 Oct 2026"** is noisy. Use "Since 29
  July 2026 · 92 days".
- Good, keep: the muted unit after big numbers ("4,221 km"), tabular
  figures, and the row anatomy of the visit list (title, meta, trailing value,
  chevron).

### Timeline (`/timeline`, day views)

| H1 | H2 | H3 | H4 | T1 | T2 | T3 | T4 | I1 | I2 | I3 | I4 | S1 | S2 | S3 | S4 | St1 | St2 | St3 | St4 | A1 | A2 | A3 | A4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 1 | 1 | 1 | 1 | 0 | 1 | 1 | 0 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 1 | 0 | 1 | 1 | 1 |

Score: 15 / 24.

- **Desktop wastes the screen on the product's main view.** The 688 px
  column, with a 340 px map strip on top and 264 px of empty canvas to its
  left, is the phone layout centred. **Fix (the biggest single upgrade in the
  app):** at ≥1200 px use a split view. Put the day header and list in a
  420–480 px left pane that scrolls, and the map in the rest, full height and
  sticky. Selection syncs both ways, as it already does.
- **The rail glyph is centred on the card, not on the title.** When a card
  grows (photos, the "Right place?" row, a wrapped long name) the glyph slides
  down. On 4 Sep (desktop) the Home glyph is 47 px below its title, and the
  uncertain visit's glyph is 73 px below. **Fix:** `items-start` on the row,
  and give the glyph the card's `padding-top` offset so its centre sits on
  the first line.
- **The date control** is native `<input type=date>` showing `09/04/2026`,
  next to the h1 "Friday 4 September" and a separate line "2026". **Fix:**
  h1 "Friday 4 September 2026" on one line (or the year muted inline). Then
  the `‹ [📅 Today] ›` group: a styled button opening a calendar popover
  that greys out days without data. On desktop, the control group sits on
  the h1 baseline, right-aligned. Today it is 20 px above that baseline.
- **"Fix trip" on every travel row** is five to eight identical ghost buttons
  per day. That is noise, and it makes travel rows as loud as visits. **Fix:**
  show it on row hover or selection on desktop. On phone, make the whole row
  tappable to open the editor with a trailing `ChevronRight` or a `⋯`. On the
  Flight row (phone, 30 Sep) the button wraps onto its own line.
- **Travel rows are not lighter than visit rows.** "Drive" is 14/500 primary
  text, the same as the visit titles. **Fix:** make the travel label `text-meta`
  in secondary ("Drive · 34.3 km · 53 min" as one muted line), with only the
  glyph coloured. Remove the 28 px tile behind the glyph (the reference
  anatomy says travel = 20 px glyph, no tile). In light mode the
  `surface-2` disc behind it is invisible anyway.
- **Visit cards: every stop is a bordered card.** Fifteen bordered boxes per
  day make a "list of forms". **Fix:** borderless rows on the page
  background, with a hover or selected tint (`surface-2`, radius 12). Keep
  the card only for the selected row.
- **Overnight visits read wrong.** "16:58 – 05:51" and "Kotikatu 12, 15 h 22
  min" at the top of each day: make it "Since 16:58 yesterday" (or "← 16:58")
  for an item that started on the previous day, and "until 09:45 tomorrow" at
  the end.
- **Summary chips row overflows** on phone with no affordance. The third chip
  is cut at "783" on 4 Sep and 30 Sep. **Fix:** wrap to two lines, or fade the
  right edge with a 24 px mask. Better, drop the chips and use a single
  stacked mode bar with a legend below, which is the same component as
  Insights "Distance by mode".
- **Distances are inconsistent within one day.** The chip says "1,137 km" but
  the Flight row says "1136.5 km" (a decimal over 100 km, and no grouping).
  Over 100 km, round to an integer and group.
- **The "Right place?" block (uncertain visit) is cramped and unclear.**
  - The title shows "Unknown place" with a bare violet "?" glued on, so the
    guess isn't shown.
  - There's a divider, then "Right place? [✓ Yes]", then on phone a
    wrapped "Pick another ▾" indented 12 px off the "Right place?" text
    start.
  - **Fix:** title "Café Maiasmokk?" (the top candidate), and on the meta
    line "Or: Kehrwieder · Pikk 16". Then one tonal button row, `[✓ Yes]
    [Something else ▾]`, left-aligned with the title. No divider. The "?"
    goes in muted text, not the accent.
- **Missing travel (phone) is broken.** In the warn-tinted dashed card, the
  text column is squeezed to about 110 px by the "+ Add travel" button. That
  wraps "Missing travel · 79.4 km · 2 h 8 / min / No location / recorded ·
  / 17:29 – 19:38" over six lines. **Fix:**
  - On phone, stack: the title line, then the meta line, then a full-width
    (or left) `Add travel` button below.
  - Use a solid hairline in `warn/30` instead of dashed.
  - Drop the tinted 28 px glyph disc and use a 16 px glyph inline.
  - Desktop is fine.
- **Transit legs.** "Change · 30 min" appears before the first ride (an
  ordering bug when the change spans the whole trip). The line badges ("Tram
  4" green, "Bus 2/49" blue) are the brightest, most saturated objects on the
  page. **Fix:** keep the HSL colours but use the badge at 12/16 with a 4 px
  radius, and put the stop path in `text-muted` on the same line. A wait
  should only appear *between* two legs.
- **Photo strip:** good. Square thumbnails, 6 across, with "+8". Keep it.
  Align its left edge with the card's text (it is).
- **Skeleton:** it has the right shape for the list, but **no map skeleton**,
  so the list jumps down 340 px when the map arrives. The summary chips are
  already filled in while the list is skeletal (different requests). **Fix:**
  add a map-sized skeleton block. Render chips and list from the same
  loading gate, or skeleton the chips too.
- **Error state:** "Couldn't load this day / Something went wrong talking to
  the server" sits in a dashed box under fully rendered summary chips. That
  is a contradictory page (the day "loaded" and "didn't"). **Fix:** a danger
  `Callout` in place of the map and list ("Couldn't load Friday 4 September.
  [Retry]"). Hide the chips on error. The Retry should be the SWR `mutate()`,
  not `location.reload()`.
- **Empty day:** "Nothing recorded… Pick another day with the arrows or the
  date." This is instructions, not an action. **Fix:** a button, "Go to
  nearest day with data (21 Jul)".
- **Trip editor (sheet on phone, dialog on desktop):** good bones. The 5×2
  mode grid, a clear selected state and Cancel/Save are good.
  - It lacks context: the map behind is blurred and doesn't show *which*
    route. Show a small static route preview at the top of the sheet.
  - The subtitle "shown as Cycle" is engineer-speak; use "Detected: cycling".
  - The phone sheet has no drag handle. Add a 32×4 handle and use a 16 px
    top radius.
  - The selected tile pairs a violet border with the mode-coloured glyph.
    Fine, keep.
- **Photo viewer:**
  - **Counter:** "1 / 6 (of 14)" is confusing. Load all 14, or say "1 of 14".
  - **Backdrop:** at 94 %, the page's text is still legible behind it on
    desktop. Make it 100 %, or blur it.
  - **Navigation:** the disabled "previous" button is a ghost square that
    looks broken.
  - **Missing context:** there is no time or place caption and no filmstrip.
    Add "12:40 · Kotikatu 12" under the counter and a 48 px thumbnail rail
    at the bottom on desktop. Hide the disabled arrow instead of dimming it.
- Good, keep: the dashed mode-coloured rail segments, the numbered stops
  matching the map, the photo strip, the long-name wrapping (title wraps,
  duration stays top-right), the Add-travel and Fix-trip sheets.

### Map (`/map`)

| H1 | H2 | H3 | H4 | T1 | T2 | T3 | T4 | I1 | I2 | I3 | I4 | S1 | S2 | S3 | S4 | St1 | St2 | St3 | St4 | A1 | A2 | A3 | A4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 1 | – | 1 | 1 | – | 1 | 1 | 1 | – | – | 1 | 0 | 0 | 1 | ? | ? | ? | 0 | 0 | 1 | 1 | 1 |

- **"Heatmap" and "Routes" look like two pressed buttons** (both
  violet-tinted). Are they toggles or a segmented choice? If both can be on,
  use checkbox-style toggles with a check. If exclusive, use `Segmented`.
- **The legend omits Flight** although a red flight line crosses the map. It
  lists Walk, Cycle, Drive, Train and Bus, but the data shows Flight and
  Ferry. Generate the legend from the modes present.
- **Phone:** the control group and "Save a place" are two floating panels of
  different widths stacked top-left. The `+/−` sits top-right. No legend on
  phone. **Fix:** one top bar (a layer toggle on the left, "Save place" as an
  icon button on the right), with the legend as a collapsible chip at the
  bottom-left above the tab bar.
- **No date-range filter.** A whole-history map with no "Last 30 days / This
  year / All" is the first thing a reviewer looks for. Add a `Segmented` or a
  range button in the top bar.
- The heatmap blobs (orange-white) clash with the mode-coloured lines.
  Pick heatmap *or* routes as the default, not both.

### Places (`/places`)

| H1 | H2 | H3 | H4 | T1 | T2 | T3 | T4 | I1 | I2 | I3 | I4 | S1 | S2 | S3 | S4 | St1 | St2 | St3 | St4 | A1 | A2 | A3 | A4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 1 | 1 | 0 | 0 | ? | 1 | ? | 0 | 1 | 1 | 1 | 0 |

- **Phone: 47 cards at about 230 px each means a 12,600 px page.** Each card
  is an icon, two lines, a divider, then "N visits ··· N h". **Fix:** a
  single `CardList` with 64 px two-line rows: a 32 px tile, the name, "Cafe ·
  Helsinki · 6 visits" muted, and the trailing total time. That is about
  3,200 px, and it scans.
- **Desktop: a 3-column wall of identical cards.** There's no sort (most
  time, most visits, recent, A–Z) and no filter by category or city. World
  has a sort `Segmented`, so reuse it here.
- **13 of 44 "Everywhere else" are "Unknown place / Not named yet"**,
  scattered through the grid with identical pin icons. **Fix:** move them
  into a collapsed group at the end: "13 unnamed places · Name them". Or
  show their street address (it exists for the candidate) muted, instead of
  "Unknown place".
- **The subtitle promises "with photos from each visit"** but the page has
  no photos. Either show a cover thumbnail per place (Immich, with a map tile
  as fallback) or change the copy.
- **Saved kinds in accent** ("School · 250 m" violet). See cross-cutting 6.
  Also "250 m" (the snap radius) is an internal setting and doesn't belong in
  a list row.
- Empty search state ("Nothing matches 'zzzz-nothing'") is fine apart from
  the dashed box. The search field's `/` shortcut hint is a nice touch, so
  keep it.

### Place (`/places/[id]`)

| H1 | H2 | H3 | H4 | T1 | T2 | T3 | T4 | I1 | I2 | I3 | I4 | S1 | S2 | S3 | S4 | St1 | St2 | St3 | St4 | A1 | A2 | A3 | A4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 1 | 1 | 0 | 1 | ? | 0 | ? | 0 | 1 | 1 | 1 | 1 |

- **No map on a place page.** That's the first thing a place needs: where it
  is, its snap radius, and the visit points. **Fix:** a 240 px (phone) or
  320 px (desktop) map header with the radius circle, which is also where
  "Size S/M/L/XL" becomes visible and meaningful.
- **The edit form is the page.** "Saved place" (name, kind, size, Save,
  Unsave) takes 470 px above the photos and visits, every time you open a
  place. **Fix:** a read view by default. An "Edit" secondary button in the
  header opens the same form in a sheet or dialog. For unsaved places, a
  single "Save place" button.
- **Phone: the stat "291 h 30 …" is truncated** and "Last visit Wed, 28 Oct
  2026" takes a full-width stat card. **Fix:** a "12 d" format (see
  cross-cutting 2). "Last visit" belongs in the subtitle ("Last visited
  today"), not a big number.
- **78 visits rendered in one list** (5,900 px on desktop). Group them by
  month with a header and show the latest 10 with "Show all 78". Or show a
  calendar heatmap of visits per day, which is more beautiful and more
  useful.
- **Header:** the tile is 48 px, but the tile plus a two-line title on
  phone wraps the title next to the tile, and the meta line sits on a third
  line. On phone put the tile above, or drop it. The badge "School · 250 m"
  (accent) and the meta "University · Espoo, Finland" are two styles for
  one line.
- **Photos empty** is a 190 px dashed box saying "Connect Immich in Settings".
  Reduce it to one muted line (see cross-cutting 9).

### Insights: Travel (`/insights`)

| H1 | H2 | H3 | H4 | T1 | T2 | T3 | T4 | I1 | I2 | I3 | I4 | S1 | S2 | S3 | S4 | St1 | St2 | St3 | St4 | A1 | A2 | A3 | A4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 0 | 1 | 1 | 0 | 1 | 1 | 1 | – | 0 | 1 | 0 | 0 | ? | 1 | ? | 1 | 0 | 1 | 1 | 1 |

- **"October 2026" appears twice** (the section label on the left, and the
  native `<select>` showing "October 2026" on the right). **Fix:** one styled
  month button between the arrows (`‹ October 2026 ›`) opening a month grid,
  and no separate label.
- **"Phone and recording" does not belong in Insights.** Battery %/h, p90
  accuracy, "Fixes/h overall", "Standby quality", and three paragraphs of
  methodology fill half the page. It is diagnostics. **Fix:** move it to
  Devices → *this phone* → "Recording quality". Insights keeps
  travel and places only.
- **Recording-quality key/values** (when they move) are 4 columns of
  label-left and value-right pairs 200 px apart, which is hard to scan.
  Use a compact table: presets as columns, metrics as rows.
- **"Saved places" puts bordered cards inside a card** (4 surface levels).
  Use `CardList` rows. "116 h" for School beside "20 nights · 309 h" for Home
  is two different metrics in one column.
- **The small multiples show May and June** (empty, since data starts in
  July). Start at the first data month.
- **Dark mode:** the past-month bars are darkened mixes (maroon, brown,
  forest), muddy against `#14151d`. The Ferry Sept bar and Ferry glyph are
  nearly invisible. Use the hue at about 45 % opacity, and a dark-theme
  Ferry colour.
- **Mode palette:** Flight `#e34948` and Run `#e87ba4` are both red-pink.
  Train and Transit are the accent violet. Ferry `#008300` and Walk
  `#1baf7a` are both green. Five of nine modes collide pairwise. Rebuild the
  categorical palette with the dataviz validator. Ferry teal-blue, Train
  slate-violet away from the accent, and Flight plum are suggestions.
- **The footnote says "Tap a bar to open that month"** on desktop. Write
  "Select".
- Good, keep: the stacked "Distance by mode" bar with an inline legend, and
  current-month emphasis in the small multiples.

### Insights: Trips (`/insights/trips`) and Trip (`/insights/trips/[id]`)

| | H1 | H2 | H3 | H4 | T1 | T2 | T3 | T4 | I1 | I2 | I3 | I4 | S1 | S2 | S3 | S4 | St1 | St2 | St3 | St4 | A1 | A2 | A3 | A4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Trips | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 1 | 1 | 1 | 1 | ? | ? | ? | 0 | 0 | 1 | 1 | 1 |
| Trip | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 1 | 1 | 1 | 0 | ? | – | ? | 0 | 1 | 1 | 1 | 1 |

- **Trips are the emotional core and they look like invoices.** Each card is
  a city name, dates, km and three chips. The reference (Polarsteps) is
  photo- or map-led covers. **Fix:** a 16:9 cover on each trip card (the best
  Immich photo of the trip, falling back to a static route map) with a bottom
  scrim carrying "Berlin" and "30 Sep – 4 Oct · 5 days · 2,403 km". Mode
  chips are optional below.
- **Trip detail has no map.** Add a route map hero (all days' tracks, the
  numbered overnight stays) before the stats.
- **Trip detail stats** ("Days 5", "Nights away 4") repeat the subtitle.
  Keep Distance and Time on the move. Fold days and nights into the subtitle.
- **"Cities visited"** is a two-row card stretched to match the 260 px "How
  you travelled" card, which leaves 100 px of void. Don't stretch grid rows.
  Also "Schönefeld" is the airport: hide cities under 4 h when the visit was
  an aerodrome.
- **Day by day rows:** the "DAY 1" tile is uppercase 12 px in a grey box, the
  only uppercase eyebrow in the app. On phone it is vertically centred
  against a three-line block while the title is top-aligned. Use a 32 px
  number tile aligned to the first line, or drop the tile and make the title
  "Day 1 · Wednesday 30 September".
- **The phone Trips cards change height** depending on whether the country
  wraps ("Germany" on its own line for Berlin, inline for the others). Put
  the country in the subtitle ("30 Sep – 4 Oct · Germany").
- **"Home: Kotikatu 12 and Mallitie 7 (saved places), where you spent
  83 nights."** is an odd preface line with mixed emphasis. Move it into a
  muted footnote under the list, or an info tooltip.

### Insights: World and City

| | H1 | H2 | H3 | H4 | T1 | T2 | T3 | T4 | I1 | I2 | I3 | I4 | S1 | S2 | S3 | S4 | St1 | St2 | St3 | St4 | A1 | A2 | A3 | A4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| World | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | – | 1 | 1 | 1 | 1 | ? | ? | ? | 0 | 1 | 1 | 1 | 1 |
| City | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | – | 1 | 1 | 0 | 0 | ? | ? | ? | 0 | 1 | 1 | 1 | 1 |

- **"World" has no world map.** The page is three stat tiles and a list.
  **Fix:** a choropleth or scratch map hero (visited countries filled in
  accent at 30 %, others neutral), with city dots sized by time. This is the
  screen people screenshot and share.
- **Every country row has the same `Flag` outline icon.** Use a 2-letter ISO
  code tile ("FI", "DE", "EE") in a neutral square, or a small SVG flag set.
  Emoji flags are ruled out by the no-emoji rule. Cities all share
  `Building2`. Drop the tile and let the text start at the inset.
- **Three segmented controls stacked** (Travel/Trips/World, then
  Countries/Cities, then Sort by Visits/Places/Time/Recent/A–Z). That's
  control soup. **Fix:** make Countries/Cities a toggle in the list header,
  and Sort a compact dropdown ("Sort: Visits ▾").
- **The City page** has no map either. It reuses the Places 3-column cards,
  with the accent kind badges. Add a city map with its places as pins, and
  use list rows for the places.
- "16 places have no address yet." is a dangling footnote. Make it an action
  ("Look up addresses") or drop it.

### Devices (`/devices`) and Settings (`/settings`)

| | H1 | H2 | H3 | H4 | T1 | T2 | T3 | T4 | I1 | I2 | I3 | I4 | S1 | S2 | S3 | S4 | St1 | St2 | St3 | St4 | A1 | A2 | A3 | A4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Devices | 1 | 1 | 1 | 1 | 1 | 1 | – | 1 | 1 | 1 | 1 | – | 1 | 1 | 1 | 1 | ? | 1 | ? | ? | 1 | 1 | 1 | 1 |
| Settings | 1 | 1 | 1 | 0 | 1 | 1 | – | 1 | 1 | 1 | 1 | – | 1 | 1 | 1 | 0 | – | – | ? | – | 1 | 1 | 1 | 1 |

- **Information architecture.** Devices is a top-level sidebar item *and* a
  sub-page of Settings (back link "‹ Settings", plus a link card inside
  Settings). It is missing from the phone tab bar. Pick one: Devices under
  Settings (and out of the sidebar), or top-level everywhere.
- **Four separate Save buttons in Settings** (Time zone, Transport, Place
  names, Immich "Connect"). Toggles that need a Save are a trap. **Fix:**
  toggles and the time zone save immediately with a toast, and only the
  Immich form keeps an explicit "Connect".
- **Public transport: a toggle that is ON but disabled** (washed violet),
  plus a disabled Save, plus "Turned off for this server
  (MATKA_TRANSIT_FEEDS=off)". Show the toggle *off* and disabled with
  "Not available on this server".
- **Card headers.** Every section has a 36 px icon tile, a title, a
  divider, and a body. The "Time zone" card then repeats "Time zone" as the
  field label. **Fix:** an inset-grouped settings list: section titles outside
  the card (13/500 muted), and rows inside with a label left and a control
  right. Remove the per-section icon tiles.
- **The AI paragraph is 120 words** in 13 px. Use one sentence ("Claude
  guesses between nearby venues. Only names and visit patterns are sent.")
  plus "What is sent ▸" disclosure.
- **Google import instructions** are a menu-path paragraph. Use a numbered
  3-step list.
- "You are signed in on 30 browsers" (a harness artefact, but shows the
  copy needs "30 other browsers" plus a list).
- **Devices:** "Pair a device" has the input and a primary "Pair" button,
  which is fine. The empty "No devices paired yet" dashed box under it
  repeats the same instruction. Hide the empty list section entirely when
  there are no devices.

### A brand-new user (empty database, `review/empty/`)

- **The empty states don't agree on the next step.**
  - Overview and Places offer a solid "Pair a device".
  - Timeline only says "Pair your phone under Devices" with no button.
  - Trips and World have no action.
  - None offers **Import Google Timeline**, which is the most valuable
    first-run action for someone switching from Google.
  - **Fix:** one onboarding empty state, used on Overview and Timeline:
    "Pair your phone" (primary) and "Import from Google Timeline"
    (secondary).
- **The timeline with no data** shows a raw native `mm/dd/yyyy` placeholder
  and disabled arrows above the empty state. Hide the date controls when
  there is no history.
- **Insights → Travel:** the "Phone and recording" section header renders
  with nothing under it, an orphan heading. Hide sections with no content.
- **Insights → World:** three stat tiles reading `0`, `0`, `0`, then the
  Countries/Cities toggle and a five-way Sort control, all above "No cities
  yet". Controls for an empty list are noise, so show only the empty state.
- **Map with no data** shows Finland with the Heatmap/Routes toggles and no
  message. Add a floating card: "Nothing to map yet · Pair a device".

### Auth key, Pair, 404

- **Sign-in:** clean.
  - The card's vertical centre sits about 60 px below the screen centre on
    phone (a lot of air above the logo). Centre it optically: 40 % from the
    top.
  - The placeholder is in monospace ("Paste your login key") while the
    typed key will be monospace too. Fine. But the input doesn't turn red on
    error. Add `aria-invalid` styling (danger outline) and focus it.
- **Pair landing:** the logo sits outside the card while the content sits
  inside, with 13 px body text over three lines in a 448 px card. Put the
  logo inside the card, as on sign-in, so the two auth surfaces match.
- **404:** good.
  - The "ERROR 404" eyebrow is the only spaced-caps label besides "DAY 1".
    Drop it, or make it muted 13 px.
  - It has two buttons, one solid. Fine.
  - In dark, the solid primary is light violet with dark text, which
    contrasts fine.

---

## What is genuinely good (keep)

- Lucide everywhere, consistent 16/20 sizes, and no emoji.
- Tokens. Light and dark both hold together, and the muted text passes
  4.5:1 on every surface (5.0–5.2:1 measured on surface-2).
- The trip editor and Add-travel sheet/dialog. The mode grid is the best
  component in the app.
- The timeline's rail, with dashed mode-coloured segments and numbered stops
  matching the map.
- Photo strips ("+8" tile) and the long-name wrapping behaviour.
- Muted units after big numbers, and tabular figures throughout.
- The sign-in screen and the 404.

---

## Top 15 fixes, ranked by visual impact

1. **[L] Timeline desktop split view.** A list pane of 420–480 px on the
   left and a full-height sticky map on the right at ≥1200 px. It is the
   main screen, and today it is the phone layout centred in empty canvas.
2. **[M] One left edge for every page.** Anchor the content column 40 px
   from the sidebar on every route (only the max width varies), and align the
   sidebar brand with the h1 row. This kills the sideways jump between tabs.
3. **[L] Maps where the content is a place.** Add a map header to Place,
   Trip, City and World (a choropleth of visited countries). Four pages that
   are about geography currently show none.
4. **[M] Places as a list, not a card wall.** Use 64 px `CardList` rows,
   sort by time/visits/recent/A–Z, and collapse unnamed places into "13
   unnamed places · Name them". The phone page goes from 12,600 to about
   3,200 px.
5. **[M] Replace native controls.** A styled date button with a calendar
   popover (days with data marked) on Timeline, a month picker on Insights,
   and a searchable time-zone select. Fixes the mm/dd/yyyy too.
6. **[M] Trip cards with covers.** A 16:9 Immich photo or route-map
   fallback with a scrim title, on Trips and the Overview. This is the
   difference between "dashboard" and "travel diary".
7. **[S] Mode palette and accent.**
   - Move Transit/Train off the accent violet and Flight off the danger red.
   - Separate Ferry from Walk.
   - Darken the light-theme Bus, Walk and Run glyphs to 3:1.
   - Give past-month bars an opacity tint, and dark-theme its Ferry.
   - Make saved-kind badges neutral.
8. **[S] Fix the phone glyph-spacing bug.** Remove the Inter-only
   `cv11`/`ss01` feature settings on Geist and scope `tabular-nums` to
   number spans. "Ho tel", "pho tos" and "Se ttings" make the phone look
   broken.
9. **[M] Quieter travel rows.** Show "Fix trip" on hover or selection only (on
   phone, the row opens the editor). Make the label a single muted meta line,
   use a 20 px glyph with no disc, and render visits as borderless rows
   instead of bordered cards.
10. **[S] Rail glyph aligned to the first line.** `items-start` plus a top
    offset equal to the card padding, so glyphs don't drift down beside
    cards with photos or questions.
11. **[S] One duration and date formatter.** Use `46 d`, `12 d 3 h` and
    `6 h 34 min` with thousands grouped. Use relative recent dates, no year
    within the current year, and `Sep` everywhere. Round flight distances to
    integers.
12. **[M] Move "Phone and recording" out of Insights** into Devices →
    phone, and rewrite all methodology footnotes as one sentence plus
    "Details". Remove env-var names from the UI.
13. **[S] Retire the dashed box.**
    - Empty states become a frameless icon, a line and an action.
    - Errors become a danger Callout with a real retry.
    - The Immich nudge becomes one line.
    - The timeline error hides the summary chips.
    - The skeleton includes the map.
    - A new user gets one onboarding state ("Pair your phone", plus "Import
      from Google Timeline") and no zero-stat tiles or orphan headings.
14. **[S] Phone Missing-travel and "Right place?" layout.**
    - Missing travel stacks title, meta and button.
    - "Right place?" shows the guess as the title ("Café Maiasmokk?") and
      puts `[Yes] [Something else ▾]` on one line, aligned to the title.
15. **[M] Settings as an inset-grouped list.**
    - Auto-save toggles and drop the four Save buttons.
    - Remove the per-card icon headers.
    - Disabled toggles show off.
    - Resolve whether Devices lives in Settings or at the top level, and put
      five items in the phone tab bar.

---

## Response (round 2 implementation)

After screenshots are in `/tmp/shots/redesign/r2/web/after/` (and `after/empty/`). The changelog is in `docs/REDESIGN.md` under "Round 2 (web)".

1. **Timeline split view: done.** From 1200 px the list is 480 px on the left and the map is full height and sticky on the right. Selection still syncs both ways, and phones keep the stacked layout.
2. **One left edge: done.**
   - Every page is left-anchored 40 px from the sidebar.
   - The h1 row and the sidebar brand are both at y=40.
3. **Maps where the content is a place: done.**
   - The place page has a pin and its size circle.
   - The trip page has routes and numbered overnight stays.
   - The city page shows its places.
   - World fills the visited countries and sizes city dots by time.
   - All of these load lazily.
4. **Places as a list: done.**
   - The list uses 64 px rows, sorts by most time, visits, recent or A–Z, and collapses "Unnamed places" at the end. The phone page is now 5,300 px tall.
   - Not done: a category or city filter.
5. **Replace native controls: done.**
   - The calendar popover marks days with data (Monday first, "28 Oct 2026").
   - The month grid picker sits between arrows.
   - The time zone is a searchable combobox.
   - All three are keyboard-complete and labelled for screen readers.
6. **Trip cards with covers: done.** Cards use the Immich photo, or else a server-drawn route sketch in mode colours, with a scrim title and a one-line subtitle. They appear on Trips and the Overview.
7. **Mode palette and accent: done.**
   - Train/Metro moved to a slate off the accent, Flight to a plum off danger, and Ferry to a teal apart from Walk.
   - Every mark is at least 3:1 on every surface in both themes.
   - Past-month bars use the same hue at 45 % opacity.
   - Kind badges and the ranking bars are neutral.
   - Checked with the dataviz validator maths. Remaining close colour-blind pairs (cycle/bus, cycle/run) always carry their glyph and label. See `palette.md`.
8. **Phone glyph-spacing bug: done.** It wasn't caused by `cv11`/`ss01`, though those are removed too. Chrome on Linux at 2x was rounding glyph advances, and `text-rendering: geometricPrecision` fixes it (checked by A/B render and the phone shots).
9. **Quieter travel rows: done.**
   - Each travel row is one muted line with a 20 px glyph and no disc.
   - "Fix trip" shows on hover or focus on desktop, and as ⋯ on phones.
   - Visits are borderless rows and get a card only when selected.
10. **Rail glyph on the first line: done.** The rows are top-aligned and the glyph is offset by the card's padding, so it stays put next to photos and questions.
11. **One duration and date formatter: done.**
    - Durations read `46 d`, `12 d 3 h` and `6 h 34 min`. Distances read `1,137 km`.
    - Recent dates are relative, the year is dropped inside the current year, and the abbreviation is always `Sep`.
    - All of this lives in `lib/format.ts`, with tests.
12. **Move "Phone and recording" out of Insights: done.**
    - It is now Devices → "Recording quality".
    - Metric names are plain ("9 in 10 fixes within"), presets are table columns, and each explanation is one sentence plus "Details".
    - No env var names appear anywhere.
13. **Retire the dashed box: done.**
    - Empty states are frameless, and errors are Callouts with a real Retry.
    - The Immich nudge is one line.
    - The timeline error hides the chips, and the skeleton includes the map and chips.
    - New users get "Pair your phone" plus "Import from Google Timeline", with no zero tiles or orphan headings.
14. **Missing travel and "Right place?": done.**
    - Missing travel stacks on phones and has a solid warn hairline.
    - "Right place?" shows the guess as the title ("Café Maiasmokk?"), puts "Or: …" in the meta line, and puts `[Yes] [Something else ▾]` aligned with the title.
15. **Settings as an inset-grouped list: done.**
    - Group titles sit outside the cards, the icon tiles are gone, and toggles and the time zone save immediately.
    - A disabled toggle shows off, with "Not available on this server".
    - Devices is top level, and the phone tab bar has five items (Timeline, Map, Places, Insights, More).

**Not done from the page notes:**
- The trip editor still has no route preview.
- There is no calendar heatmap of visits on the place page.
- Stops that are close together are clustered ("1–4", zoom on click), but the first view of a flight day doesn't zoom in to the non-flight part.
