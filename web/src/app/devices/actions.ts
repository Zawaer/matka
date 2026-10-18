"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { appUrl } from "@/lib/appUrl";
import { requireSession } from "@/lib/auth";
import { createDevice, revokeDevice } from "@/lib/devices";

export type PairResult =
  | { ok: true; name: string; token: string; link: string; qr: string }
  | { ok: false; error: string }
  | null;

export async function pairDevice(_prev: PairResult, form: FormData): Promise<PairResult> {
  await requireSession();
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 64) {
    return { ok: false, error: "Give the device a name (up to 64 characters)." };
  }

  const { token } = await createDevice(name);
  const link = `matka://pair?server=${encodeURIComponent(appUrl())}&token=${token}`;
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 2, width: 280 });
  revalidatePath("/devices");
  return { ok: true, name, token, link, qr };
}

export async function revoke(form: FormData): Promise<void> {
  await requireSession();
  const id = String(form.get("id") ?? "");
  if (!/^\d+$/.test(id)) return;
  await revokeDevice(id);
  revalidatePath("/devices");
}
