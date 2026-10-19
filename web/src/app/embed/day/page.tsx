import { DayEmbed } from "@/components/timeline/DayEmbed";
import { viewerUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Day map — Matka",
};

// One day of the timeline on a map, for the phone app's Timeline tab
// (docs/API.md → "Map in a WebView"). Chrome-less like /embed/map; the app
// switches days through window.matkaDay instead of reloading the page.
export default async function EmbedDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  if (!(await viewerUser())) {
    return <p className="p-6 text-sm text-muted">Session expired. Go back and open the map again.</p>;
  }
  const { date } = await searchParams;
  const initial = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  return (
    <div className="map-shell relative h-[100dvh] w-full touch-none overflow-hidden overscroll-none">
      <DayEmbed initialDate={initial} />
    </div>
  );
}
