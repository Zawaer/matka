import { useState } from "react";
import { errorLine } from "../error-copy";
import { Platform, Switch, View } from "react-native";
import { useTheme } from "../design/theme";
import { ago, count, inFuture } from "../format";
import { displayServer } from "../pairing";
import { openAppSettings, requestIgnoreBatteryOptimizations } from "../system";
import { PRESETS, startTracking, stopTracking } from "../tracking";
import { Banner, Button, Card, Group, GroupBlock, Icon, IconButton, IconTile, InfoRow, Skeleton, type ValueTone } from "../ui";
import { PairingLostBanner } from "../ui/components";
import { Screen, ScreenHeader } from "../ui/Screen";
import { Text } from "../ui/Text";
import type { CollectorState } from "../ui/useCollectorState";
import { refreshServerStatus, uploadNow } from "../uploader";
import { POWER_CALIBRATION } from "../power-model";
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
        <Skeleton height={72} />
        <Skeleton height={180} />
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
    ? "Unknown"
    : perm.background === "granted"
      ? perm.precise
        ? "Always, precise"
        : "Always, approximate"
      : perm.foreground === "granted"
        ? "Only while in use"
        : perm.foreground === "denied"
          ? "Denied"
          : "Not asked";
  const permTone: ValueTone = perm?.background === "granted" ? (perm.precise ? "ok" : "warn") : "bad";

  const trackingProblem = state.trackingEnabled && !state.trackingRunning;
  const recentRecoveries = state.recoveries.slice(0, 3);
  const errorIsStale =
    state.lastErrorAt != null && state.lastSuccessAt != null && state.lastSuccessAt > state.lastErrorAt;

  const status = !state.trackingEnabled
    ? { title: "Off", tone: "neutral" as const, icon: "stop" as const }
    : trackingProblem
      ? { title: "On, but not running", tone: "danger" as const, icon: "error" as const }
      : state.standby
        ? { title: "Standby: phone is still", tone: "accent" as const, icon: "quiet" as const }
        : { title: "Recording", tone: "success" as const, icon: "tabRecorder" as const };

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
      <ScreenHeader title="Recorder" right={<IconButton icon="settings" label="Settings" onPress={onSettings} />} />

      {!state.pairing ? (
        <Banner tone="warning" title="Not paired" message="Points are kept on the phone until you pair it with your Matka server.">
          <Button label="Pair with server" icon="qr" variant="surface" size="sm" onPress={onPair} />
        </Banner>
      ) : state.authLost ? (
        <PairingLostBanner onPair={onPair} />
      ) : null}

      {state.trackingEnabled && perm && perm.background !== "granted" ? (
        <Banner
          tone="danger"
          title="Location permission missing"
          message={`Nothing is recorded in the background. Allow location ${Platform.OS === "android" ? '"All the time"' : '"Always"'} in settings.`}
        >
          <Button label="Open app settings" icon="settings" variant="surface" size="sm" onPress={openAppSettings} />
        </Banner>
      ) : null}

      {state.batteryOptimized ? (
        <Banner
          tone="warning"
          icon="battery"
          title="Battery optimisation is on"
          message="Android may delay or stop recording and uploads while the phone is idle. Let Matka run unrestricted."
        >
          <Button label="Allow unrestricted" variant="surface" size="sm" onPress={requestIgnoreBatteryOptimizations} />
        </Banner>
      ) : null}

      <Card style={{ flexDirection: "row", alignItems: "center", gap: t.space.md }}>
        <IconTile icon={status.icon} tone={status.tone} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline" color={trackingProblem ? "danger" : "text"}>
            {status.title}
          </Text>
          <Text variant="callout" color="textSecondary">
            {state.standby
              ? `GPS sleeps until you move · ${PRESETS[state.preset].label}`
              : `${PRESETS[state.preset].label} preset${state.smartTracking && state.preset !== "low" ? " · smart tracking" : ""}`}
          </Text>
        </View>
        <Switch
          value={state.trackingEnabled}
          disabled={busy === "toggle"}
          onValueChange={toggle}
          trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
          thumbColor="#FFFFFF"
          accessibilityLabel="Recording"
        />
      </Card>

      <Group title="Recording">
        <InfoRow label="Location permission" value={permText} tone={permTone} />
        <InfoRow label="Last location" value={ago(state.lastFixAt)} tone={state.lastFixAt ? undefined : "dim"} />
        {state.activityStatus ? (
          <InfoRow
            label="Motion detection"
            value={state.activityStatus === "on" ? "On" : state.activityStatus === "denied" ? "Not allowed" : "Not available"}
            tone={state.activityStatus === "on" ? "ok" : "dim"}
            note={
              state.activityStatus === "on"
                ? "Tells a bike from a bus."
                : state.activityStatus === "denied"
                  ? "Allow it in Settings → Permissions → Physical activity."
                  : null
            }
          />
        ) : null}
        {recentRecoveries.length > 0 ? (
          <GroupBlock gap={6}>
            <Text variant="callout" color="textSecondary">
              Watchdog: the phone stopped location updates
            </Text>
            {recentRecoveries.map((r) => (
              <View key={r.at} style={{ flexDirection: "row", gap: t.space.sm }}>
                <View style={{ height: 20, justifyContent: "center" }}>
                  <Icon name={r.ok ? "check" : "warning"} size={16} color={r.ok ? t.c.success : t.c.warning} />
                </View>
                <Text variant="callout" color={r.ok ? "text" : "warning"} style={{ flex: 1, lineHeight: 20 }}>
                  {describeRecovery(r, clock)}
                </Text>
              </View>
            ))}
          </GroupBlock>
        ) : null}
      </Group>

      {state.usage ? <UsageToday usage={state.usage} /> : null}

      <Group
        title="Upload"
        footer={
          state.droppedOverflow > 0
            ? `${count(state.droppedOverflow)} oldest points were discarded because the queue hit its size cap.`
            : undefined
        }
      >
        <InfoRow label="Queued on phone" value={count(state.queued)} tone={state.queued > 5000 ? "warn" : undefined} />
        {state.oldestQueued ? <InfoRow label="Oldest queued" value={ago(state.oldestQueued)} /> : null}
        <InfoRow label="Last upload" value={ago(state.lastSuccessAt)} tone={state.lastSuccessAt ? undefined : "dim"} />
        {state.failures > 0 && !state.authLost ? (
          <InfoRow label="Next retry" value={`${inFuture(state.nextRetryAt)} (${state.failures} failed)`} tone="warn" />
        ) : null}
        {state.lastError ? (
          <GroupBlock gap={2}>
            <Text variant="callout" color="textSecondary">
              Last error · {ago(state.lastErrorAt)}
            </Text>
            <Text variant="callout" color={errorIsStale ? "textMuted" : "warning"}>
              {errorLine(state.lastError)}
            </Text>
          </GroupBlock>
        ) : null}
        <GroupBlock>
          <Button
            label="Upload now"
            icon="upload"
            variant="secondary"
            busy={busy === "upload"}
            disabled={!state.pairing || state.authLost}
            onPress={upload}
          />
        </GroupBlock>
      </Group>

      {message ? <Banner tone="info" message={message} /> : null}

      <Group title="Server" footer={state.pairing ? `Checked ${ago(state.serverAt)}` : undefined}>
        {state.pairing ? (
          <>
            <InfoRow label="Server" value={displayServer(state.pairing.server)} />
            <InfoRow label="Device" value={state.server?.device ?? "–"} />
            <InfoRow label="Points on server" value={count(state.server?.points)} />
            <InfoRow label="Newest on server" value={state.server?.last ? ago(Date.parse(state.server.last)) : "–"} />
            <InfoRow
              label="Last check-in"
              value={state.heartbeatAt ? ago(state.heartbeatAt) : state.heartbeatError ? "Failed" : "Never"}
              tone={state.heartbeatAt ? undefined : "dim"}
            />
          </>
        ) : (
          <InfoRow label="Server" value="Not paired" tone="dim" />
        )}
      </Group>
    </Screen>
  );
}

