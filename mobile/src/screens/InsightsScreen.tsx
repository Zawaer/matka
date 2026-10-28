// Insights tab: Travel (modes per month), Trips (away from home), World
// (countries and cities) and Places, as segments. Details (a trip, a country's
// cities, a city) are pushed on a small stack inside the tab; Android's back
// button pops it while the tab is showing.

import { useEffect, useState } from "react";
import { BackHandler, View } from "react-native";
import { useTheme } from "../design/theme";
import { Segmented } from "../ui";
import { ScreenHeader } from "../ui/Screen";
import { PairingLost, useSession, type InsightsSegment } from "../ui/session";
import PlacesScreen from "./PlacesScreen";
import CityView from "./insights/CityView";
import TravelView from "./insights/TravelView";
import TripDetailView from "./insights/TripDetailView";
import TripsView from "./insights/TripsView";
import WorldView from "./insights/WorldView";

const SEGMENTS: { value: InsightsSegment; label: string }[] = [
  { value: "travel", label: "Travel" },
  { value: "trips", label: "Trips" },
  { value: "world", label: "World" },
  { value: "places", label: "Places" },
];

type Route =
  | { kind: "trip"; id: string; name: string }
  | { kind: "country"; name: string }
  | { kind: "city"; name: string; country: string | null };

export default function InsightsScreen({
  segment,
  onSegment,
  active,
}: {
  segment: InsightsSegment;
  onSegment: (s: InsightsSegment) => void;
  /** The Insights tab is the one showing (hidden tabs stay mounted). */
  active: boolean;
}) {
  const t = useTheme();
  const { authLost } = useSession();
  const [stack, setStack] = useState<Route[]>([]);
  // Segments mount on first visit and then stay mounted, keeping their scroll and data.
  const [seen, setSeen] = useState<Set<InsightsSegment>>(() => new Set([segment]));
  if (!seen.has(segment)) setSeen(new Set(seen).add(segment));

  const push = (r: Route) => setStack((s) => [...s, r]);
  const pop = () => setStack((s) => s.slice(0, -1));
  const top = stack[stack.length - 1];

  // A switch from elsewhere (e.g. Overview → Places) shows the segment itself, not a detail over it.
  const [lastSegment, setLastSegment] = useState(segment);
  if (segment !== lastSegment) {
    setLastSegment(segment);
    setStack([]);
  }

  const depth = stack.length;
  useEffect(() => {
    if (!active || depth === 0) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setStack((s) => s.slice(0, -1));
      return true;
    });
    return () => sub.remove();
  }, [active, depth]);

  const header = (
    <View style={{ gap: t.space.lg }}>
      <ScreenHeader title="Insights" />
      <Segmented label="Insights" options={SEGMENTS} value={segment} onChange={onSegment} />
      {authLost ? <PairingLost /> : null}
    </View>
  );

  const openCity = (name: string, country: string | null) => push({ kind: "city", name, country });
  const segmentView = (s: InsightsSegment) => {
    switch (s) {
      case "travel":
        return <TravelView header={header} />;
      case "trips":
        return <TripsView header={header} onOpen={(trip) => push({ kind: "trip", id: trip.id, name: trip.name })} />;
      case "world":
        return <WorldView header={header} onOpenCountry={(name) => push({ kind: "country", name })} onOpenCity={openCity} />;
      case "places":
        return <PlacesScreen top={header} />;
    }
  };

  const backLabel = (i: number) => {
    const below = stack[i - 1];
    if (!below) return SEGMENTS.find((x) => x.value === segment)?.label ?? "Back";
    return below.kind === "trip" ? "Trip" : below.name;
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      {SEGMENTS.filter((x) => seen.has(x.value)).map((x) => (
        <View key={x.value} style={{ flex: 1, display: !top && segment === x.value ? "flex" : "none" }}>
          {segmentView(x.value)}
        </View>
      ))}
      {/* Every pushed view stays mounted under the one on top, so going back keeps its scroll. */}
      {stack.map((r, i) => (
        <View key={`${i}:${r.kind}:${r.name}`} style={{ flex: 1, display: i === stack.length - 1 ? "flex" : "none" }}>
          {r.kind === "trip" ? (
            <TripDetailView id={r.id} name={r.name} onBack={pop} onOpenCity={openCity} />
          ) : r.kind === "country" ? (
            <WorldView country={r.name} onBack={pop} onOpenCountry={() => {}} onOpenCity={openCity} />
          ) : (
            <CityView name={r.name} country={r.country} backLabel={backLabel(i)} onBack={pop} />
          )}
        </View>
      ))}
    </View>
  );
}
