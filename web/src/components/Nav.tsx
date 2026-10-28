"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTrackInAppNavigation } from "./EscapeBack";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Ellipsis } from "lucide-react";
import { Logo, Wordmark } from "./Brand";
import { NAV_ICONS } from "./ui/icons";

type Item = { href: string; label: string; icon: LucideIcon };

const ITEMS: Item[] = [
  { href: "/", label: "Overview", icon: NAV_ICONS.overview },
  { href: "/timeline", label: "Timeline", icon: NAV_ICONS.timeline },
  { href: "/map", label: "Map", icon: NAV_ICONS.map },
  { href: "/places", label: "Places", icon: NAV_ICONS.places },
  { href: "/insights", label: "Insights", icon: NAV_ICONS.insights },
  { href: "/devices", label: "Devices", icon: NAV_ICONS.devices },
  { href: "/settings", label: "Settings", icon: NAV_ICONS.settings },
];

/** The phone's tab bar: four destinations and "More" (Overview, Devices, Settings, Sign out). */
const TABS = ["/timeline", "/map", "/places", "/insights"];
const MORE = ITEMS.filter((it) => !TABS.includes(it.href));

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav() {
  const pathname = usePathname();
  // While the More menu is open it is the one active tab.
  const [moreOpen, setMoreOpen] = useState(false);
  // Close it on navigation.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setMoreOpen(false);
  }
  useTrackInAppNavigation();
  // Sign-in pages and the public /pair landing page (opened on a phone with no
  // session) stand alone: no app navigation, no "Sign out".
  if (pathname.startsWith("/auth/") || pathname === "/pair") return null;

  return (
    <>
      {/* Sidebar. From 1024 px a 224 px sidebar with labels; from 640 to 1024
          px (tablets) a 64 px icon rail, the labels as tooltips. The rail fills
          the page's height; the sidebar inside it stays put while the page
          scrolls. The brand row is a 32 px box at y=40, level with every page's h1. */}
      <div className="mk-sidebar hidden sm:block sm:w-16 sm:shrink-0 sm:border-r sm:border-border sm:bg-surface lg:w-56">
        <aside className="sticky top-0 flex h-screen flex-col px-3 pb-4 pt-10">
          <Link href="/" aria-label="Matka, overview" className="flex h-8 items-center justify-center rounded-control lg:mx-1 lg:justify-start lg:px-1.5">
            <span className="lg:hidden">
              <Logo size={28} />
            </span>
            <span className="hidden lg:inline-flex">
              <Wordmark size={28} />
            </span>
          </Link>
          <nav aria-label="Main" className="mt-6 flex flex-col gap-0.5">
            {ITEMS.map((it) => {
              const active = isActive(pathname, it.href);
              const I = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  title={it.label}
                  className={`flex h-10 items-center justify-center gap-2.5 rounded-control text-sm font-medium transition-colors lg:h-9 lg:justify-start lg:px-2.5 ${
                    active ? "bg-surface-2 text-text" : "text-secondary hover:bg-surface-2/60 hover:text-text"
                  }`}
                >
                  <I size={20} strokeWidth={1.75} aria-hidden className={active ? "text-primary" : "text-muted"} />
                  <span className="sr-only lg:not-sr-only">{it.label}</span>
                </Link>
              );
            })}
          </nav>
          <form action="/auth/logout" method="post" className="mt-auto border-t border-border pt-3">
            <button
              type="submit"
              title="Sign out"
              className="flex h-10 w-full items-center justify-center gap-2.5 rounded-control text-sm font-medium text-secondary transition-colors hover:bg-surface-2/60 hover:text-text lg:h-9 lg:justify-start lg:px-2.5"
            >
              <NAV_ICONS.signOut size={20} strokeWidth={1.75} aria-hidden className="text-muted" />
              <span className="sr-only lg:not-sr-only">Sign out</span>
            </button>
          </form>
        </aside>
      </div>

      {/* Mobile top bar: the brand only (sign-out lives under More). */}
      <header className="sticky top-0 z-30 flex h-[52px] items-center border-b border-border bg-surface/90 px-4 backdrop-blur-md sm:hidden">
        <Link href="/" aria-label="Matka, overview">
          <Wordmark size={24} />
        </Link>
      </header>

      {/* Mobile bottom tab bar: five items with 16 px side insets. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 px-4 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
      >
        {TABS.map((href) => {
          const it = ITEMS.find((i) => i.href === href)!;
          return <Tab key={href} item={it} active={!moreOpen && isActive(pathname, href)} />;
        })}
        <MoreTab pathname={pathname} open={moreOpen} setOpen={setMoreOpen} />
      </nav>
    </>
  );
}

const tabClass = (active: boolean) =>
  `flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-caption font-medium transition-colors ${
    active ? "text-primary" : "text-muted hover:text-text"
  }`;

function Tab({ item, active }: { item: Item; active: boolean }) {
  const I = item.icon;
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
      <I size={20} strokeWidth={1.75} aria-hidden />
      {item.label}
    </Link>
  );
}

/** "More": a menu above the tab bar with the rest of the app and Sign out. */
function MoreTab({ pathname, open, setOpen }: { pathname: string; open: boolean; setOpen: (v: boolean | ((o: boolean) => boolean)) => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const active = MORE.some((it) => isActive(pathname, it.href));

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, setOpen]);

  const row =
    "flex h-12 w-full items-center gap-3 px-4 text-sm font-medium text-text transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none";
  return (
    <div className="flex flex-1">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="more-menu"
        onClick={() => setOpen((o) => !o)}
        className={tabClass(active || open)}
      >
        <Ellipsis size={20} strokeWidth={1.75} aria-hidden />
        More
      </button>
      {open && (
        <div
          ref={menu}
          id="more-menu"
          role="menu"
          aria-label="More"
          className="absolute bottom-full right-3 mb-2 w-56 overflow-hidden rounded-card border border-border bg-surface py-1 shadow-pop"
        >
          {MORE.map((it) => {
            const I = it.icon;
            const on = isActive(pathname, it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                role="menuitem"
                aria-current={on ? "page" : undefined}
                className={row}
                onClick={() => setOpen(false)}
              >
                <I size={20} strokeWidth={1.75} aria-hidden className={on ? "text-primary" : "text-muted"} />
                {it.label}
              </Link>
            );
          })}
          <form action="/auth/logout" method="post" className="mt-1 border-t border-border pt-1">
            <button type="submit" role="menuitem" className={row}>
              <NAV_ICONS.signOut size={20} strokeWidth={1.75} aria-hidden className="text-muted" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
