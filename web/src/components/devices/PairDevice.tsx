"use client";

import { useActionState } from "react";
import { pairDevice, type PairResult } from "@/app/devices/actions";

export function PairDevice({ insecure }: { insecure: boolean }) {
  const [result, action, pending] = useActionState<PairResult, FormData>(pairDevice, null);

  if (result?.ok) {
    return (
      <div className="mk-card flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:items-start sm:text-left">
        {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, nothing to optimize */}
        <img
          src={result.qr}
          alt="Pairing QR code"
          width={200}
          height={200}
          className="shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-medium">Pair “{result.name}”</h2>
          <p className="mt-1 text-sm text-muted">
            Scan this with the Matka app. This is the only time the token is shown — if you lose
            it, revoke the device and pair it again.
          </p>
          <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-muted">
            Token
          </label>
          <code className="mt-1 block break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm">
            {result.token}
          </code>
          <a href={result.link} className="mt-3 inline-block text-sm text-primary hover:underline">
            Open pairing link on this device
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="mk-card flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
      <label className="flex-1">
        <span className="text-sm font-medium">Pair a device</span>
        <input
          name="name"
          required
          maxLength={64}
          placeholder="e.g. Pixel 8"
          className="mt-1.5 block w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {result && !result.ok && <span className="mt-1.5 block text-sm text-red-500">{result.error}</span>}
        {insecure && (
          <span className="mt-1.5 block text-sm text-amber-500">
            APP_URL is not https — phones will refuse to pair outside development.
          </span>
        )}
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Pairing…" : "Pair"}
      </button>
    </form>
  );
}
