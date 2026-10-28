import { useTheme } from "../design/theme";
import { ICONS, type IconName } from "../design/icons";

export type { IconName };

/** 16 inline and in dense rows, 20 in rows and buttons, 24 in the tab bar, 32 for empty states. */
export type IconSize = 16 | 20 | 24 | 32;

/** The one icon family (Lucide, design/icons.ts), at one stroke width. Decorative unless labelled by its control. */
export function Icon({ name, size = 20, color }: { name: IconName; size?: IconSize; color?: string }) {
  const { c } = useTheme();
  const Glyph = ICONS[name];
  return <Glyph size={size} color={color ?? c.textSecondary} strokeWidth={2} absoluteStrokeWidth={size > 24} />;
}
