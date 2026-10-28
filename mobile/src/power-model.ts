// Matka's own battery use, ESTIMATED from what the recorder did (time with GPS
// active per preset, time in standby, fixes). Android doesn't let an app read
// its own per-app battery stats, so this is a model calibrated on one adb
// measurement (`dumpsys batterystats`), not a measurement.
//
// KEEP IN SYNC: web/src/lib/insights/powerModel.ts and
// mobile/src/power-model.ts are identical copies (a web test compares them).
// No imports, so the file works in both projects.
//
// Recalibrating, with a new measurement on the phone (adb, one charge cycle):
//   adb shell dumpsys batterystats --charged     (Matka's UID: `cmd package list packages -U fi.otamaps.matka`)
// From Matka's UID block take: the GNSS time and its mAh ("gnss=" / "GNSS"),
// the app total, CPU and wakelock mAh, and the time on battery. From the server
// take, for the same cycle, the recorder's GPS-active minutes and fixes
// (device_daily_usage active_s and fixes, summed). Put them in POWER_CALIBRATION
// and update `date`; everything else is derived. A measurement on another
// preset only changes `preset`/`intervalS`; the derivation stays the same.

export const POWER_CALIBRATION = {
  /** When and on what it was measured. */
  date: "2026-10-28",
  device: "OnePlus 13R (CPH2645)",
  /** Battery capacity (mAh) used for percentages; override per call for another phone. */
  batteryMah: 6000,
  /** The preset in use, and its fix interval (s). */
  preset: "balanced",
  intervalS: 30,
  /** Time on battery in the cycle (15 h 14 min). */
  hoursOnBattery: 15.23,
  /** Matka's total for the cycle (mAh), and the parts batterystats attributes. */
  matkaTotalMah: 34.3,
  gnssMah: 25.2,
  /** Minutes the GNSS receiver was on for Matka. */
  gnssOnMinutes: 20,
  cpuMah: 4,
  wakelockMah: 2,
  /**
   * NOT measured in this cycle (the app didn't count them yet), assumed:
   * minutes the recorder had GPS active (the rest was Smart Tracking standby)
   * and fixes received. Replace with device_daily_usage figures next time.
   */
  activeMinutes: 120,
  fixes: 400,
  /** The battery history shows the receiver on ~0.7 s per fix at a 30 s interval (+gps/-gps pairs). */
  fixPulseS: 0.7,
  /** At or below this interval (s) the receiver is assumed on continuously. */
  continuousAtOrBelowS: 5,
};
export type PowerCalibration = typeof POWER_CALIBRATION;

export type PowerModel = {
  /** Current while the GNSS receiver is on (mA): gnssMah / GNSS hours. */
  gnssMa: number;
  /**
   * Receiver-on time per active minute that the pulses don't explain
   * (acquisition after standby, warm-ups): the measured on-fraction
   * (gnssOnMinutes / activeMinutes) minus fixPulseS / intervalS.
   */
  overheadFraction: number;
  fixPulseS: number;
  continuousAtOrBelowS: number;
  /** CPU per fix (mAh): cpuMah / fixes. */
  perFixMah: number;
  /** Everything else (wakelocks, Wi-Fi/cell scans in standby, uploads) per recording hour (mA). */
  recordingMa: number;
  batteryMah: number;
  date: string;
};

export function powerModel(c: PowerCalibration = POWER_CALIBRATION): PowerModel {
  const measuredOn = c.gnssOnMinutes / c.activeMinutes;
  return {
    gnssMa: c.gnssMah / (c.gnssOnMinutes / 60),
    overheadFraction: Math.max(0, measuredOn - c.fixPulseS / c.intervalS),
    fixPulseS: c.fixPulseS,
    continuousAtOrBelowS: c.continuousAtOrBelowS,
    perFixMah: c.cpuMah / c.fixes,
    recordingMa: Math.max(0, c.matkaTotalMah - c.gnssMah - c.cpuMah) / c.hoursOnBattery,
    batteryMah: c.batteryMah,
    date: c.date,
  };
}

export const POWER_MODEL: PowerModel = powerModel();

/** What a preset asks of the receiver: fix interval (s) and whether it uses GNSS at all. */
export type PowerProfile = { intervalS: number; gnss: boolean };

/** mobile/src/tracking.ts PRESETS; "Low power" is Wi-Fi/cell only. */
export const PRESET_PROFILES: Record<string, PowerProfile> = {
  low: { intervalS: 120, gnss: false },
  balanced: { intervalS: 30, gnss: true },
  precise: { intervalS: 10, gnss: true },
  max: { intervalS: 2, gnss: true },
};

/** The profile of a preset key; "custom" needs its settings (accuracy "balanced" = Wi-Fi/cell). */
export function profileFor(preset: string, custom?: { accuracy: string; time: number } | null): PowerProfile {
  if (preset === "custom" && custom) return { intervalS: custom.time / 1000, gnss: custom.accuracy !== "balanced" };
  return PRESET_PROFILES[preset] ?? PRESET_PROFILES.balanced;
}

/** Share of active time the receiver is on, 0..1. */
export function receiverOnFraction(p: PowerProfile, m: PowerModel = POWER_MODEL): number {
  if (!p.gnss) return 0;
  if (p.intervalS <= m.continuousAtOrBelowS) return 1;
  return Math.min(1, m.overheadFraction + m.fixPulseS / p.intervalS);
}

/** What the recorder did: seconds with GPS active, seconds in standby, fixes received. */
export type RecorderUsage = { activeS: number; standbyS: number; fixes: number };

export type PowerEstimate = {
  /** Total, and its parts (mAh). */
  mAh: number;
  gnssMah: number;
  fixMah: number;
  recordingMah: number;
  /** Of `batteryMah`. */
  percent: number;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Estimated mAh and % of the battery for some recorder usage on one preset. */
export function estimatePower(
  u: RecorderUsage,
  profile: PowerProfile,
  m: PowerModel = POWER_MODEL,
  batteryMah: number = m.batteryMah,
): PowerEstimate {
  const activeH = Math.max(0, u.activeS) / 3600;
  const standbyH = Math.max(0, u.standbyS) / 3600;
  const gnssMah = m.gnssMa * activeH * receiverOnFraction(profile, m);
  const fixMah = m.perFixMah * Math.max(0, u.fixes);
  const recordingMah = m.recordingMa * (activeH + standbyH);
  const mAh = gnssMah + fixMah + recordingMah;
  return {
    mAh: r1(mAh),
    gnssMah: r1(gnssMah),
    fixMah: r1(fixMah),
    recordingMah: r1(recordingMah),
    percent: batteryMah > 0 ? r2((mAh / batteryMah) * 100) : 0,
  };
}
