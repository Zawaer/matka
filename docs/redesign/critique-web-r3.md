# Web critique, round 3

An independent design review of the web app after round 2. The reviewer did
not build it. Every page was shot at **390 px (2x), 768 px (tablet, 2x, touch)
and 1440 px**, in light and dark, against the seeded demo history (about 3
months, 3 trips). The mocked states (`--extras`) and a brand-new user on an
empty database were shot too. Hover and keyboard-focus states were captured
on desktop.

Screenshots: `/tmp/shots/redesign/r3/web/review/` (the empty user is in
`review/empty/`). Crops used for measurements were made from those files.
The judgement below was formed from the screenshots first. The round 2
critique was read only afterwards, for the regression check in section 4.

**Harness change** (`web/scripts/screens.mjs`, no app code touched):

- `--sizes t` adds a 768×1024 tablet viewport (2x, touch).
- `--interactions` adds hover states (`i-hover-*`): nav, place row, travel
  row, trip card and chart.
- It also adds keyboard-focus states (`i-focus-*`, Tab pressed n times), the
  date picker, the Places sort and the phone More menu.

Measurements are in CSS px. Phone shots are at 2x, so pixel positions in the
PNGs were halved.

---

## 1. Verdict

Round 2 fixed the structure. Pages share one left edge, the timeline is a
real split view on desktop, maps appear wherever the content is a place, lists
replaced the card wall, and the copy now sounds like a product.

What now holds it back is **finish and robustness**:

- **One layout break per breakpoint.** The phone Overview runs off the right
  edge. At tablet width the Overview chart draws over the next card, and
  trip-detail rows wrap one word per line.
- **The glyph-spacing bug is back** inside every button, input and select.
- **The basemap is untamed in several ways.** There are empty road-shield
  boxes, Polish voivodeship labels, a dark style that switches to ALL CAPS,
  and markers sitting under the map controls.
- **Lots of small inconsistencies:**
  - three content widths
  - two segmented-control styles
  - two disclosure markers
  - a 4 px label indent on some pages and not others
  - "Pair your phone" vs "Pair a device"

None of these is hard to fix. Together they still make it read as
"almost there" rather than shipped.

**Polish score: 6 / 10.** It was roughly 4.5 at round 2. It reaches 8 once
the top 8 below are done.

---

## 2. Cross-cutting problems

1. **Glyph spacing in form controls (regression of the r2 fix).**
   - `body` has `text-rendering: geometricPrecision`. Chrome's UA stylesheet
     resets `button`, `input`, `select` and `textarea` to `auto`. A probe
     confirms `button: auto` and `body: geometricPrecision`.
   - Every control label still shows broken words:
     - "Europ e/Helsinki" in the Settings time zone
     - "zzzz-no thing" in the Places search
     - "Mo re" in the tab bar (the More item is a button)
     - "Go to the nearest day" and "Sign out everywhere else"
   - **Fix [S]:** add `button, input, select, textarea { font: inherit;
     text-rendering: inherit; }` in `globals.css`.
2. **Three content widths on desktop.**
   - The left edge is now constant at x=264. The right edge is 952 on
     Devices and Settings, 1208 on Overview and Place, 1330 on Places, and
     1336 on Insights.
   - Going from Overview to Insights, the stat strip grows by 128 px.
   - **Fix [S]:** use two widths only. Reading pages (Settings, Devices)
     get 688. Everything else gets 1072.
3. **Basemap not fully tamed** (`tameBasemap`):
   - **Road shields render as empty rectangles** drawn over the road name
     ("Länsi[▭]väylä") on every street-zoom map: the Place page, the City
     page and the timeline at street zoom. Hide the `*shield*` / `road_shield`
     symbol layers, or give them their sprite.
   - **Admin-1 labels** are shown at country zoom: "WARMIAN-MASURIAN
     VOIVODESHIP", "PSKOV OBLAST", "HRODNA REGION". They are italic or caps,
     and they are the loudest text on the Map, the trip and the day map.
     Hide `place=state|province` below z7.
   - **Water labels** are blue italic letter-spaced text ("Mågsholmssundet",
     "Kallviksundet", "Tarvo salmi"). They collide with the day markers on
     the Tallinn day. Hide straits and bays (`water_name` for non-sea/ocean).
   - **The dark style is a different basemap language.** City and country
     labels are ALL CAPS (`STOCKHOLM`, `HELSIN…`), roads are darker than land
     on the phone day map, and water is barely separable. Light uses mixed
     case. Apply the same label filter and case to both, and lift water to
     about `surface-3` in dark.
   - **The attribution** sits over map labels on phone ("Germany", "Vienna"
     and "FOLTSHOLMEN" show through it). Raise its opacity to about 90%, or
     move it under the map on phone-sized embeds.
