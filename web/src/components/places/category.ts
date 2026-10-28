// Labels for OSM categories (geodata->properties->osm_value). Their icons are
// in components/ui/icons.tsx (placeIconFor).

const LABELS: Record<string, string> = {
  fast_food: "Fast food",
  place_of_worship: "Place of worship",
  fitness_centre: "Gym",
  sports_centre: "Sports centre",
  bus_station: "Bus station",
  bus_stop: "Bus stop",
  department_store: "Department store",
  guest_house: "Guest house",
  charging_station: "Charging station",
  swimming_pool: "Swimming pool",
  coworking_space: "Coworking",
  bureau_de_change: "Currency exchange",
};


export function categoryLabel(osmValue: string | null | undefined): string {
  if (!osmValue) return "Place";
  if (LABELS[osmValue]) return LABELS[osmValue];
  // "ice_cream" -> "Ice cream"
  const words = osmValue.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A place's title: its name, else what it is ("Café"), else "Unknown place"
 * (not geocoded and not renamed). Same wording as the overview's lists.
 */
export function placeTitle(name: string | null | undefined, osmValue: string | null | undefined): string {
  if (name && name !== "Unknown Location") return name;
  return osmValue ? categoryLabel(osmValue) : "Unknown place";
}

/** The category line under a title, or null when it would only repeat the title or say nothing. */
export function placeCategoryLine(name: string | null | undefined, osmValue: string | null | undefined): string | null {
  if (!osmValue) return null;
  const label = categoryLabel(osmValue);
  return label === placeTitle(name, osmValue) ? null : label;
}
