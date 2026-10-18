"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { startSession, upsertUser } from "@/lib/auth";
import { KEY_OWNER_SUB, authMode, checkLoginKey, clearFailures, isLockedOut, recordFailure } from "@/lib/keyAuth";
import { safeNext } from "@/lib/session";

export type KeyLoginState = { error: string | null };

export async function signInWithKey(_prev: KeyLoginState, form: FormData): Promise<KeyLoginState> {
  if (authMode() !== "key") return { error: "This instance signs in with its identity provider." };
  const h = await headers();
  const client = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (isLockedOut(client)) return { error: "Too many wrong keys. Wait 15 minutes and try again." };

  const key = String(form.get("key") ?? "");
  if (!checkLoginKey(key)) {
    recordFailure(client);
    console.warn(`[auth/key] wrong login key from ${client}`);
    return { error: "That key doesn't match this Matka server." };
  }
  clearFailures(client);
  const userId = await upsertUser(KEY_OWNER_SUB, null, false, "Owner");
  await startSession(userId);
  redirect(safeNext(String(form.get("next") ?? "/")));
}