4. **Map fit ignores the chrome.**
   - The desktop day map fits its markers flush to the edges. The "1–2" stop
     marker on 30 Sep sits under the full-screen button at (1380, 100), and
     the Berlin end on `/map` sits under the legend strip.
   - World cuts off northern Finland, because it fits to cities and not to
     the filled countries.
   - **Fix [S]:** `fitBounds` padding of `{top: 56, right: 56, bottom: 48 +
     legend height, left: 24}`. Fit World to the union of the country
     polygons.
5. **Markers cover the labels they refer to.** On the day maps the stop
   marker hides "Berlin", "Tallinn" and "Helsinki". Use a smaller stop pin
   (24 px instead of 32), offset the count badge outward, or drop the city
   label layer's priority under the markers (`symbol-sort-key`).
6. **Two segmented-control styles on one surface.**
   - Map, Routes/Heatmap: the selected item gets a checkmark and a grey fill.
   - 30 days/Year/All, right next to it: the selected item is a white raised
     pill.
   - Insights tabs and the Countries/Cities toggle use the white pill.
   - In dark, the selected pill is *darker* than the track, so it reads as
     pressed in, not selected.
   - **Fix:** one `Segmented`. In dark, the selected item is `surface-3`
     with a hairline. Drop the checkmark.
7. **Stat strips with an orphan tile on phone.**
   - Three-stat strips (Insights Travel, World, City) lay out 2+1, so the
     third tile spans the full width with a lone number ("Places 31" or
     "Journeys 94" in a 360 px box).
   - **Fix:** use 3 columns at ≥360 px with the label at 12 px, or a
     2-column strip with the third stat folded into the subtitle.
8. **Label indent is inconsistent.**
   - Group labels sit 4 px inside the card edge on Overview ("Today",
     "Yesterday", x=268 vs 264) and Settings ("General", "Timeline").
   - The Place page's "October 2026" sits flush at 264.
   - "Show all 73 visits" is at 268 because of the link's own padding.
   - **Fix:** pick flush (264) everywhere. The 4 px indent is an iOS idiom
     that doesn't belong with a sidebar layout.
9. **Disclosure markers differ.** Settings uses a Lucide chevron for "What
   is sent" and the native `▶` triangle for "What happens to the file".
   Devices uses a chevron. **Fix:** hide the `summary` marker
   (`list-style: none` and `::-webkit-details-marker`) and use the chevron
   everywhere.
10. **Badges and chips that look like buttons.**
    - The per-day mode chips on Trip detail ("✈ 1,137 km") have the same
      bordered pill as the timeline summary chips and the same 1 px border as
      buttons, but they do nothing.
    - **Fix:** turn non-interactive chips into borderless `surface-2`
      tokens, or plain "✈ 1,137 km · 🚗 53.9 km" meta text with glyphs.
11. **Accent used as data.**
    - World fills visited countries in accent violet.
    - City and World dots, the trip-sketch start/end dots and the
      overnight-stay "1" marker are all accent.
    - The calendar's "has data" dots are accent under every day.
    - The rule is accent for selection and action only. Countries and dots
      should be a neutral ink (`text-2` at about 25% fill, with the outline
      at `outline`), so the one selected item can be the accent.
12. **Partial name for a token.** `--mk-accent` is an alias of
    `--mk-danger`. Anyone using `text-accent` for "the accent" gets red.
    Rename it to `--mk-alert`, or delete it.
13. **Copy inconsistencies:**
    - "Pair your phone" (Overview empty) vs "Pair a device" (Map empty and
      Devices).
    - "detected: cycling" in lowercase, inside an otherwise sentence-case
      header.
    - "Sort: Visits" uses a "Label:" prefix.
    - Devices: "how well they do it." leaves a one-word widow ("it.") on the
      phone.

---

## 3. Page by page

The checklist is DESIGN_REFERENCES section 5, grouped. ✔ is a pass, ✖ is a
fail and ~ is partial.

### Sign in (`/auth/key`)

**Checklist:** ✔ hierarchy, ✔ type, ✔ icons, ✔ surfaces, ~ states (error),
✔ contrast, ~ focus.

- **The field is autofocused and drawn with the focus ring on load.**
  - The 2 px accent ring plus the 1 px border reads as a 3 px purple frame
    before the user has done anything.
  - On error it becomes a red border *inside* a purple ring, two competing
    colours.
  - **Fix:** on error, make the ring the danger colour
    (`aria-invalid:outline-danger`).
- **The error is a full Callout** (tinted box, border and icon) wedged
  between the hint and the button, so the card grows by 52 px and the button
  jumps.
  - **Fix:** replace the hint line with the error line, in danger text with
    a 16 px icon. Then nothing moves.
