# Matka phone app: design critique, round 2

Independent review of the Expo / React Native app after redesign round 1.
Screens were captured with `mobile/preview/screens.mjs` (react-native-web,
390x844 @2x, en-GB, Europe/Helsinki). All 33 shots passed in light and dark:
`/tmp/shots/redesign/r2/app/review/{light,dark}/`. Side-by-side light|dark
composites are in `.../review/pairs/`.

Scored against [DESIGN_REFERENCES.md](../DESIGN_REFERENCES.md) section 5 with
Material 3 / Android as the platform, since the app runs on a OnePlus. The
benchmarks are Google Maps Timeline, Strava and Google Fit.

## Preview caveats (not app bugs)

- **Switch thumb is teal in the preview.** The code sets `thumbColor="#FFFFFF"`,
  but react-native-web ignores it and uses its own `activeThumbColor` default
  (#009688). On Android the thumb is white. Ignore the teal.
- **Weights look flatter than on the device.** The browser has no Roboto
  Medium, so `500` row titles render close to 400. The jump between 400/500
  and 800 is real on the phone too (see finding G2).
- **The Settings "Keep it running" footnote** shows the iOS copy ("Background
  App Refresh") because `Platform.OS` is `web`. Android gets its own text.
- **The Map tab and the day map** are placeholders here. Their chrome can't be
  judged.

## How to read the scores

Checklist codes (section 5, in order):

- **H** hierarchy and layout. H1 one primary action. H2 one or two left edges.
  H3 spacing on the 4-pt grid. H4 distinct title, section, row and meta levels.
- **T** type. T1 two or fewer weights and three or fewer colours per row.
  T2 minimum sizes. T3 tabular numerals with smaller, muted units. T4 no
  "Label:" prefixes.
- **I** icons and imagery. I1 no emoji. I2 Lucide only, 16/20/24, centred.
  I3 one tile size and tint per list. I4 photo scrims, one aspect ratio, a map
  fallback.
- **S** surfaces and colour. S1 three or fewer surface levels. S2 one radius
  per component type. S3 accent and mode colours used only with meaning.
  S4 borders used sparingly.
- **St** states. St1 skeleton loading. St2 empty state. St3 error and partial
  data. St4 edge cases (long names, zero, huge values).
- **A** accessibility and platform. A1 contrast in both themes. A2 touch
  targets of 48 dp. A3 focus and pressed states. A4 safe areas and row heights.

Each screen below gets a score of passes over applicable items, then only the
fails, with the location and a fix. `?` means it can't be verified in the
preview. A3 (pressed and focus states) can't be seen in static shots on any
screen and is left out of the totals.

---

## Global problems (affect every screen)

**G1. Every top-level tab has a different header.** In Google Maps, Fit and
Strava the app bar has the same anatomy on every tab. Here:

- Overview has a date overline and a "Good afternoon" greeting at 28/800, and
  no title matching the tab name.
- Map has no header.
- Timeline has a "Timeline" title at 28/800 and, under it, a second big title:
  the pager's "18 October" at 22/800, with "Sunday" above it.
- Insights has a title plus a four-part segmented control.
- Recorder has a title and a gear icon.
- Sub-screens use a back link row, then either a 28 title (City, Settings,
  Country) or a hero card (Trip detail). Pair has no top inset, so its title
  sits about 12 pt higher than every other screen.

Fix: one `ScreenHeader` for tabs (Title L 22/600 or Headline S 24/600, 16
side inset, 56–64 dp tall, trailing icon slot). Sub-screens get an M3 small
top app bar: a back arrow icon at 24 in a 48 target, then the title inline,
replacing the separate "‹ Trips" link row plus a big title. That saves about
60 dp on every detail screen.

**G2. Weight 800 is the "vibecoded" tell.** Screen titles, pager dates, stat
values and trip-cover titles all use 800, and everything else uses 400/500.
The result is shouty headings over flat rows. The tokens chose 800 because
Android draws 600/700 as regular with the system font. Fix: bundle Inter
(or Roboto Flex) with `expo-font` at 400/500/600 and use explicit families.
Then titles become 600, stat values 600, and row titles 500. Nothing should be
800.

**G3. Two competing section-header systems.**
- Overview, Insights and Trip detail use sentence-case 17 titles ("Distance
  by month", "Saved places").
- Recorder, Settings, the sheets and search results use uppercase tracked
  overlines ("BATTERY TODAY", "HOW DID YOU TRAVEL?", "CITIES AND COUNTRIES").

Fix: pick one. For M3, use sentence-case Title S (14/500, `onSurfaceVariant`)
as the overline everywhere, or the 17/500 title everywhere. Never use
uppercase questions.

**G4. Numbers and durations are formatted three different ways.** There are
three formatter modules: `format.ts`, `insights-logic.ts` and `search.ts`.

| Where | Example |
|---|---|
| Overview hero | 20,864 km (comma) |
| Insights, Trips, Server | 1 148 km, 6 934 km, 113 871 (space) |
| Overview places | 570 h 1 min |
| World / Country | 34 d 17 h next to 38 h 20 min in the same list |
| Trip detail | 4 d 6 h |
| Battery | 3.4 h, 6.0 h |
| Percentages | 52 %, 42 %, ≈ 1 % (space before %) |
| Month labels | "Sept" (Overview chart) vs "Sep" (By mode) |

Fix: one `format.ts`.
- Group thousands with a comma (en-GB), or a narrow no-break space, but the
  same everywhere.
- Durations: under 1 h "45 min", under 24 h "2 h 35 min", from 24 h "1 d 14 h",
  over 30 d "39 days". Battery durations in the same "h min" form.
- `52%` with no space.
- Fixed 3-letter months.

**G5. The accent is used as decoration.** In light mode, the accent
`#4F46E5` / `primarySoft` fills:
- the unselected bars in every chart (`barMuted` #D5D3F6 is an accent tint)
- the "Where you spend time" progress bars on Overview
- saved-place icon tiles and the Home/Family/Work/School badges in Places and
  Insights → Saved places
- the selected sort chip, the segmented thumb and the nav pill.

The data meaning gets lost because everything is violet. Worse, the Train
mode colour (#6250d6) is almost identical to the accent: contrast 1.09:1 in
light, 1.28:1 in dark. So the 42% Train segment in "Distance by mode" reads as
"accent".

Fix:
- Unselected bars become a neutral grey (for example `textMuted` at 35–40%).
  The accent marks only the selected bar.
- Progress bars become neutral, or the accent at a single strength.
- Saved-kind tiles become neutral like every other tile, with the kind shown
  only by the glyph.
- Move Train to a hue away from the indigo accent.

**G6. Mode colour collisions.** By design (`modeColor`), tram shares bus's
amber and metro shares train's violet. In the stacked bar and its legend,
"Bus 9%" and "Tram 1%" are the same amber dot, and "Train 42%" and "Metro 5%"
are the same violet. In the By-mode list the two rows look identical.

On top of that, the transit line badges use operator colours that fight the
mode palette:
- the Bus mode glyph is amber, but "Bus 550" is solid blue
- the Metro glyph is violet, but "Metro M1" is solid orange, which reads as
  Cycle
- the Ferry badge is cyan.

Fix:
- Either give tram and metro their own validated slots (the palette has room
  if you drop "flying" to neutral), or merge them into "Bus & tram" and
  "Rail" wherever a legend shows.
- Render line badges as neutral `surfaceAlt` pills with the line number in
  `text`, a 3 px leading bar in the mode colour, and 32 dp tall.

**G7. Chips are used for everything.** Chips appear in:
- the Timeline day stats (horizontally scrolling and clipped: "7.2 k")
- trip cards (Train / Walk / Bus with coloured glyphs)
- Day by day rows
- trip "Cities"
- place search results (3 Oct, 30 Sep date chips, 32 dp each)
- the World sort row.

In M3, chips are for filters and input. Here most are static metadata, so they
look tappable, add a 32 dp row each time, and make cards noisy. Fix:
- static mode lists become a row of 16 px mode glyphs with 4 px gaps, or a
  muted meta line ("Train · Walk · Bus")
- dates become meta text
- keep chips only for real filters (sort, mode filter).

**G8. Raw data leaks into the UI as display text.**
- Addresses start with the postcode: "00990 Esimerkkitie 2", "00180 Mallikatu
  1". Show "Esimerkkitie 2" with "Espoo" in the meta line.
- Candidate types are lowercase OSM tags: "Sibelius Monument artwork",
  "Merikannontie 8 address".
- "Unnamed place" rows appear as top-level items.

Fix: a `displayName(place)` that strips the postcode, title-cases category
labels, and renders unnamed places as "Place near Esimerkkitie" in muted italics,
or groups them.

---

## Screen by screen

### Overview (`overview-1..3`)

**Score: 13/21.** Fails: H4, T3, S3, St1, St4, A1. Unverified: A2.

- **H4.** Three big numbers compete:
  - the 34/800 hero "20,864 km"
  - four 28/800 stats in a separate card right below it
  - the 17/800 chart readout.

  Google Fit has one hero and smaller supporting stats. Fix: merge the hero
  and the 2x2 grid into one card. Put the hero number at 28/600, and the four
  stats as a row of 4 (or 2x2) at 17/600 with 12/400 labels.
- **H4 / G1.** The "Good afternoon" greeting is the screen title and wastes
  the most prominent slot. Fix: title "Overview" (or keep the date as the
  title), and drop the greeting.
- **T3.**
  - Trailing durations in Recent visits ("12 h 35 min") are primary-coloured
    at about 17 pt, as loud as the place name. Make them 13/400 muted, tabular.
  - In "Where you spend time" the units aren't muted.
  - Thousands formatting differs from Insights (G4).
- **S3.** The place-time bars and the unselected chart bars use the accent
  (G5).
- **Chart y-axis labels don't sit on their gridlines.** The "4,000" label is
  about 7 pt above its line, and "0" is about 13 pt above the baseline. Align
  each label's vertical centre to its gridline, or drop the y-axis entirely
  and keep the pinned readout (the Strava style).
- **Chart x-labels collide** ("Aug Sept Oct" nearly touch) and the year is
  missing. Fix: 3-letter months, plus a year tick under Jan.
- **"Tap a month"** is baseline-misaligned with "7,834 km" and is chrome.
  Remove it; the pinned readout already shows the chart is interactive.
- **Layout and density.**
  - "Where you spend time" rows have no leading tile, but Recent visits rows
    do. Fix: use one row anatomy for both lists.
  - Every Recent visits tile is the same grey pin, which wastes 40 dp. Fix:
    use the place glyph (as the Timeline does), or drop the tiles and group
    rows under "Today / Yesterday" day headers instead of repeating "Sun 18
    Oct" eight times.
- **St1.** The loading skeleton is three plain blocks. Fix: draw the final
  shape (a hero line, a 2x2 grid with cell dividers, a chart baseline with bar
  stubs).
- **St4.** Postcode-first names, and "570 h 1 min" instead of "23 days" (G8,
  G4).
- **A1.** Unselected bars are 1.45:1 on white and 1.51:1 on the dark card.
  Marks need 3:1, or they need to be clearly decorative with the value
  labelled.
- **Good.** One solid "Start", calm status card, empty and error states have
  an icon, a sentence and an action.

### Map tab (`map`)

Can't be judged (a placeholder in the preview). Note: the tab has no header
at all, while every other tab has a 28 title. That's fine for a full-bleed map
(Google Maps does the same), but then a floating search/date pill should
replace the missing header.

### Timeline, day view (`timeline-1..3`, `timeline-prev-day-*`)

**Score: 11/22.** Fails: H2, H3, H4, T3, S3, S4, St1, St4, A1, A4. Unverified: A2.

This is the screen users compare with Google Maps Timeline, and it's the one
furthest from it.

- **Header stack (G1).** The "Timeline" title (28) and the pager ("Sunday /
  18 October" at 22/800, with 40 dp circle buttons) together use about 120 dp
  before any content. Maps puts the date in the app bar, with ‹ › and a
  calendar button. Fix: the app bar title becomes "Sun 18 Oct" (Title L), with
  chevrons and a calendar icon trailing. Drop the "Timeline" heading; the tab
  label already says it.
- **Day map is a card inside the page.**
  - It has its own header row ("Day map", then "Hide ^"), uses a 16 inset, has
    rounded corners, and is about 290 dp tall.
  - Maps and Arc put the map edge to edge at the top, as a bottom-sheet
    layout.

  Fix: a full-width map of about 40% of the height, with no header row. The
  hide/expand affordance becomes a drag handle on the list sheet. At minimum,
  remove the "Day map / Hide" row and make the map full-bleed.
- **Stats card.**
  - The three cells ("Travelled 27.2 km", "On the move 1 h 44 min", "Stops 6")
    are fine.
  - The horizontally scrolling chip row inside the card is clipped at the
    card edge ("7.2 k"), which looks broken.

  Fix: replace the chips with one stacked mode bar (the same component as
  Insights) and a legend line, or a wrap layout of glyph+value without pills.
- **H2.** Two different text starts:
  - travel rows start their title at x = 68
  - visit titles start at about x = 85, because visit rows are bordered cards
    with 16 inner padding while travel rows are bare.

  Every row should hang off one rail with one text start. Fix: drop the cards
  for visits. Visits become plain rows with a 500 title and a tonal background
  only when selected. Or keep the cards but give travel rows the same 16 inset.
- **H4 / T3.** In visit cards, the title (17) and trailing duration (17,
  primary) have equal weight, and the time range is muted underneath. Arc and
  Maps make the place name the strongest thing and the duration secondary.
  Fix: the trailing duration becomes 13 muted tabular, or moves into the meta
  line: "22:05–08:20 · 10 h 15 min · House".
- **Per-row pencils.** Every travel row carries a 24 px edit pencil in near
  text colour, so seven identical pencils outweigh the content.
  - Maps puts editing behind tapping the row.
  - Fix: make the whole travel row pressable and open the Fix sheet. Show a
    16 px muted chevron, or nothing. Keep an explicit button only on rows that
    need attention ("Missing travel", "Were you here?").
- **Number badges on the rail glyphs** ("1"…"6", black dot with white digit,
  white in dark mode) read as notification counts and are the darkest thing on
  the rail.
  - Fix: remove them. Or, if they pair with map pins, render them as
    12/500 muted text inside the 32 px circle in place of the glyph when the
    map is visible.
- **Rail segments.**
  - The rail breaks into stubs: a 6 dp mode-coloured stub above each travel
    glyph, a gap, then the segment.
  - The colour changes don't line up with row boundaries (orange stub above
    "Bus", green stub above "Walk").

  Fix: one continuous 2 dp rail. It's neutral `borderStrong` beside visits,
  and mode-coloured from the bottom of one visit circle to the top of the
  next, passing behind the travel glyph.
- **Travel row height.** These rows are 64 dp and as tall as visit cards. The
  reference says travel rows are visibly lighter (about 40 dp: one line
  "Walk · 820 m · 11 min").

  Fix: one line, a 20 px mode glyph and 13/400 meta. Transit details (line
  badge, "Waited at Kamppi") go on a second line only when present.
- **"Stationary 10 min"** with a pause glyph is shown as a travel row. It's
  not travel. Fix: fold it into the adjacent visit ("+10 min nearby"), or show
  it as a thin muted rail note like the gap rows.
- **Warnings.** "GPS jumped around here, not counted" appears twice in amber
  at 15, louder than the row it annotates. Fix: 13/400 muted with a 16 px
  amber icon only, and copy like "Noisy GPS — distance not counted".
- **S3.** The transit badges use operator colours that clash with the mode
  glyphs (G6).
- **A1.**
  - The Bus glyph and rail (#eda100) are 2.17:1 on white, and Walk is 2.82:1.
    Those glyphs carry meaning on the rail. Use the darker step of each mode
    colour for glyphs on light surfaces.
  - Dark-mode Ferry (#008300) on surface is 3.58:1, which passes but reads as
    nearly black-green.
- **A2.** The transit badges are about 22 dp tall, and the photo thumbnails
  are 56 dp but packed 4 px apart. Confirm hitSlop on both.
- **St4.**
  - The long name "Lauttasaaren Urheilu- ja Uimahallin pysäköintialue …"
    wraps to two lines plus an ellipsis, which is fine.
  - "Unnamed place" with no category or meta looks unfinished. Fix: "Place
    near Lauttasaari", muted.
- **St1.**
  - The loading skeleton has the right shape (rail circles plus cards), which
    is good.
  - But the pager shows a literal black "…" at 22/800. Replace it with a
    120x20 skeleton bar.
  - The skeleton circles float without a rail. Add the rail.
- **Good.** Dashed gap segments, "Were you here?" inline, mode-coloured
  glyphs, photo thumbnails inside the visit, and "Edited" / "Added by you"
  badges are all the right ideas.

### Timeline, guessed visit and missing travel (`timeline-question`, `timeline-missing`)

**Score: 12/18.** Fails: H1, H2, T2-ish, S4, St4, A1.

- **"Were you here?" row.**
  - "Yes" is a grey tonal 48 dp pill and "Pick another" is an accent text
    link. Two different button styles sit side by side, and the more important
    "Yes" looks weaker.
  - Fix (M3): "Yes" becomes a tonal `primarySoft` button with `onPrimarySoft`
    text, and "Pick another" a text button. Both 40 tall in a 48 touch area,
    right-aligned.
- **Candidate list.**
  - It's a bordered list inside the bordered card (S4: a card in a card).
  - Rows are centre-aligned ("Sibelius Monument artwork"), which no list
    should be.
  - The types are lowercase OSM tags.

  Fix: left-aligned rows with a place glyph, name 15/500, and type 13 muted
  title-cased. Drop the inner border and use dividers only. The "Type a name"
  row becomes a leading-pencil row in accent.
- **H1.** Several accent and tonal actions are visible at once (Add travel,
  Yes, Pick another), plus seven pencils. Acceptable in a list, but the
  pencils should go (see above).
- **Missing travel.**
  - The title is amber 17, and the meta wraps to three lines ("11:40–13:30 ·
    No location / recorded") because "Add travel" steals the width.
  - Gap rows use a different order: "No location recorded · 3 h 35 min ·
    13:20–16:55".

  Fix: one format for both, "11:40–13:30 · 1 h 50 min · no location". Put the
  button under the text, as a small tonal button, left-aligned to the text
  column. Title in `text`, with the amber only on the dashed rail and a 16 px
  icon.

### Fix trip / Add travel / transit sheets (`sheet-*`)

**Score: 15/19.** Fails: H4, T2-ish (G3 overline), S3, A1.

- **H4.**
  - The sheet title "Fix this trip" is 28/800, the same as a screen title. M3
    sheets use Title L (22) or Headline S (24).
  - The close button is a 40 dp grey circle, top-aligned with the title rather
    than centred on it.
- **Mode grid.**
  - It's 5x2 tiles, each with a mode-coloured glyph, so the sheet becomes a
    rainbow. That's acceptable as data, but each tile is 60x64 with both an
    icon and a label, and the selected state is a 2 px accent border plus a
    tint.
  - Fix: glyphs in `textSecondary` for unselected tiles, the mode colour only
    on the selected one. Selection becomes the tint plus the check, with no
    thick border.
- **G3.** "HOW DID YOU TRAVEL?" and "LINES, IN ORDER (OPTIONAL)" are shouty
  uppercase questions. Fix: sentence case, 14/500.
- **Transit line rows.** The "1" in a grey circle, the solid green "Tram 4"
  badge and an X are fine structurally. Use the neutral badge from G6.
- **Footer.**
  - A full-bleed hairline above the footer, with "Undo fix" (tonal) and "Save"
    (solid): good.
  - "Save" with a check icon is redundant. Drop the icon.
- **Handle.** 32x4 and 28 corners: correct.

### Photo viewer (`sheet-photo`)

**Score: 9/11.** Fails: S1, I4.

- **S1.** The scrim is about 85% black, so the timeline shows through (the
  "Bus 550" badge, row text). That's distracting. A media viewer should be
  opaque black (#000) with status-bar-coloured chrome.
- **I4.** The photo touches the screen edges with no safe area. That's fine,
  but the counter "1 / 2" and the "Open in Immich" pill are top-only. Add a
  bottom caption (date, time and place, 13 muted), the way Google Photos does.

### Insights → Travel (`insights-travel-1..4`)

**Score: 12/21.** Fails: H4, T3, I3, S3, St4, A1, A4-density. Unverified: A2.

- **G1 / H4.** "Insights" (28), then the segmented control, then the pager
  ("2026 / October" at 22/800, with circular buttons). That's three header
  bands, about 250 dp, before data. Fix: segmented control as M3 primary tabs
  (text tabs with an underline indicator, 48 dp) directly under a smaller
  title. The pager becomes a single line, "‹ October 2026 ›", in Title M.
- **The segmented control is an iOS idiom.** The white raised thumb on a grey
  track is an iOS pattern. On Android, use M3 tabs, or M3 segmented buttons
  (outlined, with a check on the selected segment).
- **Distance by mode.**
  - The stacked bar is good. The legend wraps to three lines with "Train 42
    %" spacing (G4).
  - Bus and Tram share a dot colour, and so do Train and Metro (G6).

  Fix: legend as a 2-column list with right-aligned tabular percentages, or
  label only the top three segments.
- **Saved places.**
  - The accent-tinted tiles (G5) differ from the neutral tiles in every other
    list.
  - "Home" has a two-line trailing value ("25 nights / 428 h") while the
    others have one.
  - "Grandma's (the old family home in K…" is truncated.

  Fix: one trailing value, "428 h", with nights in the meta line. Allow two
  lines for the title.
- **By mode.**
  - Ten small multiples, each about 138 dp, take four screens.
  - Each has its own y-scale, contrary to the reference (shared scale): Drive's
    July bar is as tall as Walk's August, but they are very different
    distances.
  - The unselected bars are accent-tinted, while the selected bar is
    mode-coloured, so two colour systems share one chart.
  - "Ferry / None this month" still shows bars.

  Fix:
  - Use a shared scale (or say "each row has its own scale").
  - Unselected bars in neutral.
  - Collapse modes with zero distance this period into one "Also: Ferry,
    Flight — none in October" line.
  - Reduce each row to about 88 dp: a 40 tile, name and journeys, km on the
    right, and a 32 dp sparkline.
- **I3.** Mode tiles are circles here but squares in Saved places right above.
  Use one tile shape.
- **Footnote.** "Months follow your account's time zone; a journey across a
  month boundary is split by time. Tap a bar to open that month." is
  developer copy. Fix: "Tap a bar to see that month." The time-zone rule
  belongs in Help.
- **A1.** Unselected bars are 1.45:1 / 1.51:1 (see Overview).

### Insights → Trips (`insights-trips-1..3`)

**Score: 12/18.** Fails: I4, S3, St4, A1, H3-density, G7.

- **I4.**
  - The cover scrim is a stack of translucent bands, and the banding is
    clearly visible as horizontal stripes (Tampere, Tallinn, Oulu).
  - The white title sits on mid-tone yellow at about 3:1 at the top of the
    text block.
  - The no-cover fallback (Lapland) is a near-black slab with a route glyph,
    which in light mode is a black hole in a light list.

  Fix:
  - Use a real gradient: `react-native-svg` is already installed, so use
    `<LinearGradient>` (or `expo-linear-gradient`), black 0→65% over the
    bottom 55%.
  - Fallback is a static map thumbnail of the route (as the reference says),
    or at least the neutral `surfaceAlt` with a muted glyph in light mode.
- **Card layout.**
  - Cover title 22/800 on the left and "381 km / 3 days · 2 nights" on the
    right give two competing text columns over the photo.
  - Fix: Polarsteps-style. Title 20/600, then one meta line "2–4 Oct · 3
    days · 381 km", all on the left. The country goes into the meta line, and
    the chip footer goes (G7). That cuts each card from about 260 to 200 dp.
- **Intro copy.** "Nights spent more than 30 km from home (Home), found
  automatically." The "(Home)" is a leaked variable. Fix: "Trips are nights
  you spent 30 km or more from home."
- **Good.** Year headers with counts, one aspect ratio, 14 radius with the
  image clipped.

### Trip detail (`insights-trip-detail-1..3`)

**Score: 13/19.** Fails: H4, T3, S3, G7, St4, I3.

- **Back link.** "‹ Trips" in accent and then a hero card. On M3 this should
  be a top app bar with a back arrow, or the hero full-bleed with the back
  arrow overlaid on the scrim.
- **H4.** The 2x2 stats at 28/800 for "6" and "5" (days, nights) are huge for
  tiny numbers, and duplicate the cover meta. Fix: one row of 4 small stats
  (17/600 values), or fold days and nights into the cover meta.
- **"Left home 07:30 on Friday 7 August, back 18:40 on Wednesday 12
  August."** A sentence where a meta line would do. Fix: "Out 07:30 Fri 7 Aug
  · back 18:40 Wed 12 Aug", 13 muted.
- **How you travelled.**
  - These are progress bars, a third chart style for the same data: Overview
    uses bars, Insights a stacked bar.
  - Tiny values show as dots.

  Fix: reuse the Insights stacked bar plus a legend list, so mode share looks
  the same everywhere.
- **Cities as chips** ("Lisbon · 4 d 6 h"). These are navigation. Fix: list
  rows with a chevron, like the World tab.
- **Day by day.**
  - Every row has a title, a meta line and a chip row (about 97 dp).
  - "Tap a day for its timeline" is redundant with the chevrons.

  Fix: two-line rows: "Day 2 · Sat 8 Aug" and "Lisbon, Sintra · Bus, Walk"
  muted, then 8.7 km and a chevron. Drop the hint.
- **Data consistency.** The Cities chip says "Lisbon · 4 d 6 h" but the City
  page says "Time spent 4 d 1 h". Either different metrics or a bug, and
  either way users will notice.

### City / Country / World (`insights-city-1`, `insights-country-1`, `insights-world-1`, `insights-world-cities`)

**Score: 13/19.** Fails: H3-density, I3, T3, St4, G4, A2?

- **Control stacking on World.** The page stacks four controls before the
  list:
  - the Insights segmented control
  - a description
  - a stats card
  - a second segmented control (Countries / Cities)
  - a "Sort by" chip row that runs off-screen with a clipped "A" (presumably
    "A–Z").

  Fix:
  - Make the sort row a single "Sort: Visits ▾" text button that opens a
    menu, right-aligned on the list's section header.
  - Make Countries/Cities a two-tab switch inside the list header.
  - Drop the description.
- **I3.** Every country has the same flag glyph, and every city the same
  building glyph, so the 40 dp tiles carry no information. Fix: country rows
  get a tile with the ISO code ("FI", 13/500) and no emoji flags. City rows
  drop the tile and get a 16 inset.
- **T3 / G4.** The list is sorted by "Visits", but the trailing value shows
  time, and time switches units between rows ("34 d 17 h", "38 h 20 min").
  Make the trailing value match the sort key, and use one duration format.
- **City page.** The stat card plus three rows leaves half the screen empty.
  Fine for small data, but a small static map of the city's places would
  carry the page (Swarm-style).
- **Good.** Chevron rows with trailing date and tabular values; footnote "1
  place has no address yet." is honest partial-data handling.

### Places (`insights-places-*`)

**Score: 12/19.** Fails: I3, S3, T1, G7, St4, A4-variable-rows.

- **I3 / S3.** Saved places get accent tiles and accent badges ("Home",
  "Family", "Work", "School"), plus a neutral "Most visited" badge. So one list
  has two tile treatments and two badge tones. Fix: neutral tiles for all, the
  saved kind as the glyph only, plus a single small "Saved" section header to
  separate saved from frequent places. Drop "Most visited", since the order
  already says it.
- **Ordering is unexplained.** Rows run 164, 66, 31, 12 (saved), then 51, 44
  visits. Readers think the sort is broken. Fix: section headers "Saved" and
  "Other places".
- **Icon alignment.** Tiles are vertically centred on three-line rows. The
  reference says align to the first line. Pin tiles to the top with a 2 dp
  offset.
- **Search results.**
  - Four text lines plus a row of date chips per result.
  - "Last visit 3 Oct 2026 · 3 visits · 1 h" repeats the first chip.

  Fix: two lines, "Restaurant · Tampere" and "3 visits · last 3 Oct". Drop the
  date chips, or make them a horizontal text list.
- **"CITIES AND COUNTRIES" overline** plus a "City" badge on a row that
  already says "Tampere, Finland". Drop the badge.
- **Good.** The search field (tonal, 48 dp, clear button) and the "Nothing
  matches" empty state are well done.

### Recorder (`recorder-1..2`, `recorder-problems-*`, `recorder-auth-lost`)

**Score: 14/20.** Fails: H4, T4, S3, G3, copy, H3-density.

- **H4.** The status card ("Recording / Balanced preset · smart tracking" with
  a green tile and a switch) is good. But the screen is then four grouped
  lists of label/value rows of equal weight, with nothing saying "everything
  is fine". Google Fit / Strava device screens lead with one health line.

  Fix: under the status card, one line with a 16 px check, "All good · last
  upload 5 min ago", and collapse the Battery and Server groups behind a
  "Details" disclosure. Show them expanded only when there's a problem.
- **Copy (T4 spirit).** These read like a log:
  - "Matka (estimate) ≈ 1 % · 60 mAh"
  - "Phone draw, recording ~125 mA"
  - "Measured drop, unplugged 290 mAh in 8.0 h"
  - the footnote "(calibrated 2026-10-28 on a OnePlus 13R (CPH2645))"
  - "Watchdog: the phone stopped location updates / Re-registered location
    updates at 10:32 — no location for 18 min while moving"
  - "Next retry in 8 min (4 failed)".

  Fix: plain language, with the numbers kept:
  - "Matka used about 1% of battery today"
  - "Recording paused by the phone for 18 min at 10:14 — restarted"
  - "Upload failing · retrying in 8 min".

  Move the mA figures to a Details sheet, and drop the device model string.
- **S3.** Status colours are everywhere: green "Always, precise" and "On", a
  red "Only while in use", amber "37 412", amber "in 8 min (4 failed)", an
  amber last-error line, a red banner and an amber watchdog warning, all on
  one screen.

  Fix: status colour only on the icon and the banner. Values stay in `text`,
  with a 16 px status icon before them where needed.
- **Banners.** A danger-soft background with the title in danger red, and a
  white "Open app settings" button. In dark mode the background is a muddy
  maroon (#3A1F1F) with a black button. Fix:
  - an M3-style card in `errorContainer` / `onErrorContainer`
  - a tonal error button, not white/black.
- **The Server group has no dividers**, while the groups above do (Recording,
  Battery, Upload). Use one ListGroup style.
- **"Checked just now"** floats under the card at 13 muted. Fold it into the
  group footer, or into the health line.
- **Good.** The tab badge dot on Recorder when pairing is lost, the clear
  "Pairing lost" banner with a single action, and the "Upload now" tonal
  button.

### Settings (`settings-1..3`)

**Score: 13/19.** Fails: H1, H4, S4, T4/copy, G3, H3-density.

- **Header.** "‹ Recorder" link, then "Settings" 28/800: two rows (G1).
- **Preset radio rows.** The descriptions are packed with symbols: "Wi-Fi/cell
  positioning, a point every ≥2 min / 100 m. Coarse trips, lowest drain."
  "100 / m." wraps across lines.

  Fix: one plain line each:
  - "Lowest battery · rough routes"
  - "All-day use · recommended"
  - "Detailed routes · more battery"
  - "Hikes and runs · drains fast".

  Move the numbers to the Custom section.
- **Custom.** Three five-way segmented controls (Accuracy, Distance, Time).
  These are iOS idioms and visually heavy. On Android: M3 segmented buttons
  for the three-way accuracy choice, and a discrete slider or a dropdown for
  distance and time.
- **S4 / H1.** "Keep it running" is a card that contains only one full-width
  tonal button. The Pairing card has two full-width buttons ("Pair again",
  "Unpair this phone" in danger tonal), and the Queue card has a disabled
  danger button. That's three full-width buttons in cards.

  Fix: these are list rows with a leading icon ("Open app settings ›",
  "Pair again ›"). Danger actions become a row in error text, with a
  confirmation dialog.
- **Footnotes.** Long paragraphs under almost every group, for example 5
  lines under Smart tracking. Fix: one sentence. Details go in Help.
- **Good.** The radio rows are well built (the whole row is the target, the
  radio is aligned to the first line). Version footer.

### Pair (`pair`, `pair-manual`)

**Score: 16/19.** Fails: G1 (title offset), A4 (top inset), T2-ish.

- **Top inset.** The title starts about 12 pt higher than every other screen,
  so the safe-area or top padding differs. Use the shared header.
- **Instruction copy.** "In the Matka web app, open Devices → Pair a device
  and scan the QR code it shows." Fine. Consider a numbered two-step list.
- **Hint.** In Enter manually, "You can also paste the whole pairing link
  (https://…/pair#… or matka://pair?…) into the server field." is
  developer-facing. Fix: "You can also paste the pairing link here."
- **Good.** One solid action per state ("Allow camera", "Continue"), "Not
  now" as a text button, outlined 48 dp fields with labels above.

### Empty / error / loading (`empty-*`, `error-*`, `loading-*`)

**Score: 8/12.** Fails: St1 (Overview shape, the "…" pager), St2 (no action
on empty Timeline / Trips), St3 (Insights pager active on error).

- **Empty states.** Icon, title and sentence in a card: good. But empty
  Timeline and empty Trips have no action. Fix: "Open Recorder" or "Start
  recording" as a tonal button, or a text link to Settings → presets.
- **Error.** A clear title, a reassuring sentence and "Try again". On Insights
  the month pager stays visible, with active chevrons and "…" as its label.
  Hide the pager, or show the month name, when the data fails.
- **Same icon everywhere.** The route glyph is used for empty Overview, empty
  Timeline, the map placeholder and the trip fallback. Vary it by meaning:
  calendar-x for no days, luggage for trips (already), map for the map.

---

## What's good (keep)

- The token file is disciplined: one neutral ramp, contrast-checked text
  colours, a 4-pt spacing scale, one radius per component type.
- No emoji anywhere. Every icon is Lucide at consistent sizes, and the
  navigation bar follows M3 (pill indicator, labels on every item).
- The timeline shows uncertainty honestly ("Were you here?", dashed gaps,
  "Missing travel" with an action, "Edited" / "Added by you" badges).
- Sheets are built right: handle 32x4, 28 corners, a footer divider, one
  solid action.
- Grouped lists have inset dividers, 48 dp+ rows and tabular values. Dark
  mode is a real dark theme, not an inversion.
- Empty, error and search-miss states exist everywhere and use friendly copy.

---

## Top 15 fixes, ranked by visual impact

1. **[M] Rebuild the Timeline top.** The date goes in the app bar (‹ Sun
   18 Oct › and a calendar button), and the "Timeline" title goes. The day map
   becomes full-bleed with no "Day map / Hide" row. Day stats become one
   compact line plus a stacked mode bar instead of clipped scrolling chips.
2. **[M] Fix the type weights.** Bundle Inter or Roboto Flex at 400/500/600
   via `expo-font` and drop 800 everywhere. Titles and stat values become 600,
   row titles 500.
3. **[M] One row anatomy for the timeline.**
   - One text start for visits and travel (drop visit cards, or inset travel
     rows to match).
   - One continuous 2 dp rail.
   - Travel rows about 40 dp with one meta line.
   - No per-row pencils (the row opens the Fix sheet).
   - Durations muted in the meta line.
   - Remove the black number badges.
4. **[S] Make colour mean data.**
   - Unselected chart bars and place-time bars become neutral grey (no accent
     tint).
   - Saved-place tiles and badges become neutral.
   - Move Train off the accent hue (1.09:1 against it today).
   - Use darker glyph steps for Bus and Walk on white (2.2:1 and 2.8:1 today).
5. **[S] Fix mode and transit colour collisions.** Give Tram and Metro their
   own slots (or merge them into "Bus & tram" and "Rail" in legends). Transit
   line badges become neutral pills with a mode-coloured bar, not operator
   blue/orange/cyan.
6. **[M] Unify formatting in one module.**
   - Thousands separator.
   - Durations: "45 min" / "2 h 35 min" / "1 d 14 h", replacing "570 h
     1 min", "38 h 20 min" next to "34 d 17 h", and "3.4 h".
   - "52%" with no space, and "Sep" not "Sept".
   - Strip postcodes from place names.
7. **[S] One header system.** The same `ScreenHeader` on every tab (no "Good
   afternoon" greeting, Pair at the same top offset), and an M3 top app bar
   with a back arrow on sub-screens instead of a link row plus a 28 title.
8. **[S] One section-header style.** Sentence case everywhere: no uppercase
   overlines ("BATTERY TODAY", "HOW DID YOU TRAVEL?") next to 17-pt sentence
   headers.
9. **[M] Trip covers.**
   - A real `LinearGradient` scrim (react-native-svg is already in) instead of
     the visible bands.
   - Title and meta left-aligned on one column.
   - A map-thumbnail or neutral fallback instead of a black slab.
   - Drop the chip footer.
10. **[S] Cut chips that aren't filters.** Mode chips on trip cards and Day by
    day, date chips in search, city chips, and the stats chips on Timeline.
    Use glyph rows or meta text.
11. **[M] Compact Insights → Travel "By mode".**
    - A shared y-scale.
    - Neutral unselected bars.
    - Rows of about 88 dp.
    - Zero-distance modes collapsed into one line.
    - The legend as a 2-column list.

    Today it's four screens of near-identical cards.
12. **[S] Calm the World tab.**
    - A "Sort: Visits ▾" menu replaces the clipped chip row.
    - The trailing value matches the sort key.
    - Countries/Cities moves into the list header.
    - ISO-code tiles for countries replace identical flag glyphs; city tiles
      go.
13. **[S] Overview hierarchy.**
    - Merge the hero and the 2x2 stats into one card (hero 28/600, the others
      17/600).
    - Align the chart y-labels to their gridlines.
    - Fix the colliding month labels.
    - Muted trailing durations.
    - One row anatomy for both place lists.
    - Group Recent visits by day.
14. **[S] Loading and state polish.**
    - Skeletons in the final shape (Overview grid and chart, a rail in the
      Timeline).
    - No literal "…" in the pagers.
    - Hide the pager on error.
    - Add an action to the empty Timeline and empty Trips.
    - Make the photo viewer opaque black.
15. **[S] A copy pass for Recorder and Settings.** Plain-language health lines
    instead of the mA, calibration and watchdog log text. Diagnostics behind
    "Details". One-line preset descriptions without ≥/~ symbols. Plus
    "(Home)", "GPS jumped around here", and lowercase OSM tags ("artwork",
    "address") in the candidate list.

---

## Response (round 2, app)

1. **Timeline top: done.** The date is in the app bar with ‹ › and a calendar (a month picker). The map is full-bleed with no header row. The stats are one line, the shared stacked bar and a glyph legend.
2. **Type weights: done.** Inter at 400/500/600 is embedded by the expo-font plugin (it loads before first render, release too). Nothing is 800.
3. **Timeline row anatomy: done.** Visits are plain rows on one text start. One 2 dp rail. Travel rows are one line and the row opens the Fix sheet. No pencils, no number badges, durations in the meta line.
4. **Colour means data: done.** Unselected bars are neutral at 3:1. Saved tiles and badges are neutral. Train/Metro are slate and the Bus/Walk/Run glyphs are darker, per the shared palette.
5. **Mode and transit collisions: partly.** Tram/Metro still share the Bus/Train slots: the shared palette keeps eight validated colours, and rows and legends name them. Line badges keep HSL signage colours (a shared web/app decision), in the shared badge shape.
6. **One format module: done.** `format.ts` holds the shared rules (comma, "12 d 3 h"/"46 d", "52%", "Sep", 24 h), and postcodes are stripped.
7. **One header system: done.** Every tab and Pair use `ScreenHeader`, pushed views use the `AppBar` back arrow, and the greeting is gone.
8. **One section-header style: done.** Sentence case 17/600 everywhere, including grouped lists and sheets.
9. **Trip covers: done.** An SVG `LinearGradient` scrim, title and meta on one left column, a neutral fallback in light mode, no chip footer. There's no map thumbnail; no static-map source exists in the app.
10. **Chips that aren't filters: done.** Trip cards, Day by day, search dates, city chips and Timeline stats became meta text or rows. Chips remain only for real choices.
11. **By mode: done.** A shared scale, neutral bars, compact rows, quiet modes collapsed into one "Also: …" line, and a two-column legend.
12. **World: done.** A "Sort: Visits" sheet, a trailing value that matches the sort, Countries/Cities in the list header, ISO-code tiles, and no city tiles.
13. **Overview hierarchy: done.** The hero and stats are one card, labels sit on gridlines, months are three letters with the year, durations are muted, both lists share one row anatomy, and recent visits are grouped by day.
14. **Loading and states: done.** Skeletons are in the final shape (Overview grid and chart, Timeline rail, app bar title). There's no "…", the Insights pager hides on error, empty Timeline and Trips have an action, and the photo viewer is opaque with a caption.
15. **Copy pass: done.** Recorder has a health line, and diagnostics sit behind Details. Presets have one-line descriptions. Also fixed: "(Home)", "Noisy GPS — distance not counted", and sentence-case candidate types.

**Data mismatch:** the mismatch came from preview mock data plus two different metrics (time on this trip vs all visits to the city), not a server bug. The mock is fixed and both values are labelled.
