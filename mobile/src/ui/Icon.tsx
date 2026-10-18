import type { ComponentProps } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../design/theme";

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** The one icon set (Material Community, outline style) used everywhere. */
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { c } = useTheme();
  return <MaterialCommunityIcons name={name} size={size} color={color ?? c.textSecondary} />;
}

/** Font to preload so icons never pop in. */
export const iconFont = MaterialCommunityIcons.font;
