// The Timeline's day map: the server's /embed/day page in a WebView, logged
// in with an embed ticket like the Map tab (docs/API.md → "Map in a WebView").
// One page load per session: later days and row taps go to the page through
// window.matkaDay, and taps on the map come back as "matka-day" messages.
// Collapsible (remembered in kv); when the page can't be shown it shrinks to
// a one-line "Map unavailable" and the list carries on without it.

import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { AppState, Linking, Pressable, View } from "react-native";
import { WebView } from "react-native-webview";
import type {
  ShouldStartLoadRequest,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewNavigationEvent,
} from "react-native-webview/lib/WebViewTypes";
import * as db from "../db";
import { useStyles, useTheme } from "../design/theme";
import {
  INJECTED_JS,
  TICKET_RENEW_MS,
  canAutoRenew,
  dayEmbedUrl,
  decideNavigation,
  isDayPage,
  pageMessageExpired,
  parseDayMessage,
  renewDelay,
  sameOrigin,
  selectDayJs,
  setDayJs,
} from "../embed-logic";
import { getEmbedTicket } from "../viewer";
import { Icon } from "./Icon";
import { useSession } from "./session";
import { Text } from "./Text";

export const DAY_MAP_COLLAPSED_KEY = "timeline_map_collapsed";
const MAP_HEIGHT = 240;
/** The page must say hello within this long, or we give up on it. */
const READY_TIMEOUT_MS = 20_000;

export type DayMapSelection = { key: string; from: "list" | "map" } | null;

type Phase =
  | { kind: "idle" }
  | { kind: "ticket" }
  | { kind: "web"; url: string; at: number; n: number }
  | { kind: "failed" };

