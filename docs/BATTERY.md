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
