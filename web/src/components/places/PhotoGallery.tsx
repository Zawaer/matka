"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, ImageOff, Images, X } from "lucide-react";
import { Button, Callout, Skeleton } from "@/components/ui";
import { formatDateCompact, formatTime } from "@/lib/format";

interface Photo {
  id: string;
  thumbUrl: string;
  takenAt: string | null;
}

interface PhotosResponse {
  configured: boolean;
  photos: Photo[];
  error?: string;
}

/** "28 Oct 2026 · 12:40" in the viewer's zone. */
const taken = (iso: string) => `${formatDateCompact(iso)} · ${formatTime(iso)}`;

const fetcher = async (url: string): Promise<PhotosResponse> => {
  const res = await fetch(url);
  if (!res.ok && res.status >= 500) throw new Error("Failed to load photos");
  return res.json();
};

export function PhotoGallery({ placeId }: { placeId: number }) {
  const { data, error, isLoading, mutate } = useSWR<PhotosResponse>(
    `/api/places/${placeId}/photos`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const [active, setActive] = useState<number | null>(null);
  const photos = data?.photos ?? [];

  const close = useCallback(() => setActive(null), []);
  const prev = useCallback(
    () => setActive((i) => (i == null ? i : (i - 1 + photos.length) % photos.length)),
    [photos.length],
  );
  const next = useCallback(
    () => setActive((i) => (i == null ? i : (i + 1) % photos.length)),
    [photos.length],
  );

  useEffect(() => {
    if (active == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close, prev, next]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Callout
        tone="danger"
        role="alert"
        title="Couldn't load photos"
        action={
          <Button size="sm" onClick={() => void mutate()}>
            Retry
          </Button>
        }
      >
        Immich didn&apos;t answer in time.
      </Callout>
    );
  }

  if (data && data.configured === false) {
    return (
      <p className="flex items-center gap-2 text-meta text-muted">
        <Images size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
        <span>
          <Link href="/settings" className="font-medium text-primary hover:underline">
            Connect Immich
          </Link>{" "}
          to see the photos you took here.
        </span>
      </p>
    );
  }

  if (photos.length === 0) {
    return (
      <p className="flex items-center gap-2 text-meta text-muted">
        <ImageOff size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
        No photos in Immich from your visits here.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActive(i)}
            className="group relative aspect-square overflow-hidden rounded-control bg-surface-2"
            aria-label={
              p.takenAt
                ? `Photo from ${taken(p.takenAt)}`
                : "Photo"
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.thumbUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {active != null && photos[active] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-control bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Close"
          >
            <X size={20} strokeWidth={1.75} aria-hidden />
          </button>

          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-control bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Previous photo"
              >
                <ChevronLeft size={24} strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-control bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Next photo"
              >
                <ChevronRight size={24} strokeWidth={1.75} aria-hidden />
              </button>
            </>
          )}

          <figure
            className="flex max-h-full max-w-full flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/immich/asset/${photos[active].id}?size=preview`}
              alt=""
              className="max-h-[80vh] max-w-full rounded-control object-contain"
            />
            {photos[active].takenAt && (
              <figcaption className="text-meta tabular-nums text-white/70">
                {taken(photos[active].takenAt as string)}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}
