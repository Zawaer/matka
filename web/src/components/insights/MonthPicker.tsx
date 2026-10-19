"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMonth } from "@/lib/format";

const arrow =
  "mk-card flex h-9 w-9 shrink-0 items-center justify-center text-muted transition-colors hover:border-primary/60 hover:text-text";
const disabled = "mk-card flex h-9 w-9 shrink-0 items-center justify-center text-muted opacity-40";

/** ‹ [October 2026 ▾] › — navigates with ?month=YYYY-MM. */
export function MonthPicker({ month, months }: { month: string; months: string[] }) {
  const router = useRouter();
  const i = months.indexOf(month);
  const prev = i > 0 ? months[i - 1] : null;
  const next = i >= 0 && i < months.length - 1 ? months[i + 1] : null;
  const go = (m: string) => `/insights?month=${m}`;

  return (
    <div className="flex items-center gap-2">
      {prev ? (
        <Link href={go(prev)} aria-label="Previous month" className={arrow}>
          <Chevron d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" />
        </Link>
      ) : (
        <span aria-hidden className={disabled}>
          <Chevron d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" />
        </span>
      )}
      <label>
        <span className="sr-only">Month</span>
        <select
          value={month}
          onChange={(e) => router.push(go(e.target.value))}
          className="mk-card h-9 cursor-pointer px-3 text-sm text-text [color-scheme:light_dark]"
        >
          {[...months].reverse().map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </select>
      </label>
      {next ? (
        <Link href={go(next)} aria-label="Next month" className={arrow}>
          <Chevron d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4L13.2 12z" />
        </Link>
      ) : (
        <span aria-hidden className={disabled}>
          <Chevron d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4L13.2 12z" />
        </span>
      )}
    </div>
  );
}

function Chevron({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}
