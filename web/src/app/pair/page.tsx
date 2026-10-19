import { PairLanding } from "@/components/devices/PairLanding";

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
    <div className="mx-auto max-w-lg px-5 py-10">
      <PairLanding />
    </div>
  );
}
