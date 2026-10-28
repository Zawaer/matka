// The web app's one icon set: Lucide (lucide-react), outline, 1.75 stroke.
// Semantic names map to components here, so a page asks for "the icon of a
// bus trip" or "the icon of a café", never for a particular glyph. The
// mappings themselves (which mode, which place group, which saved kind)
// live in lib/modes.ts, lib/placeIcons.ts and lib/savedPlaces.ts; this file
// only says how each one is drawn. No emoji anywhere in the UI.

import {
  Ambulance,
  Banknote,
  Beer,
  BedDouble,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  BusFront,
  Camera,
  Car,
  ChartColumn,
  Church,
  CircleParking,
  Clapperboard,
  Coffee,
  Croissant,
  Drama,
  Dumbbell,
  Factory,
  FerrisWheel,
  Flower2,
  Footprints,
  Fuel,
  GraduationCap,
  Hospital,
  Hotel,
  House,
  HouseHeart,
  IceCreamCone,
  Landmark,
  LayoutGrid,
  LogOut,
  type LucideIcon,
  type LucideProps,
  Mail,
  Map as MapIcon,
  MapPin,
  Martini,
  Motorbike,
  Package,
  Pause,
  PawPrint,
  Pill,
  PlugZap,
  Plane,
  Route,
  Sandwich,
  School,
  Scissors,
  Settings,
  Shirt,
  Ship,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Siren,
  Smartphone,
  SportShoe,
  Star,
  Stethoscope,
  Store,
  Telescope,
  TrainFront,
  TrainFrontTunnel,
  TramFront,
  Trees,
  Trophy,
  UtensilsCrossed,
  Waves,
  Clock,
} from "lucide-react";
import type { ModeKey } from "@/lib/modes";
import { MODE_META } from "@/lib/modes";
import { PLACE_ICONS, type PlaceIconGroup, placeIconGroup } from "@/lib/placeIcons";
import { KIND_META, type PlaceKind } from "@/lib/savedPlaces";

export type { LucideIcon };

/** Default stroke for every icon in the app. */
export const ICON_STROKE = 1.75;

/* ---------------- Travel modes ---------------- */

export const MODE_ICONS: Record<ModeKey, LucideIcon> = {
  unknown: Route,
  stationary: Pause,
  walking: Footprints,
  running: SportShoe,
  cycling: Bike,
  driving: Car,
  bus: Bus,
  tram: TramFront,
  metro: TrainFrontTunnel,
  train: TrainFront,
  flying: Plane,
  boat: Ship,
  motorcycle: Motorbike,
};

export function modeIcon(mode: string): LucideIcon {
  return MODE_ICONS[mode as ModeKey] ?? MODE_ICONS.unknown;
}

/* ---------------- Places ---------------- */

/** Icon groups (lib/placeIcons.ts): the timeline's and the day map's stops. */
export const PLACE_GROUP_ICONS: Record<PlaceIconGroup, LucideIcon> = {
  home: House,
  work: Briefcase,
  school: GraduationCap,
  food: UtensilsCrossed,
  shopping: ShoppingBag,
  transit: TrainFront,
  culture: Landmark,
  sports: Dumbbell,
  health: Hospital,
  nature: Trees,
  hotel: BedDouble,
  airport: Plane,
  other: MapPin,
};

/** Saved-place kinds (lib/savedPlaces.ts). */
export const KIND_ICONS: Record<PlaceKind, LucideIcon> = {
  home: House,
  family: HouseHeart,
  school: GraduationCap,
  work: Briefcase,
  other: Star,
};

