import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { useTheme } from "../design/theme";
import type { Colors, TypeVariant } from "../design/tokens";

type Props = RNTextProps & {
  variant?: TypeVariant;
  color?: keyof Pick<Colors, "text" | "textSecondary" | "textMuted" | "primary" | "onPrimary" | "accent" | "danger" | "success" | "onHero" | "onHeroMuted">;
  /** Fixed-width digits: for columns of numbers only. */
  tabular?: boolean;
};

export function Text({ variant = "body", color = "text", tabular, style, ...rest }: Props) {
  const t = useTheme();
  return (
    <RNText
      {...rest}
      style={[t.type[variant], { color: t.c[color] }, tabular && { fontVariant: ["tabular-nums"] }, style]}
    />
  );
}
