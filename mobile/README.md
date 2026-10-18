# Matka (mobile)

An Expo (SDK 58) / React Native app that records your location in the
background all day, keeps every fix in an on-device queue, and uploads it in
batches to your own Matka server, and lets you browse what the server made of
it (overview, timeline, places, map). It talks only to the device API described
in [`../docs/API.md`](../docs/API.md), with the device token from pairing.

Android is the main target; nothing here is Android-only (iOS uses
`Always` location + `UIBackgroundModes: location`).

## Screens

Until the phone is paired the app opens on the pairing screen (**Cancel**
leads to the recorder, so tracking can still be controlled). Once paired,
a bottom tab bar:

| Tab | Shows | Source |
| --- | --- | --- |
| **Overview** | totals (points, days, visits, trips, distance), distance per month, top places, recent visits, and a recorder summary | `GET /api/overview` |
| **Timeline** | one day of visits and trips, ‹ › through the days that have data | `GET /api/timeline[?date=]` |
| **Places** | every place with visits, time spent, city | `GET /api/places` |
| **Map** | the web app's map, full screen, in a WebView | embed ticket, see below |
| **Recorder** | the collector status screen; **Settings** (presets, battery, pairing, queue) from its header | local state + `GET /api/ingest` |

Pull down on Overview / Timeline / Places to reload. The tab label of
**Recorder** turns red when pairing is lost or tracking is on but not running.

**Pairing lost**: any `401` (upload, status check, a viewer request or the map
ticket) marks the pairing as lost, exactly as the collector always did: uploads
stop, the queue is kept, and every tab shows the red *Pairing lost* banner with
**Re-pair**.

The viewer client (`src/viewer.ts`) checks every response's shape before the
screens see it; a `200` that isn't Matka JSON (a captive portal, an SSO login
page) is shown as an error, not as empty data. API calls send
`credentials: "omit"`, so cookies (on Android the WebView's cookie jar is
shared with `fetch`) never stand in for the token.

### Map

The map is the server's `/embed/map` page in `react-native-webview`, logged in
without the token ever appearing in a URL or the WebView (API.md → *Map in a
WebView*):

