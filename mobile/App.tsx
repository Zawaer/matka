import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

// ---- Config -------------------------------------------------------------
// On-device the phone reaches the Mac dev server via `adb reverse tcp:3000 tcp:3000`,
// so localhost:3000 on the phone == the Mac's Matka server. This is Matka's OWN
// ingest endpoint — no Dawarich involved.
const INGEST_URL = "http://localhost:3000/api/ingest";
const TASK = "matka-bg-location";

// ---- Background task (runs even when the app is backgrounded) ------------
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error) {
    console.error("[matka-bg] task error", error);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] })
    ?.locations;
  if (!locations || locations.length === 0) return;

  const points = locations.map((l) => ({
    lat: l.coords.latitude,
    lon: l.coords.longitude,
    ts: Math.floor(l.timestamp / 1000),
    accuracy: l.coords.accuracy ?? null,
    altitude: l.coords.altitude ?? null,
    speed: l.coords.speed ?? null,
  }));

  try {
    await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });
  } catch (e) {
    console.error("[matka-bg] POST failed", e);
  }
});

// ---- UI ------------------------------------------------------------------
export default function App() {
  const [fg, setFg] = useState<string>("—");
  const [bg, setBg] = useState<string>("—");
  const [tracking, setTracking] = useState(false);
  const [lastLoc, setLastLoc] = useState<string>("—");
  const [serverCount, setServerCount] = useState<number | null>(null);
  const [serverLast, setServerLast] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  const refreshServer = useCallback(async () => {
    try {
      const r = await fetch(INGEST_URL);
      const j = await r.json();
      setServerCount(j.points ?? null);
      setServerLast(j.last ?? null);
    } catch {
      setServerCount(null);
      setMsg("Can't reach server — is `adb reverse tcp:3000 tcp:3000` set?");
    }
  }, []);

  useEffect(() => {
    (async () => {
      const f = await Location.getForegroundPermissionsAsync();
      setFg(f.status);
      const b = await Location.getBackgroundPermissionsAsync();
      setBg(b.status);
      const started = await Location.hasStartedLocationUpdatesAsync(TASK).catch(
        () => false,
      );
      setTracking(started);
    })();
    refreshServer();
    const id = setInterval(refreshServer, 5000);
    return () => clearInterval(id);
  }, [refreshServer]);

  const requestPerms = useCallback(async () => {
    setMsg("Requesting foreground permission…");
    const f = await Location.requestForegroundPermissionsAsync();
    setFg(f.status);
    if (f.status !== "granted") {
      setMsg("Foreground permission denied.");
      return false;
    }
    setMsg("Requesting background (Always) permission…");
    const b = await Location.requestBackgroundPermissionsAsync();
    setBg(b.status);
    if (b.status !== "granted") {
      setMsg("Background denied. On Android set Location → 'Allow all the time'.");
      return false;
    }
    setMsg("Permissions granted.");
    return true;
  }, []);

  const start = useCallback(async () => {
    const already =
      (await Location.getBackgroundPermissionsAsync()).status === "granted";
    const ok = already ? true : await requestPerms();
    if (!ok) return;

    try {
      const l = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLastLoc(
        `${l.coords.latitude.toFixed(5)}, ${l.coords.longitude.toFixed(5)} (±${Math.round(
          l.coords.accuracy ?? 0,
        )}m)`,
      );
    } catch {}

    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 3000,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Matka",
        notificationBody: "Collecting your location",
        notificationColor: "#14b8a6",
      },
    });
    setTracking(true);
    setMsg("Tracking started — you can background the app now.");
  }, [requestPerms]);

  const stop = useCallback(async () => {
    const started = await Location.hasStartedLocationUpdatesAsync(TASK).catch(
      () => false,
    );
    if (started) await Location.stopLocationUpdatesAsync(TASK);
    setTracking(false);
    setMsg("Tracking stopped.");
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>Matka</Text>
        <Text style={styles.sub}>background location spike</Text>

        <View style={styles.card}>
          <Row label="Foreground perm" value={fg} />
          <Row label="Background perm" value={bg} />
          <Row
            label="Tracking"
            value={tracking ? "ON" : "off"}
            highlight={tracking}
          />
          <Row label="Last fix (fg)" value={lastLoc} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Server (Matka DB)</Text>
          <Row
            label="Total points"
            value={
              serverCount == null ? "unreachable" : serverCount.toLocaleString()
            }
            highlight={serverCount != null}
          />
          <Row
            label="Last point"
            value={serverLast ? new Date(serverLast).toLocaleTimeString() : "—"}
          />
          <Text style={styles.hint}>POSTing to {INGEST_URL}</Text>
        </View>

        <Pressable
          style={[styles.btn, tracking ? styles.btnStop : styles.btnStart]}
          onPress={tracking ? stop : start}
        >
          <Text style={styles.btnText}>
            {tracking ? "Stop tracking" : "Start tracking"}
          </Text>
        </Pressable>

        <Pressable style={styles.btnGhost} onPress={requestPerms}>
          <Text style={styles.btnGhostText}>Request permissions</Text>
        </Pressable>

        {!!msg && <Text style={styles.msg}>{msg}</Text>}
        <Text style={styles.platform}>{Platform.OS} · dev client</Text>
      </ScrollView>
    </View>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && styles.rowValueHi]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b1020" },
  container: { padding: 24, paddingTop: 72, gap: 16 },
  brand: { color: "#e8edf7", fontSize: 34, fontWeight: "700" },
  sub: { color: "#8b96ad", fontSize: 14, marginTop: -6, marginBottom: 8 },
  card: {
    backgroundColor: "#121829",
    borderColor: "#273149",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  cardTitle: { color: "#8b96ad", fontSize: 13, fontWeight: "600" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { color: "#8b96ad", fontSize: 14 },
  rowValue: { color: "#e8edf7", fontSize: 14, fontWeight: "600" },
  rowValueHi: { color: "#2dd4bf" },
  hint: { color: "#5a6880", fontSize: 11, marginTop: 4 },
  btn: { borderRadius: 14, padding: 18, alignItems: "center", marginTop: 4 },
  btnStart: { backgroundColor: "#14b8a6" },
  btnStop: { backgroundColor: "#ef4444" },
  btnText: { color: "#02110f", fontSize: 17, fontWeight: "700" },
  btnGhost: {
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#273149",
  },
  btnGhostText: { color: "#8b96ad", fontSize: 14, fontWeight: "600" },
  msg: { color: "#fbbf24", fontSize: 13, textAlign: "center" },
  platform: {
    color: "#5a6880",
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
  },
});
