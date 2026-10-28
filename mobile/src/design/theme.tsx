import { createContext, useContext, useMemo, type ReactNode } from "react";
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";
import {
  elevation,
  layout,
  modeColor,
  palette,
  radius,
  space,
  type,
  type Colors,
  type Scheme,
} from "./tokens";

export type Theme = {
  scheme: Scheme;
  c: Colors;
  space: typeof space;
  radius: typeof radius;
  layout: typeof layout;
  type: typeof type;
  elev: (typeof elevation)[Scheme];
  /** A colour at the given alpha (0-1): tinted backgrounds of mode colours. */
  alpha: (hex: string, a: number) => string;
  mode: (key: string) => string;
};

function build(scheme: Scheme): Theme {
  const c = palette[scheme];
  return {
    scheme,
    c,
    space,
    radius,
    layout,
    type,
    elev: elevation[scheme],
    mode: (key) => modeColor(key, scheme, c.textMuted),
    alpha: (hex, a) => `${hex.slice(0, 7)}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0")}`,
  };
}

const THEMES: Record<Scheme, Theme> = { light: build("light"), dark: build("dark") };
const Ctx = createContext<Theme>(THEMES.dark);

/** Follows the system light/dark setting. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme: Scheme = useColorScheme() === "light" ? "light" : "dark";
  return <Ctx.Provider value={THEMES[scheme]}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

/** Build a StyleSheet from the current theme; recomputed only when the scheme flips. */
type Styles = Record<string, ViewStyle | TextStyle | ImageStyle>;

export function useStyles<T extends Styles>(factory: (t: Theme) => T): T {
  const theme = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
}
