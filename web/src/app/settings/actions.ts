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
      // The nearby candidates stay: the timeline's "Visited X?" uses them too.
      `UPDATE places SET ai_name = NULL, ai_category = NULL, ai_confidence = NULL,
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
    await q(`UPDATE users SET immich_url = NULL, immich_api_key = NULL, immich_link_url = NULL WHERE id = $1`, [user.id]);
    revalidatePath("/settings");
    return { ok: true, message: "Immich disconnected." };
  }

  const base = normalizeImmichUrl(String(form.get("url") ?? ""));
  if (!base) {
    return { ok: false, message: "Enter the Immich server URL, e.g. http://immich_server:2283." };
  }
  const key = String(form.get("key") ?? "").trim();
  if (!key) return { ok: false, message: "Enter an Immich API key." };

  // Check the pair works before storing it, with exactly the permissions
  // Matka uses: asset.read (search by time) and asset.view (thumbnails).
  try {
    const opts = { signal: AbortSignal.timeout(8000), cache: "no-store" as const, redirect: "manual" as const };
    const ping = await fetch(`${base}/api/server/ping`, { ...opts, headers: { accept: "application/json" } });
    const pong = (await ping.json().catch(() => null)) as { res?: unknown } | null;
    if (!ping.ok || pong?.res !== "pong") {
      return { ok: false, message: "That URL doesn't look like an Immich server." };
    }
    const headers = { "x-api-key": key, accept: "application/json" };
    const search = await fetch(`${base}/api/search/metadata`, {
      ...opts,
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ size: 1 }),
    });
    if (search.status === 401) return { ok: false, message: "Immich rejected that API key." };
    if (search.status === 403) {
      return { ok: false, message: "That key is missing the asset.read permission (needed to find your photos)." };
    }
    if (!search.ok) return { ok: false, message: `Immich answered HTTP ${search.status}.` };
    const found = (await search.json().catch(() => null)) as { assets?: { items?: { id?: string }[] } } | null;
    const sample = found?.assets?.items?.[0]?.id;
    if (sample) {
      const thumb = await fetch(`${base}/api/assets/${encodeURIComponent(sample)}/thumbnail?size=thumbnail`, {
        ...opts,
        headers: { "x-api-key": key },
      });
      if (thumb.status === 401 || thumb.status === 403) {
        return {
          ok: false,
          message: "That key can find photos but not show them: add the asset.view permission in Immich.",
        };
      }
    }
  } catch {
    // *.internal / *.local / *.ts.net names resolve on your devices (DNS,
    // Tailscale), not inside the server's container network.
    const host = new URL(base).hostname;
    if (/\.(internal|local|lan|home|ts\.net)$/i.test(host)) {
      return {
        ok: false,
        message: `The Matka server can't see ${host}: that name only works on your devices. If Immich runs on the same server, use its container address, e.g. http://immich_server:2283.`,
      };
    }
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

/**
 * "Immich address for links": where the user opens Immich in a browser (e.g.
 * https://immich.lan). The timeline's photos link there; it is never
 * fetched by the server, so it may be a name only the user's devices know.
 */
export async function saveImmichLink(_prev: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  const raw = String(form.get("link_url") ?? "").trim();
  const url = raw ? normalizeImmichUrl(raw) : null;
  if (raw && !url) return { ok: false, message: "Enter an address like https://immich.example.com, or leave it empty." };
  await q(`UPDATE users SET immich_link_url = $2 WHERE id = $1`, [user.id, url]);
  revalidatePath("/settings");
  return { ok: true, message: url ? "Saved. Photos on the timeline open in Immich." : "Cleared. Photos open in Matka only." };
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
