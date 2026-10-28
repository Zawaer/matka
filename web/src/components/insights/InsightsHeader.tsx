import { PageHeader, Segmented } from "@/components/ui";

const TABS = [
  { key: "travel", href: "/insights", label: "Travel" },
  { key: "trips", href: "/insights/trips", label: "Trips" },
  { key: "world", href: "/insights/world", label: "World" },
] as const;

export type InsightsTab = (typeof TABS)[number]["key"];

/** Title and the Travel / Trips / World switcher shared by the Insights pages. */
export function InsightsHeader({ active, subtitle }: { active: InsightsTab; subtitle?: string }) {
  return (
    <PageHeader
      title="Insights"
      subtitle={subtitle}
      actions={<Segmented label="Insights" value={active} items={TABS.map((t) => ({ ...t }))} className="w-full sm:w-auto" />}
    />
  );
}
