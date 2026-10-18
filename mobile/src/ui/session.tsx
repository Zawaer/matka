// Shared state for the viewer tabs: the pairing to read with, and what to do
// when the server answers 401.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Pairing } from "../pairing";
import type { ViewerResult } from "../viewer";
import { PairingLostBanner } from "./components";

export type Tab = "overview" | "timeline" | "places" | "map" | "recorder";

export type Session = {
  pairing: Pairing;
  authLost: boolean;
  /** Records the 401 the same way the collector does (uploads pause, "Pairing lost"). */
  onUnauthorized: () => void;
  goPair: () => void;
  goTab: (t: Tab) => void;
};

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionContext");
  return s;
}

/**
 * Loads one viewer resource. Keeps the last good data on a failed reload,
 * reports 401s to the session, and ignores answers that arrive after a newer
 * request was started.
 */
export function useViewerQuery<T>(fetcher: (p: Pairing) => Promise<ViewerResult<T>>) {
  const { pairing, authLost, onUnauthorized } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await fetcher(pairing);
      if (n !== seq.current) return;
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else {
        setError(r.error);
        if (r.unauthorized) onUnauthorized();
      }
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [fetcher, pairing, onUnauthorized]);

  // (Re)load on mount, when the request changes and after re-pairing. Deferred
  // a tick so the effect itself doesn't set state.
  useEffect(() => {
    if (authLost) return;
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load, authLost]);

  return { data, error, loading, reload: load };
}

/** The Recorder's "Pairing lost" banner, for the viewer tabs. */
export function PairingLost() {
  const { goPair } = useSession();
  return <PairingLostBanner onPair={goPair} />;
}
