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
    <div className="flex min-h-dvh flex-col items-center px-4 pb-10 pt-[8dvh] sm:pt-[14dvh]">
      <div className="w-full max-w-md">
        <Card padding="lg">
          <div className="-mx-5 mb-5 flex justify-center border-b border-border px-5 pb-4 sm:-mx-6 sm:px-6">
            <Wordmark size={28} />
          </div>
          <PairLanding />
        </Card>
      </div>
    </div>
  );
}
