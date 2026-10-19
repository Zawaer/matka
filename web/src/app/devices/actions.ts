"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { appUrl } from "@/lib/appUrl";
import { requireUser } from "@/lib/auth";
import { createDevice, deleteDevice, revokeDevice } from "@/lib/devices";
import { pairingLink } from "@/lib/pairing";

export type PairResult =
  | { ok: true; name: string; token: string; link: string; qr: string }
  | { ok: false; error: string }
  | null;

export async function pairDevice(_prev: PairResult, form: FormData): Promise<PairResult> {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 64) {
    return { ok: false, error: "Give the device a name (up to 64 characters)." };
  }

  const token = await createDevice(user.id, name);
  // An https link to the public /pair page (token in the fragment): a phone's
  // system camera opens it in the browser, the in-app scanner reads it directly.
  const link = pairingLink(appUrl(), token);
  // SVG stays sharp at any display size. The payload is short, so the lowest
  // error correction keeps the modules big; a 4-module quiet zone is the spec.
  const svg = await QRCode.toString(link, {
    type: "svg",
    errorCorrectionLevel: "L",
    margin: 4,
    width: 360,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const qr = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  revalidatePath("/devices");
  return { ok: true, name, token, link, qr };
}

export async function revoke(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  if (!/^\d+$/.test(id)) return;
  await revokeDevice(user.id, id);
  revalidatePath("/devices");
}

export async function remove(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  if (!/^\d+$/.test(id)) return;
  await deleteDevice(user.id, id);
  revalidatePath("/devices");
}
