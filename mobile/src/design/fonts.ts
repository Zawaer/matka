// Inter on Android and iOS is embedded at build time by the expo-font config
// plugin (app.json), so it is there before the first frame and nothing needs
// loading. The web preview loads it at runtime instead: see fonts.web.ts.

/** True once the app's fonts can be drawn. */
export function useAppFonts(): boolean {
  return true;
}
