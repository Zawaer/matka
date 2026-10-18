import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import PairScreen from "./src/screens/PairScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import StatusScreen from "./src/screens/StatusScreen";
import { resumeTracking } from "./src/tracking";
import { C } from "./src/ui/theme";
import { useCollectorState } from "./src/ui/useCollectorState";
import { refreshServerStatus, uploadNow } from "./src/uploader";

type Screen = "status" | "pair" | "settings";

const isPairLink = (url: string | null | undefined): url is string => !!url && /^matka:\/\/pair\b/i.test(url);

export default function App() {
  const [screen, setScreen] = useState<Screen>("status");
  const [pairLink, setPairLink] = useState<string | null>(null);
  const { state, refresh } = useCollectorState();

  // Launch + every return to the foreground: make sure tracking runs, flush
  // the queue, refresh the server status.
  const onForeground = useCallback(async () => {
    await resumeTracking().catch(() => null);
    await uploadNow("foreground").catch(() => null);
    await refreshServerStatus().catch(() => null);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    onForeground();
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") onForeground();
    });
    return () => sub.remove();
  }, [onForeground]);

  // matka://pair?server=…&token=… deep links (cold start and while running).
  useEffect(() => {
    const open = (url: string | null | undefined) => {
      if (isPairLink(url)) {
        setPairLink(url);
        setScreen("pair");
      }
    };
    Linking.getInitialURL().then(open).catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => open(url));
    return () => sub.remove();
  }, []);

  const goPair = () => {
    setPairLink(null);
    setScreen("pair");
  };
  const goStatus = () => {
    setPairLink(null);
    setScreen("status");
    refresh();
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["top", "left", "right"]}>
        <StatusBar style="light" />
        {screen === "pair" ? (
          <PairScreen
            initialLink={pairLink}
            currentServer={state?.pairing?.server ?? null}
            onDone={goStatus}
            onCancel={goStatus}
          />
        ) : screen === "settings" ? (
          <SettingsScreen state={state} refresh={refresh} onPair={goPair} onBack={goStatus} />
        ) : (
          <StatusScreen state={state} refresh={refresh} onPair={goPair} onSettings={() => setScreen("settings")} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
