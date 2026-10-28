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
import { Group, GroupBlock, Icon, InfoRow, Segmented, Sheet, type IconName } from "../ui";
import { AppBar, Screen } from "../ui/Screen";
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
  const [picking, setPicking] = useState<"distance" | "time" | null>(null);

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
      "Uploads stop and the token is deleted from this phone. Recording carries on and points stay queued until you pair again. Also remove the device on the web Devices page.",
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
      `${count(state?.queued)} points that haven't been uploaded will be deleted for good.`,
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
    <Screen appBar={<AppBar title="Settings" backLabel="Recorder" onBack={onBack} />}>
      <Group title="Recording preset" footer="Changing the preset restarts recording.">
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
              accessibilityLabel={`${p.label}, ${k === "custom" && on ? describeCustom(custom) : p.description}`}
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
                  {k === "custom" && on ? describeCustom(custom) : p.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </Group>

      {state?.preset === "custom" ? (
        <Group title="Custom preset">
          <GroupBlock>
            <Segmented
              showLabel
              label="Accuracy"
              options={CUSTOM_ACCURACIES.map((a) => ({ value: a.key, label: a.label }))}
              value={custom.accuracy}
              disabled={busy}
              onChange={(accuracy) => changeCustom({ accuracy })}
            />
          </GroupBlock>
          <ActionRow icon="route" label="Distance between points" value={`${custom.distance} m`} disabled={busy} onPress={() => setPicking("distance")} />
          <ActionRow icon="wait" label="Time between points" value={formatInterval(custom.time)} disabled={busy} onPress={() => setPicking("time")} />
        </Group>
      ) : null}

      <Group title="Smart tracking" footer="GPS rests after 3 minutes without moving and wakes when you move (not with Low power).">
        {toggleRow("Rest GPS when the phone is still", state?.smartTracking ?? true, (on) => run("smart tracking", () => setSmartTracking(on)), busy || !state)}
      </Group>

      <Group
        title="Keep it running"
        footer={
          Platform.OS === "android"
            ? "Some phones add their own battery limits: see dontkillmyapp.com."
            : 'Set Location to "Always" with Precise Location on.'
        }
      >
        {Platform.OS === "android" ? (
          <InfoRow
            label="Battery optimisation"
            value={state?.batteryOptimized == null ? "Unknown" : state.batteryOptimized ? "On, may pause recording" : "Off"}
            tone={state?.batteryOptimized ? "warn" : state?.batteryOptimized === false ? "ok" : "dim"}
          />
        ) : null}
        {Platform.OS === "android" ? (
          <ActionRow icon="battery" label="Allow unrestricted battery use" onPress={requestIgnoreBatteryOptimizations} />
        ) : null}
        <ActionRow icon="settings" label="Open app settings" onPress={openAppSettings} />
      </Group>

      <Group title="Pairing">
        {state?.pairing ? <InfoRow label="Server" value={displayServer(state.pairing.server)} /> : null}
        {state?.pairing ? <InfoRow label="Device" value={state.server?.device ?? "–"} /> : null}
        {state?.pairing ? (
          <>
            <ActionRow icon="qr" label="Pair again" onPress={onPair} />
            <ActionRow icon="unlink" label="Unpair this phone" danger onPress={unpair} />
          </>
        ) : (
          <ActionRow icon="qr" label="Pair with server" onPress={onPair} />
        )}
      </Group>

      <Group title="Queue" footer={`Points stay on the phone until the server has them (at most ${count(db.QUEUE_CAP)}).`}>
        <InfoRow label="Queued points" value={count(state?.queued)} />
        <ActionRow icon="delete" label="Delete queued points" danger onPress={clearQueue} disabled={!state?.queued} />
      </Group>

      <Text variant="caption" color="textMuted" tabular style={{ textAlign: "center" }}>
        Matka {Application.nativeApplicationVersion ?? "?"} ({Application.nativeBuildVersion ?? "?"}) · {Platform.OS}
      </Text>

      <ChoiceSheet
        title={picking === "distance" ? "Distance between points" : null}
        options={CUSTOM_DISTANCES.map((d) => ({ value: d as number, label: `${d} m` }))}
        value={custom.distance}
        onPick={(distance) => changeCustom({ distance })}
        onClose={() => setPicking(null)}
      />
      <ChoiceSheet
        title={picking === "time" ? "Time between points" : null}
        options={CUSTOM_TIMES.map((ms) => ({ value: ms as number, label: formatInterval(ms) }))}
        value={custom.time}
        onPick={(time) => changeCustom({ time })}
        onClose={() => setPicking(null)}
      />
    </Screen>
  );
}

/** A tappable settings row: leading icon, label, a value or a chevron. Danger rows are red text. */
function ActionRow({
  icon,
  label,
  value,
  onPress,
  danger,
  disabled,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const t = useTheme();
  // Disabled reads as disabled (muted), not as a pale error tint.
  const fg = disabled ? t.c.textMuted : danger ? t.c.danger : t.c.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: t.space.md,
        minHeight: 56,
        paddingHorizontal: t.space.lg,
        backgroundColor: pressed ? t.c.surfaceAlt : "transparent",
        opacity: disabled ? 0.7 : 1,
      })}
    >
      <Icon name={icon} size={20} color={disabled ? t.c.textMuted : danger ? t.c.danger : t.c.textSecondary} />
      <Text variant="body" style={{ flex: 1, color: fg }}>
        {label}
      </Text>
      {value ? (
        <Text variant="body" color="textSecondary" tabular>
          {value}
        </Text>
      ) : null}
      {danger ? null : <Icon name="chevronRight" size={20} color={t.c.textMuted} />}
    </Pressable>
  );
}

/** A bottom sheet with one radio row per option. */
function ChoiceSheet<T extends string | number>({
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  title: string | null;
  options: readonly { value: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  return (
    <Sheet visible={title != null} onClose={onClose} title={title ?? ""}>
      <View accessibilityRole="radiogroup" style={{ marginHorizontal: -t.space.xl, marginTop: -t.space.md }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => {
                onPick(o.value);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: t.space.lg,
                minHeight: 56,
                paddingHorizontal: t.space.xl,
                backgroundColor: pressed ? t.c.surfaceAlt : "transparent",
              })}
            >
              <Icon name={on ? "radioOn" : "radioOff"} size={20} color={on ? t.c.primary : t.c.textMuted} />
              <Text variant="body" tabular>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
