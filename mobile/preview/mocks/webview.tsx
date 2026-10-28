import { createElement, useEffect } from "react";

// Web stand-in for react-native-webview. With ?map=<origin> (e.g. a local
// `next dev -p 3126` of web/) it is an iframe on that origin instead of the
// homelab deployment; without it, a placeholder so the tab isn't a blank card.
const ORIGIN = typeof location !== "undefined" ? new URLSearchParams(location.search).get("map") : null;

type LoadEvent = { nativeEvent: { url: string } };

export function WebView(props: { source: { uri: string }; style?: unknown; onLoadEnd?: (e: LoadEvent) => void }) {
  const { onLoadEnd } = props;
  const uri = props.source.uri;
  useEffect(() => {
    if (!ORIGIN) onLoadEnd?.({ nativeEvent: { url: uri } });
  }, [onLoadEnd, uri]);
  if (!ORIGIN) {
    return createElement(
      "div",
      {
        style: {
          flex: 1, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          // A quiet street-grid stand-in (the real map is the web app's MapLibre page).
          backgroundColor: "#e9ecef",
          backgroundImage: "linear-gradient(#f8f9fa 2px, transparent 2px), linear-gradient(90deg, #f8f9fa 2px, transparent 2px)",
          backgroundSize: "46px 46px", color: "#6b7280",
          font: "14px system-ui, sans-serif", textAlign: "center", padding: 24, boxSizing: "border-box",
        },
      },
      "Map preview: start the web app (next dev -p 3126) and add ?map=http://localhost:3126",
    );
  }
  const url = props.source.uri.replace(/^https?:\/\/[^/]+/, ORIGIN);
  return createElement("iframe", {
    src: url,
    onLoad: () => onLoadEnd?.({ nativeEvent: { url: uri } }),
    style: { border: 0, width: "100%", height: "100%", flex: 1, background: "transparent" },
  });
}
