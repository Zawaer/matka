# Shared travel-mode palette and formatting rules (round 2)

The web app (`web/src/app/globals.css`, `--mk-*`) and the phone app use the
same values. Mode colours are for **data marks only**: route lines, bars,
legend dots and the mode glyph. They never colour text, card backgrounds or
other chrome.

## Mode colours

| Mode (key) | Token | Light | Dark |
|---|---|---|---|
| Drive (`driving`), Motorbike (`motorcycle`) | `--mk-car` | `#2a6fdb` | `#3d86e0` |
| Cycle (`cycling`) | `--mk-bike` | `#c4620f` | `#e0782f` |
| Walk (`walking`) | `--mk-walk` | `#1d8a5a` | `#36b27a` |
| Bus (`bus`), Tram (`tram`) | `--mk-bus` (`--mk-tram` = bus) | `#9c7a00` | `#d6a52a` |
| Run (`running`) | `--mk-run` | `#cc4a86` | `#e8679f` |
| Ferry (`boat`) | `--mk-boat` | `#0b5e7a` | `#4cb8d0` |
| Train (`train`), Metro (`metro`) | `--mk-transit` (`--mk-metro` = transit) | `#686b8f` | `#8f93b3` |
| Flight (`flying`) | `--mk-fly` | `#8c3aa3` | `#b45fd0` |
| Unknown (`unknown`), Stationary | `--mk-muted` | `#63636f` | `#8a8c9c` |

Tram shares the bus slot and Metro shares the train slot. The rows and line
badges carry the name, so the palette stays at eight validated colours.

### What changed from round 1, and why

- **Train/Metro** moved from violet `#6250d6` / `#9085e9` to a slate. The old
  value was the accent (`#5144e8`, ΔE 4.7), so it read as "selected".
- **Flight** moved from red `#e34948` to a plum. The old value sat beside
  danger (`#bd2f25`, ΔE 9.6). It is now ΔE 20.6 from danger in light and 20.9
  in dark.
- **Ferry** moved from green `#008300` to a deep teal (light) or cyan (dark).
  It was another green next to Walk. Walk vs ferry is now normal-vision ΔE
  12.5 in dark and over 15 in light.
- **Bus, Walk, Run (light)** are darker. They were 2.2, 2.8 and 2.7:1 on white
  and now clear 3:1.
- **Ferry (dark)** got its own lighter step. It is 7.3:1 on surface-2, up from
  3.4:1.

### Checks

These were computed with the dataviz skill's validator maths: OKLab ΔE ×100,
Machado CVD simulation, and WCAG contrast.

**Contrast:**

| Theme | Surface | Lowest contrast |
|---|---|---|
| Light | `#ffffff` | 4.04 (bus) |
| Light | bg `#f6f5f2` | 3.71 |
| Light | surface-2 `#f2f0ec` | 3.55 |
| Dark | surface `#14151d` | 4.75 (flight) |
| Dark | surface-2 `#1b1d27` | 4.38 |
| Dark | bg `#0c0d13` | 5.07 |

Every mark is at least 3:1 on every surface in its theme.

**Distance from accent and danger** (normal-vision ΔE, accent / danger):

- Light: train 18.1 / 20.5, flight 15.3 / 20.6.
- Dark: train 11.8 / 18.0, flight 12.7 / 20.9.
- Drive stays the blue it was. It is ΔE 9.8 from the light accent, which is
  the same as round 1. It is never shown as a selection colour.

**Known close pairs.** With eight categories and the 3:1 floor, not every
pair clears the all-pairs gates. The weakest pairs are:

| Theme | Pair | Normal ΔE | CVD ΔE |
|---|---|---|---|
| Light | Cycle/Bus | 9.0 | 1.2 |
| Light | Run/Train | 18.0 | 1.6 |
| Light | Cycle/Run | 15.7 | 3.1 |
| Dark | Cycle/Run | 15.3 | 2.8 |
| Dark | Walk/Run | 30.3 | 4.1 |

Cycle/Bus (orange/yellow) is inherited from the reference palette. Each of
these marks always comes with its glyph and label: chips, rows, legends and
tooltips. Charts must keep the label or legend and never rely on colour
alone.

### Transit line badges

Line badges use the operator's own line colour, which for HSL is:

| Line type | Colour |
|---|---|
| Bus | `#007AC9` |
| Tram | `#00985F` |
| Metro | `#FF6319` |
| Train | `#8C4799` |
| Ferry | `#00B9E4` |

The text is white or `#16161f`, whichever reaches 4.5:1 (`web/src/lib/transit/colors.ts`). The badge shape is 12/16
text, 500 weight, a 4 px radius and 6 px horizontal padding, with the stop
path in muted text on the same line. These colours are signage, not the mode
palette, and they are the same in both themes.

## Formatting rules (`web/src/lib/format.ts`)

**Numbers:** en-GB grouping with a comma (`1,137`, `4,221 km`). Every number
uses tabular figures, applied to the number spans only, not to whole rows.

**Distance** (`formatKm`, also used as `formatDistance`):

| Range | Example |
|---|---|
| Under 1 km | `340 m` |
| 1 to 100 km | one decimal, `8.4 km` |
| From 100 km | whole and grouped, `1,137 km` (never `1136.5 km`) |

**A single duration** (`formatDuration`), for one visit or trip: `30 s`,
`45 min`, `6 h 34 min`. Hours are grouped, as in `1,110 h 51 min`.

**A total of time** (`formatLongDuration`), for places, cities, countries,
months and trips:

| Range | Example |
|---|---|
| Under 24 h | `6 h 34 min` |
| Under 30 days | `12 d 3 h` |
| 30 days or more | whole days, grouped: `46 d`, `1,204 d` |

So 1,110 h 51 min is shown as **`46 d`**.

**Dates:** day before month, and month abbreviations are always three
letters (`Sep`, never `Sept`).

| Use | Rule | Examples |
|---|---|---|
| Recent days | Relative for the last week | `Today`, `Yesterday`, then the weekday `Mon` |
| Other days | No year within the current year | `28 Oct`; `28 Oct 2025` otherwise |
| Rows with a weekday | `formatDateShort` | `Wed 28 Oct` |
| Day headings | `formatDayHeading` | `Today`, `Yesterday`, `Mon 26 Oct` |
| Page titles | `formatDay`, with the year muted inline | `Friday 4 September 2026` |
| Ranges | `formatDateRange` | `3–5 Oct 2026`, `28 Sep – 2 Oct 2026`, `30 Dec 2026 – 2 Jan 2027` |
| Months | `formatMonth` | `October 2026`, short `Oct` |
| Pickers | | `28 Oct 2026`; calendars start on Monday |

**Times:** 24-hour `HH:MM` (`16:58`). A visit that crosses midnight reads
`Since 16:58 yesterday` or `16:58 – until 09:45 tomorrow`.
