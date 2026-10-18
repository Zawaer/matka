import { requireOptionalNativeModule } from "expo";

export type NativeActivity = { type: string; confidence: number; at: number };
export type PermissionResponse = { status: "granted" | "denied" | "undetermined"; granted: boolean; canAskAgain: boolean };

type Native = {
  isAvailable(): boolean;
  getPermissionsAsync(): Promise<PermissionResponse>;
  requestPermissionsAsync(): Promise<PermissionResponse>;
  startAsync(intervalMs: number): Promise<boolean>;
  stopAsync(): Promise<void>;
  latest(): NativeActivity | null;
};

/** null when the installed app build predates the module (e.g. an older dev client). */
export default requireOptionalNativeModule<Native>("MatkaActivity");
