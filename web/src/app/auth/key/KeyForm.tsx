"use client";

import { useActionState } from "react";
import { signInWithKey, type KeyLoginState } from "./actions";

export function KeyForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<KeyLoginState, FormData>(signInWithKey, { error: null });
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="key" className="text-sm font-medium">
        Login key
      </label>
      <input
        id="key"
        name="key"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        className="rounded-xl border border-border bg-surface-2 px-4 py-3 font-mono text-sm outline-none focus:border-primary"
        placeholder="Paste the key from your server's .env"
      />
      {state.error && (
        <p role="alert" className="text-sm text-accent">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-full bg-primary px-5 py-3 text-sm font-bold text-[color:var(--mk-bg)] disabled:opacity-60"
      >
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
