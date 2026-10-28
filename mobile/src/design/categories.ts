import type { IconName } from "./icons";
import { placeIcon } from "./placeIcons";

export type CategoryMeta = { label: string; icon: IconName };

/** "Fast food" from "fast_food"; "Place" when the geocoder had nothing better ("yes"). */
export function categoryLabel(cat: string | null): string {
  if (!cat || cat === "yes") return "Place";
  return cat.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Label and icon of a place's category (the icon by the same rules as the timeline: design/placeIcons.ts). */
export function categoryMeta(cat: string | null, kind?: string | null, osmKey?: string | null): CategoryMeta {
  return { label: categoryLabel(cat), icon: placeIcon(kind, cat, osmKey).icon };
}
