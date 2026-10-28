// Web preview only: the config plugin doesn't run for web, so load the same
// three Inter faces at runtime under one family, and hold the first render
// until they are in (no flash of the fallback font).

import { useFonts } from "expo-font";
import { FONT_FAMILY } from "./tokens";

export function useAppFonts(): boolean {
  const [loaded, error] = useFonts([
    {
      fontFamily: FONT_FAMILY,
      fontDefinitions: [
        { path: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"), weight: 400, style: "normal" },
        { path: require("@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf"), weight: 500, style: "normal" },
        { path: require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf"), weight: 600, style: "normal" },
      ],
    },
  ]);
  return loaded || !!error;
}
