import { Timeline } from "@/components/timeline/Timeline";

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
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10">
      <Timeline key={initial ?? "latest"} initialDate={initial} />
    </div>
  );
}
