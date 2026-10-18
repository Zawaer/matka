# Browser preview

Renders the real screens with mock data, for design review without a phone.

    MATKA_PREVIEW=1 npx expo export -p web --output-dir /tmp/matka-preview
    python3 -m http.server 3127 --directory /tmp/matka-preview

Then open `http://localhost:3127/?scenario=ok|empty|error|slow&tracking=1&queued=37`.
`react-native-web`, `react-dom` and `@expo/metro-runtime` are only needed for this
and are installed with `npm i --no-save`. The Map tab embeds the web map from a local
`next dev -p 3126` (override with `?map=<origin>`).
