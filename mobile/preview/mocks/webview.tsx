import { createElement, useEffect } from "react";

// Web stand-in for react-native-webview. With ?map=<origin> (e.g. a local
// `next dev -p 3126` of web/) it is an iframe on that origin instead of the
// homelab deployment; without it, a placeholder so the tab isn't a blank card.
const ORIGIN = typeof location !== "undefined" ? new URLSearchParams(location.search).get("map") : null;

export function WebView(props: { source: { uri: string }; style?: unknown; onLoadEnd?: () => void }) {
  const { onLoadEnd } = props;
  useEffect(() => {
    if (!ORIGIN) onLoadEnd?.();
  }, [onLoadEnd]);
  if (!ORIGIN) {
    return createElement(
      "div",
      {
        style: {
          flex: 1, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "repeating-linear-gradient(45deg, #dfe7ee 0 18px, #e8eef3 18px 36px)", color: "#4a5568",
          font: "14px system-ui, sans-serif", textAlign: "center", padding: 24, boxSizing: "border-box",
        },
      },
      "Map preview: start the web app (next dev -p 3126) and add ?map=http://localhost:3126",
    );
  }
  const url = props.source.uri.replace(/^https?:\/\/[^/]+/, ORIGIN);
  return createElement("iframe", {
    src: url,
    onLoad: onLoadEnd,
    style: { border: 0, width: "100%", height: "100%", flex: 1, background: "transparent" },
  });
}
