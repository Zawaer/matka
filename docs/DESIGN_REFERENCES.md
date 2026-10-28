# Matka design references

A working brief for the redesign: what "professional and polished" means in
numbers, drawn from platform guidance, mature design systems and the apps
Matka competes with. Each section ends in rules you can check. The checklist
in section 5 is the thing to score screens against.

Values marked (verified) were checked against the source page in Oct 2026.
Unmarked values are the published spec as commonly documented. Re-check the
link before you rely on a single pixel.

---

## 0. The ten rules that matter most

1. **One type scale, used strictly.** Web: 12 / 13 / 14 / 16 / 20 / 24 / 32.
   Phone: 11 / 12 / 13 / 15 / 17 / 22 / 28 / 34 (iOS) or the M3 scale.
   Never invent a size in between.
2. **Show hierarchy with weight and colour, not size.** Use at most 2 weights
   (400 and 500 or 600) and 3 text colours (primary, secondary, muted).
3. **A 4 px spacing grid**: 4, 8, 12, 16, 24, 32, 48. Inside a card use 12 or 16.
   Between sections use 24 or 32.
4. **No more than 3 surface levels** (page, card, raised/overlay). Separate them
   with tone first, then a hairline border, and use shadow only for overlays.
5. **One accent colour.** Use it for the primary action, selection and focus.
   Every other colour encodes data (travel mode, status) and never decorates.
6. **Lucide only, no emoji.** Use 16 px icons in dense rows and inline text,
   20 px in list rows and buttons, and 24 px in the nav bar. Keep the stroke at 2,
   or 1.5 for icons of 20 px and up on web. Centre icons on the text's cap height
   or first line.
7. **Tabular numerals** for every time, duration, distance and count
   (`font-variant-numeric: tabular-nums`, `fontVariant: ['tabular-nums']`).
8. **Text contrast of at least 4.5:1, and at least 3:1 for icons, borders and
   chart marks**, in both themes. Muted text on a raised surface is where this
   usually fails.
9. **Touch targets of at least 44 pt (iOS) or 48 dp (Android)**, even when the
   visible icon is 20 px. On web, at least 24 px with spacing (WCAG 2.5.8) and
   36 to 40 px for real buttons.
10. **Design every list and chart for four states:** loading (skeleton that
    matches the shape), empty (one line, one action), error (what failed, and
    retry), and partial data (gaps shown honestly, not hidden).

---

## 1. Platform guidance

### 1.1 Material Design 3 (Android)

