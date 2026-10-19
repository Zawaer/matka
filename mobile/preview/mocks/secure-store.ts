// Web stand-in for expo-secure-store: the preview starts paired with the mock
// server (this page's origin; see mockApi.ts) unless ?paired=0.
import { params } from "./params";

export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 0;
export type SecureStoreOptions = Record<string, unknown>;

const store = new Map<string, string>();
if (params.get("paired") !== "0" && typeof location !== "undefined") {
  store.set("matka.pairing.v1", JSON.stringify({ server: location.origin, token: "mtk_preview" }));
}
export async function getItemAsync(k: string) { return store.get(k) ?? null; }
export async function setItemAsync(k: string, v: string) { store.set(k, v); }
export async function deleteItemAsync(k: string) { store.delete(k); }
