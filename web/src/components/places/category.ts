// Maps an OSM category (geodata->properties->osm_value) to a display icon + label.
// Keep this the single source of truth for place iconography.

const ICONS: Record<string, string> = {
  // food & drink
  cafe: "☕",
  restaurant: "🍽️",
  fast_food: "🍔",
  bar: "🍸",
  pub: "🍺",
  biergarten: "🍺",
  bakery: "🥐",
  ice_cream: "🍦",
  food_court: "🍽️",

  // education
  school: "🏫",
  university: "🎓",
  college: "🎓",
  kindergarten: "🧸",
  library: "📚",

  // health
  hospital: "🏥",
  clinic: "🏥",
  doctors: "🩺",
  dentist: "🦷",
  pharmacy: "💊",
  veterinary: "🐾",

  // shops
  supermarket: "🛒",
  convenience: "🏪",
  mall: "🛍️",
  department_store: "🛍️",
  marketplace: "🧺",
  clothes: "👕",
  hairdresser: "💈",
  florist: "💐",

  // money
  bank: "🏦",
  atm: "🏧",
  bureau_de_change: "💱",

  // lodging & travel
  hotel: "🏨",
  hostel: "🛏️",
  guest_house: "🛏️",
  motel: "🛏️",
  fuel: "⛽",
  charging_station: "🔌",
  parking: "🅿️",
  station: "🚉",
  bus_station: "🚌",
  bus_stop: "🚏",
  aerodrome: "✈️",
  airport: "✈️",
  ferry_terminal: "⛴️",

  // leisure & culture
  park: "🌳",
  garden: "🌷",
  playground: "🛝",
  pitch: "⚽",
  stadium: "🏟️",
  sports_centre: "🏟️",
  fitness_centre: "🏋️",
  gym: "🏋️",
  swimming_pool: "🏊",
  cinema: "🎬",
  theatre: "🎭",
  museum: "🏛️",
  gallery: "🖼️",
  attraction: "📸",
  viewpoint: "🔭",
  nightclub: "🪩",

  // worship & civic
  place_of_worship: "⛪",
  church: "⛪",
  mosque: "🕌",
  synagogue: "🕍",
  townhall: "🏛️",
  police: "🚓",
  fire_station: "🚒",
  post_office: "📮",

  // work & home
  office: "🏢",
  coworking_space: "🏢",
  house: "🏠",
  residential: "🏠",
  apartments: "🏢",
  detached: "🏡",
  industrial: "🏭",
  warehouse: "📦",
};

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

export function categoryIcon(osmValue: string | null | undefined): string {
  if (!osmValue) return "📍";
  return ICONS[osmValue] ?? "📍";
}

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
