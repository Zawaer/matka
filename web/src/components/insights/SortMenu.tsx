"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "@/components/ui";

/** "Sort: Visits ▾": a compact menu of sort orders, each a link (?sort=). */
export function SortMenu({ value, options }: { value: string; options: { key: string; label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.key === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const items = () => [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
    (items().find((el) => el.getAttribute("aria-checked") === "true") ?? items()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const list = items();
        const at = list.indexOf(document.activeElement as HTMLElement);
        list[(at + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
      }
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
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1 rounded-control px-2.5 text-meta text-muted transition-colors hover:bg-surface-2 hover:text-text aria-expanded:bg-surface-2"
      >
        Sort: <span className="font-medium text-text">{current.label}</span>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Sort by"
          className="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-card border border-border bg-surface py-1 shadow-pop"
        >
          {options.map((o) => {
            const on = o.key === current.key;
            return (
              <Link
                key={o.key}
                href={o.href}
                role="menuitemradio"
                aria-checked={on}
                onClick={() => setOpen(false)}
                className={cx(
                  "flex h-9 items-center gap-2 px-3 text-sm transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
                  on ? "font-medium text-text" : "text-secondary",
                )}
              >
                <span className="flex-1">{o.label}</span>
                <Check size={16} strokeWidth={1.75} aria-hidden className={cx("text-primary", !on && "invisible")} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
