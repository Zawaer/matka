import { CameraView, useCameraPermissions, type BarcodeSettings, type ScanningResult } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { getStatus } from "../api";
import { savePairing } from "../credentials";
import * as db from "../db";
import { useStyles, useTheme } from "../design/theme";
import { displayServer, isPairingLink, parsePairingUrl, validatePairing, type Pairing } from "../pairing";
import { Banner, Button, Card, EmptyState, Field, IconTile, Segmented } from "../ui";
import { Screen, ScreenHeader } from "../ui/Screen";
import { Text } from "../ui/Text";
import { resetUploadState, uploadNow } from "../uploader";

type Props = {
  /** A pairing link (matka://pair?… or https://…/pair#…) from a deep link, to confirm. */
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

  const fromManual = () => {
    // Accept a whole pasted pairing link (either form) in either field too.
    const pasted = [server, token].find((v) => isPairingLink(v) || /^matka:\/\//i.test(v.trim()));
    const r = pasted ? parsePairingUrl(pasted) : validatePairing(server, token);
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
      <Screen appBar={<ScreenHeader title="Pair this phone" />}>
        <Text variant="body" color="textSecondary">
          Check the server before you continue.
        </Text>
        <Card style={{ gap: t.space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.md }}>
            <IconTile
              icon={candidate.server.startsWith("https://") ? "secure" : "insecure"}
              tone={candidate.server.startsWith("https://") ? "neutral" : "warning"}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="callout" color="textSecondary">
                Server
              </Text>
              <Text variant="headline">{displayServer(candidate.server)}</Text>
            </View>
          </View>
          <Text variant="callout" color="textSecondary">
            Only continue if this is your own Matka server. Every location point recorded on this phone will be sent there.
          </Text>
        </Card>
        {candidate.server.startsWith("http://") ? (
          <Banner tone="warning" message="This is an unencrypted development address. Release builds block plain HTTP." />
        ) : null}
        {switching ? (
          <Banner
            tone="warning"
            message={`This replaces the current pairing with ${displayServer(currentServer)}. Points still queued on the phone will be uploaded to the new server.`}
          />
        ) : null}
        {error ? <Banner tone="danger" message={error} /> : null}
        <Button label="Verify and pair" icon="check" onPress={confirm} busy={busy} />
        <Button
          label="Back"
          variant="ghost"
          onPress={() => {
            setCandidate(null);
            setError(null);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen appBar={<ScreenHeader title="Pair this phone" />}>
      <View style={{ gap: t.space.sm }}>
        {["In the Matka web app, open Devices → Pair a device.", mode === "manual" ? "Copy the server address and token it shows." : "Scan the QR code it shows."].map((step, i) => (
          <View key={i} style={{ flexDirection: "row", gap: t.space.md, alignItems: "flex-start" }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.c.surfaceAlt, alignItems: "center", justifyContent: "center", marginTop: -1 }}>
              <Text variant="label" color="textSecondary" tabular>
                {i + 1}
              </Text>
            </View>
            <Text variant="body" style={{ flex: 1 }}>
              {step}
            </Text>
          </View>
        ))}
      </View>

      <Segmented
        role="tablist"
        label="How to pair"
        options={[
          { value: "scan", label: "Scan QR", icon: "qr" },
          { value: "manual", label: "Enter manually", icon: "keyboard" },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
      />

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
        <Card style={{ gap: t.space.sm }}>
          <Text variant="label" color="textSecondary">
            Server address
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
          <Text variant="label" color="textSecondary" style={{ marginTop: t.space.sm }}>
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
            You can also paste the pairing link here.
          </Text>
          <View style={{ marginTop: t.space.sm }}>
            <Button label="Continue" onPress={fromManual} />
          </View>
        </Card>
      )}

      {error ? <Banner tone="danger" message={error} /> : null}
      <Button label="Not now" variant="ghost" onPress={onCancel} />
    </Screen>
  );
}

// Stable identity: a new object every render would be re-sent to the native view.
const QR_ONLY: BarcodeSettings = { barcodeTypes: ["qr"] };

function Scanner({ onScan }: { onScan: (data: string) => boolean }) {
  const [permission, requestPermission] = useCameraPermissions();
  // Barcode callbacks fire many times per second; handle one at a time and
  // ignore repeats of a code we already rejected.
  const lastRejected = useRef<string | null>(null);
  const done = useRef(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const s = useStyles((th) => ({
    camera: {
      aspectRatio: 1,
      width: "100%",
      borderRadius: th.radius.md,
      overflow: "hidden",
      backgroundColor: "#000",
      borderWidth: 1,
      borderColor: th.c.border,
    },
  }));

  // `data` is ML Kit's display value, which for some content types is a
  // reformatted or shortened version of what the code holds; `raw` (Android)
  // is the exact payload. Prefer the raw text, fall back to data.
  const handle = ({ data, raw }: ScanningResult) => {
    if (done.current) return;
    const value = (raw || data || "").trim();
    if (!value || value === lastRejected.current) return;
    let ok = onScan(value);
    if (!ok && data && data.trim() !== value) ok = onScan(data.trim());
    if (ok) done.current = true;
    else lastRejected.current = value;
  };
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  });

  // The system scanner (Google code scanner on Android, VisionKit on iOS) is
  // a separate full-screen UI with its own focus and zoom handling. It reports
  // through a module-level event, not the CameraView callback.
  const modern = CameraView.isModernBarcodeScannerAvailable;
  useEffect(() => {
    if (!modern) return;
    const sub = CameraView.onModernBarcodeScanned((r) => handleRef.current(r));
    return () => sub.remove();
  }, [modern]);

  const launchSystemScanner = () => {
    setScannerError(null);
    lastRejected.current = null;
    CameraView.launchScanner(QR_ONLY).catch((e: unknown) =>
      setScannerError(`Couldn't open the system scanner: ${e instanceof Error ? e.message : String(e)}`),
    );
  };
  const systemScanner = modern ? (
    <>
      <Button label="Use the system scanner" icon="qr" variant="secondary" onPress={launchSystemScanner} />
      {scannerError ? <Banner tone="danger" message={scannerError} /> : null}
    </>
  ) : null;

  if (!permission) return <View style={s.camera} />;
  if (!permission.granted) {
    return (
      <>
        <Card>
          <EmptyState
            icon="camera"
            title="Scan the pairing code"
            body={
              permission.canAskAgain
                ? "Matka uses the camera only to read the QR code."
                : "Camera access was denied. Allow it in system settings, or enter the details manually."
            }
            action={permission.canAskAgain ? <Button label="Allow camera" icon="camera" onPress={requestPermission} /> : undefined}
          />
        </Card>
        {systemScanner}
      </>
    );
  }

  return (
    <>
      <View style={s.camera}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={QR_ONLY}
          onBarcodeScanned={handle}
        />
      </View>
      {systemScanner}
    </>
  );
}
