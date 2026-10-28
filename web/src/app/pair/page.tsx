import { Wordmark } from "@/components/Brand";
import { PairLanding } from "@/components/devices/PairLanding";
import { Card } from "@/components/ui";

// Public (see src/proxy.ts): the phone that opens this has no session. The
// page itself holds nothing secret; the token is only in the URL fragment,
// which the browser never sends, and is read client-side.
export const metadata = {
  title: "Pair with Matka",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default function PairPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center sm:py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Wordmark size={28} />
        </div>
        <Card padding="lg">
          <PairLanding />
        </Card>
      </div>
    </div>
  );
}
