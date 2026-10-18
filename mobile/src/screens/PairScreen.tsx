import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { getStatus } from "../api";
import { savePairing } from "../credentials";
import * as db from "../db";
import { useStyles, useTheme } from "../design/theme";
import { displayServer, parsePairingUrl, validatePairing, type Pairing } from "../pairing";
import { Button, Icon, PingRings } from "../ui";
import { Banner, Field, Panel } from "../ui/components";
import { Screen, ScreenHeader } from "../ui/Screen";
import { Text } from "../ui/Text";
import { resetUploadState, uploadNow } from "../uploader";

type Props = {
  /** A matka://pair link from a deep link, to confirm. */
  initialLink: string | null;
  currentServer: string | null;
  onDone: () => void;
  onCancel: () => void;
};

export default function PairScreen({ initialLink, currentServer, onDone, onCancel }: Props) {
  const t = useTheme();
  // App remounts this screen (key) for every new deep link, so the link only
  // needs to be read once, here.
  const [initial] = useState(() => (initialLink ? parsePairingUrl(initialLink) : null));
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [candidate, setCandidate] = useState<Pairing | null>(initial?.ok ? initial.value : null);
  const [error, setError] = useState<string | null>(initial && !initial.ok ? initial.error : null);
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState("");
  const [token, setToken] = useState("");

  const s = useStyles((th) => ({
    tabs: { flexDirection: "row", gap: th.space.xs, backgroundColor: th.c.surfaceAlt, borderRadius: th.radius.pill, padding: th.space.xs },
    tab: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: th.space.sm + 2, borderRadius: th.radius.pill },
    tabOn: { backgroundColor: th.c.surface, boxShadow: th.elev.e1 },
  }));

  const fromManual = () => {
    // Accept a whole pasted matka://pair link in the server field too.
    const r = server.trim().toLowerCase().startsWith("matka://")
      ? parsePairingUrl(server)
      : validatePairing(server, token);
    if (r.ok) {
      setCandidate(r.value);
      setError(null);
    } else {
      setError(r.error);
    }
  };

  const confirm = async () => {
    if (!candidate) return;
    setBusy(true);
    setError(null);
    try {
      const r = await getStatus(candidate);
      if (!r.ok) {
        setError(
          r.unauthorized
            ? "The server rejected this token. It may have been revoked — create a new pairing on the Devices page."
            : r.error,
        );
        return;
      }
      await savePairing(candidate);
      await resetUploadState();
      await db.setKv("server_status", JSON.stringify(r.status));
      await db.setNum("server_status_at", Date.now());
      uploadNow("foreground").catch(() => {});
      onDone();
    } catch (e) {
      setError(`Couldn't save the pairing: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (candidate) {
    const switching = currentServer != null && currentServer !== candidate.server;
    return (
      <Screen>
        <ScreenHeader title="Pair device" subtitle="Check the server before you continue" />
        <Panel title="Confirm server">
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.sm }}>
            <Icon name={candidate.server.startsWith("https://") ? "lock-outline" : "lock-open-alert-outline"} size={20} color={t.c.primary} />
            <Text variant="title3" style={{ flex: 1 }}>
              {displayServer(candidate.server)}
            </Text>
          </View>
          <Text variant="callout" color="textSecondary">
            Only continue if this is your own Matka server. Every location point recorded on this phone will be sent
            there.
          </Text>
          {candidate.server.startsWith("http://") ? (
            <Banner tone="warn" message="This is an unencrypted development URL. Release builds block plain HTTP." />
          ) : null}
          {switching ? (
            <Banner
              tone="warn"
              message={`This replaces the current pairing with ${displayServer(currentServer)}. Points still queued on the phone will be uploaded to the new server.`}
            />
          ) : null}
        </Panel>
        {error ? <Banner tone="bad" message={error} /> : null}
        <Button label="Verify and pair" icon="check" onPress={confirm} busy={busy} />
        <Button
          label="Back"
          variant="secondary"
          onPress={() => {
            setCandidate(null);
            setError(null);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Pair device" subtitle="In the Matka web app open Devices → Pair a device, then scan the QR code it shows." />

      <View style={s.tabs} accessibilityRole="tablist">
        {(["scan", "manual"] as const).map((m) => {
          const on = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => {
                setMode(m);
                setError(null);
              }}
              style={[s.tab, on && s.tabOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Icon name={m === "scan" ? "qrcode-scan" : "keyboard-outline"} size={18} color={on ? t.c.primary : t.c.textMuted} />
              <Text variant="callout" style={{ fontWeight: "700", color: on ? t.c.text : t.c.textMuted }}>
                {m === "scan" ? "Scan QR" : "Enter manually"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === "scan" ? (
        <Scanner
          onScan={(data) => {
            const r = parsePairingUrl(data);
            if (r.ok) {
              setCandidate(r.value);
              setError(null);
              return true;
            }
            setError(r.error);
            return false;
          }}
        />
      ) : (
        <Panel>
          <Text variant="caption" color="textSecondary" style={{ fontWeight: "700" }}>
            Server URL
          </Text>
          <Field
            value={server}
            onChangeText={setServer}
            placeholder="https://matka.example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
          />
          <Text variant="caption" color="textSecondary" style={{ fontWeight: "700" }}>
            Device token
          </Text>
          <Field
            value={token}
            onChangeText={setToken}
            placeholder="mtk_…"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text variant="caption" color="textMuted">
            You can also paste the whole matka://pair?… link into the server field.
          </Text>
          <Button label="Continue" onPress={fromManual} />
        </Panel>
      )}

      {error ? <Banner tone="bad" message={error} /> : null}
      <Button label="Cancel" variant="secondary" onPress={onCancel} />
    </Screen>
  );
}

function Scanner({ onScan }: { onScan: (data: string) => boolean }) {
  const t = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  // Barcode callbacks fire many times per second; handle one at a time and
  // ignore repeats of a code we already rejected.
  const lastRejected = useRef<string | null>(null);
  const done = useRef(false);
  const s = useStyles((th) => ({
    camera: {
      aspectRatio: 1,
      width: "100%",
      borderRadius: th.radius.xl,
      overflow: "hidden",
      backgroundColor: "#000",
      borderWidth: 1,
      borderColor: th.c.border,
    },
  }));

  if (!permission) return <View style={s.camera} />;
  if (!permission.granted) {
    return (
      <Panel style={{ alignItems: "center" }}>
        <PingRings size={110} color={t.c.primary}>
          <Icon name="camera-outline" size={30} color={t.c.primary} />
        </PingRings>
        <Text variant="callout" color="textSecondary" style={{ textAlign: "center" }}>
          Matka needs the camera only to read the pairing QR code.
        </Text>
        {permission.canAskAgain ? (
          <Button label="Allow camera" icon="camera-outline" onPress={requestPermission} />
        ) : (
          <Text variant="caption" color="textMuted" style={{ textAlign: "center" }}>
            Camera access was denied. Enable it in system settings, or enter the code manually.
          </Text>
        )}
      </Panel>
    );
  }

  const handle = ({ data }: BarcodeScanningResult) => {
    if (done.current || data === lastRejected.current) return;
    if (onScan(data)) done.current = true;
    else lastRejected.current = data;
  };

  return (
    <View style={s.camera}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={handle}
      />
    </View>
  );
}
