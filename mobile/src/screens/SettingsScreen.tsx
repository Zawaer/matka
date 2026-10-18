import * as Application from "expo-application";
import { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { clearPairing } from "../credentials";
import * as db from "../db";
import { count } from "../format";
import { displayServer } from "../pairing";
import { openAppSettings, requestIgnoreBatteryOptimizations } from "../system";
import { PRESETS, setPreset, type PresetKey } from "../tracking";
import { Button, Card, Row, s } from "../ui/components";
import { C, RADIUS } from "../ui/theme";
import type { CollectorState } from "../ui/useCollectorState";
import { resetUploadState } from "../uploader";

type Props = {
  state: CollectorState | null;
  refresh: () => Promise<void>;
  onPair: () => void;
  onBack: () => void;
};

export default function SettingsScreen({ state, refresh, onPair, onBack }: Props) {
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
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <Text style={s.h1}>Settings</Text>
        <Text style={s.link} onPress={onBack} accessibilityRole="button">
          Done
        </Text>
      </View>

      <Card title="Recording preset">
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
                borderWidth: 1,
                borderColor: on ? C.primaryStrong : C.border,
                backgroundColor: on ? C.surface2 : "transparent",
                borderRadius: RADIUS,
                padding: 12,
                gap: 4,
              }}
            >
              <Text style={[s.body, { fontWeight: "700", color: on ? C.primary : C.text }]}>{p.label}</Text>
              <Text style={s.hint}>{p.description}</Text>
            </Pressable>
          );
        })}
        <Text style={s.hint}>
          Fixes are only recorded when you move at least the given distance, and are delivered to the app in batches
          to save battery. Changing the preset restarts recording.
        </Text>
      </Card>

      <Card title="Keep it running">
        {Platform.OS === "android" ? (
          <>
            <Text style={s.body}>
              Android&apos;s battery optimisation can stop or delay background apps. For an always-on collector, let
              Matka run unrestricted. Some phones (Samsung, Xiaomi, Huawei, OnePlus…) have an extra vendor setting —
              see dontkillmyapp.com.
            </Text>
            <Row
              label="Battery optimisation"
              value={state?.batteryOptimized == null ? "unknown" : state.batteryOptimized ? "on (restricted)" : "off"}
              tone={state?.batteryOptimized ? "warn" : "ok"}
            />
            <Button title="Disable battery optimisation" kind="ghost" onPress={requestIgnoreBatteryOptimizations} />
          </>
        ) : (
          <Text style={s.body}>
            Set Location to &quot;Always&quot; with Precise Location on, and keep Background App Refresh enabled.
          </Text>
        )}
        <Button title="Open app settings" kind="ghost" onPress={openAppSettings} />
      </Card>

      <Card title="Pairing">
        {state?.pairing ? (
          <>
            <Row label="Server" value={displayServer(state.pairing.server)} />
            <Row label="Device" value={state.server?.device ?? "—"} />
            <Button title="Pair again" kind="ghost" onPress={onPair} />
            <Button title="Unpair" kind="danger" onPress={unpair} />
          </>
        ) : (
          <Button title="Pair with server" onPress={onPair} />
        )}
      </Card>

      <Card title="Queue">
        <Row label="Queued points" value={count(state?.queued)} />
        <Text style={s.hint}>
          Points are stored on the phone until the server confirms them. Beyond {count(db.QUEUE_CAP)} queued points the
          oldest are discarded.
        </Text>
        <Button title="Delete queued points" kind="ghost" onPress={clearQueue} disabled={!state?.queued} />
      </Card>

      <Text style={[s.hint, { textAlign: "center" }]}>
        Matka {Application.nativeApplicationVersion ?? "?"} ({Application.nativeBuildVersion ?? "?"}) · {Platform.OS}
      </Text>
    </ScrollView>
  );
}
