import Link from "next/link";

const TABS = [
  { key: "travel", href: "/insights", label: "Travel" },
  { key: "trips", href: "/insights/trips", label: "Trips" },
  { key: "world", href: "/insights/world", label: "World" },
] as const;

export type InsightsTab = (typeof TABS)[number]["key"];

/** Title and the Travel / Trips / World switcher shared by the Insights pages. */
export function InsightsHeader({ active, subtitle }: { active: InsightsTab; subtitle?: string }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight">Insights</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      <nav aria-label="Insights" className="mk-card flex shrink-0 gap-1 self-start p-1 sm:self-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={`rounded-[14px] px-4 py-1.5 text-sm font-medium transition-colors ${
              t.key === active ? "bg-surface-2 text-primary" : "text-muted hover:text-text"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
