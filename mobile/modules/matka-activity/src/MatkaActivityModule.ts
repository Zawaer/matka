import { requireOptionalNativeModule } from "expo";

export type NativeActivity = { type: string; confidence: number; at: number };
/** Raw whole-phone battery readings (Android BatteryManager); normalised by src/usage-logic.ts. */
export type RawBattery = {
  currentNow: number | null;
  chargeCounter: number | null;
  plugged: boolean | null;
  interactive: boolean | null;
};
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
  /** "onActivity" fires for each new reading (builds from 2026-10 on; older builds never fire it). */
  addListener(event: "onActivity", listener: (a: NativeActivity) => void): { remove(): void };
};

/** null when the installed app build predates the module (e.g. an older dev client). */
export default requireOptionalNativeModule<Native>("MatkaActivity");