- The placeholder is in monospace ("Paste your login key") while the label
  is Geist. Use mono for the typed value only and Geist for the placeholder.
- Good: the optical position, the one solid button, and the copy.

### Pair landing (`/pair`)

**Checklist:** ✖ one action (none), ✔ type, ✔ icons, ✔ surfaces.

- "Pairing link incomplete" is a dead end with no action. Add a ghost
  "Open Matka" button (to `/`).
- The divider under the logo row is full-bleed while the content is
  centred, so the card reads as two stacked boxes. Remove the divider and
  put 24 px between the logo and the icon.

### Overview (`/`)

**Checklist:** ✔ one primary, ✖ shared edges (phone overflow), ✔ spacing on
desktop, ✔ type scale, ✔ tabular, ✔ icons, ✔ tiles, ~ covers (no map
fallback, see Trips), ✔ surfaces, ✖ tablet layout, ✔ contrast.

- **Phone: horizontal overflow.**
  - `scrollWidth` is 393 at a 390 viewport.
  - The "Distance by month" card and the "Most time spent" card run to the
    screen edge with no right inset, and "All places" is clipped.
  - **Cause:** in `app/page.tsx`, each `<li className="flex flex-1 …">` has
    no `min-w-0`. The hover label (`whitespace-nowrap`, only `invisible`)
    still takes layout width, so each column is as wide as its own "2,403 km"
    label.
  - The same cause makes the **bars different widths**. On phone, Aug is
    55 px, Sep 65 px and Oct 50 px.
  - **Fix [S]:**
    - `li` gets `min-w-0 basis-0`.
    - The value label gets `absolute bottom-full left-1/2 -translate-x-1/2`,
      so it no longer takes layout space.
- **Tablet (768): the chart overlaps the next column.**
  - With the 224 px sidebar, the content is 544 px. `md:grid-cols-5` still
    applies, so the chart's 3/5 column gets about 320 px.
  - The Sep and Oct bars and the "1,529 km" label draw *on top of* the
    "Most time spent" card.
  - The stat strip truncates to "Distance tra…" / "4,221…" and "Location
    poi…".
  - "Most time spent" wraps to two lines next to "All places".
  - Trip covers go 2+1 with ellipsised meta ("2,403…").
  - **Fix [M]:**
    - Under 1024, collapse the sidebar to a 64 px icon rail (or use the
      phone shell).
    - Gate the 5-column grid at `lg:`.
    - Make the stat strip 2×2 below 640 of content width.
- **"Most time spent" bars.** The first bar is drawn in near-black text
  colour, the rest in light grey. It reads as a different kind of bar, not
  "100%". Draw all in `text-2` at 35% with the track at `surface-2`, or all
  the same neutral.
- **Recent trips covers** are 172 px tall on desktop, and the route sketch
  touches the top edge: Berlin's endpoint is at y+16 of the cover, while the
  scrim area takes the bottom 60%. Inset the sketch to the top 55% with 16 px
  padding.
- **Recent visits at 1440** stretch title-to-duration across 944 px. Fine
  for a list, but the day groups could be a 2-column grid on desktop to halve
  the 900 px of scroll.
- Good: stat strip proportions, muted units, the restraint of the chart (the
  current month labelled, the rest on hover), and day-grouped visits.

### Timeline (`/timeline`, day views, mocked states)

**Checklist:** ✔ one primary, ~ shared edges (rail, title and travel text
are 3 edges, which is acceptable here), ✔ spacing, ✔ type, ✔ tabular, ✔ no
labels, ✔ icons, ✔ tiles, ✔ surfaces, ✔ states (skeleton, error, empty) but
see below, ✔ contrast, ~ targets (phone), ✔ focus ring.

- **Duplicated icon on saved places.** The rail glyph is a house, then the
  meta line starts with a `[🏠 Home]` badge with the same house. Same for
  School. Drop the glyph inside the kind badge (text-only "Home"), or drop
  the badge and let the rail glyph plus the word carry it.
- **Date header redundancy.** The h1 says "Wednesday 28 October 2026" and the
  button directly below says "📅 28 Oct 2026".
  - Make the button icon-only ("Pick a day"), sitting between the arrows.
  - Or make the h1 itself the picker trigger, with a chevron after the year.
- **Missing travel (mocked):**
  - "Missing travel**·** 79.4 km": the separator has no leading space (both
    phone and desktop).
  - In the 480 px desktop list the card wraps "2 h / 8 min" and "No location
    recorded · / 17:29 – 19:38" across lines, because "Add travel" sits
    beside it.
  - Fix: stack the button under the meta at <560 px of card width (as on
    phone), and make every duration and range `whitespace-nowrap`.