1. The app calls `POST /api/device/embed-ticket` with the bearer header and gets
   a URL valid for 60 s. It must be on the paired server's origin, otherwise the
   app refuses to load it (check the server's public URL setting if you see that error).
2. The WebView opens that URL; the server sets a 12 h httpOnly cookie and
   redirects to `/embed/map`.
3. The app fetches a new ticket and reloads after **11 h** (timer, plus a check
   whenever the app returns to the foreground), when the page shows
   *Session expired* (detected by a small injected script that reports the page
   text), or when the top-level page answers `401`. Automatic renewals are
   limited to one per 30 s, so a broken server shows an error with
   **Try again** instead of looping.

Navigation is locked to the server's origin: links to other `http(s)` sites
open in the system browser, anything else (`intent:`, `file:`, `javascript:`,
custom schemes) is ignored. The map tab is mounted on first visit and kept
alive while you switch tabs.

## How it works

- **Recording**: `expo-location` background updates with a `TaskManager` task
  (`src/tracking.ts`). On Android this runs as a foreground service with a
  permanent "Matka is recording your location" notification.
- **Queue**: every fix goes into SQLite (`src/db.ts`) before anything else
  happens, so a failed or missing network loses nothing. The queue is capped at
  200 000 points; beyond that the oldest are discarded (shown on the status screen).
- **Upload** (`src/uploader.ts`, logic in `src/upload-logic.ts`): batches of up
  to 500 points (≈ 50 kB, well under the server's 1000 points / 1 MB). The
  background task uploads when ≥ 60 points are queued or 10 minutes have passed
  since the last attempt; the app also uploads whenever it comes to the
  foreground and when you press **Upload now**.
  Response handling follows API.md exactly:

  | Response | What the app does |
  | --- | --- |
  | 200 with receipt | deletes the batch from the queue |
  | 200 *without* the JSON receipt | treated as an error (e.g. an SSO or captive-portal page); keeps the batch |
  | 400 | drops the batch (it can never succeed) and records the error |
  | 401 | stops uploading, keeps the queue, shows **Pairing lost** |
  | 413 | splits the batch in half and retries (a single 413 point is dropped) |
  | 5xx, other codes, network error, 30 s timeout | keeps the queue, retries with exponential backoff (30 s, 1 min, 2 min … max 1 h) |

- **Pairing**: QR code, `matka://pair?…` deep link or manual entry. The app
  shows the server host and asks you to confirm (a link from anywhere could
  otherwise send your location to someone else's server), checks it with
  `GET /api/ingest`, and only then stores server + token in the OS keystore
  (`expo-secure-store`, readable after first unlock so locked-phone uploads work).

## Build

You need a **development or release build**; Expo Go cannot run background
location.

### EAS (recommended, no Android SDK needed)

```sh
cd mobile
npm ci
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview      # installable release APK
```

Profiles in `eas.json`:

| Profile | Output | Use |
| --- | --- | --- |
| `development` | debug APK with `expo-dev-client` | development against `npx expo start` |
| `preview` | release-signed APK, internal distribution | **install this on your phone** |
| `production` | Android App Bundle (`.aab`) | Play Store, if ever |

iOS: `npx eas-cli@latest build -p ios --profile preview` (needs an Apple
developer account and the device registered for ad-hoc distribution).

Before each new release bump `android.versionCode` (and `ios.buildNumber`,
`version`) in `app.json`; `appVersionSource` is `local`.

### Local build

Needs JDK 17 and the Android SDK (with the NDK version React Native asks for).

```sh
cd mobile
npm ci
npx expo prebuild -p android        # generates android/ (git-ignored, never edit by hand)
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Without your own keystore configured, the generated project signs release
builds with the debug key: fine for your own phone, not for distribution.

For development: `npx expo run:android` (device connected over USB), then
`npx expo start`.

**Plain HTTP**: release builds block cleartext traffic (network security
config `cleartextTrafficPermitted="false"`, plus `usesCleartextTraffic=false`)
and the app only accepts `https://` servers. `http://localhost`, `127.0.0.1`
and `10.0.2.2` are accepted for development and work in debug builds (e.g.
with `adb reverse tcp:3000 tcp:3000`).

### Config plugins

| Plugin | What | Builds |
| --- | --- | --- |
| `plugins/withUserCerts.js` | Writes Android network security configs: `main` trusts **system CAs only** with cleartext off; the `debug` and `debugOptimized` source sets override it to also trust **user-installed CAs** and allow cleartext (Metro, localhost). | user CAs: debug only |
| `plugins/withLowMemoryGradle.js` | Caps Gradle/Kotlin/CMake parallelism and heap (`-Xmx2g`, one worker, one C++ job) so the Android build finishes on a small VM. Slower, but doesn't get OOM-killed. | all |

**Private CAs (homelab)**: a server whose certificate comes from a private CA
installed on the phone as a *user* CA (e.g. a Caddy internal CA) works in
**development builds only**. Release builds (EAS `preview` / `production`,
`assembleRelease`) deliberately ignore user CAs, because anything that can add
a CA to the phone (an MDM profile, a "VPN" app) could otherwise read the device
token and your location stream. For the release build give the server a
publicly trusted certificate, for example Tailscale HTTPS certificates
(`*.ts.net`) or Let's Encrypt via a DNS challenge for a real domain; both work
for servers that are only reachable inside your network. iOS has no
equivalent switch: a CA installed and trusted in *Settings → General → About →
Certificate Trust Settings* is trusted by every app.

## Install and pair

1. Copy the APK to the phone (or open the EAS link on it) and install it;
   allow "install unknown apps" for your browser / file manager when asked.
2. In the Matka web app: **Devices → Pair a device**, give it a name.
3. In the app (it opens on the pairing screen): **Scan QR**, point the camera at the code,
   check the server shown and tap **Verify and pair**. Alternatively open the
   `matka://pair?…` link on the phone, or choose **Enter manually** and paste
   the server URL and token (or the whole link).
4. In the **Recorder** tab turn **Tracking** on and grant location → **Allow all the time** (Android) /
   **Always** (iOS), and allow notifications on Android 13+ so the recording
   notification is visible.

To move to a new token, pair again (the queue is kept). **Recorder → Settings → Unpair**
deletes the token from the phone; also revoke the device on the web Devices page.

## Recommended phone settings

- **Location permission: Allow all the time**, with **Use precise location** on.
  The status screen shows "always (approximate)" in amber if precise is off.
- **Battery optimisation: off for Matka.** The app shows a banner and a button
  (*Disable battery optimisation*) that opens the system dialog. Without this,
  Doze can delay fixes and uploads for hours when the phone is idle.
- **Vendor battery savers** (Samsung "Sleeping apps", Xiaomi "Autostart" /
  "No restrictions", Huawei, OnePlus …) can kill the service anyway; see
  <https://dontkillmyapp.com> for your phone and set Matka to unrestricted.
- Don't swipe Matka away from Recents on phones that treat that as force-stop.
- **After a reboot, open Matka once.** Android does not restart the location
  service by itself after boot; the app resumes tracking on launch when it was on.
- iOS: Location **Always** + Precise, Background App Refresh on.

### Presets (Settings)

| Preset | Accuracy | Min. interval / distance | Delivered to the app every |
| --- | --- | --- | --- |
| Low power | Balanced (Wi-Fi/cell) | 2 min / 100 m | 10 min or 500 m |
| **Balanced** (default) | High (GPS) | 30 s / 25 m | 2 min or 100 m |
| Precise | High (GPS) | 10 s / 10 m | 1 min or 50 m |

Fixes are only produced while you move at least the given distance, so a
phone lying on a desk records almost nothing. On iOS the Low power preset also
lets the system pause updates when you're stationary (`pausesUpdatesAutomatically`);
iOS may then wait for significant movement or the app being opened to resume,
which is why the other presets leave pausing off.

## Status screen

| Item | Meaning |
| --- | --- |
| **Not paired** (amber banner) | No server yet. Points are still recorded and kept on the phone if tracking is on. |
| **Pairing lost** (red banner) | The server answered 401: the token was revoked or is invalid. Uploads are paused, nothing is deleted. Pair again. |
| **Background location permission is missing** | Tracking is on but the OS no longer allows background location; nothing is being recorded. |
| **Battery optimisation is on** (Android) | The OS may throttle recording/uploads. Tap the button to exempt Matka. |
| Tracking: **Recording** / **Off** / **On — not running** | "On — not running" means tracking is wanted but the location service isn't registered (e.g. after a permission change); open the app with permission granted to restart. |
| Location permission | always (precise) · always (approximate) · only while in use · denied · not asked |
| Last fix | Time of the newest fix put in the queue. |
| Queued on phone | Points not yet confirmed by the server. Amber above 5000. |
| Oldest queued | Age of the oldest unsent point. |
| Last successful upload | Last time the server accepted a batch. |
| Retrying in … (n failed) | Uploads failed n times in a row (5xx / network); next automatic attempt. **Upload now** retries immediately. |
| Last error | Most recent upload problem; shown greyed out once a later upload succeeded. |
| Server / Device / Points on server / Newest on server | From `GET /api/ingest`: the device name you gave when pairing and the account totals. "Checked …" is when this was last fetched (on every app foreground). |

## Development

```sh
npm test            # jest (jest-expo): pairing, timestamps, upload logic, viewer client, map rules
npx tsc --noEmit    # typecheck
npx expo lint       # eslint (eslint-config-expo)
npx expo-doctor     # dependency / config checks
npx expo export --platform android   # bundles the JS (catches import/Metro errors without an Android SDK)
```

Code map:

| File | What |
| --- | --- |
| `index.ts` | imports `src/tracking.ts` first so the background task is defined before the app mounts |
| `App.tsx` | pairing gate, bottom tabs, deep links, foreground resume/upload |
| `src/pairing.ts` | pairing link parsing + URL/token validation (pure, tested) |
| `src/points.ts` | fix → queue row → wire point, timestamp conversion (pure, tested) |
| `src/upload-logic.ts` | response-code handling, batching/splitting, backoff, trigger (pure, tested) |
| `src/db.ts` | SQLite queue + key/value state |
| `src/credentials.ts` | token in `expo-secure-store` |
| `src/api.ts` | HTTP transport (timeout, bearer header, no cookies), `POST`/`GET /api/ingest` |
| `src/viewer.ts` | viewer client: overview, timeline, places, embed ticket; response parsing (tested) |
| `src/embed-logic.ts` | map WebView rules: origin check, navigation policy, ticket renewal (pure, tested) |
| `src/uploader.ts` | runs uploads, records status, backoff, marks pairing lost |
| `src/tracking.ts` | background task, presets, start/stop/resume, permissions |
| `src/system.ts` | battery optimisation / app settings intents |
| `src/theme.ts` | viewer colours (transport modes) and formatting; base tokens in `src/ui/theme.ts` |
| `src/ui/session.tsx` | viewer context (pairing, 401 handling), `useViewerQuery` |
| `src/screens/*` | Overview, Timeline, Places, Map; Status, Pair (QR / manual), Settings |
| `plugins/*` | config plugins, see *Config plugins* |
