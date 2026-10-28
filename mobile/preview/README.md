# Browser preview

Renders the real screens with mock data, for design review without a phone.

    npm i --no-save react-native-web react-dom @expo/metro-runtime   # web-only, not in package.json
    MATKA_PREVIEW=1 npx expo start --web --port 3127 --host localhost

Then open `http://localhost:3127/` (Node ≥ 22.13). With `MATKA_PREVIEW=1`, `metro.config.js`
swaps the native modules (SQLite queue, secure store, location, battery, task manager,
WebView) for the stand-ins in `mocks/`, and the dev server serves `photos/*.jpg` for
`/api/immich/asset/:id`. The app starts paired with the page's own origin and
`mockApi.ts` answers every `/api/…` call in the server's shapes (docs/API.md).

Page switches:

- `?scenario=empty|error|slow`: no data yet, every request 502, or requests that never finish.
- `?paired=0`: not paired (Pair screen).
- `?tracking=1&queued=37&preset=custom&smart=0&authLost=1&failing=1&standby=1&recovered=1&batteryOpt=1&perm=denied|foreground`:
  recorder state (`recovered`: watchdog restarts; `batteryOpt`: battery optimisation on).
- `?map=http://localhost:3126`: the Map tab embeds a local `next dev -p 3126` of web/
  (otherwise a placeholder).

Screenshots of every tab, sub-view, sheet and state, light and dark:
`node preview/screens.mjs /tmp/shots/app` (needs `npm i --no-save playwright-core`;
see docs/REDESIGN.md, "How to screenshot (app)"). Don't start the server with
`CI=1`: it turns off Metro's file watching, so edits don't show up.
