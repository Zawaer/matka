import { preconnect, preload } from "react-dom";
import { DayEmbed, type DayEmbedStart } from "@/components/timeline/DayEmbed";
import { dayHasMap, dayWindow } from "@/components/timeline/dayMap";
import { viewerUser } from "@/lib/auth";
import { basemapStyle, glyphUrls } from "@/lib/basemap";
import { isDate, loadTimeline } from "@/lib/timeline";
import { tracksGeoJson } from "@/lib/tracks";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Day map — Matka",
};

// One day of the timeline on a map, for the phone app's Timeline tab
// (docs/API.md → "Map in a WebView"). Chrome-less like /embed/map; the app
// switches days through window.matkaDay instead of reloading the page.
//
// The first day comes inside the page: its timeline, its lines and (when the
// app said which theme) the tamed basemap style, so the map starts as soon as
// the scripts have run, without three more round trips from the phone
// (docs/redesign/daymap-perf.md).
export default async function EmbedDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[]; theme?: string | string[] }>;
}) {
  const user = await viewerUser();
  if (!user) {
    return <p className="p-6 text-sm text-muted">Session expired. Go back and open the map again.</p>;
  }
  // The tiles' host: the TLS handshake overlaps the scripts.
  preconnect("https://tiles.openfreemap.org", { crossOrigin: "anonymous" });
  const { date, theme } = await searchParams;
  const initial = typeof date === "string" && isDate(date) ? date : null;
  const dark = theme === "dark" ? true : theme === "light" ? false : null;

  const [timeline, style] = await Promise.all([
    loadTimeline(user, initial, { withDates: false }).catch((err) => {
      console.warn("[embed/day] timeline", err);
      return null;
    }),
    dark == null ? null : basemapStyle(dark),
  ]);
  // The labels' fonts: otherwise only asked for once the first tiles are parsed.
  // (MapLibre fetches them same-origin-credentials CORS, which is what this matches.)
  if (style) for (const href of glyphUrls(style)) preload(href, { as: "fetch", crossOrigin: "anonymous" });
  let start: DayEmbedStart | null = null;
  if (timeline?.day.date) {
    const day = timeline.day;
    const win = dayWindow(day);
    const hasMoves = day.items.some((it) => it.kind === "move" && it.track.mode !== "stationary");
    const tracks =
      win && hasMoves && dayHasMap(day.items) ? await tracksGeoJson(user, win.from, win.to).catch(() => null) : null;
    start = { day, tracks, style: style && dark != null ? { dark, json: style } : null };
  }
  return (
    <div className="map-shell relative h-[100dvh] w-full touch-none overflow-hidden overscroll-none">
      <DayEmbed initialDate={initial} start={start} />
    </div>
  );
}