Links: [Type scale](https://m3.material.io/styles/typography/type-scale-tokens),
[Color roles](https://m3.material.io/styles/color/roles),
[Elevation](https://m3.material.io/styles/elevation/overview),
[Shape](https://m3.material.io/styles/shape/corner-radius-scale),
[Lists](https://m3.material.io/components/lists/specs),
[Cards](https://m3.material.io/components/cards/specs),
[Navigation bar](https://m3.material.io/components/navigation-bar/specs),
[Bottom sheets](https://m3.material.io/components/bottom-sheets/specs),
[Chips](https://m3.material.io/components/chips/specs).

**Type scale** (size/line height in sp, weight). Roboto, or Inter as a close substitute.

| Role | L | M | S |
|---|---|---|---|
| Display | 57/64 400 | 45/52 400 | 36/44 400 |
| Headline | 32/40 400 | 28/36 400 | 24/32 400 |
| Title | 22/28 400 | 16/24 500 | 14/20 500 |
| Body | 16/24 400 | 14/20 400 | 12/16 400 |
| Label | 14/20 500 | 12/16 500 | 11/16 500 |

For Matka, the screen title is Headline S or Title L. Row titles are Title M or
Body L. Secondary row lines are Body M in `onSurfaceVariant`. Use Label M for
chips, axis labels and badges. Big stat numbers use Display S or Headline L
with tabular numerals.

**Colour roles.** Surfaces are tones of one neutral, not separate colours:
`surface` (the page), then `surfaceContainerLowest`, `Low`, the default
`surfaceContainer`, `High` and `Highest`. These replace shadow as the way to
show elevation. A card on the page is `surfaceContainerLow`. A sheet or nav
bar is `surfaceContainer`. Search fields and selected chips are `High` or
`Highest`. Text is `onSurface` (primary) or `onSurfaceVariant` (secondary).
`outline` is for meaningful borders such as text fields. `outlineVariant` is
for dividers and card borders. Pair `primary` with `onPrimary`, and use
`primaryContainer` with `onPrimaryContainer` for softer emphasis such as a
selected nav pill or a "Confirm visit" tonal button. Error uses the same pattern.

**Elevation.** The levels are 0, 1, 3, 6, 8 and 12 dp. In M3 they mostly show
as tonal change, with shadow reserved for things that float: FABs, menus and
dragged items. In dark mode, express elevation through lighter surfaces only.

**Shape scale.** None 0, XS 4, S 8, M 12, L 16, XL 28, Full (pill). Chips and
small buttons use 8. Cards use 12. Bottom sheets use 28 on the top corners.
Buttons and the nav indicator use Full. Give each component type one radius
and use it everywhere.

**Lists.** One-line rows are 56 dp, two-line 72 dp and three-line 88 dp. The
leading inset is 16 dp. A leading icon is 24 dp. Avatars and thumbnails are 40
or 56 dp. The gap from the leading element to the text is 16 dp. Dividers are
inset to align with the text, not full-bleed. Trailing metadata (time, distance)
uses Label S or Body S in `onSurfaceVariant`.

**Cards.** There are three variants: elevated, filled and outlined. Use only one
per screen. Internal padding is 16 dp, the radius is 12, and cards are 8 dp
apart in a list or grid.

**Navigation bar.** 3 to 5 destinations, 80 dp tall (the 2025 "expressive"
version is 64 dp), 24 dp icons. The active indicator is a 64×32 pill in
`secondaryContainer`. Show a label on every item. The active icon is filled
and inactive icons are outlined. Lucide has no filled set, so mark the active
item with the pill and the label colour instead.

**Bottom sheets.** Top corners are 28 dp. The drag handle is 32×4 dp and sits
22 dp from the top. The sheet is `surfaceContainerLow`, with a scrim behind
the modal version. The day-map-plus-list layout maps directly to a standard
(non-modal) sheet with peek, half and full detents.

**Chips.** 32 dp tall with a radius of 8, 16 dp horizontal padding (8 with an
18 dp icon), and Label L text. Filter chips get a checkmark when selected. Use
them for the mode filter and date-range filters.

**Touch target.** At least 48×48 dp, whatever the visual size.

### 1.2 Apple Human Interface Guidelines (iOS)

Links: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout),
[Typography](https://developer.apple.com/design/human-interface-guidelines/typography),
[Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables),
[Color](https://developer.apple.com/design/human-interface-guidelines/color),
[Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode),
[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility),
[Charts](https://developer.apple.com/design/human-interface-guidelines/charts).

**Dynamic Type at the default (Large) size** (pt, size/leading):

| Style | Size/leading | Weight |
|---|---|---|
| Large Title | 34/41 | Regular (Bold in nav bars) |
| Title 1 / 2 / 3 | 28/34, 22/28, 20/25 | Regular |
| Headline | 17/22 | Semibold |
| Body | 17/22 | Regular |
| Callout | 16/21 | Regular |
| Subhead | 15/20 | Regular |
| Footnote | 13/18 | Regular |
| Caption 1 / 2 | 12/16, 11/13 | Regular |

Nothing should go below 11 pt. The hierarchy comes from using only a handful
of these styles: Headline for row titles, Subhead or Footnote in secondary
label colour for metadata, and Large Title that collapses to an inline title
on scroll.

**Layout.** The standard side margin is 16 pt (20 pt on larger phones). Respect
the safe areas: the home indicator area is about 34 pt. Hit targets are at
least 44×44 pt.

**Lists.** Use inset-grouped lists for settings and device lists: sections on
`secondarySystemBackground` with a corner radius of about 10 to 12. Rows are at
least 44 pt, and 60 to 72 pt with a subtitle. Separators are inset to the text
start. Use a disclosure chevron only when the row navigates. Section headers
are Footnote, in secondary label colour.

**Colour.** Use semantic colours: label, secondaryLabel, tertiaryLabel, then
systemBackground, secondarySystemBackground and tertiarySystemBackground. That
gives three text levels and three surfaces, which is the same model as M3. Dark
mode is not just the light theme inverted: the base is near-black and raised
surfaces get lighter.

### 1.3 WCAG contrast basics

Links: [1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html),
[2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html),
[WebAIM checker](https://webaim.org/resources/contrastchecker/).

- Body text needs at least **4.5:1**. Large text (24 px and up, or 18.66 px
  bold and up) needs at least **3:1**.
- UI component boundaries, icons that carry meaning, focus rings and chart
  marks need at least **3:1** against what they sit next to.
- Disabled controls and pure decoration are exempt. A placeholder that acts as
  a label is not.
- Pointer targets must be at least **24×24 CSS px**, or have enough spacing
  (2.5.8, AA). The platform values of 44 and 48 are stricter, so use them on
  the phone.
- Check muted text against **every** surface it appears on: the page, the card,
  the raised card and the map overlay. Don't check it only against the page.

---

## 2. Design systems for clean, dense UIs

### 2.1 Vercel Geist — [typography](https://vercel.com/geist/typography), [colors](https://vercel.com/geist/colors)

- Typography comes in named roles rather than raw sizes: **Heading** (72 down
  to 14), **Label** (20 to 12, single line, with generous line height for
  icons), **Copy** (24 to 13, multi-line, taller line height) and **Button**
  (16, 14, 12) (verified).
- Label 14 is the workhorse for menus and rows. Label 13 is for the secondary
  line next to it, with tabular figures for numbers. Label 12 is for tertiary
  text in busy views. Copy 14 is the default paragraph (verified).
- Emphasis comes from a `<strong>` inside the same size, not a bigger size.
- Colour comes in 10-step scales (100 to 1000) per hue. 100 to 300 are
  component backgrounds, 400 to 600 are borders, 700 and 800 are solid fills,
  900 is secondary text and 1000 is primary text. The background has only two
  levels (`background-100` and `-200`).
- Take from Geist: the label/copy split. In Matka, timeline row titles are
  14/20 at 500 and metadata is 13/18 at 400, muted and tabular.

### 2.2 Radix Colors and Radix Themes — [scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale), [Themes spacing](https://www.radix-ui.com/themes/docs/theme/spacing), [radius](https://www.radix-ui.com/themes/docs/theme/radius)

What each of the 12 steps is for (verified):

| Step | Use |
|---|---|
| 1–2 | App background, subtle background (cards, sidebars) |
| 3 / 4 / 5 | Component background: normal, hover, pressed or selected |
| 6 / 7 / 8 | Border: subtle non-interactive, interactive, strong or focus ring |
| 9 / 10 | Solid fill (the purest hue), and its hover state |
| 11 / 12 | Low-contrast text, high-contrast text |

- Build Matka's neutral from one gray scale, slightly tinted toward the
  accent (Radix "slate" or "mauve" next to a violet accent). Every surface,
  border and text value then comes from that one scale, so the parts look
  related.
- Steps 11 and 12 pass 4.5:1 on steps 1 and 2 by construction. Step 11 on
  step 3 or above needs checking.
- The accent scale has the same shape: 3 or 4 for a selected row, 9 for the
  primary button, 11 for accent text.
- Radix Themes spacing runs 1 to 9 = **4, 8, 12, 16, 24, 32, 40, 48, 64 px**.
  The radius scale has one "radius" setting that drives all of components,
  cards and pills consistently.

### 2.3 Linear — [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)

- Build themes from **three inputs: base, accent and contrast**, generated in
  LCH so equal lightness looks equally light. Derive every surface elevation
  from the same calculation (verified).
- **Reduce the accent.** They deliberately pulled blue out of the chrome so
  the UI reads as neutral and the content leads (verified).
- Prototype hierarchy in **black and white with opacities first**, then add
  colour (verified).
- Line up labels, icons and buttons vertically and horizontally in the
  navigation. Users don't notice alignment, but they feel it (verified).
- Make chrome (sidebar, headers, filters) quieter than content. For Matka the
  map and the timeline are the content, and the nav and filters are chrome.

### 2.4 Refactoring UI and Tailwind UI — [refactoringui.com](https://www.refactoringui.com/), [7 practical tips](https://medium.com/refactoring-ui/7-practical-tips-for-cheating-at-design-40c736799886)

- **Use weight and colour before size.** Primary text is dark, secondary is
  grey and tertiary is lighter grey. Two weights are enough (400 and 600).
  Don't put grey text on a coloured background. Use a tint of that colour instead.
- **Labels are a last resort.** "12:40 – 14:05 · 1 h 25 min" needs no
  "Duration:" label. The format explains itself.
- **Use a constrained spacing scale** where each step is at least about 25%
  bigger than the last (4, 8, 12, 16, 24, 32, 48, 64). Leave more space between
  groups than within them.
- **Use fewer borders.** Separate with a box shadow, a background tone change
  or extra space. Where a divider is really needed, make it a hairline in the
  border token.
- **Shadows have two parts**: a tight, darker one for the edge and a soft,
  larger one for lift. Use about 3 elevation levels at most. In dark mode,
  replace shadows with lighter surfaces.
- **Empty states are designed screens.** Use an illustration or a large muted
  icon, one sentence saying why it's empty, and one primary action.
- **De-emphasise competing elements** instead of emphasising the main one. Make
  secondary buttons ghost or outline buttons and keep a single solid button per view.
- **Line height falls as size grows**: about 1.5 for 14 to 16 px body text,
  1.25 for 24 px and up, and 1.1 for big stat numbers.
- Tailwind mapping: `text-xs` 12/16, `text-sm` 14/20, `text-base` 16/24,
  `text-lg` 18/28, `text-xl` 20/28, `text-2xl` 24/32, `text-3xl` 30/36.
  Spacing unit is 4 px. Radii are `rounded-md` 6, `rounded-lg` 8 and
  `rounded-xl` 12. Use `tabular-nums` for numbers.

### 2.5 Lucide — [icon design guide](https://lucide.dev/contribute/icon-design-guide), [lucide-react](https://lucide.dev/guide/packages/lucide-react)

- Icons are drawn on a 24×24 grid with a **2 px stroke**, round caps and
  joins, and 1 px padding (verified). They are outline-only, so don't mix them
  with filled icons from another set.
- Sizes: **16** inline and in dense rows (pair with 13 or 14 px text), **20**
  in list rows, buttons and inputs (14 to 16 px text), **24** in the nav bar and
  for large leading icons.
- Stroke: when you scale down to 16, keep `strokeWidth={2}` or use
  `absoluteStrokeWidth` so lines don't go hairline thin. For a lighter look
  above 20 px, set 1.75 or 1.5 globally. Pick one value and keep it.
- Alignment: use flex with `items-center` and a 6 to 8 px gap for one-line
  labels. For multi-line rows, align the icon to the **first line**, not the
  block's centre: a 20 px icon next to 20 px line-height text, or a 2 px
  top offset.
- Colour: icons take the text colour of their row (`currentColor`), usually the
  secondary text colour. Use mode or status colour only when the icon *is*
  the data (the travel-mode glyph on a trip row).
- Icon tiles (an icon in a tinted square) are 32 to 40 px with an 8 to 10
  radius and a 10 to 12% tint of the meaning colour behind a 100% glyph. Use
  one tile size per list.
- Never use emoji as icons, bullets, category markers or decoration.

---

## 3. Domain references

### 3.1 Google Maps Timeline (the reference users know)

Links: [Manage your Timeline (help)](https://support.google.com/maps/answer/6258979),
[9to5Google on the on-device Timeline](https://9to5google.com/2024/12/11/google-maps-on-device-timeline/),
[Android Central walkthrough with screenshots](https://www.androidcentral.com/google-maps-new-timeline-feature-lets-you-keep-track-your-location-history).

- **Day view = map on top, chronological list below.** Swipe left and right
  between days, with a date header and a calendar picker. The day's path is
  one blue line, and visited places are pins. Tapping a row focuses the map.
- **Visit rows**: a category glyph in a circle on a vertical rail, the place
  name (medium weight), then address or category plus the time range on a
  muted second line. Photos taken there show as a small thumbnail strip.
- **Travel rows**: a smaller mode glyph on the rail, then "Driving · 12 km ·
  25 min" in muted text. The rail segment can be dashed or coloured by mode.
  These rows are visibly lighter than visit rows.
- **Uncertain data is shown as a question, not hidden.** A low-confidence visit
  asks you to confirm it ("Did you visit…?") or pick from nearby candidates.
  Gaps can be edited ("Edit day", add a missed visit, change the travel mode).
  For Matka: one inline tonal button per uncertain row, and a dashed rail
  segment with "No data · 14:10–15:30" for gaps.
- What makes it look polished: one left rail that every row hangs off, a
  consistent 40 px glyph column, only two text levels per row, and colour
  used only on the path and mode glyphs.

### 3.2 Arc Timeline (Big Paua) — [App Store](https://apps.apple.com/us/app/arc-timeline-trips-places/id1063151918)

- An automatic diary of visits and trips with a dense, data-rich timeline.
  Each trip segment is coloured by detected activity (walking, cycling, car,
  train), and that colour stays the same everywhere: the map, the list and the
  stats.
- Rows are compact: name, then duration as a large tabular number, and the
  time range small. Day summaries show time per activity as a stacked bar.
- Lessons for Matka: a **fixed colour per travel mode is a strong asset**, so
  use it consistently and for nothing else. Show duration as the strongest
  number in a row.

### 3.3 Fitness and stats screens — Apple Fitness, Google Fit, Strava

Links: [Apple HIG Charts](https://developer.apple.com/design/human-interface-guidelines/charts),
[Strava App Store](https://apps.apple.com/us/app/strava-run-bike-walk/id426826309).

- **Stat tiles**: a small muted label on top ("Distance", 12 to 13 px, often
  uppercase with +0.04em tracking, or sentence case in medium weight), a big
  tabular number (28 to 34 px, semibold, line height 1.1) with the unit in
  smaller muted text ("124 km"), and an optional delta line ("+12% vs Sept",
  coloured only by direction). Tiles sit in a 2-column grid on the phone and
  3 or 4 columns on the web, with 12 to 16 px padding and an 8 to 12 px gap.
- **Month charts** (Strava and Apple Fitness): simple vertical bars per week
  or day, one accent colour, the current period highlighted and the others
  muted, no gridlines or one faint baseline, and a value label only on the
  selected or maximum bar.
- **Activity rows** (Strava): a mode icon, title, date and place on a muted
  line, and three inline stats ("8.2 km · 42 min · 5:07 /km") with labels
  above and values below. A route thumbnail is a small map with the line in
  the accent colour.
- **Rings and summaries**: one hero visual per screen at most.

### 3.4 Swarm / Foursquare — [App Store](https://apps.apple.com/us/app/foursquare-swarm-check-in-app/id870161082)

- **Place rows**: a category icon in a tinted circle (40 px), the venue name
  (semibold), "Category · Neighbourhood" muted, and a check-in count or last
  visit trailing and right-aligned. Category colours come from a fixed palette.
- The stats and "lists" views use large counts with small labels, and maps
  of the places you've been.
- Lesson: **category glyph plus tint is the place's identity**. Use one glyph
  set (Lucide), one tint strength and one tile size.

### 3.5 Polarsteps — [App Store](https://apps.apple.com/us/app/polarsteps-travel-tracker/id947925763), [Dribbble team page](https://dribbble.com/polarsteps)

- **Trip cards are photo-led**: a full-bleed cover photo (16:9 or 4:3) with a
  bottom gradient scrim (black 0 → 60%) carrying the title (white, 17 to 20 px
  semibold) and a meta line ("12 days · 3 countries · 2,340 km"). The card
  radius is 12 to 16, and the image is clipped to it.
- **Trip detail**: a map of the route with numbered steps, then step cards
  with large photos. Stats go in one row of 3 or 4 tiles near the top.
- **Year and world stats**: countries visited, km and days as huge numbers,
  plus a scratch map or globe.
- Lessons for Matka: **imagery carries the emotion, so the chrome stays neutral**.
  Always put a scrim under text on photos (at least 4.5:1 at the text's
  position). Use one consistent aspect ratio for covers. When a trip has no
  photo, use a map thumbnail of the route as the fallback, not a coloured
  placeholder or emoji.

---

## 4. Data visualisation for Insights

Links: [Apple HIG Charts](https://developer.apple.com/design/human-interface-guidelines/charts),
[Datawrapper: colours for data vis](https://blog.datawrapper.de/colors/),
[Tufte, small multiples (summary)](https://www.edwardtufte.com/notebook/small-multiples/).

- **Choose the chart by the question.** Use bars to compare months or
  categories, a line for a trend over many points, a stacked bar or a
  100% bar for parts of a whole, and a calendar heatmap for daily rhythm.
  Avoid pie and donut charts with more than 3 slices. Don't use 3D or gradients.
- **Small multiples** beat one crowded chart. Example: per-mode distance by
  month as a row of small identical bar charts, each with a **shared y-scale**
  and labelled once.
- **Restrained colour.** Use one hue for single-series charts (the accent or
  neutral). Highlight the selected or current bar and draw the others at about
  40% or in neutral. Use the categorical mode palette only when a chart splits
  by mode. Use sequential ramps (one hue, light to dark) for heatmaps, with the
  lightest step still visible against the background (3:1 for marks).
- **Label directly, keep legends minimal.** Put the series name at the end of
  its line or bar group. Label the max or selected value, not every bar.
- **Axes**: 11 to 12 px muted tabular labels, no y-axis line, at most 3 to 4
  faint gridlines (border-subtle) or none, and the baseline at zero for bars.
  Abbreviate: "Jan", "1.2k km".
- **Bars**: a gap of 20 to 40% of the bar width, a top radius of 2 to 4 px (not
  pills), and at least 8 px wide on the phone (or switch to weeks).
- **Tooltips**: show on hover and on tap, with the value in bold and tabular
  digits, the date or category muted, and no chart-junk border. On the phone,
  prefer a pinned readout above the chart that updates when you scrub.
- **Dark mode**: give data colours their own dark-theme values (slightly
  lighter and less saturated). Don't reuse light values on dark surfaces.
- **Empty and partial**: draw the axis with a muted "No data for March"
  message, and show gaps as gaps (no interpolation across missing days).
- Use the repo's `dataviz` skill and its palette validator when you choose or
  change the mode palette.

---

## 5. Matka checklist (score each screen 0/1 per line)

**Hierarchy and layout**
- [ ] Exactly one primary (solid accent) action is visible. Every other action
      is secondary, ghost or in a menu.
- [ ] All content shares 1 or 2 left edges (page inset, and text start after the
      icon column). Nothing is off by a few px.
- [ ] Spacing uses only 4, 8, 12, 16, 24, 32 or 48. Space between groups is
      larger than space within a group.
- [ ] Screen title, then section header, then row title, then metadata are
      clearly distinct, each using a size from the defined scale.

**Type**
- [ ] No row uses more than 2 weights or more than 3 text colours.
- [ ] No text is below 12 px on web or 11 pt on the phone. Body is 14 to 16 on
      web and 15 to 17 on the phone.
- [ ] Every number (times, durations, km, counts, axis labels) uses tabular
      numerals. Units are smaller and muted next to big stat values.
- [ ] No "Label:" prefixes where the format is self-explanatory.

**Icons and imagery**
- [ ] No emoji anywhere, including empty states, toasts and category markers.
- [ ] Only Lucide icons, at 16, 20 or 24, with one stroke width per surface.
      Each icon is centred on the line it labels.
- [ ] Icon tiles are one size per list, with one tint strength.
- [ ] Text on photos sits on a scrim and passes 4.5:1. Covers use one aspect
      ratio and have a map fallback.

**Surfaces and colour**
- [ ] At most 3 surface levels. Tone and hairline borders come first, and
      shadow is used only for floating things.
- [ ] Radii are consistent per component type (for example controls 8,
      cards 12, sheets 16 to 28, pills full).
- [ ] Accent appears only on primary actions, selection, focus and links.
      Mode and status colours appear only where they carry meaning (marks,
      glyphs, badges). Never use them for decoration.
- [ ] Borders are used sparingly. Cards don't have both a border and a heavy shadow.

**States**
- [ ] Loading uses skeletons in the final shape, not spinners in a blank page.
- [ ] Empty: an icon, one sentence and one action.
- [ ] Error: what failed, plus a retry. Partial or uncertain data is shown
      honestly (dashed gap, "Confirm visit?").
- [ ] Long names, 0 values, very large values and missing photos have been tested.

**Accessibility and platform**
- [ ] Text is at least 4.5:1 and icons, borders and chart marks at least 3:1,
      **in both light and dark**, on every surface where they appear.
- [ ] Touch targets are at least 44 pt (iOS) or 48 dp (Android). On web, hit
      areas are at least 24 px, with buttons 36 to 40 px.
- [ ] Focus rings are visible (2 px accent, 2 px offset), and hover and
      pressed states are defined.
- [ ] The phone respects safe areas. List rows are at least 56 dp (one line)
      or 64 to 72 dp (two lines).

---

## 6. Suggested Matka defaults (derived from the above)

| Token | Web | Phone |
|---|---|---|
| Page title | 24/32 600 | 28/34 600 (collapses to 17 on scroll) |
| Section header | 13/18 500, muted | 13/18 500, muted |
| Row title | 14/20 500 | 16/22 500 |
| Row meta | 13/18 400, muted, tabular | 13/18 400, muted, tabular |
| Stat value | 28/32 600, tabular | 28/32 600, tabular |
| Caption / axis | 12/16 400 | 12/16 400 |
| Row height | 44 single, 56 two-line | 56 single, 68 to 72 two-line |
| Page inset | 16 (phone) to 24 to 32 (desktop) | 16 |
| Card padding / gap | 16 / 12 | 16 / 12 |
| Radius | control 8, card 12, sheet 16 | control 10, card 14, sheet 28 |
| Icons | 16 inline, 20 rows | 20 rows, 24 nav |

Timeline row anatomy (web and phone):

- A 40 px left column for the rail and glyph. Visits get a 32 px tile, and
  travel gets a 20 px glyph with no tile.
- 12 px gap.
- Title on the first line and meta on the second.
- Trailing column with the time, right-aligned and tabular.
- Travel rows are about 40 px tall and visit rows about 64 px.
- The rail is 2 px in the border-strong colour, mode-coloured for travel
  segments, and dashed for gaps.
