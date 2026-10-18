import type { IconName } from "../ui/Icon";
import type { Colors } from "./tokens";

type TintKey = keyof Colors["tint"];
export type CategoryMeta = { label: string; icon: IconName; tint: TintKey };

const G = {
  home: { icon: "home-outline", tint: "coral" },
  food: { icon: "silverware-fork-knife", tint: "amber" },
  coffee: { icon: "coffee-outline", tint: "amber" },
  drink: { icon: "glass-mug-variant", tint: "amber" },
  shop: { icon: "cart-outline", tint: "violet" },
  study: { icon: "school-outline", tint: "sky" },
  read: { icon: "book-open-page-variant-outline", tint: "sky" },
  work: { icon: "office-building-outline", tint: "sky" },
  transit: { icon: "train-variant", tint: "slate" },
  nature: { icon: "tree-outline", tint: "mint" },
  sport: { icon: "dumbbell", tint: "mint" },
  other: { icon: "map-marker-outline", tint: "slate" },
} as const satisfies Record<string, { icon: IconName; tint: TintKey }>;

const BY_OSM: Record<string, keyof typeof G> = {
  apartments: "home", house: "home", residential: "home", dormitory: "home", detached: "home",
  restaurant: "food", fast_food: "food", food_court: "food",
  cafe: "coffee",
  pub: "drink", bar: "drink", biergarten: "drink",
  supermarket: "shop", convenience: "shop", mall: "shop", department_store: "shop", kiosk: "shop",
  school: "study", university: "study", college: "study", kindergarten: "study",
  library: "read",
  office: "work", commercial: "work", industrial: "work",
  station: "transit", subway: "transit", tram_stop: "transit", bus_station: "transit",
  park: "nature", garden: "nature", forest: "nature", nature_reserve: "nature", beach: "nature",
  gym: "sport", sports_centre: "sport", fitness_centre: "sport", pitch: "sport", stadium: "sport",
};

export function categoryLabel(cat: string | null): string {
  if (!cat || cat === "yes") return "Place";
  return cat.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function categoryMeta(cat: string | null): CategoryMeta {
  const g = G[(cat && BY_OSM[cat]) || "other"];
  return { label: categoryLabel(cat), icon: g.icon, tint: g.tint };
}
