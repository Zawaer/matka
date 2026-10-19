"use server";

import { revalidatePath } from "next/cache";
import { endOtherSessions, requireUser } from "@/lib/auth";
import { claudeConfigured } from "@/lib/claude";
import { dawarichStatus, topUpDawarich } from "@/lib/dawarichImport";
import { encrypt } from "@/lib/crypto";
import { q } from "@/lib/db";
import { normalizeImmichUrl } from "@/lib/immich";

export type FormResult = { ok: boolean; message: string } | null;

// Only IANA names: Intl also accepts offsets like "+05:00", which Postgres
// reads with the POSIX (inverted) sign.
const validTimeZone = (tz: string) => Intl.supportedValuesOf("timeZone").includes(tz);

export async function saveTimezone(_prev: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  const tz = String(form.get("timezone") ?? "").trim();
  if (!validTimeZone(tz)) return { ok: false, message: `Unknown time zone “${tz}”.` };
  await q(`UPDATE users SET timezone = $2 WHERE id = $1`, [user.id, tz]);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function saveTransit(_prev: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  const on = form.get("transit_lines") === "on";
  await q(`UPDATE users SET transit_lines = $2 WHERE id = $1`, [user.id, on]);
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: on ? "On. Trips are matched in the background over the next minutes." : "Off. Lines are hidden.",
  };
}

export async function saveAiPlaces(_prev: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  if (!claudeConfigured()) return { ok: false, message: "Not available on this server." };
  const on = form.get("ai_places") === "on";
  await q(`UPDATE users SET ai_places = $2 WHERE id = $1`, [user.id, on]);
  if (on) {
    // Look the places up again to collect their nearby candidates; names stay meanwhile.
    await q(
      `UPDATE places SET geocoder_version = NULL
       WHERE user_id = $1 AND kind IS NULL AND custom_name IS NULL AND geo_candidates IS NULL`,
      [user.id],
    );
  } else {
    await q(
      `UPDATE places SET geo_candidates = NULL, ai_name = NULL, ai_category = NULL, ai_confidence = NULL,
                         ai_version = NULL, ai_checked_at = NULL, ai_visits = NULL
       WHERE user_id = $1`,
      [user.id],
    );
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: on
      ? "On. Places are checked in the background over the next hours."
      : "Off. Names picked by AI were removed.",
  };
}

export async function savePhotoPoints(_prev: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  const on = form.get("photo_points") === "on";
  await q(`UPDATE users SET photo_points = $2 WHERE id = $1`, [user.id, on]);
  if (on) await q(`DELETE FROM import_state WHERE source = $1`, [`immich-photos:${user.id}`]);
  else await q(`DELETE FROM points WHERE user_id = $1 AND source = 'photo'`, [user.id]).then(() =>
    q(`UPDATE processing_state SET dirty_from = '-infinity' WHERE user_id = $1`, [user.id]),
  );
  revalidatePath("/settings");
  return {
    ok: true,
    message: on ? "On. Photo locations are read in the background." : "Off. Photo locations were removed from your history.",
  };
}

export async function saveImmich(_prev: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  if (form.get("disconnect")) {
    await q(`UPDATE users SET immich_url = NULL, immich_api_key = NULL WHERE id = $1`, [user.id]);
    revalidatePath("/settings");
    return { ok: true, message: "Immich disconnected." };
  }

  const base = normalizeImmichUrl(String(form.get("url") ?? ""));
  if (!base) {
    return { ok: false, message: "Enter the Immich server URL, e.g. http://immich_server:2283." };
  }
  const key = String(form.get("key") ?? "").trim();
  if (!key) return { ok: false, message: "Enter an Immich API key." };

  // Check the pair works before storing it.
  try {
    const res = await fetch(`${base}/api/users/me`, {
      headers: { "x-api-key": key, accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
      redirect: "manual",
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Immich rejected that API key." };
    }
    if (!res.ok) return { ok: false, message: `Immich answered HTTP ${res.status}.` };
    const me = (await res.json().catch(() => null)) as { id?: unknown } | null;
    if (typeof me?.id !== "string") {
      return { ok: false, message: "That URL doesn't look like an Immich server." };
    }
  } catch {
    return { ok: false, message: "Couldn't reach Immich at that URL from the Matka server." };
  }

  await q(`UPDATE users SET immich_url = $2, immich_api_key = $3 WHERE id = $1`, [
    user.id,
    base,
    encrypt(key),
  ]);
  revalidatePath("/settings");
  return { ok: true, message: "Immich connected." };
}

export async function checkDawarich(): Promise<FormResult> {
  const user = await requireUser();
  const status = await dawarichStatus(user.id);
  if (!status) return { ok: false, message: "Not available on this server." };
  if (!status.ready) return { ok: false, message: "The first Dawarich import is still running." };
  const r = await topUpDawarich({ force: true });
  revalidatePath("/settings");
  if (!r) return { ok: false, message: "A check is already running; try again in a minute." };
  if (r.error) return { ok: false, message: `Couldn't read Dawarich: ${r.error}` };
  if (r.read === 0) return { ok: true, message: "No new points in Dawarich." };
  const n = (x: number) => x.toLocaleString("en-GB");
  return {
    ok: true,
    message:
      `${n(r.read)} new points in Dawarich: ${n(r.inserted)} added` +
      (r.covered ? `, ${n(r.covered)} skipped because Matka already had that time` : "") +
      (r.duplicate ? `, ${n(r.duplicate)} already present` : "") +
      ".",
  };
}

export async function signOutOthers(): Promise<void> {
  const user = await requireUser();
  await endOtherSessions(user.id);
  revalidatePath("/settings");
}
