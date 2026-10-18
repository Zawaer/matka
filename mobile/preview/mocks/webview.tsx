import { createElement } from "react";

// Web stand-in for react-native-webview: an iframe pointed at a local Next dev
// server (PREVIEW_MAP_ORIGIN) instead of the homelab deployment.
const ORIGIN =
  (typeof location !== "undefined" && new URLSearchParams(location.search).get("map")) ||
  "http://localhost:3126";

export function WebView(props: {
  source: { uri: string };
  style?: unknown;
  onLoadEnd?: () => void;
}) {
  const url = props.source.uri.replace(/^https?:\/\/[^/]+/, ORIGIN);
  return createElement("iframe", {
    src: url,
    onLoad: props.onLoadEnd,
    style: { border: 0, width: "100%", height: "100%", flex: 1, background: "transparent" },
  });
}
