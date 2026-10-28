import { Compass } from "lucide-react";
import { ButtonLink, NAV_ICONS } from "@/components/ui";

// Shown inside the app's layout (nav included) for unknown pages and for
// places or trips that don't exist (any more): a place merged away by
// reprocessing, a trip whose dates moved.
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Compass size={24} strokeWidth={1.75} aria-hidden />
      </span>
      <p className="mt-5 text-caption font-medium uppercase tracking-wide text-muted">Error 404</p>
      <h1 className="mt-1 text-title text-text">Nothing here</h1>
      <p className="mt-2 max-w-xs text-sm text-muted">
        This page doesn&apos;t exist, or what it showed has gone: places and trips are recomputed as new locations come
        in.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <ButtonLink href="/" variant="primary" icon={NAV_ICONS.overview}>
          Overview
        </ButtonLink>
        <ButtonLink href="/timeline" icon={NAV_ICONS.timeline}>
          Timeline
        </ButtonLink>
      </div>
    </div>
  );
}
