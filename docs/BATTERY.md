# Battery: what the recorder costs, and why Smart Tracking matters

Measured on the user's OnePlus (Android 15/16), from Android's own battery
statistics (`dumpsys batterystats`). Android keeps per-app numbers and a
minute-by-minute history only since the last full charge, so each
measurement covers one charge cycle.

## Before: always-on GPS (old build, 19 Oct 2026)

Recorder on the Balanced preset (high accuracy, a fix every ≥30 s / 25 m),
no standby.

- With the screen off for 1 h 33 min, Matka held the GPS for **1 h 35 min**:
  the GPS never turned off, moving or not.
- About **117 mAh in ~2 h** from Matka's GPS alone. Over a day Matka was the
  phone's top battery user (27 % of use, ahead of the launcher and Snapchat).
- The phone was "active" in the background roughly half of every night hour.

## After: Smart Tracking (from 19 Oct 20:03; measured 27–28 Oct)

After 3 minutes of the phone's motion sensing reporting "still", the recorder
drops to a Wi-Fi/cell standby (no GPS); a moving reading or a standby fix
>100 m away brings GPS back (see `mobile/src/smart-logic.ts`).

Per-app totals for one charge cycle (15 h 14 min on battery, 10 h 44 min
screen off, 4 348 mAh used by the whole phone):

| | Old build | Smart Tracking |
|---|---|---|
| Matka's GPS time | ≈ the whole time | **20 min in 15 h** |
| Matka's energy | ~117 mAh per 2 h | **34 mAh in 15 h** |
| Share of the phone's drain | top app | **< 1 %** |

GPS time per hour from the battery history (local time; GPS seconds include
any app that used GPS):

| Hour | GPS on (s) | Screen (min) | Battery |
|---|---|---|---|
| 27 Oct 19 | 17 | 2 | 80→78 |
| 20 | 38 | 10 | 78→74 |
| 21 | 309 | 12 | 74→61 |
| 22 | 66 | 8 | 61→48 |
| 23 | 14 | 7 | 48→44 |
| 28 Oct 00 | 3 | 5 | 44→41 |
| 01 | 4 | 1 | 41→39 |
| 02 | 693 | 11 | 39→33 |
| 03 | 522 | 65 | 33→44 (charging) |
| 04 | 0 | 20 | 44→67 (charging) |
| 05 | 0 | 0 | 67→65 |
| 06 | 0 | 0 | 65→63 |
| 07 | 20 | 8 | 63→60 |
| 08 | 0 | 1 | 60→58 |
| 09 | 25 | 11 | 58→52 |
| 10 | 0 | 2 | 52→49 |

The overnight hours (04–11) used **45 s of GPS in 7 hours**; the old build
would have used all 7 hours.

## Why it is this cheap

1. **No GPS while still.** Most of a day is spent not moving (home, school,
   sleep). Standby uses Wi-Fi/cell positioning only, which costs almost
   nothing; the phone's motion sensing (Activity Recognition) runs on a
   low-power sensor hub anyway.
2. **Even while moving, the GPS is duty-cycled.** The history shows the
   fused location provider switching the GPS on for ~0.7 s every 30 s
   (`+gps … -gps` pairs 30 s apart): it keeps a warm fix and only powers the
   receiver to refresh it. A 30 s interval is therefore much cheaper than
   "GPS on" suggests.
3. **Uploads are batched** and Matka's own CPU use is negligible (< 4 mAh per
   charge cycle); the cost was always the GPS receiver.

## Caveats

- Numbers cover one charge cycle each; days differ (more travel = more GPS).
- The 02–03 GPS block coincides with 76 min of screen time and may be another
  app (navigation) rather than Matka; the per-app total (20 min) is the
  reliable figure for Matka.
- The trade-off is the first minutes of a trip: GPS returns when motion
  sensing reports movement, typically within 30–90 s. If trip starts look
  clipped, shorten the 3-minute standby delay before adding battery back.

## Reproducing

With the phone on adb (`fi.otamaps.matka`):

```sh
# per-app totals since the last full charge (look for gnss= under Matka's UID)
adb shell dumpsys batterystats --charged
# Matka's UID
adb shell cmd package list packages -U fi.otamaps.matka
# minute-by-minute history: +gps/-gps, +screen/-screen, battery level
adb shell dumpsys batterystats --history
```

## Whole-phone drain from uploaded points (19–28 Oct)

The app sends the battery level with every point, so the server can rebuild
how fast the phone drained while unplugged (Insights → Travel → Phone
battery; one `[stats] battery` log line per user at server start). For the
first ten days:

| Day | %/h unplugged (hours covered) | Overnight %/h |
|---|---|---|
| 19 Oct | 6.1 (7.5 h) | |
| 20 | 5.4 (14.0 h) | |
| 21 | 8.8 (11.2 h) | 10.1 |
| 22 | 5.3 (11.5 h) | |
| 23 | 5.7 (19.1 h) | 6.9 |
| 24 | 5.8 (15.7 h) | 7.8 |
| 25 | 6.5 (16.3 h) | |
| 26 | 6.0 (16.3 h) | 3.6 |
| 27 | 6.9 (13.8 h) | |
| 28 | 3.9 (7.0 h) | 4.0 |

What this does **not** show: a before/after. Smart Tracking reached the
phone on 19 Oct at 20:03, the same day the Matka app's own uploads (and so
its battery readings) begin; earlier history came from Dawarich and Google
without battery levels. And once Matka's share fell under 1 % of the phone's
drain, the whole-phone rate is set by the screen and other apps: 5–7 %/h
by day, with high "overnight" values on nights the phone was in use. The
per-app numbers above remain the direct measure of what Matka costs.

## Matka's own use, estimated (from 28 Oct 2026)

Android doesn't let an app read its own battery stats, so the app counts what
the recorder does (seconds with GPS active per preset, seconds in standby,
fixes, moving/still minutes) and a model turns that into ≈ mAh and % of the
battery: `web/src/lib/insights/powerModel.ts` (an identical copy is
`mobile/src/power-model.ts`). Calibration: the 27–28 Oct cycle above (Balanced,
15 h 14 min, Matka GNSS 20 min ≈ 25.2 mAh ⇒ ≈ 75.6 mA with the receiver on;
Matka total 34.3 mAh incl. ~4 mAh CPU, ~2 mAh wakelocks; 6000 mAh battery).
GPS-active minutes and fixes for that cycle weren't counted yet, so 120 min and
400 fixes are assumed; the receiver was then on 1/6 of active time, of which
0.7 s / 30 s is the fix pulses and the rest an overhead that is kept for every
preset (Precise ≈ 0.21, Max detail = always on). To recalibrate, take the same
`dumpsys batterystats --charged` figures plus `device_daily_usage` active_s and
fixes for the cycle and edit `POWER_CALIBRATION` (comment in the file).

The phone also samples its own battery current (`BATTERY_PROPERTY_CURRENT_NOW`,
normalised to mA, discharge positive) and charge counter whenever fixes arrive
and on watchdog runs, unplugged only. These are whole-phone figures (screen off
with GPS active, screen off in standby, screen on) and the charge-counter drop;
they show on the Recorder tab, in Insights → Travel → Recording quality, and in
the `[stats] quality` log line.
