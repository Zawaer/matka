// Matka API client: the homelab deployment, reached over Tailscale. The
// certificate comes from the homelab's Caddy CA, which the app trusts as a
// user-installed CA (see plugins/withUserCerts.js).
export const API_BASE = "https://matka.lan";

export async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(API_BASE + path, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return (await r.json()) as T;
}

export type Overview = {
  totals: {
    points: number;
    visits: number;
    tracks: number;
    days: number;
    totalKm: number;
    first: string | null;
    last: string | null;
  };
  months: { year: number; month: number; distance: number }[];
  cities: { city: string; count: number }[];
  recent: { id: number; name: string | null; startedAt: string; duration: number | null }[];
};

export type PlaceItem = {
  id: number;
  name: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
  visitCount: number;
  totalTime: number;
  lastVisit: string | null;
};

export type TimelineItem =
  | {
      kind: "visit";
      visit: {
        id: number;
        placeName: string | null;
        name: string | null;
        startedAt: string;
        endedAt: string;
        duration: number | null;
      };
    }
  | {
      kind: "move";
      track: {
        id: number;
        startedAt: string;
        endedAt: string;
        distance: number | null;
        duration: number | null;
        mode: string;
      };
    };

export type TimelineResp = {
  day: { date: string; items: TimelineItem[] };
  dates: string[];
  minDate?: string;
  maxDate?: string;
};
