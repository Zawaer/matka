// The web map in a WebView, logged in with an embed ticket (docs/API.md →
// "Map in a WebView"). The device token never goes into a URL or the WebView:
// the app trades it for a one-minute ticket URL, the server swaps that for a
// 12 h httpOnly cookie, and we renew the session after 11 h, when the page
// shows "Session expired", or on a top-level 401.

import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, AppState, Linking, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import type {
  ShouldStartLoadRequest,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewOpenWindowEvent,
} from "react-native-webview/lib/WebViewTypes";
import {
  INJECTED_JS,
  TICKET_RENEW_MS,
  canAutoRenew,
  decideNavigation,
  pageMessageExpired,
  renewDelay,
  sameOrigin,
} from "../embed-logic";
import { C } from "../theme";
import { Button, s as ui } from "../ui/components";
import { PairingLost, useSession } from "../ui/session";
import { getEmbedTicket } from "../viewer";

type Phase = { kind: "ticket" } | { kind: "web"; url: string; at: number; n: number } | { kind: "error"; error: string };

export default function MapScreen() {
  const { pairing, authLost, onUnauthorized } = useSession();
  const server = pairing.server;
  const [phase, setPhase] = useState<Phase>({ kind: "ticket" });
  const [loading, setLoading] = useState(true);
  const lastAutoRenew = useRef<number | null>(null);
  const seq = useRef(0);
  const web = useRef<ComponentRef<typeof WebView>>(null);

  /** Gets a fresh ticket and (re)loads the WebView with it. */
  const renew = useCallback(
    async (auto: boolean) => {
      const now = Date.now();
      if (auto) {
        if (!canAutoRenew(lastAutoRenew.current, now)) {
          setPhase({ kind: "error", error: "The map session keeps expiring. Try again in a moment." });
          return;
        }
        lastAutoRenew.current = now;
      }
      const n = ++seq.current;
      setPhase({ kind: "ticket" });
      setLoading(true);
      const r = await getEmbedTicket(pairing);
      if (n !== seq.current) return;
      if (!r.ok) {
        if (r.unauthorized) onUnauthorized();
        setPhase({ kind: "error", error: r.error });
        return;
      }
      setPhase({ kind: "web", url: r.data, at: Date.now(), n });
    },
    [pairing, onUnauthorized],
  );

  // First ticket on mount (and again after re-pairing); deferred a tick so the
  // effect itself doesn't set state.
  useEffect(() => {
    if (authLost) return;
    const id = setTimeout(() => renew(false), 0);
    return () => clearTimeout(id);
  }, [renew, authLost]);

  // Renew before the 12 h cookie runs out: a timer while the app runs, and a
  // check on every return to the foreground (timers don't run in background).
  const at = phase.kind === "web" ? phase.at : null;
  useEffect(() => {
    if (at == null) return;
    const id = setTimeout(() => renew(false), renewDelay(at, Date.now()));
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active" && Date.now() - at >= TICKET_RENEW_MS) renew(false);
    });
    return () => {
      clearTimeout(id);
      sub.remove();
    };
  }, [at, renew]);

  const onShouldStart = useCallback(
    (req: ShouldStartLoadRequest) => {
      const d = decideNavigation(req.url, server);
      if (d === "allow") return true;
      // Only user-visible top-level navigations go to the browser; a stray
      // cross-origin iframe is just blocked.
      if (d === "external" && req.isTopFrame !== false) Linking.openURL(req.url).catch(() => {});
      return false;
    },
    [server],
  );

  const onOpenWindow = useCallback(
    (e: WebViewOpenWindowEvent) => {
      const url = e.nativeEvent.targetUrl;
      const d = decideNavigation(url, server);
      if (d === "allow") web.current?.injectJavaScript(`window.location.assign(${JSON.stringify(url)}); true;`);
      else if (d === "external") Linking.openURL(url).catch(() => {});
    },
    [server],
  );

  const onHttpError = useCallback(
    (e: WebViewHttpErrorEvent) => {
      // The ticket was used too late (401 from /embed/start) or the cookie died.
      if (e.nativeEvent.statusCode === 401 && sameOrigin(e.nativeEvent.url, server)) renew(true);
    },
    [server, renew],
  );

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      if (sameOrigin(e.nativeEvent.url, server) && pageMessageExpired(e.nativeEvent.data)) renew(true);
    },
    [server, renew],
  );

  if (authLost) {
    return (
      <View style={[st.fill, { padding: 20 }]}>
        <PairingLost />
      </View>
    );
  }

  return (
    <View style={st.fill}>
      {phase.kind === "web" ? (
        <WebView
          ref={web}
          key={phase.n}
          source={{ uri: phase.url }}
          style={st.fill}
          originWhitelist={["*"]} // every navigation goes through onShouldStart (the default would open other schemes itself)
          onShouldStartLoadWithRequest={onShouldStart}
          onOpenWindow={onOpenWindow}
          onHttpError={onHttpError}
          onMessage={onMessage}
          injectedJavaScript={INJECTED_JS}
          onLoadEnd={() => setLoading(false)}
          onError={(e) => {
            setLoading(false);
            setPhase({ kind: "error", error: `Couldn't load the map: ${e.nativeEvent.description}` });
          }}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess={false}
          allowsLinkPreview={false}
          mixedContentMode="never"
          webviewDebuggingEnabled={__DEV__}
        />
      ) : null}
      {phase.kind === "error" ? (
        <View style={[st.overlay, { padding: 24, gap: 14 }]}>
          <Text style={[ui.body, { color: C.muted, textAlign: "center" }]}>{phase.error}</Text>
          <Button title="Try again" kind="ghost" onPress={() => renew(false)} />
        </View>
      ) : loading ? (
        <View style={st.overlay}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.bg },
  overlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bg,
  },
});
