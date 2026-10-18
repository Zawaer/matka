import { redirect } from "next/navigation";
import { Logo } from "@/components/Brand";
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
    <div className="flex min-h-[80dvh] items-center justify-center px-5 py-10">
      <div className="mk-card w-full max-w-sm p-7">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={36} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sign in to Matka</h1>
            <p className="text-sm text-muted">Your own location history, on your own server.</p>
          </div>
        </div>
        {loginKeyConfigured() ? (
          <KeyForm next={next} />
        ) : (
          <p className="text-sm text-accent">
            MATKA_LOGIN_KEY isn&apos;t set (or is shorter than 32 characters) on this server, so nobody
            can sign in yet.
          </p>
        )}
      </div>
    </div>
  );
}
