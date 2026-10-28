"use client";

import { useActionState } from "react";
import { signInWithKey, type KeyLoginState } from "./actions";
import { Button, Callout, Field, Input } from "@/components/ui";

export function KeyForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<KeyLoginState, FormData>(signInWithKey, { error: null });
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Login key" htmlFor="key" hint="The MATKA_LOGIN_KEY from your server’s .env.">
        <Input
          id="key"
          name="key"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          className="font-mono"
          placeholder="Paste your login key"
          aria-invalid={state.error ? true : undefined}
        />
      </Field>
      {state.error && (
        <Callout tone="danger" role="alert">
          {state.error}
        </Callout>
      )}
      <Button type="submit" variant="primary" size="lg" block disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </Button>
    </form>
  );
}
