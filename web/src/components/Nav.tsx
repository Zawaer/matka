"use client";

import Link from "next/link";
import { useTrackInAppNavigation } from "./EscapeBack";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Wordmark } from "./Brand";
import { NAV_ICONS } from "./ui/icons";

type Item = { href: string; label: string; icon: LucideIcon };

const ITEMS: Item[] = [
  { href: "/", label: "Overview", icon: NAV_ICONS.overview },
  { href: "/map", label: "Map", icon: NAV_ICONS.map },
  { href: "/timeline", label: "Timeline", icon: NAV_ICONS.timeline },
  { href: "/places", label: "Places", icon: NAV_ICONS.places },
  { href: "/insights", label: "Insights", icon: NAV_ICONS.insights },
  { href: "/devices", label: "Devices", icon: NAV_ICONS.devices },
  { href: "/settings", label: "Settings", icon: NAV_ICONS.settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav() {
  const pathname = usePathname();
  useTrackInAppNavigation();
  // Sign-in pages and the public /pair landing page (opened on a phone with no
  // session) stand alone: no app navigation, no "Sign out".
  if (pathname.startsWith("/auth/") || pathname === "/pair") return null;

  return (
    <>
      {/* Desktop sidebar */}
      {/* The rail fills the page's height; the sidebar inside it stays put while the page scrolls. */}
      <div className="mk-sidebar hidden md:block md:w-56 md:shrink-0 md:border-r md:border-border md:bg-surface">
      <aside className="sticky top-0 flex h-screen flex-col px-3 py-4">
        <Link href="/" className="mx-1 flex h-9 items-center rounded-control px-1.5">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="mt-5 flex flex-col gap-0.5">
          {ITEMS.map((it) => {
            const active = isActive(pathname, it.href);
            const I = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 items-center gap-2.5 rounded-control px-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-surface-2 text-text" : "text-secondary hover:bg-surface-2/60 hover:text-text"
                }`}
              >
                <I size={20} strokeWidth={1.75} aria-hidden className={active ? "text-primary" : "text-muted"} />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <form action="/auth/logout" method="post" className="mt-auto border-t border-border pt-3">
          <button
            type="submit"
            className="flex h-9 w-full items-center gap-2.5 rounded-control px-2.5 text-sm font-medium text-secondary transition-colors hover:bg-surface-2/60 hover:text-text"
          >
            <NAV_ICONS.signOut size={20} strokeWidth={1.75} aria-hidden className="text-muted" />
            Sign out
          </button>
        </form>
      </aside>
      </div>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur-md md:hidden">
        <Link href="/" aria-label="Matka, overview">
          <Wordmark size={24} />
        </Link>
        <form action="/auth/logout" method="post">
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <NAV_ICONS.signOut size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </form>
      </header>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        {/* Six fit a phone; Devices is linked from Settings there. */}
        {ITEMS.filter((it) => it.href !== "/devices").map((it) => {
          const active = isActive(pathname, it.href);
          const I = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-14 flex-1 flex-col items-center justify-center gap-1 text-caption font-medium tracking-[0.01em] transition-colors ${
                active ? "text-primary" : "text-muted hover:text-text"
              }`}
            >
              <I size={20} strokeWidth={1.75} aria-hidden />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
