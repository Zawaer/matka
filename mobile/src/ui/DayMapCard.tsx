// The Timeline's day map: the server's /embed/day page in a WebView, logged
// in with an embed ticket like the Map tab (docs/API.md → "Map in a WebView").
// One page load per session: later days and row taps go to the page through
// window.matkaDay, and taps on the map come back as "matka-day" messages.
// Collapsible (remembered in kv); when the page can't be shown it shrinks to
// a one-line "Map unavailable" and the list carries on without it.
//
// Speed (docs/redesign/daymap-perf.md): the card mounts with the Timeline
// (which App.tsx mounts early, hidden), asks for its ticket while the
// timeline itself loads, and until the page says the map is on screen it
// shows a sketch of the day's lines drawn here from the timeline, framed like
// the map, which then fades in over it.

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Animated, AppState, Linking, Pressable, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { WebView } from "react-native-webview";
import type {
  ShouldStartLoadRequest,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewNavigationEvent,
} from "react-native-webview/lib/WebViewTypes";
import * as db from "../db";
import { daySketch, svgPath } from "../day-sketch";
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
import { getEmbedTicket, type TimelineItem } from "../viewer";
import { Icon } from "./Icon";
import { useSession } from "./session";
import { Text } from "./Text";

export const DAY_MAP_COLLAPSED_KEY = "timeline_map_collapsed";
/** About 40% of a phone screen under the app bar. */
export const MAP_HEIGHT = 300;
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
  items,
  visible,
  selected,
  onSelect,
}: {
  /** The day the list shows (YYYY-MM-DD); null until the timeline has answered (the page then opens on the latest day). */
  date: string | null;
  /** The day's rows, for the sketch shown until the map is on screen; null while loading. */
  items: TimelineItem[] | null;
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
  // The page will say "drawn" once the map is on screen; older pages only say "day".
  const saysDrawn = useRef(false);
  const [fade] = useState(() => new Animated.Value(1));
  const [covered, setCovered] = useState(true); // the cover is (still) there
  const [width, setWidth] = useState(0);
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
      saysDrawn.current = false;
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

  // Load when expanded (straight away, alongside the timeline's own request),
  // and again after re-pairing or a theme flip; deferred a tick so the effect
  // itself doesn't set state.
  useEffect(() => {
    if (collapsed !== false || authLost) return;
    const id = setTimeout(() => renew(false), 0);
    return () => clearTimeout(id);
  }, [collapsed, authLost, renew]);

  // The map fades in over the sketch once it's drawn; a reload covers it again.
  useEffect(() => {
    if (!shown) {
      fade.setValue(1);
      const id = setTimeout(() => setCovered(true), 0);
      return () => clearTimeout(id);
    }
    const anim = Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true });
    anim.start(({ finished }) => finished && setCovered(false));
    return () => anim.stop();
  }, [shown, fade]);

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
          saysDrawn.current = m.drawn;
          if (dateRef.current) inject(setDayJs(dateRef.current));
          if (selRef.current?.from === "list") inject(selectDayJs(selRef.current.key));
          break;
        case "day":
          if (!saysDrawn.current) setShown(true);
          break;
        case "drawn":
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
      saysDrawn.current = false;
      setShown(false);
      setPhase({ kind: "idle" });
    }
  };

  const s = useStyles((th) => ({
    // Full-bleed: edge to edge under the app bar, no card, no header row.
    bleed: { marginHorizontal: -th.layout.gutter, marginTop: -th.space.sm },
    bar: { flexDirection: "row", alignItems: "center", gap: th.space.sm, height: 48, paddingHorizontal: th.space.xs },
    frame: { height: MAP_HEIGHT, backgroundColor: th.c.surfaceAlt },
    cover: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: th.c.surfaceAlt, alignItems: "center", justifyContent: "center" },
    hide: {
      position: "absolute",
      top: th.space.sm,
      right: th.space.sm,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: th.c.surface,
      boxShadow: th.elev.overlay === "0 0 0 rgba(0,0,0,0)" ? undefined : "0 1px 3px rgba(16,16,24,0.18)",
    },
  }));

  // The day's lines, framed like the map (the card is full-bleed: the screen's width).
  const sketch = useMemo(() => (items && width > 0 ? daySketch(items, width, MAP_HEIGHT) : null), [items, width]);

  if (collapsed == null || authLost || (collapsed && !date)) return null;

  const failed = phase.kind === "failed";
  if (collapsed || failed) {
    // A one-line row: show the map again, or say it can't be shown.
    return (
      <Pressable
        onPress={failed ? () => renew(false) : toggle}
        accessibilityRole="button"
        accessibilityLabel={failed ? "Map unavailable. Try again" : "Show the day's map"}
        style={({ pressed }) => [s.bar, visible ? null : { display: "none" }, pressed ? { opacity: 0.7 } : null]}
      >
        <Icon name={failed ? "noLocation" : "tabMap"} size={16} color={failed ? t.c.textMuted : t.c.primary} />
        <Text variant="label" color={failed ? "textSecondary" : "primary"}>
          {failed ? "Map unavailable · Try again" : "Show the day's map"}
        </Text>
      </Pressable>
    );
  }
  return (
    <View style={[s.bleed, visible ? null : { display: "none" }]}>
      <View style={s.frame} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {phase.kind === "web" ? (
          <WebView
            ref={web}
            key={phase.n}
            source={{ uri: phase.url }}
            style={{ flex: 1, backgroundColor: t.c.surfaceAlt }}
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
            // The defaults, spelled out: the page's scripts, worker, style,
            // sprites, glyphs and tiles come from the HTTP cache next time.
            cacheEnabled
            cacheMode="LOAD_DEFAULT"
          />
        ) : null}
        {covered ? (
          <Animated.View style={[s.cover, { opacity: fade }]} pointerEvents="none">
            {sketch ? (
              <Svg width={width} height={MAP_HEIGHT} accessible={false}>
                {sketch.lines.map((l) => (
                  <Path key={`c${l.key}`} d={svgPath(l.points)} stroke={t.c.surface} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                ))}
                {sketch.lines.map((l) => (
                  <Path
                    key={l.key}
                    d={svgPath(l.points)}
                    stroke={t.mode(l.mode)}
                    strokeWidth={l.added ? 3 : 4}
                    strokeDasharray={l.added ? [6, 4.5] : undefined}
                    strokeLinecap={l.added ? "butt" : "round"}
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
                {sketch.stops.map((st) => (
                  <Circle key={st.key} cx={st.x} cy={st.y} r={6} fill={t.c.surface} stroke={t.c.textSecondary} strokeWidth={2} />
                ))}
              </Svg>
            ) : (
              <Icon name="tabMap" size={24} color={t.c.textMuted} />
            )}
          </Animated.View>
        ) : null}
        <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel="Hide the day's map" hitSlop={4} style={({ pressed }) => [s.hide, pressed ? { opacity: 0.7 } : null]}>
          <Icon name="collapse" size={20} color={t.c.text} />
        </Pressable>
      </View>
    </View>
  );
}
