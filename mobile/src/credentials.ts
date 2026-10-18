// Pairing credentials live in the OS keystore (Android Keystore / iOS Keychain).
// AFTER_FIRST_UNLOCK so the background task can upload while the phone is locked.

import * as SecureStore from "expo-secure-store";
import type { Pairing } from "./pairing";

const KEY = "matka.pairing.v1";
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

let cache: Pairing | null | undefined;

export async function loadPairing(): Promise<Pairing | null> {
  if (cache !== undefined) return cache;
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTS);
    const p = raw ? (JSON.parse(raw) as Pairing) : null;
    cache = p && typeof p.server === "string" && typeof p.token === "string" ? p : null;
  } catch {
    // Locked keychain (iOS before first unlock) or corrupt entry: treat as not
    // paired for this run, but don't cache so the next call tries again.
    return null;
  }
  return cache;
}

export async function savePairing(p: Pairing): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(p), OPTS);
  cache = p;
}

export async function clearPairing(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, OPTS);
  cache = null;
}