const span = (s: number) => (s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

/** Matka's estimated battery use today, and the phone's own (whole-phone) measurements. */
function UsageToday({ usage }: { usage: NonNullable<CollectorState["usage"]> }) {
  const { estimate, current } = usage;
  const pct = estimate.percent < 1 ? estimate.percent.toFixed(1) : String(Math.round(estimate.percent));
  const measured = current.active.median != null || current.standby.median != null || usage.dropS > 0;
  return (
    <Group
      title="Battery today"
      footer={`Matka's own use is estimated from GPS and standby time (calibrated ${POWER_CALIBRATION.date} on a ${POWER_CALIBRATION.device}).${
        measured ? " Phone draw is measured for the whole phone (screen off, unplugged), not Matka alone." : ""
      }`}
    >
      <InfoRow label="Matka (estimate)" value={`≈ ${pct} % · ${Math.round(estimate.mAh).toLocaleString("en-US")} mAh`} />
      <InfoRow label="GPS active" value={span(usage.activeS)} />
      <InfoRow label="Standby" value={span(usage.standbyS)} />
      {current.active.median != null ? <InfoRow label="Phone draw, recording" value={`~${Math.round(current.active.median)} mA`} /> : null}
      {current.standby.median != null ? <InfoRow label="Phone draw, standby" value={`~${Math.round(current.standby.median)} mA`} /> : null}
      {usage.dropS > 0 ? <InfoRow label="Measured drop, unplugged" value={`${Math.round(usage.dropMah)} mAh in ${span(usage.dropS)}`} /> : null}
    </Group>
  );
}
