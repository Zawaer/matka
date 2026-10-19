// Immich cover photos (lib/covers.ts) for trip and city pages. Images go
// through the authenticated asset proxy, sit in boxes of fixed aspect ratio so
// nothing moves while they load, and text over them sits on a dark gradient
// (white on dark in both themes).

import type { ReactNode } from "react";
import { assetUrl } from "@/lib/covers";

/** Shown behind (or instead of) a photo: dark in both themes, like the photo scrim. */
export const COVER_BACKDROP = "bg-linear-to-br from-[#2b2f4d] via-[#1d2036] to-[#141625]";

export function CoverPhoto({
  assetId,
  size = "preview",
  eager,
  className = "",
}: {
  assetId: string;
  size?: "thumbnail" | "preview";
  eager?: boolean;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={assetUrl(assetId, size)}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : undefined}
      className={`absolute inset-0 h-full w-full object-cover ${className}`}
    />
  );
}

/** Bottom scrim so white text over any photo stays legible. */
export function CoverScrim() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/35 via-55% to-black/0"
    />
  );
}

/** A page header over a cover photo: back link on top, title block at the bottom. */
export function CoverHeader({ assetId, children }: { assetId: string; children: ReactNode }) {
  return (
    <header
      className={`relative mb-6 aspect-[3/2] overflow-hidden rounded-[var(--mk-radius)] sm:aspect-[21/9] ${COVER_BACKDROP}`}
    >
      <CoverPhoto assetId={assetId} eager />
      <CoverScrim />
      <div className="absolute inset-x-0 bottom-0 p-5 text-white md:p-7 [text-shadow:0_1px_8px_rgb(0_0_0/0.45)]">
        {children}
      </div>
    </header>
  );
}

/** A row of small square photos, each opening the larger preview. */
export function PhotoStrip({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <ul className="-mx-5 mb-6 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-8 sm:overflow-visible sm:px-0">
      {ids.map((id) => (
        <li key={id} className="w-24 shrink-0 sm:w-auto">
          <a
            href={assetUrl(id, "preview")}
            target="_blank"
            rel="noopener"
            aria-label="Open photo"
            className={`relative block aspect-square overflow-hidden rounded-xl ring-primary/60 focus:outline-none focus-visible:ring-2 ${COVER_BACKDROP}`}
          >
            <CoverPhoto assetId={id} size="thumbnail" className="transition-transform duration-200 hover:scale-105" />
          </a>
        </li>
      ))}
    </ul>
  );
}
