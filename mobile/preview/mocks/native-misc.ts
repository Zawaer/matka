// Web stand-ins for expo-battery, expo-application and expo-intent-launcher.
import { params } from "./params";

export async function getBatteryLevelAsync() { return 0.81; }
export async function isBatteryOptimizationEnabledAsync() { return params.get("batteryOpt") === "1"; }
export const applicationId = "fi.matka.app";
export const nativeApplicationVersion = "1.4.0";
export const nativeBuildVersion = "14";
export const ActivityAction = { IGNORE_BATTERY_OPTIMIZATION_SETTINGS: "x", APPLICATION_DETAILS_SETTINGS: "y", REQUEST_IGNORE_BATTERY_OPTIMIZATIONS: "z" };
export async function startActivityAsync() { return { resultCode: 0 }; }
