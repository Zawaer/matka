// Category icons for visits, places and day-map stops: the same groups and
// rules as the web's web/src/lib/placeIcons.ts (keep the two in step). `icon`
// is a semantic name from design/icons.ts (Lucide, like the web).

import type { IconName } from "./icons";

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

export const PLACE_ICONS: Record<PlaceIconGroup, { label: string; icon: IconName }> = {
  home: { label: "Home", icon: "home" },
  work: { label: "Work", icon: "work" },
  school: { label: "School", icon: "school" },
  food: { label: "Food & café", icon: "food" },
  shopping: { label: "Shopping", icon: "shopping" },
  transit: { label: "Transit", icon: "transit" },
  culture: { label: "Culture", icon: "culture" },
  sports: { label: "Sports", icon: "sports" },
  health: { label: "Health", icon: "health" },
  nature: { label: "Nature", icon: "nature" },
  hotel: { label: "Hotel", icon: "hotel" },
  airport: { label: "Airport", icon: "airport" },
  other: { label: "Place", icon: "place" },
};

/** Saved kinds (the web's lib/savedPlaces.ts) that decide the icon by themselves. */
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
  if (category && Object.prototype.hasOwnProperty.call(BY_VALUE, category)) return BY_VALUE[category];
  if (osmKey === "aeroway") return "airport";
  if (osmKey && Object.prototype.hasOwnProperty.call(BY_KEY, osmKey)) return BY_KEY[osmKey];
  return "other";
}

/** The icon itself (label and semantic icon name). */
export const placeIcon = (kind: string | null | undefined, category: string | null | undefined, osmKey?: string | null) =>
  PLACE_ICONS[placeIconGroup(kind, category, osmKey)];
