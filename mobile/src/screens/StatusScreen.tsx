import { useState } from "react";
import { errorLine } from "../error-copy";
import { Platform, Pressable, Switch, View } from "react-native";
import { useTheme } from "../design/theme";
import { ago, count, fmtDateShort, fmtDuration, fmtTime, group, inFuture } from "../format";
import { openAppSettings, requestIgnoreBatteryOptimizations } from "../system";
import { PRESETS, startTracking, stopTracking } from "../tracking";
import { Banner, Button, Card, Group, GroupBlock, Icon, IconButton, IconTile, InfoRow, Skeleton, type IconName, type ValueTone } from "../ui";
import { PairingLostBanner } from "../ui/components";
import { Screen, ScreenHeader } from "../ui/Screen";
import { Text } from "../ui/Text";
import type { CollectorState } from "../ui/useCollectorState";
import { refreshServerStatus, uploadNow } from "../uploader";
import { describeRecovery } from "../watchdog-logic";

/** "14:02" today, else "Fri 16 Oct 14:02". */
function clock(ms: number): string {
  const d = new Date(ms);
  const time = fmtTime(d.toISOString());
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${fmtDateShort(d)} ${time}`;
}

/** The status card's second line: everything fine, or the most important problem in plain words. */
function health(state: CollectorState): { icon: IconName; tone: "ok" | "warn" | "bad" | "off"; text: string } | null {
  const perm = state.permissions;
  const uploaded = state.lastSuccessAt ? `last upload ${ago(state.lastSuccessAt)}` : "nothing uploaded yet";
  if (!state.trackingEnabled) return { icon: "info", tone: "off", text: "Nothing new is logged" };
  if (!state.trackingRunning) return { icon: "error", tone: "bad", text: "Recording should be on but isn't running" };
  // These have a banner of their own above; don't say it twice.
  if ((perm && perm.background !== "granted") || !state.pairing || state.authLost) return null;
  if (state.failures > 0) return { icon: "warning", tone: "warn", text: `Upload failing · retrying ${inFuture(state.nextRetryAt)}` };
  return { icon: "ok", tone: "ok", text: `All good · ${uploaded}` };
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
  // null = automatic: open only when something in there needs a look.
  const [details, setDetails] = useState<boolean | null>(null);

  if (!state) {
    return (
      <Screen appBar={<ScreenHeader title="Recorder" />}>
        <Skeleton height={72} />
        <Skeleton height={20} width="60%" radius={6} />
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
  const h = health(state);
  const serverProblem = !!state.pairing && !state.authLost && !state.heartbeatAt && !!state.heartbeatError;
  const showDetails = details ?? serverProblem;
  const hColor = !h ? t.c.textMuted : h.tone === "ok" ? t.c.success : h.tone === "warn" ? t.c.warning : h.tone === "bad" ? t.c.danger : t.c.textMuted;

  const trackingProblem = state.trackingEnabled && !state.trackingRunning;
  const recentRecoveries = state.recoveries.slice(0, 3);
  const errorIsStale =
    state.lastErrorAt != null && state.lastSuccessAt != null && state.lastSuccessAt > state.lastErrorAt;

  const status = !state.trackingEnabled
    ? { title: "Recording is off", tone: "neutral" as const, icon: "recordingOff" as const }
    : trackingProblem
      ? { title: "On, but not running", tone: "danger" as const, icon: "error" as const }
      : state.standby
        ? { title: "Standby: phone is still", tone: "accent" as const, icon: "quiet" as const }
        : { title: "Recording", tone: "success" as const, icon: "tabRecorder" as const };

  return (
    <Screen
      appBar={<ScreenHeader title="Recorder" right={<IconButton icon="settings" label="Settings" onPress={onSettings} />} />}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await refreshServerStatus().catch(() => null);
        await refresh();
        setRefreshing(false);
      }}
    >

      {!state.pairing ? (
        <Banner tone="warning" title="Not paired" message="Points are kept on the phone until you pair it with your Matka server.">
          <Button label="Pair with server" icon="qr" variant="tonal" tone="warning" size="sm" onPress={onPair} />
        </Banner>
      ) : state.authLost ? (
        <PairingLostBanner onPair={onPair} />
      ) : null}

      {state.trackingEnabled && perm && perm.background !== "granted" ? (
        <Banner
          tone="danger"
          title={perm.foreground === "granted" ? "Background location is off" : "Location permission is off"}
          message={
            perm.foreground === "granted"
              ? `Matka can only record while the app is open. Set location to ${Platform.OS === "android" ? "“Allow all the time”" : "“Always”"} in settings.`
              : `Nothing is recorded. Set location to ${Platform.OS === "android" ? "“Allow all the time”" : "“Always”"} in settings.`
          }
        >
          <Button label="Open app settings" icon="settings" variant="tonal" tone="danger" size="sm" onPress={openAppSettings} />
        </Banner>
      ) : null}

      {state.batteryOptimized ? (
        <Banner
          tone="warning"
          icon="battery"
          title="Battery optimisation is on"
          message="Android may pause recording and uploads while the phone is idle. Let Matka run unrestricted."
        >
          <Button label="Allow unrestricted" variant="tonal" tone="warning" size="sm" onPress={requestIgnoreBatteryOptimizations} />
        </Banner>
      ) : null}

      <Card style={{ flexDirection: "row", alignItems: "center", gap: t.space.md }}>
        <IconTile icon={status.icon} tone={status.tone} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline">{status.title}</Text>
          {/* The health line lives in the card (the preset is on Settings); a banner above covers the rest. */}
          {state.standby ? (
            <Text variant="callout" color="textSecondary">
              GPS sleeps until you move
            </Text>
          ) : h ? (
            <View style={{ flexDirection: "row", gap: 6 }} accessible accessibilityLabel={h.text}>
              {h.tone === "off" ? null : (
                <View style={{ height: 20, justifyContent: "center" }}>
                  <Icon name={h.icon} size={16} color={hColor} />
                </View>
              )}
              <Text variant="callout" color="textSecondary" tabular style={{ flex: 1 }}>
                {h.text}
              </Text>
            </View>
          ) : (
            <Text variant="callout" color="textSecondary">
              {`${PRESETS[state.preset].label} preset`}
            </Text>
          )}
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

      <Group title="Location">
        <InfoRow label="Location permission" value={permText} tone={permTone} />
        <InfoRow label="Last location" value={ago(state.lastFixAt)} tone={state.lastFixAt ? undefined : "dim"} />
        {state.activityStatus ? (
          <InfoRow
            label="Motion detection"
            value={state.activityStatus === "on" ? "On" : state.activityStatus === "denied" ? "Not allowed" : "Not available"}
            tone={state.activityStatus === "on" ? undefined : "dim"}
            note={
              state.activityStatus === "on"
                ? null
                : state.activityStatus === "denied"
                  ? "Allow it in Settings → Permissions → Physical activity."
                  : null
            }
          />
        ) : null}
        {recentRecoveries.length > 0 ? (
          <GroupBlock gap={6}>
            <Text variant="callout" color="textSecondary">
              Times the phone paused recording
            </Text>
            {recentRecoveries.map((r) => (
              <View key={r.at} style={{ flexDirection: "row", gap: t.space.sm }}>
                <View style={{ height: 20, justifyContent: "center" }}>
                  <Icon name={r.ok ? "ok" : "warning"} size={16} color={r.ok ? t.c.success : t.c.warning} />
                </View>
                <Text variant="callout" tabular style={{ flex: 1, lineHeight: 20 }}>
                  {describeRecovery(r, clock)}
                </Text>
              </View>
            ))}
          </GroupBlock>
        ) : null}
      </Group>

      <Group
        title="Upload"
        footer={
          state.droppedOverflow > 0
            ? `${count(state.droppedOverflow)} of the oldest points were dropped because the queue was full.`
            : undefined
        }
      >
        <InfoRow label="Queued on phone" value={count(state.queued)} tone={state.queued > 5000 ? "warn" : undefined} />
        {state.oldestQueued ? <InfoRow label="Oldest queued" value={ago(state.oldestQueued)} /> : null}
        <InfoRow label="Last upload" value={ago(state.lastSuccessAt)} tone={state.lastSuccessAt ? undefined : "dim"} />
        {state.failures > 0 && !state.authLost ? (
          <InfoRow label="Upload failing" value={`Retrying ${inFuture(state.nextRetryAt)}`} tone="warn" note={`${state.failures} ${state.failures === 1 ? "try" : "tries"} so far`} />
        ) : null}
        {state.lastError ? (
          <GroupBlock gap={2}>
            <Text variant="callout" color="textSecondary">
              Last error, {ago(state.lastErrorAt)}
            </Text>
            <Text variant="callout" color={errorIsStale ? "textMuted" : "text"}>
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

      {/* Closed: one row in its own group. Open: the sections follow directly (no extra header). */}
      {showDetails ? null : (
        <Card padded={false} style={{ marginTop: t.space.sm, overflow: "hidden" }}>
          <Pressable
            onPress={() => setDetails(true)}
            accessibilityRole="button"
            accessibilityState={{ expanded: false }}
            accessibilityLabel="Show battery and server details"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: t.space.md,
              minHeight: 56,
              paddingHorizontal: t.space.lg,
              backgroundColor: pressed ? t.c.surfaceAlt : "transparent",
            })}
          >
            <Text variant="body" style={{ flex: 1 }}>
              Battery and server
            </Text>
            <Icon name="expand" size={20} color={t.c.textSecondary} />
          </Pressable>
        </Card>
      )}

      {showDetails ? (
        <>
          {state.usage ? <UsageToday usage={state.usage} /> : null}

          {/* Server address and device name are on Settings → Pairing; here only what the server knows. */}
          <Group
            title="Server"
            right={<Button label="Hide" variant="ghost" size="sm" onPress={() => setDetails(false)} />}
            footer={state.pairing ? `Status refreshed ${ago(state.serverAt)}` : undefined}
          >
            {state.pairing ? (
              <>
                <InfoRow label="Points on server" value={count(state.server?.points)} />
                <InfoRow label="Newest on server" value={state.server?.last ? ago(Date.parse(state.server.last)) : "–"} />
                <InfoRow
                  label="Last check-in"
                  value={state.heartbeatAt ? ago(state.heartbeatAt) : state.heartbeatError ? "Failed" : "Never"}
                  tone={state.heartbeatAt ? undefined : state.heartbeatError ? "warn" : "dim"}
                />
              </>
            ) : (
              <InfoRow label="Server" value="Not paired" tone="dim" />
            )}
          </Group>
        </>
      ) : null}
    </Screen>
  );
}

/** Matka's estimated battery use today, and the phone's own (whole-phone) measurements. */
function UsageToday({ usage }: { usage: NonNullable<CollectorState["usage"]> }) {
  const { estimate, current } = usage;
  const share = estimate.percent < 0.5 ? "Under 1%" : `About ${Math.round(estimate.percent)}%`;
  const time = (s: number) => (s > 0 && s < 60 ? "Under 1 min" : s > 0 ? fmtDuration(s) : "None");
  return (
    <Group title="Battery today" footer="Matka's share is an estimate; phone draw is measured for the whole phone.">
      <InfoRow label="Used by Matka" value={`${share} · ${group(estimate.mAh)} mAh`} />
      <InfoRow label="GPS on" value={time(usage.activeS)} />
      <InfoRow label="GPS resting" value={time(usage.standbyS)} />
      {current.active.median != null ? <InfoRow label="Phone draw, recording" value={`${Math.round(current.active.median)} mA`} /> : null}
      {current.standby.median != null ? <InfoRow label="Phone draw, resting" value={`${Math.round(current.standby.median)} mA`} /> : null}
      {usage.dropS > 0 ? <InfoRow label="Battery drop, unplugged" value={`${group(usage.dropMah)} mAh in ${fmtDuration(usage.dropS)}`} /> : null}
    </Group>
  );
}
