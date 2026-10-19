// Web stand-in for expo-location: permissions as ?perm=granted|denied|foreground,
// and a "running" flag for the background task (?tracking=1 starts it).
import { flag, params } from "./params";

export enum Accuracy { Lowest = 1, Low, Balanced, High, Highest, BestForNavigation }
export enum ActivityType { Other = 1, AutomotiveNavigation, Fitness, OtherNavigation, Airborne }
export enum PermissionStatus { DENIED = "denied", GRANTED = "granted", UNDETERMINED = "undetermined" }
export type LocationObject = { coords: { latitude: number; longitude: number; accuracy: number | null; altitude: number | null; speed: number | null }; timestamp: number };
export type LocationTaskOptions = Record<string, unknown>;

const perm = params.get("perm") ?? "granted";
let started = flag("tracking");
const status = (ok: boolean) => ({ status: ok ? PermissionStatus.GRANTED : PermissionStatus.DENIED, granted: ok, canAskAgain: true, expires: "never", android: { accuracy: "fine" } });

export async function getForegroundPermissionsAsync() { return status(perm !== "denied"); }
export async function getBackgroundPermissionsAsync() { return status(perm === "granted"); }
export const requestForegroundPermissionsAsync = getForegroundPermissionsAsync;
export const requestBackgroundPermissionsAsync = getBackgroundPermissionsAsync;
export async function hasStartedLocationUpdatesAsync() { return started; }
export async function startLocationUpdatesAsync() { started = true; }
export async function stopLocationUpdatesAsync() { started = false; }
