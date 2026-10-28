import { useState } from "react";
import { errorLine } from "../error-copy";
import { Platform, Switch, View } from "react-native";
import { useTheme } from "../design/theme";
import { ago, count, inFuture } from "../format";
import { displayServer } from "../pairing";
import { openAppSettings, requestIgnoreBatteryOptimizations } from "../system";
import { PRESETS, startTracking, stopTracking } from "../tracking";
import { Button, Skeleton } from "../ui";
import { Banner, LinkText, PairingLostBanner, Panel, Row, type Tone } from "../ui/components";
import { Screen, ScreenHeader } from "../ui/Screen";
import { Text } from "../ui/Text";
import type { CollectorState } from "../ui/useCollectorState";
import { refreshServerStatus, uploadNow } from "../uploader";
import { POWER_CALIBRATION } from "../power-model";
import { usageLines } from "../usage-logic";
import { describeRecovery } from "../watchdog-logic";

/** "14:02" today, else "Fri 16 Oct 14:02". */
function clock(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

type Props = {
  state: CollectorState | null;
  refresh: () => Promise<void>;
  onPair: () => void;
  onSettings: () => void;
};

export default function StatusScreen({ state, refresh, onPair, onSettings }: Props) {
  const t = useTheme();
  const [busy, setBusy] = useState<"toggle" | "upload" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  if (!state) {
    return (
      <Screen>
        <ScreenHeader title="Recorder" />
        <Skeleton height={140} radius={20} />
        <Skeleton height={180} radius={20} />
      </Screen>
    );
  }

  const toggle = async (on: boolean) => {
    setBusy("toggle");
    setMessage(null);
    try {
      if (on) {
        const r = await startTracking();
        if (!r.ok) setMessage(r.error);
      } else {
        await stopTracking();
      }
    } finally {
      await refresh();
      setBusy(null);
    }
  };

  const upload = async () => {
    setBusy("upload");
    setMessage(null);
    try {
      const r = await uploadNow("manual");
      if (r == null) {
        setMessage(state.authLost ? "Re-pair the device first." : "Nothing to do (not paired).");
      } else if (r.result === "done") {
        setMessage(r.sent > 0 ? `Uploaded ${count(r.sent)} points.` : "Queue is empty.");
        await refreshServerStatus();
      } else {
        setMessage(r.error ?? "Upload failed.");
      }
    } finally {
      await refresh();
      setBusy(null);
    }
  };

  const perm = state.permissions;
  const permText = !perm
    ? "unknown"
    : perm.background === "granted"
      ? perm.precise
        ? "always (precise)"
        : "always (approximate)"
      : perm.foreground === "granted"
        ? "only while in use"
        : perm.foreground === "denied"
          ? "denied"
          : "not asked";
  const permTone: Tone = perm?.background === "granted" ? (perm.precise ? "ok" : "warn") : "bad";

  const trackingProblem = state.trackingEnabled && !state.trackingRunning;
  const recentRecoveries = state.recoveries.slice(0, 3);
  const errorIsStale =
    state.lastErrorAt != null && state.lastSuccessAt != null && state.lastSuccessAt > state.lastErrorAt;

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await refreshServerStatus().catch(() => null);
        await refresh();
        setRefreshing(false);
      }}
    >
      <ScreenHeader title="Recorder" subtitle="What this phone records and uploads" right={<LinkText label="Settings" onPress={onSettings} />} />

      {!state.pairing ? (
        <Banner tone="warn" message="Not paired. Points are kept on the phone until you pair.">
          <Button label="Pair with server" icon="qrcode-scan" onPress={onPair} />
        </Banner>
      ) : state.authLost ? (
        <PairingLostBanner onPair={onPair} />
      ) : null}

      {state.trackingEnabled && perm && perm.background !== "granted" ? (
        <Banner
          tone="bad"
          message={`Background location permission is missing, so nothing is recorded. Allow location ${
            Platform.OS === "android" ? '"All the time"' : '"Always"'
          } in settings.`}
        >
          <Button label="Open app settings" icon="cog-outline" variant="secondary" onPress={openAppSettings} />
        </Banner>
      ) : null}

      {state.batteryOptimized ? (
        <Banner
          tone="warn"
          icon="battery-alert-variant-outline"
          message="Battery optimisation is on for Matka. Android may delay or stop background recording and uploads while the phone is idle. Allow Matka to run unrestricted."
        >
          <Button label="Disable battery optimisation" variant="secondary" onPress={requestIgnoreBatteryOptimizations} />
        </Banner>
      ) : null}

      <Panel title="Tracking">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title3" style={trackingProblem ? { color: t.c.danger } : undefined}>
              {state.trackingEnabled
                ? trackingProblem
                  ? "On — not running"
                  : state.standby
                    ? "Standby — phone still"
                    : "Recording"
                : "Off"}
            </Text>
            <Text variant="caption" color="textSecondary">
              {state.standby
                ? `GPS sleeps until you move · ${PRESETS[state.preset].label} preset`
                : `${PRESETS[state.preset].label} preset${state.smartTracking && state.preset !== "low" ? " · smart tracking" : ""}`}
            </Text>
          </View>
          <Switch
            value={state.trackingEnabled}
            disabled={busy === "toggle"}
            onValueChange={toggle}
            trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            thumbColor={t.c.surface}
            accessibilityLabel="Tracking"
          />
        </View>
        <Row label="Location permission" value={permText} tone={permTone} />
        <Row label="Last location" value={ago(state.lastFixAt)} tone={state.lastFixAt ? undefined : "dim"} />
        {state.usage ? <UsageToday usage={state.usage} /> : null}
        {state.activityStatus ? (
          <Row
            label="Motion detection"
            value={
              state.activityStatus === "on"
                ? "On (tells bike from bus)"
                : state.activityStatus === "denied"
                  ? "Not allowed: Settings → Permissions → Physical activity"
                  : "Not available on this phone"
            }
            tone={state.activityStatus === "on" ? "ok" : "dim"}
          />
        ) : null}
        {recentRecoveries.length > 0 ? (
          <View style={{ gap: 2 }}>
            <Text variant="caption" color="textSecondary">
              Recording watchdog · the phone stopped location updates
            </Text>
            {recentRecoveries.map((r) => (
              <Text key={r.at} variant="callout" style={{ color: r.ok ? t.c.textSecondary : t.c.tint.amber.fg }}>
                {describeRecovery(r, clock)}
              </Text>
            ))}
          </View>
        ) : null}
      </Panel>

      <Panel title="Upload">
        <Row label="Queued on phone" value={count(state.queued)} tone={state.queued > 5000 ? "warn" : undefined} />
        {state.oldestQueued ? <Row label="Oldest queued" value={ago(state.oldestQueued)} /> : null}
        <Row label="Last upload" value={ago(state.lastSuccessAt)} tone={state.lastSuccessAt ? "ok" : "dim"} />
        {state.failures > 0 && !state.authLost ? (
          <Row label="Retrying" value={`${inFuture(state.nextRetryAt)} (${state.failures} failed)`} tone="warn" />
        ) : null}
        {state.lastError ? (
          <View style={{ gap: 2 }}>
            <Text variant="caption" color="textSecondary">
              Last error · {ago(state.lastErrorAt)}
            </Text>
            <Text variant="callout" style={{ color: errorIsStale ? t.c.textMuted : t.c.tint.amber.fg }}>
              {errorLine(state.lastError)}
            </Text>
          </View>
        ) : null}
        {state.droppedOverflow > 0 ? (
          <Text variant="caption" color="textMuted">
            {count(state.droppedOverflow)} oldest points were discarded because the queue hit its size cap.
          </Text>
        ) : null}
        <Button
          label="Upload now"
          icon="cloud-upload-outline"
          variant="secondary"
          busy={busy === "upload"}
          disabled={!state.pairing || state.authLost}
          onPress={upload}
        />
      </Panel>

      <Panel title="Server">
        {state.pairing ? (
          <>
            <Row label="Server" value={displayServer(state.pairing.server)} />
            <Row label="Device" value={state.server?.device ?? "—"} />
            <Row label="Points on server" value={count(state.server?.points)} />
            <Row label="Newest on server" value={state.server?.last ? ago(Date.parse(state.server.last)) : "—"} />
            <Row
              label="Last check-in"
              value={state.heartbeatAt ? ago(state.heartbeatAt) : state.heartbeatError ? "failed" : "never"}
              tone={state.heartbeatAt ? undefined : "dim"}
            />
            <Text variant="caption" color="textMuted">
              Checked {ago(state.serverAt)}
            </Text>
          </>
        ) : (
          <Text variant="callout" color="textSecondary">
            Not paired.
          </Text>
        )}
      </Panel>

      {message ? (
        <Text variant="callout" style={{ color: t.c.tint.amber.fg, textAlign: "center" }}>
          {message}
        </Text>
      ) : null}
    </Screen>
  );
}

/** Matka's estimated battery use today, and the phone's own (whole-phone) measurements. */
function UsageToday({ usage }: { usage: NonNullable<CollectorState["usage"]> }) {
  const l = usageLines(usage, usage.estimate);
  return (
    <View style={{ gap: 2 }}>
      <Text variant="callout">{l.estimate}</Text>
      <Text variant="caption" color="textMuted">
        Estimate of Matka&apos;s own use from GPS and standby time (calibrated {POWER_CALIBRATION.date} on a{" "}
        {POWER_CALIBRATION.device}).
      </Text>
      {l.draw || l.drop ? (
        <>
          {l.draw ? <Text variant="callout">{l.draw}</Text> : null}
          {l.drop ? <Text variant="callout">{l.drop}</Text> : null}
          <Text variant="caption" color="textMuted">
            Measured by the phone for the whole phone (screen off, unplugged), not Matka alone.
          </Text>
        </>
      ) : null}
    </View>
  );
}
