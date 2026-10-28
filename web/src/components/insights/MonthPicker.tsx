"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select, cx, iconButtonClass } from "@/components/ui";
import { formatMonth } from "@/lib/format";

const arrow = iconButtonClass({ variant: "secondary" });

/** Previous / [October 2026] / next — navigates with ?month=YYYY-MM. */
export function MonthPicker({ month, months }: { month: string; months: string[] }) {
  const router = useRouter();
  const i = months.indexOf(month);
  const prev = i > 0 ? months[i - 1] : null;
  const next = i >= 0 && i < months.length - 1 ? months[i + 1] : null;
  const go = (m: string) => `/insights?month=${m}`;

  return (
    <div className="flex items-center gap-2">
      {prev ? (
        <Link href={go(prev)} aria-label="Previous month" title="Previous month" className={arrow}>
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
        </Link>
      ) : (
        <span aria-hidden className={cx(arrow, "pointer-events-none opacity-40")}>
          <ChevronLeft size={16} strokeWidth={1.75} />
        </span>
      )}
      <label className="min-w-0 flex-1 sm:flex-none">
        <span className="sr-only">Month</span>
        <Select value={month} onChange={(e) => router.push(go(e.target.value))} className="sm:w-44">
          {[...months].reverse().map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </Select>
      </label>
      {next ? (
        <Link href={go(next)} aria-label="Next month" title="Next month" className={arrow}>
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
        </Link>
      ) : (
        <span aria-hidden className={cx(arrow, "pointer-events-none opacity-40")}>
          <ChevronRight size={16} strokeWidth={1.75} />
        </span>
      )}
    </div>
  );
}
