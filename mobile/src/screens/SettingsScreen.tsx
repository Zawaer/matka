import * as Application from "expo-application";
import { useState } from "react";
import { Alert, Platform, Pressable, Switch, View } from "react-native";
import { clearPairing } from "../credentials";
import * as db from "../db";
import { useTheme } from "../design/theme";
import { count } from "../format";
import { displayServer } from "../pairing";
import { openAppSettings, requestIgnoreBatteryOptimizations } from "../system";
import {
  CUSTOM_ACCURACIES,
  CUSTOM_DISTANCES,
  CUSTOM_TIMES,
  DEFAULT_CUSTOM,
  describeCustom,
  formatInterval,
  type CustomSettings,
} from "../preset-logic";
import { PRESETS, setCustom, setPreset, setSmartTracking, type PresetKey } from "../tracking";
import { Button, Icon } from "../ui";
import { LinkText, Panel, Row, Segmented } from "../ui/components";
import { Screen, ScreenHeader } from "../ui/Screen";
import { Text } from "../ui/Text";
import type { CollectorState } from "../ui/useCollectorState";
import { resetUploadState } from "../uploader";

type Props = {
  state: CollectorState | null;
  refresh: () => Promise<void>;
  onPair: () => void;
  onBack: () => void;
};

export default function SettingsScreen({ state, refresh, onPair, onBack }: Props) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);

  const choose = async (key: PresetKey) => {
    setBusy(true);
    try {
      await setPreset(key);
    } catch (e) {
      Alert.alert("Couldn't change preset", String(e));
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert(`Couldn't change ${what}`, String(e));
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const custom = state?.custom ?? DEFAULT_CUSTOM;
  const changeCustom = (patch: Partial<CustomSettings>) => run("custom settings", () => setCustom({ ...custom, ...patch }));

  const unpair = () =>
    Alert.alert(
      "Unpair this phone?",
      "Uploads stop and the token is deleted from the phone. Tracking keeps running and points stay queued until you pair again. Also revoke the device on the web Devices page.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unpair",
          style: "destructive",
          onPress: async () => {
            await clearPairing();
            await resetUploadState();
            await refresh();
          },
        },
      ],
    );

  const clearQueue = () =>
    Alert.alert(
      "Delete queued points?",
      `${count(state?.queued)} points that have not been uploaded will be deleted permanently.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await db.clearQueue();
            await refresh();
          },
        },
      ],
    );

  return (
    <Screen>
      <ScreenHeader title="Settings" right={<LinkText label="Done" onPress={onBack} />} />

      <Panel title="Recording preset">
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => {
          const p = PRESETS[k];
          const on = state?.preset === k;
          return (
            <Pressable
              key={k}
              disabled={busy}
              onPress={() => choose(k)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: t.space.md,
                borderWidth: 1,
                borderColor: on ? t.c.primary : t.c.border,
                backgroundColor: on ? t.c.primarySoft : "transparent",
                borderRadius: t.radius.md,
                padding: t.space.md,
              }}
            >
              <Icon name={on ? "radiobox-marked" : "radiobox-blank"} size={22} color={on ? t.c.primary : t.c.textMuted} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="headline" color={on ? "primary" : "text"}>
                  {p.label}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {k === "custom" ? (on ? describeCustom(custom) : p.description) : p.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {state?.preset === "custom" ? (
          <View style={{ gap: t.space.md }}>
            <Segmented
              label="Accuracy"
              options={CUSTOM_ACCURACIES.map((a) => ({ value: a.key, label: a.label }))}
              value={custom.accuracy}
              disabled={busy}
              onChange={(accuracy) => changeCustom({ accuracy })}
            />
            <Segmented
              label="Distance between points"
              options={CUSTOM_DISTANCES.map((d) => ({ value: d, label: `${d} m` }))}
              value={custom.distance}
              disabled={busy}
              onChange={(distance) => changeCustom({ distance })}
            />
            <Segmented
              label="Time between points"
              options={CUSTOM_TIMES.map((ms) => ({ value: ms, label: formatInterval(ms) }))}
              value={custom.time}
              disabled={busy}
              onChange={(time) => changeCustom({ time })}
            />
          </View>
        ) : null}
        <Text variant="caption" color="textMuted">
          Fixes are only recorded when you move at least the given distance, and are delivered to the app in batches
          to save battery. Changing the preset restarts recording.
        </Text>
      </Panel>

      <Panel title="Smart tracking">
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.md }}>
          <Text variant="headline" style={{ flex: 1 }}>
            Rest GPS when the phone is still
          </Text>
          <Switch
            value={state?.smartTracking ?? true}
            disabled={busy || !state}
            onValueChange={(on) => run("smart tracking", () => setSmartTracking(on))}
            trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            thumbColor={t.c.surface}
            accessibilityLabel="Smart tracking"
          />
        </View>
        <Text variant="caption" color="textMuted">
          After 3 minutes without moving, Matka switches to Wi-Fi/cell positioning and lets GPS sleep. It switches
          back as soon as motion detection or location shows you moving; the first metres of a trip may be coarse.
          Needs motion detection. Not used with Low power.
        </Text>
      </Panel>

      <Panel title="Keep it running">
        {Platform.OS === "android" ? (
          <>
            <Text variant="callout" color="textSecondary">
              Android&apos;s battery optimisation can stop or delay background apps. For an always-on collector, let
              Matka run unrestricted. Some phones (Samsung, Xiaomi, Huawei, OnePlus…) have an extra vendor setting —
              see dontkillmyapp.com.
            </Text>
            <Row
              label="Battery optimisation"
              value={state?.batteryOptimized == null ? "unknown" : state.batteryOptimized ? "on (restricted)" : "off"}
              tone={state?.batteryOptimized ? "warn" : "ok"}
            />
            <Button label="Disable battery optimisation" variant="secondary" onPress={requestIgnoreBatteryOptimizations} />
          </>
        ) : (
          <Text variant="callout" color="textSecondary">
            Set Location to &quot;Always&quot; with Precise Location on, and keep Background App Refresh enabled.
          </Text>
        )}
        <Button label="Open app settings" icon="cog-outline" variant="secondary" onPress={openAppSettings} />
      </Panel>

      <Panel title="Pairing">
        {state?.pairing ? (
          <>
            <Row label="Server" value={displayServer(state.pairing.server)} />
            <Row label="Device" value={state.server?.device ?? "—"} />
            <Button label="Pair again" icon="qrcode-scan" variant="secondary" onPress={onPair} />
            <Button label="Unpair" icon="link-variant-off" variant="danger" onPress={unpair} />
          </>
        ) : (
          <Button label="Pair with server" icon="qrcode-scan" onPress={onPair} />
        )}
      </Panel>

      <Panel title="Queue">
        <Row label="Queued points" value={count(state?.queued)} />
        <Text variant="caption" color="textMuted">
          Points are stored on the phone until the server confirms them. Beyond {count(db.QUEUE_CAP)} queued points the
          oldest are discarded.
        </Text>
        <Button label="Delete queued points" icon="delete-outline" variant="secondary" onPress={clearQueue} disabled={!state?.queued} />
      </Panel>

      <Text variant="caption" color="textMuted" style={{ textAlign: "center" }}>
        Matka {Application.nativeApplicationVersion ?? "?"} ({Application.nativeBuildVersion ?? "?"}) · {Platform.OS}
      </Text>
    </Screen>
  );
}
