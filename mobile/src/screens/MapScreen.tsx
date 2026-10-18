import { useCallback, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { useStyles, useTheme } from "../design/theme";
import { API_BASE } from "../api";
import { Button, Icon, PingRings } from "../ui";
import { Text } from "../ui/Text";

/**
 * The map is the web app's /map page (MapLibre) in embed mode. It sits in a framed
 * card like every other surface, and gets the app's light/dark choice so the
 * basemap, toggles and legend always match the rest of the UI.
 */
export default function MapScreen() {
  const t = useTheme();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState("loading");
    setAttempt((n) => n + 1);
  }, []);

  const s = useStyles((th) => ({
    root: { flex: 1, backgroundColor: th.c.bg, paddingHorizontal: th.space.md, paddingTop: th.space.md, paddingBottom: th.space.md },
    frame: { flex: 1, borderRadius: th.radius.xl, overflow: "hidden", borderWidth: 1, borderColor: th.c.border, backgroundColor: th.c.surface, boxShadow: th.elev.e2 },
    overlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center", backgroundColor: th.c.surface, gap: th.space.sm, padding: th.space.xxl },
  }));

  return (
    <View style={s.root}>
      <View style={s.frame}>
        <WebView
          key={`${t.scheme}-${attempt}`}
          source={{ uri: `${API_BASE}/map?embed=1&theme=${t.scheme}` }}
          style={{ flex: 1, backgroundColor: t.c.surface }}
          onLoadEnd={() => setState((p) => (p === "error" ? p : "ready"))}
          onError={() => setState("error")}
          onHttpError={() => setState("error")}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          overScrollMode="never"
        />
        {state === "loading" && (
          <View style={s.overlay} pointerEvents="none">
            <PingRings size={120} color={t.c.primary}>
              <Icon name="map-marker-path" size={32} color={t.c.primary} />
            </PingRings>
            <Text variant="callout" color="textSecondary">
              Drawing your journeys…
            </Text>
          </View>
        )}
        {state === "error" && (
          <View style={s.overlay}>
            <Icon name="map-search-outline" size={40} color={t.c.textMuted} />
            <Text variant="title3">The map didn&apos;t load</Text>
            <Text variant="callout" color="textSecondary" style={{ textAlign: "center", marginBottom: 8 }}>
              Check your connection and try again.
            </Text>
            <Button label="Try again" icon="refresh" onPress={retry} />
          </View>
        )}
      </View>
    </View>
  );
}
