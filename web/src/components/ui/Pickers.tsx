"use client";

// Styled replacements for the native date, month and select controls: a
// button that opens a popover. Each is keyboard-complete (arrows, Home/End,
// Page Up/Down, Enter, Esc) and labelled for screen readers. Dates are
// calendar dates (YYYY-MM-DD), shown day-before-month (en-GB / Finnish order).

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { MONTH_NAMES, MONTH_NAMES_SHORT, WEEKDAY_NAMES_SHORT } from "@/lib/format";
import { cx } from "./cx";
import { iconButtonClass } from "./Button";

/* ---------------- Popover plumbing ---------------- */

/** Closes on Esc (focus back to the trigger) and on a press outside. */
function useDismiss(open: boolean, close: () => void, refs: React.RefObject<HTMLElement | null>[]) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!refs.some((r) => r.current?.contains(t))) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        (refs[0].current as HTMLElement | null)?.focus();
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
    // refs are stable objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

const POPOVER = "absolute z-40 mt-1.5 rounded-card border border-border bg-surface p-3 shadow-pop";
const triggerClass = cx(
  "inline-flex h-9 min-w-0 items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm font-medium text-text shadow-card transition-colors",
  "hover:border-strong hover:bg-surface-2 aria-expanded:border-strong aria-expanded:bg-surface-2 disabled:pointer-events-none disabled:opacity-50",
);

/* ---------------- Dates ---------------- */

const pad = (n: number) => String(n).padStart(2, "0");
const toYmd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (s: string) => ({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1, d: Number(s.slice(8, 10)) });
const addDays = (s: string, n: number) => {
  const t = new Date(`${s}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** Monday = 0. */
const weekday = (s: string) => (new Date(`${s}T12:00:00Z`).getUTCDay() + 6) % 7;

/** "28 Oct 2026". */
export const formatPickerDate = (s: string) => {
  const p = parse(s);
  return `${p.d} ${MONTH_NAMES_SHORT[p.m]} ${p.y}`;
};

/**
 * A date button ("28 Oct 2026" with a calendar icon, or the icon alone)
 * opening a month calendar. Days in `available` are the ones with data: the
 * others are greyed out, struck through and skipped by the keyboard, so every
 * pick lands somewhere.
 */
export function DatePicker({
  value,
  onChange,
  available,
  min,
  max,
  label = "Pick a date",
  iconOnly,
  popoverClassName,
  className,
}: {
  value: string;
  onChange: (date: string) => void;
  /** Just the calendar icon (when the date is already the page's title). */
  iconOnly?: boolean;
  /** Where the popover sits; by default under the trigger, left edges aligned. */
  popoverClassName?: string;
  /** Days that can be picked (with data). Without it, every day in min…max. */
  available?: readonly string[];
  min?: string;
  max?: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), [trigger, pop]);
  const id = useId();

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${label}: ${value ? formatPickerDate(value) : "none"}`}
        onClick={() => setOpen((o) => !o)}
        title={iconOnly ? label : undefined}
        className={cx(triggerClass, "tabular-nums", iconOnly && "w-9 justify-center px-0 text-secondary", className)}
      >
        <CalendarDays size={16} strokeWidth={1.75} aria-hidden className={cx("shrink-0", !iconOnly && "text-muted")} />
        {!iconOnly && <span className="truncate">{value ? formatPickerDate(value) : "Pick a date"}</span>}
      </button>
      {open && (
        <div ref={pop} id={id} role="dialog" aria-label={label} className={cx(POPOVER, "w-[296px]", popoverClassName ?? "left-0")}>
          <Calendar
            value={value}
            available={available}
            min={min}
            max={max}
            onPick={(d) => {
              setOpen(false);
              trigger.current?.focus();
              if (d !== value) onChange(d);
            }}
          />
        </div>
      )}
    </div>
  );
}

