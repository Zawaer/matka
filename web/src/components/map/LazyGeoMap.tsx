"use client";

import dynamic from "next/dynamic";
import type { GeoMapProps } from "./GeoMap";

export type { GeoMapProps, GeoPoint } from "./GeoMap";

/** GeoMap, loaded only when a page shows one (MapLibre is big). Server pages can render this. */
const GeoMapLazy = dynamic(() => import("./GeoMap"), {
  ssr: false,
  loading: () => <div aria-hidden className="h-full w-full animate-pulse rounded-card bg-surface-2" />,
});

export function LazyGeoMap(props: GeoMapProps) {
  // The box keeps its height while the chunk loads, so nothing below jumps.
  return (
    <div className={props.className ?? "h-60 md:h-80"}>
      <GeoMapLazy {...props} className="h-full" />
    </div>
  );
}
