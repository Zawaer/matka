"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, ImageOff, Images, X } from "lucide-react";
import { Callout, EmptyState, Skeleton } from "@/components/ui";

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

const fetcher = async (url: string): Promise<PhotosResponse> => {
  const res = await fetch(url);
  if (!res.ok && res.status >= 500) throw new Error("Failed to load photos");
  return res.json();
};

export function PhotoGallery({ placeId }: { placeId: number }) {
  const { data, error, isLoading } = useSWR<PhotosResponse>(
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
      <Callout tone="danger" role="alert">
        Couldn&apos;t load photos right now.
      </Callout>
    );
  }

  if (data && data.configured === false) {
    return (
      <EmptyState
        icon={Images}
        title="Photos from your visits"
        description={
          <>
            Connect Immich in{" "}
            <Link href="/settings" className="font-medium text-primary hover:underline">
              Settings
            </Link>{" "}
            to see the photos you took here.
          </>
        }
        className="py-8"
      />
    );
  }

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={ImageOff}
        title="No photos"
        description="Nothing in Immich from the times you visited this place."
        className="py-8"
      />
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
                ? `Photo from ${new Date(p.takenAt).toLocaleString()}`
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
                {new Date(photos[active].takenAt as string).toLocaleString()}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}
