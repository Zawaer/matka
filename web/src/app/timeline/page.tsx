import { Timeline } from "@/components/timeline/Timeline";

export const metadata = {
  title: "Timeline · Matka",
};

export default function TimelinePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10">
      <Timeline />
    </div>
  );
}
