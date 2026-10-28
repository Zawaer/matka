"use client";

import { useRouter } from "next/navigation";
import { MonthSelect } from "@/components/ui";

/** ‹ [October 2026 ▾] › — navigates with ?month=YYYY-MM. */
export function MonthPicker({ month, months }: { month: string; months: string[] }) {
  const router = useRouter();
  return <MonthSelect value={month} months={months} onChange={(m) => router.push(`/insights?month=${m}`)} />;
}
