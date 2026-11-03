import { requireOptionalNativeModule } from "expo";

export type NativeActivity = { type: string; confidence: number; at: number };
/** Raw whole-phone battery readings (Android BatteryManager); normalised by src/usage-logic.ts. */
export type RawBattery = {
  currentNow: number | null;
  chargeCounter: number | null;
  plugged: boolean | null;
  interactive: boolean | null;
};
/** expo-location's foreground service: notification up, running throttled, or gone. */
export type LocationServiceState = "foreground" | "background" | "none";
export type PermissionResponse = { status: "granted" | "denied" | "undetermined"; granted: boolean; canAskAgain: boolean };

type Native = {
  isAvailable(): boolean;
  getPermissionsAsync(): Promise<PermissionResponse>;
  requestPermissionsAsync(): Promise<PermissionResponse>;
  startAsync(intervalMs: number): Promise<boolean>;
  stopAsync(): Promise<void>;
  latest(): NativeActivity | null;
  /** Builds from 2026-10-28 on (Android); iOS returns null. Missing in older builds. */
  batterySnapshot?(): RawBattery | null;
  /** Builds from 2026-11-03 on (Android). Missing in older builds and on iOS. */
  locationServiceState?(): LocationServiceState;
  /** Lifts (true) or restores (false) expo-location's foreground guard; true: lifted and Android should allow the start. */
  allowLocationServiceStart?(allow: boolean): boolean;
  /** "onActivity" fires for each new reading (builds from 2026-10 on; older builds never fire it). */
  addListener(event: "onActivity", listener: (a: NativeActivity) => void): { remove(): void };
};

/** null when the installed app build predates the module (e.g. an older dev client). */
export default requireOptionalNativeModule<Native>("MatkaActivity");
