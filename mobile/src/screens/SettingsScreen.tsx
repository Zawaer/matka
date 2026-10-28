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
import { presetChanged } from "../watchdog";
import { Button, Group, GroupBlock, Icon, InfoRow, Segmented } from "../ui";
import { BackLink, DetailTitle, Screen } from "../ui/Screen";
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
      presetChanged();
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
      // Preset, custom values and Smart Tracking are in the heartbeat.
      if (what === "custom settings" || what === "smart tracking") presetChanged();
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

  const toggleRow = (label: string, value: boolean, onChange: (v: boolean) => void, disabled: boolean) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.md, minHeight: 56, paddingHorizontal: t.space.lg }}>
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
        thumbColor="#FFFFFF"
        accessibilityLabel={label}
      />
    </View>
  );

  return (
    <Screen>
      <BackLink label="Recorder" onPress={onBack} />
      <DetailTitle title="Settings" />

      <Group
        title="Recording preset"
        footer="Points are only recorded when you move at least the given distance, and reach the app in batches to save battery. Changing the preset restarts recording."
      >
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
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "flex-start",
                gap: t.space.md,
                minHeight: 64,
                paddingHorizontal: t.space.lg,
                paddingVertical: t.space.md,
                backgroundColor: pressed ? t.c.surfaceAlt : "transparent",
              })}
            >
              <View style={{ height: 20, justifyContent: "center" }}>
                <Icon name={on ? "radioOn" : "radioOff"} size={20} color={on ? t.c.primary : t.c.textMuted} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="headline">{p.label}</Text>
                <Text variant="callout" color="textSecondary">
                  {k === "custom" ? (on ? describeCustom(custom) : p.description) : p.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {state?.preset === "custom" ? (
          <GroupBlock gap={t.space.lg}>
            <Segmented
              role="radiogroup"
              showLabel
              label="Accuracy"
              options={CUSTOM_ACCURACIES.map((a) => ({ value: a.key, label: a.label }))}
              value={custom.accuracy}
              disabled={busy}
              onChange={(accuracy) => changeCustom({ accuracy })}
            />
            <Segmented
              role="radiogroup"
              showLabel
              label="Distance between points"
              options={CUSTOM_DISTANCES.map((d) => ({ value: d, label: `${d} m` }))}
              value={custom.distance}
              disabled={busy}
              onChange={(distance) => changeCustom({ distance })}
            />
            <Segmented
              role="radiogroup"
              showLabel
              label="Time between points"
              options={CUSTOM_TIMES.map((ms) => ({ value: ms, label: formatInterval(ms) }))}
              value={custom.time}
              disabled={busy}
              onChange={(time) => changeCustom({ time })}
            />
          </GroupBlock>
        ) : null}
      </Group>

      <Group
        title="Smart tracking"
        footer="After 3 minutes without moving, Matka switches to Wi-Fi and cell positioning and lets GPS sleep. It switches back as soon as motion detection or location shows you moving, so the first metres of a trip may be coarse. Needs motion detection; not used with Low power."
      >
        {toggleRow("Rest GPS when the phone is still", state?.smartTracking ?? true, (on) => run("smart tracking", () => setSmartTracking(on)), busy || !state)}
      </Group>

      <Group
        title="Keep it running"
        footer={
          Platform.OS === "android"
            ? "Android's battery optimisation can stop or delay background apps. Some phones (Samsung, Xiaomi, Huawei, OnePlus) have an extra vendor setting: see dontkillmyapp.com."
            : 'Set Location to "Always" with Precise Location on, and keep Background App Refresh enabled.'
        }
      >
        {Platform.OS === "android" ? (
          <InfoRow
            label="Battery optimisation"
            value={state?.batteryOptimized == null ? "Unknown" : state.batteryOptimized ? "On (restricted)" : "Off"}
            tone={state?.batteryOptimized ? "warn" : "ok"}
          />
        ) : null}
        <GroupBlock>
          {Platform.OS === "android" ? (
            <Button label="Allow unrestricted battery use" icon="battery" variant="secondary" onPress={requestIgnoreBatteryOptimizations} />
          ) : null}
          <Button label="Open app settings" icon="settings" variant="secondary" onPress={openAppSettings} />
        </GroupBlock>
      </Group>

      <Group title="Pairing">
        {state?.pairing ? <InfoRow label="Server" value={displayServer(state.pairing.server)} /> : null}
        {state?.pairing ? <InfoRow label="Device" value={state.server?.device ?? "–"} /> : null}
        <GroupBlock>
          {state?.pairing ? (
            <>
              <Button label="Pair again" icon="qr" variant="secondary" onPress={onPair} />
              <Button label="Unpair this phone" icon="unlink" variant="danger" onPress={unpair} />
            </>
          ) : (
            <Button label="Pair with server" icon="qr" onPress={onPair} />
          )}
        </GroupBlock>
      </Group>

      <Group
        title="Queue"
        footer={`Points stay on the phone until the server confirms them. Beyond ${count(db.QUEUE_CAP)} queued points the oldest are discarded.`}
      >
        <InfoRow label="Queued points" value={count(state?.queued)} />
        <GroupBlock>
          <Button label="Delete queued points" icon="delete" variant="danger" onPress={clearQueue} disabled={!state?.queued} />
        </GroupBlock>
      </Group>

      <Text variant="caption" color="textMuted" tabular style={{ textAlign: "center" }}>
        Matka {Application.nativeApplicationVersion ?? "?"} ({Application.nativeBuildVersion ?? "?"}) · {Platform.OS}
      </Text>
    </Screen>
  );
}
