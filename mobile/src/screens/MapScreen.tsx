import { View, StyleSheet, ActivityIndicator, Text } from "react-native";
import { WebView } from "react-native-webview";
import { useState } from "react";
import { C } from "../theme";
import { API_BASE } from "../api";

export default function MapScreen() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <WebView
        source={{ uri: `${API_BASE}/map` }}
        style={{ flex: 1, backgroundColor: C.bg }}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setErr(true);
          setLoading(false);
        }}
        // the web /map renders its own full-screen MapLibre canvas
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
      />
      {loading && (
        <View style={st.overlay}>
          <ActivityIndicator color={C.primary} />
        </View>
      )}
      {err && (
        <View style={st.overlay}>
          <Text style={{ color: C.muted }}>Couldn&apos;t load the map.</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0, bottom: 0, left: 0, right: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bg,
  },
});