- **"Right place?" buttons** use two different secondary styles side by
  side: "Yes" is outlined white and "Something else" is a grey fill. Make
  "Yes" the tonal primary (`primary/10` bg, `primary-strong` text) and
  "Something else" ghost.
- **The uncertain title** renders as "Café Maiasmokk ?", with a space before
  the muted "?". Remove the gap: `ml-0` and a thin space at most.
- **Error and loading states drop the date navigation.** With the error
  Callout you cannot go to another day except through the browser. Render
  the date nav in the skeleton and the error, because it doesn't depend on
  the data.
- **The skeleton is barely visible.** `surface-2` on `bg` is 1.03:1 in
  light. Use `surface-3` (#e9e6e0 is about 1.2:1) with a slow shimmer, and
  the same in dark.
- **Empty day.** "Nothing recorded on this day / No visits or trips were
  recorded." says the same thing twice. Use "Nothing recorded on Mon 20 Jul",
  then a primary button "Go to 29 Jul" (no parentheses).
- **Calendar popover:**
  - It opens 82 px left of its trigger (x=224 against the button's 306) and
    touches the sidebar border. Align its left edge to the trigger.
  - Every day carries an accent dot. When nearly every day has data, mark
    the *missing* days instead (a muted strike or a hollow day).
  - The footnote "Dotted days have recorded history." then goes away.
- **Phone targets:** the prev/next/date buttons are about 36 px and the
  travel "⋯" about 32 px, under the 44 px phone minimum. Make them 44 px hit
  areas (padding or `::after` inset).
- **Phone top bar.** The 52 px brand-only bar costs a lot of space on the
  main screen. Hide it on Timeline and Map, or put the date nav in it.
- **Keyboard:** 14 Tabs on phone reach the map attribution links before the
  list, and there is no skip link on desktop (8 Tabs to reach the page).
  Add "Skip to content", and put the map after the list in DOM order
  (`order-` for visuals).
- **Photo viewer (desktop).** The photo is shown at 640×480 in a 1440×900
  viewport, using 44% of the width. Fit to `min(100vw-160px,
  100vh-200px)`. On the phone the next arrow is a 44 px translucent white
  disc on a light sky and nearly invisible. Use a dark 50% disc with a white
  glyph.
- Good:
  - The split view.
  - The rail with mode-coloured dashed segments.
  - The 20 px travel glyphs.
  - Overnight phrasing ("Since 16:58 yesterday, until 05:51").
  - Transit legs with operator badges.
  - The trip editor sheet and dialog, and the hover reveal of "Fix trip".
  - The focus ring.

### Map (`/map`)

**Checklist:** ~ one primary (none, fine for a map), ✔ type, ✔ icons, ✖
control consistency, ✔ legend, ~ dark parity, ✔ empty state.

- **Phone controls are three unrelated blocks.** There is a 2-row filter
  card (0–333), separate zoom buttons (347–379) whose tops are offset by
  2 px, and a 44×40 "save place" button floating under the filter card,
  aligned to nothing.
  - **Fix:** put zoom and save-place in one vertical group at the
    top-right, with the filter card ending 8 px before it.
- **Tablet:** "Save a place" wraps to its own row under the filter bar.
  Make it icon-only below 1024.
- **The legend on phone** has a "Legend" title row with an icon, which
  wastes 32 px. Drop the title. The swatches are self-explanatory.
- Route lines are about 1.5 px at country zoom and the flight polyline
  shows GPS kinks. Use 2.5 px, plus a 1 px `bg` casing so lines read over
  the grey water.
- **Empty map:** the Routes/Heatmap and range controls stay enabled over
  nothing. Disable them.
- Good: the compact desktop toolbar, the bottom legend strip, and the
  empty-state card on the map.

### Places (`/places`)

**Checklist:** ✔ all hierarchy, ✔ type, ✔ tabular, ✔ icons and tiles, ✔
surfaces, ✔ states (no results), ✔ contrast.

- **Phone truncation eats the number.** "Department store · Helsinki · 5
  vi…" Put the visit count in the trailing column under the duration, or
  truncate the category first (`min-w-0` on category, `shrink-0` on the
  count).
- **Search:**
  - The input shows the focus outline plus the 1 px border at offset 0, a
    3 px purple frame that is heavier than every other control. Use a 1 px
    `primary` border plus a 3 px `primary/20` ring.
  - The glyph-spacing bug ("no thing") is cross-cutting item 1.
- "Save a place on the map" is above the search on phone and top-right on
  desktop. The desktop placement is right. On phone it pushes the list down
  56 px, so move it into the More/kebab menu or make it a trailing icon in
  the search field.
- Good: the 64 px rows, the sort segmented, Saved first, unnamed places
  collapsed, and the `/` key hint.

### Place (`/places/[id]`)

**Checklist:** ✔ one primary (Edit is secondary), ~ shared edges ("Show
all" +4), ✔ type, ✔ tabular, ✔ icons, ✔ surfaces, ✔ states.

- **The header differs by breakpoint.** Desktop has a 48 px icon tile left
  of the title, while the phone has none and the title sits at the page
  edge. Show the tile on phone too (40 px), or nowhere.
- **The map has no pin.** It shows only a dashed accent circle, plus
  zoom ± on a 320 px static context map, and the broken road shields.
  - Add the place's glyph pin at the centre.
  - Make the circle neutral (`text-2` at 12% fill with a 1 px outline).
  - Drop the zoom buttons below 400 px of map height.
- **Overnight visit rows** read "15:25 – 08:13", with no hint that the end
  is the next day. The timeline says "until 08:13 tomorrow". Use "15:25 –
  08:13 +1" (a muted superscript).
- **The 2-tile stat strip** at 1440 is two 470 px boxes for "73" and
  "46 d". Merge it into the subtitle ("73 visits · 46 d in total · last
  visited yesterday") and drop the strip, or add First visit and Average
  stay to make 4.
- Good: the visits grouped by month, the "Show all" pattern, and the
  one-line Immich nudge.

### Insights › Travel (`/insights`)

**Checklist:** ✔ hierarchy, ✔ type, ✔ tabular, ✔ icons, ~ charts (scale),
✔ surfaces, ~ states (empty has no action), ✔ contrast.

- **The small multiples don't share a y-scale.** Walk (30 km) and Flight
  (1,137 km) both reach full height, which contradicts DESIGN_REFERENCES §4.
  Either share the scale (and accept tiny bars), or label each chart's max
  ("max 40 km") in caption text so the independence is explicit. Sharing is
  better for honest comparison, with per-mode scales on hover.
- **Zero modes** ("Train · 0 m · —", "Ferry · 0 m · —") still take full
  cards. Collapse modes with zero this month into one muted row ("No train
  or ferry this month"). "0 m" should be "—" anyway.
- **The month picker** is a select-looking box ("October 2026 ▾") between
  arrows. The next arrow when disabled has no border, while the previous
  arrow has one. Disabled buttons keep their border at 50% opacity.
- **Tablet:** card headers wrap ("40 / journeys", "7 h 24 / min"). Below
  360 px of card width, stack the values under the title.
- **Empty user:** "No travel recorded yet" has no action. Add "Pair your
  phone" (the same as Overview).
- Good: the stacked mode bar with a direct legend, saved places as rows, and
  the footnote.

### Insights › Trips and Trip detail

**Checklist (Trips):** ✔ hierarchy, ✔ type, ~ covers (sketch, not map), ✔
surfaces. **Trip detail:** ✔ hierarchy, ✖ tablet layout, ✔ tabular, ✖
chips look interactive, ~ map fit.

- **Route sketch covers look like placeholder art.**
  - A route floating on graph paper, with no coastline, gives no sense of
    place.
  - The Tallinn sketch has a stray orange tick at the top.
  - Every sketch hugs the top edge.
  - Per DESIGN_REFERENCES §3.5 the fallback is a *map thumbnail*. You
    already render the land mask (World), so draw the land/water silhouette
    under the route at `surface-2`/`surface-3`. That turns "chart" into
    "place".
  - On desktop the cards also differ by 1–2 px in height (Tampere 196 vs
    194, so its title sits 1 px lower). Use a fixed `aspect-[16/9]`
    container plus a fixed 2-line text block.
- **Real-photo covers weren't exercised** by the harness (trip covers aren't
  mocked), so scrim contrast on photos is unverified.
- **Trip detail, tablet:**
  - The day rows break into "Day / Wednesday / 30 / September / V…", one
    word per line, because three mode chips and the km column take the
    width.
  - "Cities visited" truncates "Germa…".
  - **Fix:** put the chips on their own line below the title under 900 px
    of content width (as on phone).
- **"How you travelled":**
  - The tracks are grey with a mode-coloured fill, and the value column is
    two-line, so the bar is not on the label's baseline.
  - The "Cities visited" card beside it is 120 px tall next to 260 px.
  - Make the grid `items-stretch`, or stack Cities under it.
- **The description line** ("5 days, 4 nights away. Left home 05:51 on
  Wednesday 30 September, back 15:42 on Sunday 4 October.") repeats the
  dates above it. Shorten it to "4 nights away · left 05:51, back 15:42".
- **The trip map** fits Helsinki to Berlin but shows the UK to Moscow on
  desktop (1072×420). Raise `maxZoom`, reduce the padding, or crop the map
  to 16:7. The overnight "1" marker covers the "Berlin" label.
- Good: the structure (map → stats → modes → days), and the
  "Day 1 · Wednesday 30 September" rows on phone and desktop.

### Insights › World and City

**Checklist:** ✔ hierarchy, ✔ type, ✔ tabular, ~ icons (ISO tiles), ✖
accent as data, ~ map fit, ✖ phone stat orphan.

- **Sort and the visible metric disagree.** "Sort: Visits" is selected, but
  the trailing column shows days ("80 d", "3 d 21 h"). Show the sorted
  metric in the trailing slot, or sort by time by default.
- **The map is clipped:** northern Finland is out of frame (cross-cutting
  item 4). The Helsinki cluster draws as a doubled ring. Use one dot with a
  count.
- **The city map** has dots with no labels and no hover on touch, and the
  zoom control covers a dot at the right edge. Label the top 3 dots, and
  pad the fit.
- **ISO-code tiles** ("FI", "DE", "EE") in grey squares read as
  placeholders. Use a 20×14 flag with a 1 px inner border (emoji-free SVG
  flags), or drop the tile and indent the text.
- Good: Countries/Cities as one list with a toggle, and the meta line
  ("5 cities · 21 places · 275 visits").

### Devices (`/devices`)

**Checklist:** ✔ one primary (Pair), ✔ type, ✔ tabular, ~ chart, ✖ empty
state, ✖ phone table.

- **There is no device list and no empty state**, yet battery and quality
  data are shown. The demo seed has 0 rows in `devices` and the page hides
  the section when it's empty.
  - For a real user who revoked their phone, the page contradicts itself.
  - Show "No phones paired yet" in the Paired devices slot.
  - Seed one device so the list can be reviewed. It wasn't reviewable this
    round.
- **The phone table is cramped.**
  - Column headers wrap to 4 lines ("Balanced, / Smart / Tracking off /
    Until 19 Oct").
  - Row labels wrap to 2–3 lines ("Wobble / along the / path").
  - Below 600 px, transpose it into one small card per setting (setting
    name as the header, metrics as label/value rows), or make the first
    column sticky and scroll horizontally.
- **Battery stats:**
  - "Before 2.7 %/h, After 3.3 %/h": After is worse, but nothing says so.
    Add a direction line ("+0.6 %/h after", with a neutral or warn tint).
  - The units are not muted here, unlike every other stat. Use "2.7 %/h"
    with "%/h" muted.
- **Battery chart:**
  - Gaps (missing days) show as unlabelled holes.
  - The x-axis has only the two end dates.
  - Add a week tick or two, and a "no data" hatch for the gaps.
  - The accent "Smart Tracking" line is fine, as an annotation.
- **The Pair card's icon tile** is accent-tinted. It is decoration, so make
  it neutral.

### Settings (`/settings`)

**Checklist:** ✔ one primary (Connect), ✔ grouped list, ~ edges (4 px label
indent), ✔ type, ~ controls (glyph spacing, disclosure), ~ disabled states.

- **The disabled toggle** ("Public transport lines — Not available on this
  server") looks the same as the enabled off toggle next to it, at only 50%
  opacity on an already pale track. Also grey out the title to `muted`, or
  replace the toggle with a "Not available" badge.
- **Toggle targets** are 36×20 on phone. Make the whole row the label so
  the hit area is the row.
- **Server address placeholder.** "http://immich_server:2283" looks like a
  filled value. Use "https://photos.example.com", and put the Docker
  hostname hint in the help text.
- **Buttons are full-width on Devices (phone) but auto-width on Settings
  (phone).** Pick auto-width, left-aligned, for in-card actions everywhere.
- The time zone "Europe/Helsinki UTC+02:00" (the offset in muted text) is
  good, once the glyph spacing is fixed.
- Good: inset-grouped sections with titles outside, immediate save, and the
  danger outline for "Sign out everywhere else".

### 404

**Checklist:** ✔ throughout. The copy is long: "…or what it showed has
gone: places and trips are recomputed as new locations come in." Use "This
page doesn't exist, or the place or trip it showed was merged." Good
otherwise.

### Shell and navigation

- **Phone More menu:** while it is open, both "Timeline" and "More" are
  highlighted. Only the open menu should be active, or keep Timeline and
  show More as pressed without the accent.
- **Tablet (768) uses the full 224 px sidebar**, which leaves 544 px and
  causes every tablet break above. Use a 64 px icon rail from 640 to
  1024 px, with labels as tooltips.
- **The desktop sidebar** is quiet and aligned (brand on the h1 row, active
  pill, Sign out pinned). Keep it.

---

## 4. Round 2 issues: fixed or not

| r2 item | Status |
|---|---|
| 1 Timeline split view | **Fixed.** Map fit and control overlap are new nits. |
| 2 One left edge | **Fixed** (x=264). Right edges still vary: three widths. |
| 3 Maps on place pages | **Fixed.** Basemap hygiene (shields, admin labels, dark caps) is new. |
| 4 Places as a list | **Fixed** (2,669 px tall on phone). |
| 5 Native controls | **Mostly.** The calendar is good; the month picker still looks like a select. |
| 6 Trip covers | **Partial.** The sketch on graph paper is not a map fallback. |
| 7 Palette | **Fixed.** Accent is still used for World fills and dots. |
| 8 Glyph spacing | **Regressed in controls** (buttons, inputs, selects; UA reset). |
| 9 Quieter travel rows | **Fixed.** |
| 10 Rail glyph alignment | **Fixed.** |
| 11 Formatters | **Fixed.** Nits: "0 m" for none; overnight ranges on the Place page. |
| 12 Recording quality moved | **Fixed.** The phone table is cramped. |
| 13 States | **Mostly.** Error and skeleton hide the date nav; Insights empty has no action; the skeleton is too faint. |
| 14 Missing travel / Right place | **Partial.** Phone is good. The desktop 480 px column wraps badly, there is a "travel·" spacing typo, and the button styles are mixed. |
| 15 Settings | **Fixed.** Disclosure-marker mismatch; disabled toggle ambiguous. |
| r2 cross-cutting 11, overlapping markers | **Partial.** Merged clusters are good, but markers now cover city labels and sit under controls. |

New in round 3, untested before: the tablet width, which is the worst
breakpoint now.

---

## 5. What is now strong (keep)

- **The desktop timeline split.** The rail, dashed mode-coloured segments,
  20 px travel glyphs, hover-revealed "Fix trip" and the sticky map make it
  look like a product. This is the best screen.
- **Typography discipline.** One scale, muted units, tabular numbers and
  relative dates are consistent across almost every page.
- **Lists.** Places, recent visits and saved places use one 56–64 px row
  with one tile size and one tint.
- **Sheets and dialogs.** The trip editor is compact and well proportioned,
  with a clear selected state and one primary.
- **Empty and error states.** They are frameless, with one sentence and real
  actions. The map empty card is especially nice.
- **The palette.** Mode colours are distinguishable and used only on marks.
  The chart restraint (the current period solid, the rest tinted) is right.
- **Copy.** It is mostly plain and human now ("Nothing to map yet", "That
  key doesn't match this Matka server.").

---

## 6. Top 15 by visual impact

1. **[S] Fix the phone Overview overflow and the uneven bars.** Give the
   chart columns `min-w-0 basis-0`, and position the value label absolutely.
   This is the first screen in the More tab, and it visibly bleeds off the
   edge.
2. **[S] Fix glyph spacing in controls.** `button, input, select, textarea
   { font: inherit; text-rendering: inherit }`. "Mo re" is in the tab bar of
   every phone page.
3. **[M] Tablet layout.** Use an icon-rail sidebar from 640 to 1024 px, and
   gate the multi-column grids (Overview 5-col, Trip detail days, small
   multiples) on content width, not viewport. The chart currently draws over
   the next card.
4. **[S] Basemap hygiene.** Hide road-shield symbols (the empty boxes),
   admin-1 labels and strait/bay water labels, and use the same label case
   in dark as in light.
5. **[S] Map fit padding.** Keep markers clear of the controls and legend,
   and fit World to the countries.
6. **[M] Trip cover fallback as a real map thumbnail.** Draw the land
   silhouette under the route, inset the sketch, and give all cards a fixed
   aspect and text block.
7. **[S] Keep the date nav in the timeline's loading and error states.**
   Raise the skeleton contrast to `surface-3`.
8. **[S] Missing travel and Right place polish.** Add the "travel ·"
   spacing, stack the button and nowrap durations in the 480 px column, make
   Yes tonal primary and Something else ghost, and remove the "?" gap.
9. **[S] One segmented control.** No checkmark variant, and a lighter (not
   darker) selected state in dark.
10. **[S] Accent for selection only.** Use neutral fills for World
    countries, city dots, sketch endpoints, the overnight marker and the
    Pair tile. Mark missing days in the calendar, not the days with data.
11. **[S] Remove redundant icons and labels on the timeline.** Kind badges
    without the repeated glyph, and an icon-only date trigger (or the h1 as
    the trigger).
12. **[M] Devices.** Show a device list or a "No phones paired yet" state,
    seed a device, and transpose the quality table on phone. Add a
    direction line for Before/After battery.
13. **[S] Small multiples.** Use a shared y-scale (or a labelled max),
    collapse the zero-this-month modes into one line, and fix the header
    wrap at tablet.
14. **[S] One content width per page type** (688 reading, 1072 everything
    else), one label indent (flush), one disclosure chevron, and auto-width
    in-card buttons.
15. **[S] Phone stat strips and targets.** Use 3-up strips instead of 2+1
    orphans, give the date nav, "⋯" and toggles 44 px hit areas, and show
    one active tab when More is open.

---

## 7. Overall verdict

Round 2 delivered the structural changes the last review asked for, and the
desktop experience now reads as a designed product. The split timeline, the
quiet lists, the consistent type and number formatting and the restrained
palette are all at a professional level. The gap to "shipped by a
Linear-grade team" is now about **robustness and finish**:

- a phone page that overflows
- a tablet width that nobody designed for
- a font-rendering fix that stops at form controls
- a basemap that still shows its raw OpenMapTiles defaults (empty shields,
  voivodeships, caps in dark)
- a long tail of small inconsistencies (two segmented styles, three widths,
  4 px indents, mixed disclosure markers, accent leaking into data)

Each fix is small, and most are [S]. Do items 1–8 and the app moves from
"carefully assembled" to "considered".

**Polish score: 6 / 10.**

---

## Response (round 3, web)

The implementation is logged in [REDESIGN.md, Round 3 (web)](../REDESIGN.md).
After shots: `/tmp/shots/redesign/r3/web/after/` at 390, 768, 1024 and
1440 px, light and dark, with `--extras`. The harness now flags any page whose
`scrollWidth` exceeds the viewport.

| # | Item | Status | Why / how |
|---|---|---|---|
| 1 | Phone Overview overflow, uneven bars | Done | Columns are `min-w-0 basis-0`; the value label is absolute over the bar. |
| 2 | Glyph spacing in controls | Done | `button, input, select, textarea` inherit font, letter-spacing and `text-rendering` (base layer, so utilities still win). |
| 3 | Tablet layout | Done | A 64 px icon rail from 640 to 1024 px; Overview and Trip detail grids at `lg`; stat strips use a container query. |
| 4 | Basemap hygiene | Done | `transformStyle` rewrites the style JSON before load: no shields, state labels or strait/river labels; sentence case and Latin names in both themes; dark water lifted. |
| 5 | Map fit padding | Done | `fitPadding` on every map, sized to each map's chrome; World fits the countries' main landmasses. |
| 6 | Trip cover as a map thumbnail | Done | Land/water silhouette from the bundled OSM land mask under the route; routes inset to the top 55%; fixed 16:9 box. Outside the mask's Baltic coverage the backdrop is land. |
| 7 | Date nav in loading and error; skeleton contrast | Done | Nav steps by calendar day when the day list is unknown; skeleton is surface-3 with a shimmer. |
| 8 | Missing travel and Right place | Done | Container-query stacking at <560 px, "travel · " spacing, nowrap figures, tonal Yes, ghost Something else, no "?" gap. |
| 9 | One segmented control | Done | Map layer toggles use the Segmented pill, no checkmark; `--mk-seg-on` makes the dark pill lighter than its track. |
| 10 | Accent for selection only | Done | Neutral countries, dots, sketch stops, overnight and day-map markers, chart history bars and Pair tile; the calendar strikes out missing days. |
| 11 | Redundant timeline icons and labels | Done | Text-only kind badges; icon-only date trigger between the arrows. |
| 12 | Devices | Done | Always a list (or "No phones paired yet"), demo seed adds a paired and a revoked phone, phone table transposed, Before/After direction line. |
| 13 | Small multiples | Partly | Each chart labels its max ("max 1,137 km") instead of sharing a scale (tiny walk bars would be unreadable); zero modes fold into one line; headers don't wrap. |
| 14 | Widths, indent, disclosure, buttons | Done | 688 / 1072 px only; flush labels; chevron everywhere (native marker hidden globally); in-card buttons auto-width. |
| 15 | Phone stat strips and targets | Done | Three-up strips; 44 px date nav and "⋯" targets; whole-row toggle labels; only the More tab is active while its menu is open. |

Other notes taken: the sign-in error replaces the hint and turns the ring red;
the search focus is a 1 px border plus a soft ring; Pair landing lost its
divider and gained "Open Matka"; 404 copy shortened; "Pair your phone"
everywhere; Place stats moved into the subtitle with a pin on the map and
"+1" on overnight rows; Places shows the visit count under the duration;
World sorts by time with the sorted metric trailing and no ISO tiles;
trip-detail chips are plain meta text; the photo viewer fills the screen with
dark arrow discs; a skip link was added.

Not done: putting the phone day map after the list in DOM order, hiding the
phone top bar on Timeline and Map, SVG flags, and labelling the city map's
dots beyond the top three. Real-photo covers are still not exercised by the
harness.
