import MapView from "@/components/map/MapView";
import { viewerUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Map — Matka",
};

// Full-screen map for the phone app's WebView. The root layout hides the web
// chrome on /embed/ paths (see layout.tsx).
export default async function EmbedMapPage() {
  if (!(await viewerUser())) {
    return (
      <p className="p-6 text-sm text-muted">Session expired. Go back and open the map again.</p>
    );
  }
  return (
    <div className="map-shell relative h-[100dvh] w-full overflow-hidden">
      <MapView />
    </div>
  );
}