/**
 * Finer icons for OSM categories (osm_value) on the places list and place
 * page, where there is room to tell a café from a bar. Anything not listed
 * falls back to its group's icon, then a pin.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  cafe: Coffee,
  restaurant: UtensilsCrossed,
  fast_food: Sandwich,
  food_court: UtensilsCrossed,
  bar: Martini,
  pub: Beer,
  biergarten: Beer,
  bakery: Croissant,
  ice_cream: IceCreamCone,
  school: School,
  university: GraduationCap,
  college: GraduationCap,
  kindergarten: School,
  library: BookOpen,
  hospital: Hospital,
  clinic: Stethoscope,
  doctors: Stethoscope,
  dentist: Stethoscope,
  pharmacy: Pill,
  veterinary: PawPrint,
  supermarket: ShoppingCart,
  convenience: Store,
  mall: ShoppingBag,
  department_store: ShoppingBag,
  marketplace: ShoppingBasket,
  clothes: Shirt,
  hairdresser: Scissors,
  florist: Flower2,
  bank: Landmark,
  atm: Banknote,
  bureau_de_change: Banknote,
  hotel: Hotel,
  hostel: BedDouble,
  guest_house: BedDouble,
  motel: BedDouble,
  fuel: Fuel,
  charging_station: PlugZap,
  parking: CircleParking,
  station: TrainFront,
  bus_station: BusFront,
  bus_stop: BusFront,
  aerodrome: Plane,
  airport: Plane,
  ferry_terminal: Ship,
  park: Trees,
  garden: Flower2,
  playground: Trees,
  beach: Waves,
  pitch: Trophy,
  stadium: Trophy,
  sports_centre: Dumbbell,
  fitness_centre: Dumbbell,
  gym: Dumbbell,
  swimming_pool: Waves,
  cinema: Clapperboard,
  theatre: Drama,
  museum: Landmark,
  gallery: Landmark,
  attraction: Camera,
  theme_park: FerrisWheel,
  viewpoint: Telescope,
  nightclub: Martini,
  place_of_worship: Church,
  church: Church,
  townhall: Landmark,
  police: Siren,
  fire_station: Ambulance,
  post_office: Mail,
  office: Building2,
  coworking_space: Building2,
  house: House,
  residential: House,
  apartments: Building2,
  detached: House,
  industrial: Factory,
  warehouse: Package,
};

/** The icon for a place: saved kind > fine OSM category > icon group > pin. */
export function placeIconFor(
  kind: string | null | undefined,
  category: string | null | undefined,
  osmKey?: string | null,
): LucideIcon {
  if (kind && kind in KIND_ICONS) return KIND_ICONS[kind as PlaceKind];
  if (category && Object.hasOwn(CATEGORY_ICONS, category)) return CATEGORY_ICONS[category];
  return PLACE_GROUP_ICONS[placeIconGroup(null, category, osmKey)];
}

/** A short label for the same icon, for titles and screen readers. */
export function placeIconLabel(kind: string | null | undefined, category: string | null | undefined, osmKey?: string | null) {
  if (kind && kind in KIND_META) return KIND_META[kind as PlaceKind].label;
  return PLACE_ICONS[placeIconGroup(null, category, osmKey)].label;
}

/* ---------------- App navigation and actions ---------------- */

export const NAV_ICONS = {
  overview: LayoutGrid,
  map: MapIcon,
  timeline: Clock,
  places: MapPin,
  insights: ChartColumn,
  devices: Smartphone,
  settings: Settings,
  signOut: LogOut,
} satisfies Record<string, LucideIcon>;

/* ---------------- Rendering ---------------- */

type IconProps = Omit<LucideProps, "ref"> & { icon: LucideIcon };

/** Any Lucide icon at the app's stroke width, hidden from screen readers. */
export function Icon({ icon: C, size = 16, strokeWidth = ICON_STROKE, ...rest }: IconProps) {
  return <C size={size} strokeWidth={strokeWidth} aria-hidden focusable={false} {...rest} />;
}

/** A travel mode's icon. Colour it from the outside (it uses currentColor). */
export function ModeGlyph({ mode, ...rest }: Omit<LucideProps, "ref"> & { mode: string }) {
  return <Icon icon={modeIcon(mode)} {...rest} />;
}

/** A place's icon from its saved kind / OSM category / OSM key. */
export function PlaceGlyph({
  kind,
  category,
  osmKey,
  ...rest
}: Omit<LucideProps, "ref"> & { kind?: string | null; category?: string | null; osmKey?: string | null }) {
  return <Icon icon={placeIconFor(kind, category, osmKey)} {...rest} />;
}

/** The mode's colour, for data marks next to the icon. */
export const modeColor = (mode: string) => (MODE_META[mode as ModeKey] ?? MODE_META.unknown).color;

