import Link from "next/link";

// Shown inside the app's layout (nav included) for unknown pages and for
// places or trips that don't exist (any more): a place merged away by
// reprocessing, a trip whose dates moved.
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-5 py-16 md:py-24">
      <div className="mk-card flex flex-col items-center gap-2 px-6 py-12 text-center">
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="text-xl font-semibold">Nothing here</h1>
        <p className="max-w-xs text-sm text-muted">
          This page doesn&apos;t exist, or what it showed has gone: places and trips are recomputed as new
          locations come in.
        </p>
        <div className="mt-3 flex gap-2">
          <Link href="/" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">
            Overview
          </Link>
          <Link href="/timeline" className="rounded-lg border border-border px-4 py-2 text-sm hover:border-primary/60">
            Timeline
          </Link>
        </div>
      </div>
    </div>
  );
}
