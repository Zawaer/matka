"use server";

import { revalidatePath } from "next/cache";
import { endOtherSessions, requireUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { q } from "@/lib/db";

export type FormResult = { ok: boolean; message: string } | null;

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function saveTimezone(_prev: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  const tz = String(form.get("timezone") ?? "").trim();
  if (!validTimeZone(tz)) return { ok: false, message: `Unknown time zone “${tz}”.` };
  await q(`UPDATE users SET timezone = $2 WHERE id = $1`, [user.id, tz]);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function saveImmich(_prev: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  if (form.get("disconnect")) {
    await q(`UPDATE users SET immich_url = NULL, immich_api_key = NULL WHERE id = $1`, [user.id]);
    revalidatePath("/settings");
    return { ok: true, message: "Immich disconnected." };
  }

  const rawUrl = String(form.get("url") ?? "").trim().replace(/\/+$/, "");
  const key = String(form.get("key") ?? "").trim();
  let url: URL;
  try {
    url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    return { ok: false, message: "Enter the Immich server URL, e.g. http://immich_server:2283." };
  }
  if (!key) return { ok: false, message: "Enter an Immich API key." };

  // Check the pair works before storing it.
  try {
    const res = await fetch(`${url.origin}${url.pathname.replace(/\/+$/, "")}/api/users/me`, {
      headers: { "x-api-key": key, accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Immich rejected that API key." };
    }
    if (!res.ok) return { ok: false, message: `Immich answered HTTP ${res.status}.` };
  } catch {
    return { ok: false, message: "Couldn't reach Immich at that URL from the Matka server." };
  }

  await q(`UPDATE users SET immich_url = $2, immich_api_key = $3 WHERE id = $1`, [
    user.id,
    rawUrl,
    encrypt(key),
  ]);
  revalidatePath("/settings");
  return { ok: true, message: "Immich connected." };
}

export async function signOutOthers(): Promise<void> {
  const user = await requireUser();
  await endOtherSessions(user.id);
  revalidatePath("/settings");
}
