// Category icons for visits on the timeline and stops on the day map: one
// small set of groups (shopping, food, school…) derived from the place's saved
// kind, else its OSM category (geodata osm_value, then osm_key). Client-safe.
//
// The phone app has a copy of this table (mobile/src/design/placeIcons.ts):
// keep the two in step. `emoji` is what the web shows (the web's icons are
// emoji, like MODE_META and KIND_META); `mci` is the MaterialCommunityIcons
// name the app shows.

export const PLACE_ICON_GROUPS = [
  "home",
  "work",
  "school",
  "food",
  "shopping",
  "transit",
  "culture",
  "sports",
  "health",
  "nature",
  "hotel",
  "airport",
  "other",
] as const;
export type PlaceIconGroup = (typeof PLACE_ICON_GROUPS)[number];

export const PLACE_ICONS: Record<PlaceIconGroup, { label: string; emoji: string; mci: string }> = {
  home: { label: "Home", emoji: "🏠", mci: "home-outline" },
  work: { label: "Work", emoji: "💼", mci: "briefcase-outline" },
  school: { label: "School", emoji: "🎓", mci: "school-outline" },
  food: { label: "Food & café", emoji: "🍴", mci: "silverware-fork-knife" },
  shopping: { label: "Shopping", emoji: "🛍️", mci: "shopping-outline" },
  transit: { label: "Transit", emoji: "🚉", mci: "train-variant" },
  culture: { label: "Culture", emoji: "🏛️", mci: "bank-outline" },
  sports: { label: "Sports", emoji: "🏋️", mci: "dumbbell" },
  health: { label: "Health", emoji: "🏥", mci: "hospital-box-outline" },
  nature: { label: "Nature", emoji: "🌳", mci: "tree-outline" },
  hotel: { label: "Hotel", emoji: "🏨", mci: "bed-outline" },
  airport: { label: "Airport", emoji: "✈️", mci: "airplane" },
  other: { label: "Place", emoji: "📍", mci: "map-marker-outline" },
};

/** Saved kinds (lib/savedPlaces.ts) that decide the icon by themselves. */
const BY_KIND: Record<string, PlaceIconGroup> = { home: "home", family: "home", school: "school", work: "work" };

/** OSM values (osm_value), the most specific signal. */
const BY_VALUE: Record<string, PlaceIconGroup> = {
  // home
  house: "home", residential: "home", apartments: "home", detached: "home", semidetached_house: "home",
  terrace: "home", dormitory: "home", bungalow: "home",
  // work
  office: "work", coworking_space: "work", commercial: "work", industrial: "work", warehouse: "work",
  company: "work", government: "work", it: "work",
  // school
  school: "school", university: "school", college: "school", kindergarten: "school", library: "school",
  language_school: "school", music_school: "school", driving_school: "school", research_institute: "school",
  // food & café
  restaurant: "food", cafe: "food", fast_food: "food", food_court: "food", bakery: "food", ice_cream: "food",
  pastry: "food", coffee: "food", deli: "food",
  // shopping
  supermarket: "shopping", convenience: "shopping", mall: "shopping", department_store: "shopping",
  marketplace: "shopping", clothes: "shopping", shoes: "shopping", books: "shopping", electronics: "shopping",
  hardware: "shopping", doityourself: "shopping", furniture: "shopping", florist: "shopping",
  kiosk: "shopping", gift: "shopping", sports: "shopping", outdoor: "shopping", variety_store: "shopping",
  // transit
  station: "transit", bus_station: "transit", bus_stop: "transit", tram_stop: "transit", subway_entrance: "transit",
  halt: "transit", platform: "transit", stop_position: "transit", ferry_terminal: "transit",
  // culture
  museum: "culture", gallery: "culture", theatre: "culture", cinema: "culture", arts_centre: "culture",
  concert_hall: "culture", attraction: "culture", artwork: "culture", castle: "culture", monument: "culture",
  memorial: "culture", zoo: "culture", aquarium: "culture", theme_park: "culture", events_venue: "culture",
  exhibition_centre: "culture",
  // sports
  fitness_centre: "sports", gym: "sports", sports_centre: "sports", sports_hall: "sports", stadium: "sports",
  pitch: "sports", swimming_pool: "sports", ice_rink: "sports", golf_course: "sports", climbing: "sports",
  water_park: "sports", track: "sports",
  // health
  hospital: "health", clinic: "health", doctors: "health", dentist: "health", pharmacy: "health",
  physiotherapist: "health", optician: "health",
  // nature
  park: "nature", garden: "nature", forest: "nature", wood: "nature", nature_reserve: "nature", beach: "nature",
  playground: "nature", dog_park: "nature", viewpoint: "nature", picnic_site: "nature", camp_site: "nature",
  island: "nature", peak: "nature",
  // hotel
  hotel: "hotel", hostel: "hotel", guest_house: "hotel", motel: "hotel", apartment: "hotel", chalet: "hotel",
  // airport
  aerodrome: "airport", airport: "airport", terminal: "airport", gate: "airport",
};

/** OSM keys (osm_key), when the value says nothing we know. */
const BY_KEY: Record<string, PlaceIconGroup> = {
  shop: "shopping",
  office: "work",
  craft: "work",
  railway: "transit",
  public_transport: "transit",
  aeroway: "airport",
  healthcare: "health",
  natural: "nature",
  tourism: "culture",
  historic: "culture",
  leisure: "sports",
};

/** The icon group for a place: saved kind > OSM value > OSM key > other. */
export function placeIconGroup(
  kind: string | null | undefined,
  category: string | null | undefined,
  osmKey?: string | null,
): PlaceIconGroup {
  if (kind && BY_KIND[kind]) return BY_KIND[kind];
  if (category && Object.hasOwn(BY_VALUE, category)) return BY_VALUE[category];
  if (osmKey === "aeroway") return "airport";
  if (osmKey && Object.hasOwn(BY_KEY, osmKey)) return BY_KEY[osmKey];
  return "other";
}

/** The icon itself (label, emoji, MaterialCommunityIcons name). */
export const placeIcon = (kind: string | null | undefined, category: string | null | undefined, osmKey?: string | null) =>
  PLACE_ICONS[placeIconGroup(kind, category, osmKey)];
