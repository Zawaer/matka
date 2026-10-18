"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark, Logo } from "./Brand";

type Item = { href: string; label: string; icon: React.ReactNode };

const ICON = {
  overview: (
    <path d="M4 13h7V4H4v9Zm0 7h7v-5H4v5Zm9 0h7v-9h-7v9Zm0-16v5h7V4h-7Z" />
  ),
  map: (
    <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
  ),
  timeline: (
    <path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3Zm-1 4v6l5 3 .9-1.6-4.9-2.9V7h-1Z" />
  ),
  places: (
    <path d="M12 2C7.6 2 4 5.6 4 10c0 5.5 8 12 8 12s8-6.5 8-12c0-4.4-3.6-8-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
  ),
  devices: (
    <path d="M7 1h10a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Zm0 3v14h10V4H7Zm5 15.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
  ),
  signOut: (
    <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm6.6 4.4-1.4 1.4 2.2 2.2H9v2h8.4l-2.2 2.2 1.4 1.4L21.2 12l-4.6-4.6Z" />
  ),
};

const ITEMS: Item[] = [
  { href: "/", label: "Overview", icon: ICON.overview },
  { href: "/map", label: "Map", icon: ICON.map },
  { href: "/timeline", label: "Timeline", icon: ICON.timeline },
  { href: "/places", label: "Places", icon: ICON.places },
  { href: "/devices", label: "Devices", icon: ICON.devices },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function GlyphIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col md:border-r md:border-border md:bg-surface md:p-4">
        <div className="px-2 py-3">
          <Wordmark />
        </div>
        <nav className="mt-4 flex flex-col gap-1">
          {ITEMS.map((it) => {
            const active = isActive(pathname, it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-surface-2 text-primary"
                    : "text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                <GlyphIcon>{it.icon}</GlyphIcon>
                {it.label}
              </Link>
            );
          })}
        </nav>
        <form action="/auth/logout" method="post" className="mt-auto">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <GlyphIcon>{ICON.signOut}</GlyphIcon>
            Sign out
          </button>
        </form>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo size={24} />
        <span className="text-base font-semibold tracking-tight">Matka</span>
        <form action="/auth/logout" method="post">
          <button type="submit" aria-label="Sign out" className="block text-muted">
            <GlyphIcon>{ICON.signOut}</GlyphIcon>
          </button>
        </form>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 backdrop-blur md:hidden">
        {ITEMS.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${
                active ? "text-primary" : "text-muted"
              }`}
            >
              <GlyphIcon>{it.icon}</GlyphIcon>
              {it.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
