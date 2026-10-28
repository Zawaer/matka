// The app's one icon family: Lucide (the web uses the same set). Screens ask
// for a semantic name ("walk", "home", "edit"), never a Lucide glyph, so a
// glyph can be swapped in one place. Per-icon imports keep the bundle to the
// glyphs used here. Sizes: 16 inline and in dense rows, 20 in rows, buttons
// and inputs, 24 in the tab bar (32 only for empty states); stroke 2 throughout.

import type { LucideIcon } from "lucide-react-native";
import Activity from "lucide-react-native/icons/activity";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import BatteryWarning from "lucide-react-native/icons/battery-warning";
import BedDouble from "lucide-react-native/icons/bed-double";
import Bike from "lucide-react-native/icons/bike";
import Briefcase from "lucide-react-native/icons/briefcase";
import Building from "lucide-react-native/icons/building";
import Bus from "lucide-react-native/icons/bus";
import Calendar from "lucide-react-native/icons/calendar";
import Camera from "lucide-react-native/icons/camera";
import Car from "lucide-react-native/icons/car";
import ChartColumn from "lucide-react-native/icons/chart-column";
import Check from "lucide-react-native/icons/check";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import Circle from "lucide-react-native/icons/circle";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import CircleDot from "lucide-react-native/icons/circle-dot";
import CirclePause from "lucide-react-native/icons/circle-pause";
import CircleQuestionMark from "lucide-react-native/icons/circle-question-mark";
import CloudOff from "lucide-react-native/icons/cloud-off";
import CloudUpload from "lucide-react-native/icons/cloud-upload";
import Dumbbell from "lucide-react-native/icons/dumbbell";
import Earth from "lucide-react-native/icons/earth";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import ExternalLink from "lucide-react-native/icons/external-link";
import Flag from "lucide-react-native/icons/flag";
import Footprints from "lucide-react-native/icons/footprints";
import GitCommitVertical from "lucide-react-native/icons/git-commit-vertical";
import GraduationCap from "lucide-react-native/icons/graduation-cap";
import Hospital from "lucide-react-native/icons/hospital";
import Hourglass from "lucide-react-native/icons/hourglass";
import House from "lucide-react-native/icons/house";
import ImageIcon from "lucide-react-native/icons/image";
import Info from "lucide-react-native/icons/info";
import Keyboard from "lucide-react-native/icons/keyboard";
import Landmark from "lucide-react-native/icons/landmark";
import LayoutDashboard from "lucide-react-native/icons/layout-dashboard";
import LocateFixed from "lucide-react-native/icons/locate-fixed";
import Lock from "lucide-react-native/icons/lock";
import LockOpen from "lucide-react-native/icons/lock-open";
import Luggage from "lucide-react-native/icons/luggage";
import MapIcon from "lucide-react-native/icons/map";
import MapPin from "lucide-react-native/icons/map-pin";
import MapPinOff from "lucide-react-native/icons/map-pin-off";
import Moon from "lucide-react-native/icons/moon";
import Motorbike from "lucide-react-native/icons/motorbike";
import Pencil from "lucide-react-native/icons/pencil";
import Plane from "lucide-react-native/icons/plane";
import PlaneTakeoff from "lucide-react-native/icons/plane-takeoff";
import Play from "lucide-react-native/icons/play";
import Plus from "lucide-react-native/icons/plus";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Route from "lucide-react-native/icons/route";
import ScanQrCode from "lucide-react-native/icons/scan-qr-code";
import Search from "lucide-react-native/icons/search";
import Settings from "lucide-react-native/icons/settings";
import Ship from "lucide-react-native/icons/ship";
import ShoppingBag from "lucide-react-native/icons/shopping-bag";
import Square from "lucide-react-native/icons/square";
import Star from "lucide-react-native/icons/star";
import TrainFront from "lucide-react-native/icons/train-front";
import TrainFrontTunnel from "lucide-react-native/icons/train-front-tunnel";
import TramFront from "lucide-react-native/icons/tram-front";
import Trash from "lucide-react-native/icons/trash";
import Trees from "lucide-react-native/icons/trees";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import Undo2 from "lucide-react-native/icons/undo-2";
import Unlink from "lucide-react-native/icons/unlink";
import Users from "lucide-react-native/icons/users";
import Utensils from "lucide-react-native/icons/utensils";
import X from "lucide-react-native/icons/x";

export const ICONS = {
  // ---- travel modes (design/modes.ts) ----
  walk: Footprints,
  run: Activity,
  cycle: Bike,
  drive: Car,
  bus: Bus,
  tram: TramFront,
  metro: TrainFrontTunnel,
  train: TrainFront,
  flight: Plane,
  ferry: Ship,
  motorbike: Motorbike,
  stationary: CirclePause,
  move: Ellipsis,

  // ---- places: saved kinds and category groups (design/placeIcons.ts) ----
  home: House,
  family: Users,
  work: Briefcase,
  school: GraduationCap,
  food: Utensils,
  shopping: ShoppingBag,
  transit: TrainFront,
  culture: Landmark,
  sports: Dumbbell,
  health: Hospital,
  nature: Trees,
  hotel: BedDouble,
  airport: PlaneTakeoff,
  place: MapPin,
  unnamedPlace: CircleQuestionMark,
  saved: Star,
  city: Building,
  country: Flag,
  world: Earth,

  // ---- tabs ----
  tabOverview: LayoutDashboard,
  tabMap: MapIcon,
  tabTimeline: GitCommitVertical,
  tabInsights: ChartColumn,
  tabRecorder: CircleDot,

  // ---- things ----
  trip: Luggage,
  route: Route,
  calendar: Calendar,
  gps: LocateFixed,
  photo: ImageIcon,
  camera: Camera,
  keyboard: Keyboard,
  qr: ScanQrCode,
  quiet: Moon,
  noLocation: MapPinOff,
  wait: Hourglass,
  battery: BatteryWarning,
  secure: Lock,
  insecure: LockOpen,
  offline: CloudOff,

  // ---- actions ----
  back: ChevronLeft,
  forward: ChevronRight,
  chevronRight: ChevronRight,
  expand: ChevronDown,
  collapse: ChevronUp,
  close: X,
  check: Check,
  add: Plus,
  edit: Pencil,
  delete: Trash,
  undo: Undo2,
  moveUp: ArrowUp,
  refresh: RefreshCw,
  search: Search,
  settings: Settings,
  external: ExternalLink,
  upload: CloudUpload,
  unlink: Unlink,
  start: Play,
  stop: Square,
  radioOn: CircleDot,
  radioOff: Circle,

  // ---- status ----
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