export function DayMapCard({
  date,
  visible,
  selected,
  onSelect,
}: {
  /** The day the list shows (YYYY-MM-DD). */
  date: string | null;
  /** The day has something to draw; otherwise the card hides (the page stays loaded). */
  visible: boolean;
  selected: DayMapSelection;
  /** A stop or a line was tapped on the map. */
  onSelect: (key: string) => void;
}) {
  const t = useTheme();
  const scheme = t.scheme;
  const { pairing, authLost, onUnauthorized } = useSession();
  const server = pairing.server;
  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [shown, setShown] = useState(false); // the page has drawn a day
  const web = useRef<ComponentRef<typeof WebView>>(null);
  const seq = useRef(0);
  const lastAutoRenew = useRef<number | null>(null);
  const ready = useRef(false);
  const dateRef = useRef(date);
  const selRef = useRef(selected);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    let live = true;
    db.getKv(DAY_MAP_COLLAPSED_KEY).then(
      (v) => live && setCollapsed(v === "1"),
      () => live && setCollapsed(false),
    );
    return () => {
      live = false;
    };
  }, []);

  const inject = (js: string) => web.current?.injectJavaScript(js);

  /** Gets a ticket and (re)loads the page with it. */
  const renew = useCallback(
    async (auto: boolean) => {
      const now = Date.now();
      if (auto) {
        if (!canAutoRenew(lastAutoRenew.current, now)) {
          setPhase({ kind: "failed" });
          return;
        }
        lastAutoRenew.current = now;
      }
      const n = ++seq.current;
      ready.current = false;
      setShown(false);
      setPhase({ kind: "ticket" });
      const r = await getEmbedTicket(pairing);
      if (n !== seq.current) return;
      if (!r.ok) {
        if (r.unauthorized) onUnauthorized();
        setPhase({ kind: "failed" });
        return;
      }
      setPhase({ kind: "web", url: dayEmbedUrl(r.data, dateRef.current, scheme), at: Date.now(), n });
    },
    [pairing, onUnauthorized, scheme],
  );

  // Load when expanded with a day to show, and again after re-pairing or a
  // theme flip; deferred a tick so the effect itself doesn't set state.
  const hasDate = date != null;
  useEffect(() => {
    if (collapsed !== false || !hasDate || authLost) return;
    const id = setTimeout(() => renew(false), 0);
    return () => clearTimeout(id);
  }, [collapsed, hasDate, authLost, renew]);

  // Renew before the 12 h cookie runs out (see MapScreen).
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

  // A page that never answers (an older server, a broken load) gives way to the list.
  const n = phase.kind === "web" ? phase.n : null;
  useEffect(() => {
    if (n == null) return;
    const id = setTimeout(() => {
      if (!ready.current && n === seq.current) setPhase({ kind: "failed" });
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [n]);

  // Day changes and row taps go to the loaded page.
  useEffect(() => {
    dateRef.current = date;
    if (ready.current && date) inject(setDayJs(date));
  }, [date]);
  useEffect(() => {
    selRef.current = selected;
    if (ready.current && selected?.from !== "map") inject(selectDayJs(selected?.key ?? null));
  }, [selected]);

  const fail = useCallback(() => {
    ++seq.current;
    ready.current = false;
    setPhase({ kind: "failed" });
  }, []);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      if (!sameOrigin(e.nativeEvent.url, server)) return;
      if (pageMessageExpired(e.nativeEvent.data)) return void renew(true);
      const m = parseDayMessage(e.nativeEvent.data);
      if (!m) return;
      switch (m.event) {
        case "ready":
          ready.current = true;
          if (dateRef.current) inject(setDayJs(dateRef.current));
          if (selRef.current?.from === "list") inject(selectDayJs(selRef.current.key));
          break;
        case "day":
          setShown(true);
          break;
        case "select":
          onSelectRef.current(m.key);
          break;
        case "expired":
          renew(true);
          break;
        case "error":
          fail();
          break;
      }
    },
    [server, renew, fail],
  );

  const onLoadEnd = useCallback(
    (e: WebViewNavigationEvent | WebViewErrorEvent) => {
      // An older server sends every ticket to the full map: not for this card.
      const url = e.nativeEvent.url;
      if (sameOrigin(url, server) && !isDayPage(url) && !/\/embed\/start/.test(url)) fail();
    },
    [server, fail],
  );

  const onHttpError = useCallback(
    (e: WebViewHttpErrorEvent) => {
      if (!sameOrigin(e.nativeEvent.url, server)) return;
      if (e.nativeEvent.statusCode === 401) renew(true);
      else fail();
    },
    [server, renew, fail],
  );

  const onShouldStart = useCallback(
    (req: ShouldStartLoadRequest) => {
      const d = decideNavigation(req.url, server);
      if (d === "allow") return true;
      // The map's credits link out: to the browser, like the Map tab.
      if (d === "external" && req.isTopFrame !== false) Linking.openURL(req.url).catch(() => {});
      return false;
    },
    [server],
  );

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    db.setKv(DAY_MAP_COLLAPSED_KEY, next ? "1" : null).catch(() => {});
    if (next) {
      // Collapsed: drop the page (and its memory); expanding loads it again.
      ++seq.current;
      ready.current = false;
      setShown(false);
      setPhase({ kind: "idle" });
    }
  };

  const s = useStyles((th) => ({
    card: {
      backgroundColor: th.c.surface,
      borderRadius: th.radius.md,
      borderWidth: 1,
      borderColor: th.c.border,
      overflow: "hidden",
    },
    bar: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingHorizontal: th.space.lg, height: 48 },
    frame: { height: MAP_HEIGHT, borderTopWidth: 1, borderTopColor: th.c.border, backgroundColor: th.c.surface },
    cover: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: th.c.surfaceAlt, alignItems: "center", justifyContent: "center" },
  }));

  if (collapsed == null || authLost || !date) return null;

  const failed = phase.kind === "failed";
  return (
    <View style={[s.card, visible ? null : { display: "none" }]}>
      <Pressable
        onPress={failed ? () => renew(false) : toggle}
        accessibilityRole="button"
        accessibilityLabel={failed ? "Map unavailable. Try again" : collapsed ? "Show the day's map" : "Hide the day's map"}
        style={({ pressed }) => [s.bar, pressed ? { backgroundColor: t.c.surfaceAlt } : null]}
      >
        <Icon name={failed ? "noLocation" : "tabMap"} size={16} color={t.c.textSecondary} />
        <Text variant="label" color="textSecondary" style={{ flex: 1 }}>
          {failed ? "Map unavailable" : "Day map"}
        </Text>
        <Text variant="label" color="primary">
          {failed ? "Try again" : collapsed ? "Show" : "Hide"}
        </Text>
        {failed ? null : <Icon name={collapsed ? "expand" : "collapse"} size={16} color={t.c.primary} />}
      </Pressable>
      {collapsed || failed ? null : (
        <View style={s.frame}>
          {phase.kind === "web" ? (
            <WebView
              ref={web}
              key={phase.n}
              source={{ uri: phase.url }}
              style={{ flex: 1, backgroundColor: t.c.surface }}
              originWhitelist={["*"]}
              onShouldStartLoadWithRequest={onShouldStart}
              onMessage={onMessage}
              onLoadEnd={onLoadEnd}
              onHttpError={onHttpError}
              onError={fail}
              injectedJavaScript={INJECTED_JS}
              javaScriptEnabled
              domStorageEnabled
              allowFileAccess={false}
              allowsLinkPreview={false}
              mixedContentMode="never"
              overScrollMode="never"
              // The map takes its own pans and pinches instead of the list scrolling.
              nestedScrollEnabled
              scrollEnabled={false}
              bounces={false}
              setSupportMultipleWindows={false}
              webviewDebuggingEnabled={__DEV__}
            />
          ) : null}
          {shown ? null : (
            <View style={s.cover} pointerEvents="none">
              <Icon name="route" size={24} color={t.c.textMuted} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}