function Calendar({
  value,
  available,
  min,
  max,
  onPick,
}: {
  value: string;
  available?: readonly string[];
  min?: string;
  max?: string;
  onPick: (d: string) => void;
}) {
  const ok = useMemo(() => (available ? new Set(available) : null), [available]);
  const lo = min ?? available?.[0];
  const hi = max ?? available?.at(-1);
  const inRange = (d: string) => (!lo || d >= lo) && (!hi || d <= hi);
  const can = (d: string) => inRange(d) && (!ok || ok.has(d));
  const [focus, setFocus] = useState(value || hi || toYmd(new Date().getFullYear(), new Date().getMonth(), 1));
  const { y, m } = parse(focus);
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    // Focus the active day when opening and after keyboard moves.
    grid.current?.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus({ preventScroll: true });
    moved.current = false;
  }, [focus]);

  // Step to the next pickable day in a direction (skips empty days), within 2 years.
  const step = (from: string, by: number) => {
    let d = addDays(from, by);
    for (let i = 0; i < 800; i++) {
      if (can(d)) return d;
      if ((lo && d < lo) || (hi && d > hi)) return from;
      d = addDays(d, by > 0 ? 1 : -1);
    }
    return from;
  };
  const monthShift = (by: number) => {
    const t = new Date(Date.UTC(y, m + by, 1));
    const ty = t.getUTCFullYear();
    const tm = t.getUTCMonth();
    // The same day in that month (clamped), or the month's first pickable day.
    const same = toYmd(ty, tm, Math.min(parse(focus).d, daysIn(ty, tm)));
    if (can(same)) return same;
    for (let d = 1; d <= daysIn(ty, tm); d++) if (can(toYmd(ty, tm, d))) return toYmd(ty, tm, d);
    return same;
  };

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    let next: string | null = null;
    if (k === "ArrowLeft") next = step(focus, -1);
    else if (k === "ArrowRight") next = step(focus, 1);
    else if (k === "ArrowUp") next = step(focus, -7);
    else if (k === "ArrowDown") next = step(focus, 7);
    else if (k === "PageUp") next = monthShift(e.shiftKey ? -12 : -1);
    else if (k === "PageDown") next = monthShift(e.shiftKey ? 12 : 1);
    else if (k === "Home") next = addDays(focus, -weekday(focus));
    else if (k === "End") next = addDays(focus, 6 - weekday(focus));
    else if (k === "Enter" || k === " ") {
      e.preventDefault();
      if (can(focus)) onPick(focus);
      return;
    }
    if (next) {
      e.preventDefault();
      moved.current = true;
      setFocus(next);
    }
  };

  const first = toYmd(y, m, 1);
  const lead = weekday(first);
  const cells: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = 1; d <= daysIn(y, m); d++) cells.push(toYmd(y, m, d));
  while (cells.length % 7) cells.push(null);
  const today = new Date();
  const todayYmd = toYmd(today.getFullYear(), today.getMonth(), today.getDate());
  const prevOk = !lo || toYmd(y, m, 1) > lo;
  const nextOk = !hi || toYmd(y, m, daysIn(y, m)) < hi;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className={iconButtonClass({ size: "sm" })}
          onClick={() => setFocus(monthShift(-1))}
          disabled={!prevOk}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
        </button>
        <p className="text-label text-text" aria-live="polite">
          {MONTH_NAMES[m]} {y}
        </p>
        <button
          type="button"
          className={iconButtonClass({ size: "sm" })}
          onClick={() => setFocus(monthShift(1))}
          disabled={!nextOk}
          aria-label="Next month"
        >
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div ref={grid} role="grid" aria-label={`${MONTH_NAMES[m]} ${y}`} onKeyDown={onKey}>
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_NAMES_SHORT.map((w) => (
            <span key={w} role="columnheader" aria-label={w} className="flex h-8 items-center justify-center text-caption text-muted">
              {w.slice(0, 2)}
            </span>
          ))}
        </div>
        {Array.from({ length: cells.length / 7 }, (_, r) => (
          <div role="row" key={r} className="grid grid-cols-7">
            {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
              if (!d) return <span key={i} role="gridcell" />;
              const enabled = can(d);
              const sel = d === value;
              const isToday = d === todayYmd;
              return (
                <span key={d} role="gridcell" aria-selected={sel}>
                  <button
                    type="button"
                    data-day={d}
                    tabIndex={d === focus ? 0 : -1}
                    disabled={!enabled}
                    aria-label={`${formatPickerDate(d)}${enabled ? "" : ", nothing recorded"}`}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => onPick(d)}
                    className={cx(
                      "relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm tabular-nums transition-colors focus-visible:outline-offset-0",
                      sel
                        ? "bg-primary font-semibold text-on-primary"
                        : enabled
                          ? "font-medium text-text hover:bg-surface-2"
                          : // A day without history, inside the range: struck through, so the
                            // few gaps stand out rather than dotting every day that has data.
                            cx("cursor-default text-muted/60", ok && inRange(d) && "line-through decoration-muted/60"),
                      isToday && !sel && "ring-1 ring-strong",
                    )}
                  >
                    {Number(d.slice(8))}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Months ---------------- */

/**
 * "‹ [October 2026 ▾] ›": a month button between arrows, opening a year of
 * months. Only months in `months` (YYYY-MM, ascending) can be picked.
 */
export function MonthPicker({
  value,
  months,
  onChange,
  className,
}: {
  value: string;
  months: readonly string[];
  onChange: (month: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), [trigger, pop]);
  const id = useId();
  const i = months.indexOf(value);
  const prev = i > 0 ? months[i - 1] : null;
  const next = i >= 0 && i < months.length - 1 ? months[i + 1] : null;
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const years = [...new Set(months.map((mo) => Number(mo.slice(0, 4))))];
  const set = new Set(months);
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) grid.current?.querySelector<HTMLElement>("[aria-pressed=true], button:not(:disabled)")?.focus();
  }, [open, year]);

  const onGridKey = (e: React.KeyboardEvent) => {
    const btns = [...(grid.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = btns.indexOf(document.activeElement as HTMLButtonElement);
    const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key];
    if (by == null || at < 0) return;
    e.preventDefault();
    for (let j = at + by; j >= 0 && j < btns.length; j += by) {
      if (!btns[j].disabled) {
        btns[j].focus();
        return;
      }
    }
  };

  const arrow = iconButtonClass({ variant: "secondary" });
  return (
    <div className={cx("flex items-center gap-1.5", className)}>
      <button type="button" className={arrow} disabled={!prev} onClick={() => prev && onChange(prev)} aria-label="Previous month">
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <div className="relative min-w-0 flex-1 sm:flex-none">
        <button
          ref={trigger}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => {
            setYear(Number(value.slice(0, 4)));
            setOpen((o) => !o);
          }}
          className={cx(triggerClass, "w-full justify-center tabular-nums sm:w-40")}
        >
          <CalendarDays size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />
          <span className="truncate">
            {MONTH_NAMES[Number(value.slice(5, 7)) - 1]} {value.slice(0, 4)}
          </span>
        </button>
        {open && (
          <div ref={pop} id={id} role="dialog" aria-label="Pick a month" className={cx(POPOVER, "left-1/2 w-64 -translate-x-1/2")}>
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                className={iconButtonClass({ size: "sm" })}
                disabled={year <= years[0]}
                onClick={() => setYear(year - 1)}
                aria-label="Previous year"
              >
                <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
              </button>
              <p className="text-label tabular-nums text-text">{year}</p>
              <button
                type="button"
                className={iconButtonClass({ size: "sm" })}
                disabled={year >= years.at(-1)!}
                onClick={() => setYear(year + 1)}
                aria-label="Next year"
              >
                <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            <div ref={grid} className="grid grid-cols-3 gap-1" onKeyDown={onGridKey}>
              {MONTH_NAMES_SHORT.map((name, mi) => {
                const key = `${year}-${pad(mi + 1)}`;
                const on = key === value;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${MONTH_NAMES[mi]} ${year}`}
                    disabled={!set.has(key)}
                    onClick={() => {
                      setOpen(false);
                      if (key !== value) onChange(key);
                    }}
                    className={cx(
                      "h-9 rounded-control text-sm transition-colors",
                      on ? "bg-primary font-semibold text-on-primary" : "font-medium text-text hover:bg-surface-2 disabled:text-muted/50 disabled:hover:bg-transparent",
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <button type="button" className={arrow} disabled={!next} onClick={() => next && onChange(next)} aria-label="Next month">
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

/* ---------------- Searchable select ---------------- */

export type ComboOption = { value: string; label: string; hint?: string };

/**
 * A select with a search box (WAI-ARIA combobox + listbox): type to filter,
 * ↑/↓ to move, Enter to pick, Esc to close. For long lists like time zones.
 */
export function Combobox({
  value,
  options,
  onChange,
  label,
  placeholder = "Search…",
  name,
  className,
  disabled,
}: {
  value: string;
  options: readonly ComboOption[];
  onChange: (value: string) => void;
  /** Accessible name. */
  label: string;
  placeholder?: string;
  /** Also posts the value with a form under this name. */
  name?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useDismiss(open, () => setOpen(false), [trigger, pop]);
  const id = useId();
  const current = options.find((o) => o.value === value);

  const shown = useMemo(() => {
    const words = query.toLowerCase().replace(/[_/]/g, " ").split(/\s+/).filter(Boolean);
    if (!words.length) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.hint ?? ""} ${o.value}`.toLowerCase().replace(/[_/]/g, " ");
      return words.every((w) => hay.includes(w));
    });
  }, [options, query]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (v: string) => {
    setOpen(false);
    trigger.current?.focus();
    if (v !== value) onChange(v);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, Math.min(shown.length - 1, a + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Home" && e.ctrlKey) {
      setActive(0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) pick(shown[active].value);
    }
  };

  return (
    <div className={cx("relative", className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? value}`}
        onClick={() => {
          setQuery("");
          setActive(Math.max(0, options.findIndex((o) => o.value === value)));
          setOpen((o) => !o);
        }}
        className={cx(triggerClass, "w-full justify-between font-normal")}
      >
        <span className="min-w-0 truncate text-left">
          {current?.label ?? value}
          {current?.hint && <span className="ml-2 text-muted">{current.hint}</span>}
        </span>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />
      </button>
      {open && (
        <div ref={pop} className={cx(POPOVER, "left-0 right-0 p-0 sm:right-auto sm:w-[22rem]")}>
          <div className="relative border-b border-border">
            <Search size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={`${id}-list`}
              aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}
              aria-autocomplete="list"
              aria-label={label}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
              placeholder={placeholder}
              className="h-11 w-full rounded-t-card bg-transparent pl-9 pr-3 text-sm text-text outline-none placeholder:text-muted"
            />
          </div>
          <ul ref={list} id={`${id}-list`} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto py-1">
            {shown.length === 0 ? (
              <li className="px-3 py-2 text-meta text-muted">Nothing matches.</li>
            ) : (
              shown.map((o, i) => {
                const sel = o.value === value;
                return (
                  <li
                    key={o.value}
                    id={`${id}-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={sel}
                    onPointerMove={() => setActive(i)}
                    onClick={() => pick(o.value)}
                    className={cx(
                      "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                      i === active ? "bg-surface-2 text-text" : "text-secondary",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="shrink-0 text-meta tabular-nums text-muted">{o.hint}</span>}
                    <Check size={16} strokeWidth={1.75} aria-hidden className={cx("shrink-0 text-primary", !sel && "invisible")} />
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
