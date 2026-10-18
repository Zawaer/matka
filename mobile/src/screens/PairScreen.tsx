import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getStatus } from "../api";
import { savePairing } from "../credentials";
import * as db from "../db";
import { displayServer, parsePairingUrl, validatePairing, type Pairing } from "../pairing";
import { Banner, Button, Card, s } from "../ui/components";
import { C, RADIUS } from "../ui/theme";
import { resetUploadState, uploadNow } from "../uploader";

type Props = {
  /** A matka://pair link from a deep link, to confirm. */
  initialLink: string | null;
  currentServer: string | null;
  onDone: () => void;
  onCancel: () => void;
};

export default function PairScreen({ initialLink, currentServer, onDone, onCancel }: Props) {
  // App remounts this screen (key) for every new deep link, so the link only
  // needs to be read once, here.
  const [initial] = useState(() => (initialLink ? parsePairingUrl(initialLink) : null));
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [candidate, setCandidate] = useState<Pairing | null>(initial?.ok ? initial.value : null);
  const [error, setError] = useState<string | null>(initial && !initial.ok ? initial.error : null);
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState("");
  const [token, setToken] = useState("");

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
      <ScrollView contentContainerStyle={st.pad}>
        <Text style={s.h1}>Pair device</Text>
        <Card title="Confirm server">
          <Text style={[s.body, { fontSize: 18, fontWeight: "700" }]}>{displayServer(candidate.server)}</Text>
          <Text style={s.body}>
            Only continue if this is your own Matka server. Every location point recorded on this phone will be sent
            there.
          </Text>
          {candidate.server.startsWith("http://") ? (
            <Text style={[s.body, { color: C.accent }]}>
              This is an unencrypted development URL. Release builds block plain HTTP.
            </Text>
          ) : null}
          {switching ? (
            <Text style={[s.body, { color: C.accent }]}>
              This replaces the current pairing with {displayServer(currentServer)}. Points still queued on the phone
              will be uploaded to the new server.
            </Text>
          ) : null}
        </Card>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <Button title="Verify and pair" onPress={confirm} busy={busy} />
        <Button
          title="Back"
          kind="ghost"
          onPress={() => {
            setCandidate(null);
            setError(null);
          }}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>Pair device</Text>
      <Text style={s.sub}>
        In the Matka web app open Devices → Pair a device, then scan the QR code it shows.
      </Text>

      <View style={st.tabs}>
        {(["scan", "manual"] as const).map((m) => (
          <Text
            key={m}
            onPress={() => {
              setMode(m);
              setError(null);
            }}
            style={[st.tab, mode === m && st.tabOn]}
            accessibilityRole="button"
          >
            {m === "scan" ? "Scan QR" : "Enter manually"}
          </Text>
        ))}
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
        <Card>
          <Text style={s.label}>Server URL</Text>
          <TextInput
            style={s.input}
            value={server}
            onChangeText={setServer}
            placeholder="https://matka.example.com"
            placeholderTextColor={C.faint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
          />
          <Text style={s.label}>Device token</Text>
          <TextInput
            style={s.input}
            value={token}
            onChangeText={setToken}
            placeholder="mtk_…"
            placeholderTextColor={C.faint}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={s.hint}>You can also paste the whole matka://pair?… link into the server field.</Text>
          <Button title="Continue" onPress={fromManual} />
        </Card>
      )}

      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Button title="Cancel" kind="ghost" onPress={onCancel} />
    </ScrollView>
  );
}

function Scanner({ onScan }: { onScan: (data: string) => boolean }) {
  const [permission, requestPermission] = useCameraPermissions();
  // Barcode callbacks fire many times per second; handle one at a time and
  // ignore repeats of a code we already rejected.
  const lastRejected = useRef<string | null>(null);
  const done = useRef(false);

  if (!permission) return <View style={st.camera} />;
  if (!permission.granted) {
    return (
      <Card>
        <Text style={s.body}>Matka needs the camera only to read the pairing QR code.</Text>
        {permission.canAskAgain ? (
          <Button title="Allow camera" onPress={requestPermission} />
        ) : (
          <Text style={s.hint}>Camera access was denied. Enable it in system settings, or enter the code manually.</Text>
        )}
      </Card>
    );
  }

  const handle = ({ data }: BarcodeScanningResult) => {
    if (done.current || data === lastRejected.current) return;
    if (onScan(data)) done.current = true;
    else lastRejected.current = data;
  };

  return (
    <View style={st.camera}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={handle}
      />
    </View>
  );
}

const st = StyleSheet.create({
  pad: { padding: 20, gap: 14, paddingBottom: 40 },
  tabs: { flexDirection: "row", gap: 8 },
  tab: {
    flex: 1,
    textAlign: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    color: C.muted,
    fontWeight: "600",
    overflow: "hidden",
  },
  tabOn: { backgroundColor: C.surface2, color: C.text, borderColor: C.primaryStrong },
  camera: {
    aspectRatio: 1,
    width: "100%",
    borderRadius: RADIUS,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: C.border,
  },
});
