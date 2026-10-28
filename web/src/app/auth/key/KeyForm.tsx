"use client";

import { useActionState, useEffect, useRef } from "react";
import { signInWithKey, type KeyLoginState } from "./actions";
import { Button, Field, Input } from "@/components/ui";

export function KeyForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<KeyLoginState, FormData>(signInWithKey, { error: null });
  const input = useRef<HTMLInputElement>(null);
  // A wrong key: back to the field, selected, so the next paste replaces it.
  useEffect(() => {
    if (state.error) input.current?.select();
  }, [state]);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field
        label="Login key"
        htmlFor="key"
        hint="The login key set when your server was installed."
        // The error takes the hint's line, so nothing moves.
        error={state.error ?? undefined}
      >
        <Input
          ref={input}
          id="key"
          name="key"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          className="font-mono placeholder:font-sans"
          placeholder="Paste your login key"
          aria-invalid={state.error ? true : undefined}
        />
      </Field>
      <Button type="submit" variant="primary" size="lg" block disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </Button>
    </form>
  );
}
