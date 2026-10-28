# Matka phone app: design critique, round 3

This is an independent review of the phone app (Expo SDK 58 / RN 0.88) after
the round 2 response. It is the last pass before the owner tries the app on a
real phone, so it ranks problems by what a user will notice in the first five
minutes, not by how hard they are to fix.

**Screenshots:** `/tmp/shots/redesign/r3/app/review/{light,dark}/`, with 61
files per theme. They come from `mobile/preview/screens.mjs`, at 390x844 and
2x. Every view and state was captured in both themes.

**New in `screens.mjs` (review extras):**

- the day picker (`timeline-daypicker`)
- Overview while recording (`overview-recording`)
- the default Recorder with recording off (`recorder-off`)
- Recorder with Details expanded (`recorder-details`)
- the Settings option sheet (`settings-distance`)
- the World sort sheet (`insights-world-sort`)
- `error-timeline`, `loading-insights`, `loading-places`, `empty-places` and
  `empty-travel`

**Measured, not eyeballed:** a playwright probe read the computed font sizes
and the hit boxes of the controls, so the type and touch-target notes below
are numbers.

**Preview caveats (not app bugs).** Shadows and the Switch are drawn by
react-native-web. In the shots the Switch thumb is teal on an indigo track,
but the code sets `thumbColor="#FFFFFF"`, so it is fine on Android. The Map
tab and the day map are placeholders. Text truncation shows as "...", where
Android shows "…". Inter is loaded by the preview loader, as on the device.

---

## Overall impression

Round 2 did the heavy lifting:

- one header system
- Inter at 400/500/600
- the formatting module
- neutral bars
- a calm timeline rail
- consistent cards and grouped lists
- sentence-case section headers

Dark mode is well tuned. At a glance the app now looks designed rather than
generated.

The remaining problems are no longer about style. They are about **behaviour
and truth**, the things a user finds by using it:

- **Places you can't open.** 26 places in the Places tab, and the places in
  City view, are dead rows.
- **Overnight times that don't say which day.** "22:05–08:20" opens Sunday's
  timeline.
- **A duration in the wrong format.** Trip detail shows "28 h".
- **A sparkline that shows nothing.** Most rows are flat dashes, yet the
  footnote says "Tap a bar".
- **Loading states that jump** (Insights, Places, the Timeline map).

There is also a handful of spacing and anatomy slips that make a few screens
feel less finished than the Timeline and Overview.

---

## Screen by screen

The checklist is DESIGN_REFERENCES.md section 5. ✓ = pass, ✗ = fail, ~ =
mostly. Only the failing or notable lines are listed per screen. Lines not
mentioned pass.

### Overview (`overview-1..3`, `overview-recording`, `empty-overview`, `error-overview`, `loading-overview`)

Checklist: one primary ✓ (Start, or Stop as tonal when recording) · left
edges ✓ · spacing ✓ · hierarchy ✓ · type ✓ · tabular ✓ · icons ✓ ·
surfaces ✓ · states ✓ · targets ~ (month bars 23 dp wide) · overnight
honesty ✗.

