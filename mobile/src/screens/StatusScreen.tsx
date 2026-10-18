import { useState } from "react";
import { Platform, ScrollView, Switch, Text, View } from "react-native";
import { ago, count, inFuture } from "../format";
import { displayServer } from "../pairing";
import { requestIgnoreBatteryOptimizations, openAppSettings } from "../system";
import { PRESETS, startTracking, stopTracking } from "../tracking";
import { Banner, Button, Card, PairingLostBanner, Row, s } from "../ui/components";
import { C } from "../ui/theme";
import type { CollectorState } from "../ui/useCollectorState";
import { refreshServerStatus, uploadNow } from "../uploader";

type Props = {
  state: CollectorState | null;
  refresh: () => Promise<void>;
  onPair: () => void;
  onSettings: () => void;
};

export default function StatusScreen({ state, refresh, onPair, onSettings }: Props) {
  const [busy, setBusy] = useState<"toggle" | "upload" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!state) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={s.sub}>Loading…</Text>
      </View>
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
  const permTone = perm?.background === "granted" ? (perm.precise ? "ok" : "warn") : "bad";

  const trackingProblem = state.trackingEnabled && !state.trackingRunning;
  const errorIsStale =
    state.lastErrorAt != null && state.lastSuccessAt != null && state.lastSuccessAt > state.lastErrorAt;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <View>
          <Text style={s.h1}>Matka</Text>
          <Text style={s.sub}>recorder</Text>
        </View>
        <Text style={s.link} onPress={onSettings} accessibilityRole="button">
          Settings
        </Text>
      </View>

      {!state.pairing ? (
        <Banner tone="warn">
          <Text style={[s.bannerText, { color: C.accent }]}>Not paired. Points are kept on the phone until you pair.</Text>
          <Button title="Pair with server" onPress={onPair} />
        </Banner>
      ) : state.authLost ? (
        <PairingLostBanner onPair={onPair} />
      ) : null}

      {state.trackingEnabled && perm && perm.background !== "granted" ? (
        <Banner tone="bad">
          <Text style={[s.bannerText, { color: C.danger }]}>
            Background location permission is missing, so nothing is recorded. Allow location{" "}
            {Platform.OS === "android" ? '"All the time"' : '"Always"'} in settings.
          </Text>
          <Button title="Open app settings" kind="ghost" onPress={openAppSettings} />
        </Banner>
      ) : null}

      {state.batteryOptimized ? (
        <Banner tone="warn">
          <Text style={[s.bannerText, { color: C.accent }]}>
            Battery optimisation is on for Matka. Android may delay or stop background recording and uploads while the
            phone is idle. Allow Matka to run unrestricted.
          </Text>
          <Button title="Disable battery optimisation" kind="ghost" onPress={requestIgnoreBatteryOptimizations} />
        </Banner>
      ) : null}

      <Card title="Tracking">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={[s.body, { fontSize: 17, fontWeight: "700" }]}>
              {state.trackingEnabled ? (trackingProblem ? "On — not running" : "Recording") : "Off"}
            </Text>
            <Text style={s.hint}>{PRESETS[state.preset].label} preset</Text>
          </View>
          <Switch
            value={state.trackingEnabled}
            disabled={busy === "toggle"}
            onValueChange={toggle}
            trackColor={{ true: C.primaryStrong, false: C.border }}
            thumbColor={C.text}
          />
        </View>
        <Row label="Location permission" value={permText} tone={permTone} />
        <Row label="Last fix" value={ago(state.lastFixAt)} tone={state.lastFixAt ? undefined : "dim"} />
      </Card>

      <Card title="Upload">
        <Row
          label="Queued on phone"
          value={count(state.queued)}
          tone={state.queued > 5000 ? "warn" : undefined}
        />
        {state.oldestQueued ? <Row label="Oldest queued" value={ago(state.oldestQueued)} /> : null}
        <Row
          label="Last successful upload"
          value={ago(state.lastSuccessAt)}
          tone={state.lastSuccessAt ? "ok" : "dim"}
        />
        {state.failures > 0 && !state.authLost ? (
          <Row
            label="Retrying"
            value={`${inFuture(state.nextRetryAt)} (${state.failures} failed)`}
            tone="warn"
          />
        ) : null}
        {state.lastError ? (
          <View style={{ gap: 2 }}>
            <Text style={s.rowLabel}>Last error · {ago(state.lastErrorAt)}</Text>
            <Text style={[s.body, { color: errorIsStale ? C.faint : C.accent }]}>{state.lastError}</Text>
          </View>
        ) : null}
        {state.droppedOverflow > 0 ? (
          <Text style={s.hint}>
            {count(state.droppedOverflow)} oldest points were discarded because the queue hit its size cap.
          </Text>
        ) : null}
        <Button
          title="Upload now"
          kind="ghost"
          busy={busy === "upload"}
          disabled={!state.pairing || state.authLost}
          onPress={upload}
        />
      </Card>

      <Card title="Server">
        {state.pairing ? (
          <>
            <Row label="Server" value={displayServer(state.pairing.server)} />
            <Row label="Device" value={state.server?.device ?? "—"} />
            <Row label="Points on server" value={count(state.server?.points)} />
            <Row
              label="Newest on server"
              value={state.server?.last ? ago(Date.parse(state.server.last)) : "—"}
            />
            <Text style={s.hint}>Checked {ago(state.serverAt)}</Text>
          </>
        ) : (
          <Text style={s.sub}>Not paired.</Text>
        )}
      </Card>

      {message ? <Text style={[s.body, { color: C.accent, textAlign: "center" }]}>{message}</Text> : null}
    </ScrollView>
  );
}
