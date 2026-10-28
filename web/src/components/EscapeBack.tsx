"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

// Esc on a detail page (place, trip, city) goes back to where you came from:
// browser Back when the previous page was inside Matka, otherwise the page's
// parent list. Ignored while typing or when something else handles Esc.

const KEY = "matka:inAppPages";

/** Counts in-app page views this tab (rendered once, from Nav). */
export function useTrackInAppNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, String(Number(sessionStorage.getItem(KEY) ?? "0") + 1));
    } catch {
      // storage unavailable: Esc falls back to the parent list
    }
  }, [pathname]);
}

const typing = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
};

export function EscapeBack({ fallback }: { fallback: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (typing(e.target)) {
        (e.target as HTMLElement).blur();
        return;
      }
      if (document.querySelector("dialog[open], [aria-modal='true']")) return;
      let pages = 0;
      try {
        pages = Number(sessionStorage.getItem(KEY) ?? "0");
      } catch {}
      if (pages > 1 && window.history.length > 1) router.back();
      else router.push(fallback);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, fallback]);
  return null;
}
