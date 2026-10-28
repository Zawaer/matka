import { redirect } from "next/navigation";
import { Logo } from "@/components/Brand";
import { Callout, Card } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { authMode, loginKeyConfigured } from "@/lib/keyAuth";
import { safeNext } from "@/lib/session";
import { KeyForm } from "./KeyForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in — Matka" };

export default async function KeyLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (authMode() !== "key") redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  if (await getUser()) redirect(next);

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 pb-10 pt-[12dvh] sm:pt-[16dvh]">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={40} />
          <h1 className="mt-4 text-title text-text">Sign in to Matka</h1>
          <p className="mt-1 text-sm text-muted">Your own location history, on your own server.</p>
        </div>
        <Card padding="lg">
          {loginKeyConfigured() ? (
            <KeyForm next={next} />
          ) : (
            <Callout tone="danger" title="Sign-in isn’t set up" role="alert">
              This server has no login key yet (or one shorter than 32 characters), so nobody can sign in. Whoever
              runs it can set one in the server&apos;s settings.
            </Callout>
          )}
        </Card>
      </div>
    </div>
  );
}
