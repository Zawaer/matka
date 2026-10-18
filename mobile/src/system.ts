// OS settings helpers (battery optimisation, app settings).

import * as Application from "expo-application";
import * as Battery from "expo-battery";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking, Platform } from "react-native";

/** Android only: true when Doze/app-standby may throttle the collector. null elsewhere/unknown. */
export async function isBatteryOptimized(): Promise<boolean | null> {
  if (Platform.OS !== "android") return null;
  try {
    return await Battery.isBatteryOptimizationEnabledAsync();
  } catch {
    return null;
  }
}

/**
 * Asks Android to exempt Matka from battery optimisation (the system "Allow
 * app to always run in background?" dialog). Falls back to the full list.
 * Needs REQUEST_IGNORE_BATTERY_OPTIMIZATIONS in the manifest (see app.json).
 */
export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, {
      data: `package:${Application.applicationId}`,
    });
  } catch {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
  }
}

/** This app's page in system settings (permissions, battery, notifications). */
export function openAppSettings(): Promise<void> {
  return Linking.openSettings();
}
