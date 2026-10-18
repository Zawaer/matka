import MapView from "@/components/map/MapView";

export const metadata = {
  title: "Map & heatmap — Matka",
};

export default function MapPage() {
  // Fill the viewport minus chrome. The root layout gives <main> a pb-20 on
  // mobile (to clear the fixed bottom nav); we cancel it here so the map can
  // sit exactly between the ~52px sticky top bar and the ~56px bottom nav.
  return (
    <div className="relative -mb-20 h-[calc(100dvh-108px)] w-full overflow-hidden md:mb-0 md:h-[100dvh]">
      <MapView />
    </div>
  );
}