1. **The place-time bars have ragged right ends** (`overview-2`, "Where you
   spend time").
   - The track width follows the width of the trailing value. The Esimerkkitie
     track ends at about 288 dp, the library at 296 and Kilpisjärvi at 304, so
     the five bars don't share a right edge and "100%" means a different
     length on each row.
   - Fix: give the trailing value a fixed column (min-width about 72 dp,
     right-aligned), or put the bar under the title only and end every track
     at the same x.
2. **Overnight visits read as one ambiguous range** (`overview-2/3`, Recent
   visits).
   - "Esimerkkitie 2 18:35–07:10" under "Sun 18 Oct" is ambiguous.
   - Under Sat 17 Oct, "Esimerkkitie 2 22:05–08:20" sits directly above "Esimerkkitie
     2 18:35–22:05". The same place appears twice, back to back.
   - The shared rule (palette.md, "Times") is `16:58 – until 09:45 tomorrow`
     and `Since 16:58 yesterday`. The web does this; the app doesn't
     (`fmtTime` is used raw, and nothing in `src/` says "yesterday" or
     "tomorrow").
   - Fix: port `formatVisitRange` from web `lib/format.ts` to
     `src/format.ts`. Use it here, in the Timeline, in Places search and in
     Trip detail.
   - Also merge consecutive visits to the same place on the same day in this
     list (or show only the later one).
3. **"Unnamed place" is a top-level row** (`overview-3`).
   - Round 2 (G8) asked for "Place near Esimerkkitie" in muted text, or for these
     to be hidden from summaries. It still reads like a data hole in the most
     visible list in the app.
   - Fix: in Recent visits, show the street or area from the reverse geocode
     ("Near Otaniementie") in `textSecondary`, or skip visits under 30 min
     with no name.
4. **The "All places" and "Timeline" text actions sit 12 dp inside the card's
   right edge** (`overview-2`, x≈361 vs the card at 373 and values at 357).
   They line up with nothing. Fix: right-align the section action to the
   value column (16 + 16 inset), or to the card's outer edge, and use the
   same rule on every section header with an action.
5. **Recent visits rows have no leading glyph.** The same visits in Places
   and the Timeline have a 40 dp tile or a rail glyph. Without it, eight rows
   of name plus time are a wall. Fix: add the 32 dp place glyph (the
   Timeline's), or at least the category icon at 20 in `textSecondary`.
6. **Chart.**
   - The x labels touch ("May Jun", "Apr May") at 13 px. At 12 bars, use
     12 px labels, or label every other month plus the selected one.
   - The bars' hit boxes are 23 dp wide, below 48. Fix: make the whole plot
     a single pan or press responder that picks the nearest bar.
7. **Loading (`loading-overview`).** Good: the final shape. Keep it.

### Map tab (`map`)

This is a placeholder in the preview, so there is nothing to judge
visually. On the device, check that the web map's top-right controls clear
the status bar inset and that the legend doesn't sit under the tab bar.

### Timeline, day view (`timeline-1..3`, `timeline-prev-day-1..2`, `timeline-question`, `timeline-daypicker`, `loading-timeline`, `empty-timeline`, `error-timeline`)

Checklist: one primary ✓ · one text start ✓ (x=68 for every row) · spacing
✓ · hierarchy ✓ (15/500 titles, 13 meta, measured) · tabular ✓ · icons ✓ ·
rail ✓ · states ~ (skeleton shape) · overnight honesty ✗ · touch ~ (visit
rows 42 dp, icon buttons 40 dp visible with hitSlop).

This is the best screen in the app. The fixes are about truth and edges.

1. **Overnight ranges** (`timeline-1` first row "22:05–08:20", `timeline-3`
   last row "18:35–07:10", `timeline-prev-day-1` "23:10–09:40"). The first
   thing a user sees each morning is a range that starts after it ends. Fix:
   "Since 22:05 yesterday · 10 h 15 min · House" and "18:35 – until 07:10
   tomorrow". This is the same function as Overview item 2.
2. **The rail under a visit takes the next trip's colour.**
   - Under City library the rail is walk-green through the photo strip
     (`timeline-3`). Under Cafe Regatta it is cycle-orange through "Were you
     here?". Under Lauttasaari it is ferry-teal (`timeline-prev-day-2`).
   - But under Kamppi it is grey (the next row is missing travel). The
     colour therefore says "you were walking" while you sat in the library.
   - Fix (`TimelineScreen.tsx` `railColor`, line ~338): the segment from a
     visit's glyph down to the end of that visit's body is always
     `borderStrong`. The mode colour starts at the travel row's own top edge.
3. **The gap row reads as a different component from Missing travel**
   (`timeline-prev-day-2`).
   - It is "13:20–16:55 · 3 h 35 min · no location recorded", wrapping to a
     second line with "recorded" orphaned, in muted text with no title.
   - On Sunday, "Missing travel" has a title and says "no location".
   - Fix: give both the same two-line anatomy. The title is "No location"
     (`textSecondary`, 15/500) and the meta line is "13:20–16:55 · 3 h
     35 min". Use one phrase, "no location", in both.
4. **A transit leg inside a Bus row keeps the bus colour** (`timeline-1/2`).
   - "Bus · 11.2 km" contains a Metro M1/M2 leg after a wait, and the rail
     stays amber the whole way.
   - Fix: either split the rail at the leg boundary (slate for the metro
     part, using the leg distances you already have), or title the row by
     the dominant legs ("Bus + Metro · 11.2 km").
   - At minimum, the title shouldn't say "Bus" when the mode legend counts
     the metro separately.
5. **"Were you here?" while picking** (`timeline-question`).
   - With the list open, the row reads "Were you here?  [Yes]  Close", and
     the alternatives sit below it.
   - "Yes" next to a list of other places is ambiguous: yes to which?
   - Fix: while the candidates are open, hide "Yes". Use the row as a header
     ("Where were you?") with "Cancel" trailing, and show the original guess
     as the first candidate with a check.
6. **Visit rows are 42 dp tall to touch.** The probe measured the visit
   pressable at 298x42. It needs vertical padding to reach 56. Two-line rows
   should be at least 64 by the checklist.
7. **Loading shape (`loading-timeline`).**
   - The map skeleton is an inset 88 dp rounded card, but the loaded map is
     full-bleed and about 300 dp tall. The app bar is a grey bar where the
     date and ‹ › 📅 will be.
   - Everything jumps on load.
   - Fix: a full-bleed `surfaceAlt` block at the real map height, the three
     app-bar icon buttons drawn (disabled), and the date skeleton at the
     title's width.
8. **Day picker (`timeline-daypicker`).**
   - Days with data are plain black numerals, and days without are grey.
     That is a weak signal, and it relies on colour alone.
   - Add a 4 dp dot under days with data (accent for the selected day,
     `textMuted` otherwise), as Google Maps Timeline does.
   - "Today" (28) has an outline ring but no data, so it looks selectable
     and isn't.
   - The footnote "Days with something recorded can be opened" is
     instruction copy that the dots make unnecessary.
9. **Transit badges.** They are 12/16 at 500 per the shared spec (measured)
   and look right.
   - "Tram 4/4T/10" in the row vs "Tram 4" in the Fix sheet
     (`sheet-fix-transit`) is a mock artefact, but check it on device: the
     sheet should list every inferred line.
10. **Empty and error (`empty-timeline`, `error-timeline`).** Good.
    - The app bar falls back to "Timeline". That's correct, but then the
      ‹ › 📅 icons vanish, so the bar's anatomy changes.
    - Keep the calendar icon (disabled) so the bar is stable.

### Sheets: Fix this trip, Add travel, transit (`sheet-fix-trip`, `sheet-add-travel`, `sheet-fix-transit`)

Checklist: all pass except: the selected-tile check is cramped; Add travel
pre-selects a mode.

1. **The selected-tile check mark** sits in the tile's top-right corner, 6 dp
   from the edge, where it overlaps the radius. It reads as a stray tick.
   Fix: either drop it (the tint plus the accent label already say
   "selected"), or put an 18 dp filled accent circle with a white check,
   centred on the corner at (-4, -4).
2. **Add travel pre-selects Walk** for a 1 h 50 min gap of 518 m
   (`sheet-add-travel`), and Save is live immediately. A user who taps Add
   travel and then Save by reflex records a walk they didn't make. Fix: no
   pre-selection, with Save disabled until a mode is picked. Alternatively,
   pre-select only when the speed makes one mode obvious, and say so ("Looks
   like a walk").
3. **The subtitle "shown as Walk"** is fine. "edited" in the transit
   sheet should be "you edited this" or a neutral badge, as in the row.
4. **The line list** ("1 [Tram 4] ×"): the step number in a grey circle
   beside a coloured badge is heavy for a list that usually has one item.
   Show the number only when there are two or more lines.

### Photo viewer (`sheet-photo`)

Pass. It is opaque black, with "1 / 2", the Immich pill, the close button
and a caption. One nit: the caption "Bus · 08:31–09:02" sits 24 dp above the
bottom edge, with no safe-area inset applied in the preview. On a phone with
gesture navigation, confirm it clears the handle (it needs `insets.bottom +
16`).

### Insights → Travel (`insights-travel-1..3`, `loading-insights`, `empty-travel`, `error-insights`)

Checklist: one primary ✓ · left edges ✓ · spacing ✓ · hierarchy ✓ · units ~
(km muted, d/h not) · icon tiles ✗ (two shapes on one screen) · colour ~ ·
states ✗ (generic skeleton) · touch ✗ (sparkline bars 10x32).

1. **The By mode sparklines are flat dashes** (`insights-travel-2/3`).
   - The bars share one y-scale across all modes (round 2, item 11), and
     Drive's July (2,707 km) sets the maximum. So Walk (116 / 57 / 103 / 134
     / 89 / 80 km), Train (up to 481 km) and the rest are 2 px stubs that
     all look the same.
   - Under them, the footnote "Tap a bar to see that month" invites taps on
     10x32 dp targets.
   - Fix:
     - Scale each row to its own maximum (the row's value is already given
       as a number, so what the sparkline shows is the shape over time).
     - Make the whole row the tap target (it opens that mode's months, or
       nothing).
     - Delete the footnote.
   - If a shared scale is kept on purpose, drop the sparklines. A flat line
     in every row is visual noise.
2. **Two icon-tile shapes on one screen.** Saved places use 40 dp neutral
   rounded squares. By mode uses 40 dp mode-tinted circles. Fix: use the
   rounded square everywhere, with a neutral fill and the glyph in its mode
   colour. That keeps colour on the glyph (a data mark) and off the surface.
3. **The "Distance by mode" legend uses dots, but Train and Metro (and Bus
   and Tram) are identical dots** (`insights-travel-1`).
   - The Timeline's day legend already uses mode glyphs.
   - Fix: use the 16 px mode glyph in its colour instead of the dot. That
     makes the legend unambiguous without new colours, and makes the two
     legends in the app one component.
4. **The stat strip units are inconsistent.** "1,148 km" has a smaller,
   muted unit, but "1 d 21 h" is all full-size. Apply the same unit styling
   to d/h/min (one helper that splits value and unit).
5. **"By mode / Last 6 months"** sits under a month pager set to October.
   The rows' km values are October's, and the sparklines are six months.
   Fix: rename the header to "By mode in October" and put "Last 6 months"
   as a caption under the sparkline column only, or drop it with the
   sparklines.
6. **Loading (`loading-insights`).**
   - Three plain slabs: one of them is 240 dp, and none matches the stat
     strip, the stacked bar or the rows.
   - Overview and the Timeline got shaped skeletons; Insights didn't.
   - Fix: reuse `StatGrid` with skeleton cells, a 12 dp bar plus four
     legend lines, then three `ListRow` skeletons with tiles.
7. **"Also: Ferry, Flight — none in October"** is good. Keep it.

### Insights → Trips (`insights-trips-1..3`, `empty-trips`)

Checklist: hierarchy ✓ · scrim ✓ · covers ✗ (the fallback has a different
shape) · spacing ✗ (intro line).

1. **The intro line is 8 dp under the tab divider** ("Trips are nights you
   spent 30 km or more from home."). The same goes for "26 places you come
   back to" on Places. Every other content block starts 16 dp below its
   header. Fix: 16 dp top padding on the tab body (`InsightsScreen` content
   container), the same on all four tabs.
2. **The no-cover trip card is a different object** (`insights-trips-2`,
   Lapland).
   - It is a grey box with a centred suitcase, and a 22 dp title in text
     colour on two lines. Its height differs from the 16:9 covers.
   - The web draws a route sketch in mode colours for this case.
   - Fix: keep the 16:9 frame, fill it with `surfaceAlt` plus the route
     sketch (the web's `routeSketch` output as an SVG path, or a simple
     polyline of the trip's points), and use the same scrim and white title
     as the photo cards.
   - Long titles get `numberOfLines={2}`.
3. **Cards in a year section have no gap rhythm.** The gap between cards is
   14 dp, and the gap before a year header is 48. Use 12 between cards and
   32 before a year header.

### Trip detail (`insights-trip-detail-1..3`)

Checklist: hierarchy ✓ · formatting ✗ · scrim ~ · imagery ~.

1. **"On the move 28 h"** is a total, so per the shared rule it should read
   "1 d 4 h".
   - Code: `TripDetailView.tsx:110` uses `fmtDuration(trip.duration)`, but
     it should be `fmtLongDuration`, as in `TravelView.tsx:185`.
   - Travel shows "1 d 21 h" one tab away, so the inconsistency is visible.
2. **The hero is a 220 dp photo with only a date caption.** The photo strip
   right under it repeats the same photos.
   - The caption "7–12 Aug 2026 · …" sits on the light part of the peach
     sample, in both themes. The scrim band is too short for a one-line
     caption 24 dp from the bottom.
   - Fix: either move the title onto the hero (as the trip cards do, with
     the app bar transparent over it) so the hero earns its height, or drop
     the hero and start with the stat strip and the strip of photos.
   - Whichever you choose, extend the gradient to cover the bottom 50% and
     check the caption at 4.5:1 on a bright real photo.
3. **"Out 07:30 Fri 7 Aug · back 18:40 Wed 12 Aug"** repeats the hero's date
   range in another form. Make it the hero caption's second line, or drop
   "7–12 Aug 2026" from the caption.
4. **How you travelled**: the same dot legend problem as on Travel (Train
   and Metro have the same dot).
5. **Day by day.**
   - Good rows.
   - The trailing distance is above the chevron, but the metric is ambiguous
     ("3,418 km" on day 1). Add "km" muted styling consistent with the stat
     strip.

### City / Country / World (`insights-city-1`, `insights-country-1`, `insights-world-1`, `insights-world-cities`, `insights-world-sort`)

Checklist: left edges ✓ · hierarchy ~ · header ✗ (two-line app bar) ·
navigation ✗ (dead places) · tabs ✗ (nested primary tabs).

1. **Places in City view can't be opened** (`insights-city-1`). The rows
   have no chevron and no `onPress`. It is the end of a three-level
   drill-down (World → Finland → Espoo → nothing). See Places item 1.
2. **The two-line app bar** (City "Lisbon / Portugal · last visited 12 Aug",
   and Country) puts the title 9 dp from the top of the bar. The back arrow
   is centred on the pair, so the title sits higher than on Trip detail and
   Settings. Fix: keep the 56 dp single-line `AppBar` (title only), and move
   the subtitle into the content as the first line (`callout`,
   `textSecondary`) above the stat strip.
3. **Nested tabs.** World has primary tabs (Travel/Trips/World/Places), then
   a second row of primary-style tabs (Countries | Cities) with their own
   underline. That underline stops at x=270 to make room for "Sort: Visits ▾"
   (`insights-world-1`), which looks unfinished. Fix: M3 says the second
   level should be secondary tabs, or better here a two-segment
   `Segmented` (Countries / Cities) at the left of the list header with
   "Sort: Visits" as a trailing text button on the same 48 dp row. No
   underline.
4. **The stat strip sits 8 dp under the tab divider** (`insights-world-1`,
   `insights-city-1`). Use 16, as above.
5. **The Country view is thin.** It has a subtitle, a sort and a list, and
   no stat strip, unlike City. For parity, add the three-up strip (Cities ·
   Visits · Time).
6. **The sort sheet** (`insights-world-sort`) is clean. "Places", "Time" and
   "Recent" as sort keys are fine.

### Places (`insights-places-1..4`, `insights-places-search`, `insights-places-nomatch`, `loading-places`, `empty-places`)

Checklist: hierarchy ✓ · icon tiles ✓ · navigation ✗ · consistency ✗ (two
row anatomies) · states ✗ (skeleton, "0 places") · spacing ✗ (intro line).

1. **A place row does nothing when you tap it.**
   - `PlacesScreen.tsx` ~line 219 renders `ListRow` without `onPress`, so
     the 26 rows are inert.
   - The same places in search results do have a chevron and open the day
     of the last visit (`onOpenDay`).
   - The most natural tap in the app is a dead end, and the user can't tell
     why search rows behave differently.
   - Fix, cheapest first:
     - **(a)** Make every place row open the day of its last visit, as
       search does, with a chevron.
     - **(b)** Add a small place sheet: map pin, totals, recent visits as
       rows that open their day, and "Open in web" for editing. The web has
       a full place page to mirror.
   - Apply the same to City view rows.
2. **Two anatomies for the same object.**
   - The list row is title / "Kind · City" with trailing "164 visits" over
     "23 d 18 h".
   - The search row is title / "Kind · City" / "3 visits · last 3 Oct", plus
     a chevron.
   - Pick one, preferably the list one with a chevron. Put "last 3 Oct" in
     place of the time when the query is active, if recency matters for
     search.
3. **The intro line is 8 dp under the tabs** ("26 places you come back to").
   - While loading it says "Where you spend your time" and then swaps to the
     count (`loading-places`). That swap is a text jump.
   - With no data it says "0 places you come back to" (`empty-places`).
   - Fix: one fixed line, "Places you come back to", with the count as a
     trailing caption only when it is greater than 0.
4. **Loading (`loading-places`)** is one 400 dp slab. Use five `ListRow`
   skeletons with tiles.
5. **Category glyphs collapse.**
   - Theatre, Attraction, Castle, Museum and Arts centre all use the same
     landmark glyph (`insights-places-4`).
   - Parking and Pub fall back to the generic pin.
   - "Unnamed place · Place · Espoo" says "place" twice.
   - Fix:
     - Map `amenity=parking` → `square-parking`, `pub|bar` → `beer`,
       `museum|arts_centre` → `palette` or `frame`, and
       `castle|attraction` → `castle`.
     - Drop the kind word when it is the generic "Place".
6. **No-match state** (`insights-places-nomatch`). The copy is good. Add one
   action ("Clear search"), as the checklist says (icon, sentence, action).

### Recorder (`recorder-1`, `recorder-off-1`, `recorder-problems-1..2`, `recorder-auth-lost`, `recorder-details-1..2`)

Checklist: one primary ✓ · hierarchy ~ (repeated "Recording") · status
colour ✓ · states ✓ · touch ✓ · copy ~.

1. **The Off state looks like an unchecked checkbox** (`recorder-off-1`,
   `recorder-auth-lost`).
   - The status tile is a 20 px square outline in a grey square tile, and
     the title is just "Off".
   - Overview says "Recording is off" with a dot.
   - Fix: title "Recording is off". The tile glyph should be `map-pin-off`
     or a hollow `circle` (the same family as the on state's `circle-dot`),
     not `square`.
2. **"Recording" three times in a row** (`recorder-1`): the status card
   title "Recording", then the section header "Recording", then the switch
   label. Fix: rename the section "Location" (it holds the permission, last
   fix and motion rows).
3. **The banner title is wrong for the state** (`recorder-problems-1`). It
   says "Location permission missing", but the permission is "Only while in
   use", as the row below says. Fix: "Background location is off", with the
   body "Matka can only record while the app is open. Allow location 'All
   the time'…". Android's own wording is "Allow all the time", not "Always";
   change the Settings footnote too.
4. **The Details expander** (`recorder-1`, `recorder-details-1`).
   - "Details" is a section header with a muted "Battery and server ⌄" on
     the right. Expanded, it is followed straight away by another section
     header, "Battery today", which reads as two headers stacked.
   - Fix: make the collapsed state a single `ListRow` in its own group
     ("Battery and server", chevron down). When it is open, drop the
     "Details" header and let "Battery today" / "Server" follow directly.
5. **The Server group duplicates Settings → Pairing** (Server, Device), and
   its footnote "Checked just now" sits under "Last check-in 20 min ago".
   These are two different checks that read as a contradiction. Fix: drop
   Server and Device here (Settings has them). Rename the footnote "Status
   refreshed just now", or remove it.
6. **Watchdog lines.**
   - "The phone stopped recording — couldn't restart at Tue 27 Oct 13:11"
     puts the time after the failure. Write "Tue 27 Oct 13:11 · Recording
     stopped and couldn't restart".
   - Lead every line with the time, so the list scans as a log.
7. **The status line under the card** ("All good · last upload 5 min ago")
   is outside the card at a 32 dp inset. It is the only free-floating line
   on the screen. Fix: move it into the card as the subtitle, replacing
   "Balanced preset · smart tracking", which Settings already shows.

### Settings (`settings-1..3`, `settings-distance`)

Checklist: pass, except the copy nits.

1. **"Custom" is both a radio option and the next section header.** Rename
   the section "Custom preset", or nest the custom controls inside the
   Custom row when it is selected.
2. **The option sheets** (`settings-distance`) list values only. Add one
   line of help under the title ("Smaller means more detailed routes and
   more battery"). Otherwise it is good.
3. **The disabled "Delete queued points"** is light pink on white. It reads
   as an error tint more than as disabled. Use `textMuted` for disabled
   destructive rows.
4. **"Set Location to 'Always' with Precise Location on."** Android calls it
   "Allow all the time" and "Use precise location". Match the OS words.

### Pair (`pair`, `pair-manual`)

Pass. One fix: step 2 always says "Scan the QR code it shows", even in
Enter manually mode. In manual mode it should read "Copy the server address
and token it shows."

### Empty / error / loading, cross-cutting

- **Empty and error:** consistent card plus a 64 dp circle tile, a title, a
  sentence and one tonal action. Pass.
- **Loading** is shaped on Overview and the Timeline rows, and generic slabs
  everywhere else. See the per-screen items above.
- **Zero values:** "0 places you come back to". A Recorder that is off shows
  "Last location 1 min ago" (a mock artefact; on device, confirm the row
  hides or says "Before recording stopped").

---

## Round 2 regressions and leftovers

| R2 item | Status in r3 |
|---|---|
| 1 Timeline top | Done, and good. The loading shape doesn't match it (map skeleton). |
| 3 Row anatomy | Done. The rail colour bleeds under visits (Timeline 2). |
| 6 One format module | Regressed in one place: Trip detail "28 h" (`fmtDuration` on a total). Overnight ranges were never ported. |
| 11 By mode | The shared scale made the sparklines unreadable (Travel 1). It needs a per-row scale. |
| 12 World | The Countries/Cities toggle became a second row of primary tabs with a broken underline. |
| 13 Overview | Done. The place-time bar tracks don't align (Overview 1). |
| 14 Loading | Overview and the Timeline rail are done. The Timeline map and app bar, Insights and Places aren't. |
| G8 Raw data | Postcodes and tags are fixed. "Unnamed place" is still a top-level label everywhere. |

---

## Top 12, ranked by what a user will notice

1. **[M] Make places openable.**
   - Every place row in Insights → Places and City view needs an `onPress`
     and a chevron.
   - At minimum, open the day of the last visit, as search already does.
   - Ideally, a place sheet with totals and recent visits.
2. **[S] Overnight ranges.**
   - Port the web's "Since 22:05 yesterday" / "until 07:10 tomorrow"
     formatter to `src/format.ts`.
   - Use it in Timeline, Overview Recent visits and search.
3. **[S] Fix or drop the By mode sparklines.**
   - Use a per-row scale, make the row the tap target, and delete "Tap a bar
     to see that month".
   - Today they are flat dashes with 10x32 dp targets.
4. **[S] Trip detail "28 h" → "1 d 4 h".** Use `fmtLongDuration` at
   `TripDetailView.tsx:110`. Also apply unit styling to d/h in stat strips.
5. **[S] Rail colour under visits.** The segment under a visit stays
   `borderStrong`, and the mode colour starts at the travel row.
6. **[M] Loading shapes for the Timeline map and app bar, Insights and
   Places.**
   - A full-bleed map block.
   - App-bar icons present.
   - `StatGrid` / `ListRow` skeletons instead of slabs.
   - No intro-text swap.
7. **[S] Spacing under the Insights tabs.**
   - 16 dp before the first block on every tab (Trips intro, Places intro,
     World and City stat strips).
   - A single-line `AppBar` on City and Country, with the subtitle in the
     content.
8. **[S] World's Countries/Cities control.** A `Segmented` plus a trailing
   "Sort" on one row, not nested primary tabs with a clipped underline.
9. **[M] The no-cover trip card.** The same 16:9 frame, with a route sketch
   or a neutral fill, the same scrim and a white title clamped to two lines.
10. **[S] Recorder copy and anatomy.**
    - "Recording is off" with a non-checkbox glyph.
    - Rename the "Recording" section to "Location".
    - Banner: "Background location is off" and "Allow all the time".
    - The Details expander as a row, not a second header.
    - Drop the duplicate Server group.
11. **[S] Legends use mode glyphs, not dots** (Travel, Trip detail). This
    resolves Train vs Metro and Bus vs Tram. One icon-tile shape (rounded
    square, neutral fill, mode-coloured glyph) on By mode.
12. **[S] Small truth and copy fixes.**
    - Overview place-bar tracks get a fixed trailing column.
    - "Unnamed place" becomes "Near ‹street›".
    - Add travel has no pre-selected mode.
    - "Yes" is hidden while picking another place.
    - The gap row matches Missing travel's anatomy.
    - The Pair step 2 copy follows the mode.
    - The day picker has data dots.

---

## Verdict

Round 2 turned the app from "competent template" into a coherent product,
in both themes:

- type, colour, header and list anatomy are now consistent
- the Timeline in particular reads like a first-party Google app

What is left is mostly not visual polish. A user will feel it within
minutes:

- tapping a place does nothing
- the morning's first visit says "22:05–08:20" with no day
- a trip says "28 h" where every other total says "1 d 4 h"
- the By mode chart is a row of identical dashes that asks to be tapped
- several Insights tabs start too close to their tab bar, and load as grey
  slabs that jump

None of these needs a redesign; most are S-sized. With items 1–7 done, the
app would hold up next to Google Maps Timeline or Arc on a real phone.

**Polish score: 7.5 / 10** (round 2's state, as reviewed, was lower; after
the top 7 I'd expect 8.5).

---

## Response (round 3, app)

1. **Make places openable: done.**
   - Places rows, search hits and City rows open a place sheet with totals,
     recent days (each opens its timeline) and "Open on the web".
   - A list row and a search hit share one row anatomy.
2. **Overnight ranges: done.**
   - `fmtVisitRange` follows the web's rule. It is used in the Timeline, in
     Recent visits (which also joins back-to-back stays and opens the
     evening's day) and in the photo captions.
   - Search rows show dates only.
3. **By mode sparklines: done.**
   - Each row has its own scale.
   - The whole row is the target and opens a month sheet.
   - The footnote is gone, and the header reads "By mode in October".
4. **"28 h" → "1 d 4 h": done.** `Stat` now styles d/h/min as units.
5. **Rail colour under visits: done.** The rail stays neutral under a stop.
6. **Loading shapes: done.**
   - Timeline: a full-bleed map block and a stable app bar.
   - Travel, Places, World/Country/City, Trips and Trip detail have shaped
     skeletons.
   - The Places intro no longer swaps.
7. **Spacing under the tabs: done.**
   - 16 dp on Trips, World and Places, and on City and Country.
   - Single-line app bars, with the City subtitle in the content.
   - Country got a stat strip.
8. **World's control: done.** A two-segment `Segmented`, with Sort on the same
   48 row.
9. **No-cover trip card: partly.** It has the same 16:9 frame, scrim and white
   two-line title, on the dark backdrop with a faint route glyph. The real
   route sketch isn't in the app API.
10. **Recorder copy and anatomy: done.**
    - "Recording is off" with a ring.
    - "Location" section.
    - "Background location is off" / "Allow all the time".
    - The Details row in its own card.
    - Server and Device removed.
    - Time-first watchdog lines.
11. **Legends and tiles: done.** Mode glyphs in the legends, and rounded
    neutral mode tiles.
12. **Small fixes: mostly.**
    - Done: the bar column, Add travel with no preselection, Yes hidden while
      picking, gap row anatomy, Pair copy, day-picker dots.
    - Partly: "Near ‹street›". The APIs carry no street, so unnamed places are
      muted and short unnamed stops are hidden from Recent visits.
