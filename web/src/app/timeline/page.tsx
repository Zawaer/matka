import { Timeline } from "@/components/timeline/Timeline";
import { Page } from "@/components/ui";

export const metadata = {
  title: "Timeline · Matka",
};

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { date } = await searchParams;
  const initial = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  return (
    <Page width="narrow">
      <Timeline key={initial ?? "latest"} initialDate={initial} />
    </Page>
  );
}
