"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { markAllDirty } from "@/lib/places";
import { KIND_META, isPlaceKind, parseRadius } from "@/lib/savedPlaces";

export type CreateResult = { ok: true; id: number } | { ok: false; error: string };

/**
 * Saves a place you haven't (necessarily) visited, from a tap on the map. The
 * geocoder names it on its next pass (geocodePending picks up rows with no
 * geocoded_at); reprocessing snaps any past visits inside it.
 */
export async function createSavedPlace(input: {
  lat: number;
  lon: number;
  name: string;
  kind: string;
  radius: number;
}): Promise<CreateResult> {
  const user = await requireUser();
  const { lat, lon, kind } = input ?? {};
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { ok: false, error: "Tap the map to pick a spot." };
  }
  if (!isPlaceKind(kind)) return { ok: false, error: "Pick a kind." };
  const radius = parseRadius(input.radius);
  if (radius == null) return { ok: false, error: "Pick a size." };
  const name = String(input.name ?? "").trim().slice(0, 120) || KIND_META[kind].label;
  const [row] = await q<{ id: string }>(
    `INSERT INTO places (user_id, geom, custom_name, kind, radius_m, saved_at)
     VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, $6, now())
     RETURNING id`,
    [user.id, lon, lat, name, kind, radius],
  );
  await markAllDirty(user.id);
  revalidatePath("/places");
  return { ok: true, id: Number(row.id) };
}
