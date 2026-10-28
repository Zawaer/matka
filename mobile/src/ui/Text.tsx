import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { useTheme } from "../design/theme";
import { FONT_FAMILY, type Colors, type TypeVariant } from "../design/tokens";

export type TextColor = keyof Pick<
  Colors,
  "text" | "textSecondary" | "textMuted" | "primary" | "onPrimary" | "danger" | "warning" | "success"
>;

type Props = RNTextProps & {
  variant?: TypeVariant;
  color?: TextColor;
  /** Fixed-width digits: every time, duration, distance and count. */
  tabular?: boolean;
};

/** All text: Inter (bundled at 400 / 500 / 600; the weight picks the face), a type-scale variant and a text colour. */
export function Text({ variant = "body", color = "text", tabular, style, ...rest }: Props) {
  const t = useTheme();
  return (
    <RNText
      {...rest}
      style={[{ fontFamily: FONT_FAMILY }, t.type[variant], { color: t.c[color] }, tabular && { fontVariant: ["tabular-nums"] }, style]}
    />
  );
}
