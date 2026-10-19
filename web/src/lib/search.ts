// Place search: text folding and ranking. Client-safe (no database); the SQL
// side lives in lib/placeSearch.ts and folds with the database function
// matka_fold() from migrations/014_search.sql, which uses the same map.

const EXTRA: Record<string, string> = { Ø: "O", ø: "o", Đ: "D", đ: "d", Ł: "L", ł: "l", Ħ: "H", ħ: "h", Ŧ: "T", ŧ: "t", ı: "i" };

function buildFoldMap(): [string, string] {
  let from = "";
  let to = "";
  for (let c = 0xc0; c <= 0x24f; c++) {
    const ch = String.fromCodePoint(c);
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (base !== ch && /^[A-Za-z]$/.test(base)) {
      from += ch;
      to += base;
    }
  }
  for (const [k, v] of Object.entries(EXTRA)) {
    from += k;
    to += v;
  }
  return [from, to];
}

/**
 * Accented Latin letters and what they fold to, one character each (Postgres
 * translate() maps one to one): Latin-1 and Latin Extended-A/B letters that
 * decompose to a base letter, plus the few that don't (ø, đ, ł, ħ, ŧ, ı).
 * migrations/014_search.sql holds these same two strings; search.test.ts
 * keeps them in step.
 */
export const [FOLD_FROM, FOLD_TO] = buildFoldMap();

const FOLD = new Map([...FOLD_FROM].map((ch, i) => [ch, FOLD_TO[i]]));

/**
 * Case- and accent-insensitive form of a string, the same as matka_fold() in
 * the database: "Café Ekberg" → "cafe ekberg", "Särkänniemi" → "sarkanniemi".
 */
export function fold(s: string | null | undefined): string {
  if (!s) return "";
  let out = "";
  for (const ch of s.normalize("NFC")) out += FOLD.get(ch) ?? ch;
  return out.toLowerCase();
}

export const MAX_QUERY_LENGTH = 100;

/** The words of a query, folded: "  Tin  Tin Tángo " → ["tin", "tin", "tango"]. */
export function queryTokens(q: string): string[] {
  return fold(q.slice(0, MAX_QUERY_LENGTH)).split(/\s+/).filter(Boolean);
}

/** A LIKE pattern matching `token` anywhere, with LIKE's own wildcards escaped. */
export const likeAnywhere = (token: string) => `%${token.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** How well a text matches the query, best first. */
export const MatchLevel = {
  None: 0,
  /** Every word occurs somewhere in it. */
  Words: 1,
  /** The whole query occurs inside it. */
  Substring: 2,
  /** A word in it starts with the query ("tango" in "Tin Tin Tango"). */
  WordPrefix: 3,
  /** It starts with the query. */
  Prefix: 4,
  Exact: 5,
} as const;
export type MatchLevel = (typeof MatchLevel)[keyof typeof MatchLevel];

const WORD_START = /[\s\-,./()&'’"]+/;

/** How `text` matches the query `tokens` (from queryTokens). */
export function matchLevel(text: string | null | undefined, tokens: string[]): MatchLevel {
  if (!text || tokens.length === 0) return MatchLevel.None;
  const t = fold(text).trim();
  const q = tokens.join(" ");
  if (t === q) return MatchLevel.Exact;
  if (t.startsWith(q)) return MatchLevel.Prefix;
  const at = t.indexOf(q);
  if (at >= 0) {
    // "tin tango" in "tin tin tango": a word boundary right before it.
    const before = at === 0 ? "" : t[at - 1];
    if (WORD_START.test(before) || t.split(WORD_START).some((w) => w.startsWith(q))) return MatchLevel.WordPrefix;
    return MatchLevel.Substring;
  }
  return tokens.every((tok) => t.includes(tok)) ? MatchLevel.Words : MatchLevel.None;
}

/** What a place matched on, for the result list: its name ranks above the rest. */
export type MatchField = "name" | "address" | "kind" | "category" | "area";

export interface SearchCandidate {
  /** Display name (custom_name, else geo_name). */
  name: string | null;
  /** The geocoder's name when the user renamed the place. */
  altName?: string | null;
  street?: string | null;
  /** Saved kind ("home") and its label. */
  kind?: string | null;
  /** OSM category, "fast_food". */
  category?: string | null;
  city?: string | null;
  country?: string | null;
  visitCount: number;
  /** ISO timestamp or null. */
  lastVisit: string | null;
}

export interface Scored {
  score: number;
  field: MatchField;
}

/**
 * Scores a place for the query: by its name first (exact > prefix > word
 * prefix > substring > all words), then the other fields, which only ever
 * rank below a name match. 0 = no match.
 */
export function scorePlace(c: SearchCandidate, tokens: string[]): Scored {
  const name = matchLevel(c.name, tokens);
  if (name) return { score: 100 + name * 10, field: "name" };
  const alt = matchLevel(c.altName, tokens);
  if (alt) return { score: 90 + alt, field: "name" };
  const kind = matchLevel(c.kind, tokens);
  if (kind) return { score: 60 + kind, field: "kind" };
  const category = matchLevel(c.category?.replace(/_/g, " "), tokens);
  if (category) return { score: 50 + category, field: "category" };
  const street = matchLevel(c.street, tokens);
  if (street) return { score: 40 + street, field: "address" };
  // Words split over several fields ("cafe helsinki") or a city/country only.
  const all = [c.name, c.altName, c.street, c.kind, c.category?.replace(/_/g, " "), c.city, c.country]
    .filter(Boolean)
    .join(" ");
  const area = matchLevel(all, tokens);
  if (area) {
    // Name words matched too ("cafe helsinki" → Café Regatta, Helsinki) beat a city alone.
    const nameWords = tokens.filter((tok) => fold(c.name).includes(tok)).length;
    return { score: 10 + Math.min(nameWords, 5) * 5 + area, field: "area" };
  }
  return { score: 0, field: "area" };
}

/** Ranks places for a query: best match, then most visits, then most recent. Drops non-matches. */
export function rankPlaces<T extends SearchCandidate>(places: T[], tokens: string[]): (T & Scored)[] {
  return places
    .map((p) => ({ ...p, ...scorePlace(p, tokens) }))
    .filter((p) => p.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.visitCount - a.visitCount ||
        (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "") ||
        (a.name ?? "").localeCompare(b.name ?? ""),
    );
}

export interface AreaRow {
  city: string | null;
  country: string | null;
  places: number;
  visits: number;
  /** Seconds. */
  duration: number;
  /** ISO timestamp or null. */
  lastVisit: string | null;
}

export interface AreaResult {
  type: "city" | "country";
  name: string;
  /** The city's country; null for a country. */
  country: string | null;
  places: number;
  visits: number;
  duration: number;
  lastVisit: string | null;
  /** Web page for it (the World pages). */
  href: string;
}

export const cityHref = (name: string, country: string | null) =>
  `/insights/world/city?name=${encodeURIComponent(name)}${country ? `&country=${encodeURIComponent(country)}` : ""}`;
export const countryHref = (name: string) => `/insights/world?country=${encodeURIComponent(name)}`;

/**
 * Cities and countries whose own name matches the query, from per-city
 * totals. A country adds up its cities. Best match first, then most visits.
 */
export function rankAreas(rows: AreaRow[], tokens: string[], limit = 6): AreaResult[] {
  const out: (AreaResult & { level: MatchLevel })[] = [];
  const countries = new Map<string, AreaResult & { level: MatchLevel }>();
  for (const r of rows) {
    const cityLevel = matchLevel(r.city, tokens);
    if (r.city && cityLevel) {
      out.push({
        type: "city",
        name: r.city,
        country: r.country,
        places: r.places,
        visits: r.visits,
        duration: r.duration,
        lastVisit: r.lastVisit,
        href: cityHref(r.city, r.country),
        level: cityLevel,
      });
    }
    const countryLevel = matchLevel(r.country, tokens);
    if (r.country && countryLevel) {
      const c = countries.get(r.country) ?? {
        type: "country" as const,
        name: r.country,
        country: null,
        places: 0,
        visits: 0,
        duration: 0,
        lastVisit: null,
        href: countryHref(r.country),
        level: countryLevel,
      };
      c.places += r.places;
      c.visits += r.visits;
      c.duration += r.duration;
      if (r.lastVisit && (!c.lastVisit || r.lastVisit > c.lastVisit)) c.lastVisit = r.lastVisit;
      countries.set(r.country, c);
    }
  }
  out.push(...countries.values());
  return out
    .sort((a, b) => b.level - a.level || b.visits - a.visits || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((a): AreaResult => {
      const r: AreaResult & { level?: MatchLevel } = { ...a };
      delete r.level;
      return r;
    });
}

/**
 * A local calendar date (YYYY-MM-DD) for result lists: "18 Oct", with the
 * year when it isn't this year or `withYear` asks for it ("18 Oct 2025").
 */
export function formatDate(date: string, withYear = false, now = new Date()): string {
  const d = new Date(`${date}T12:00:00Z`);
  const year = withYear || date.slice(0, 4) !== String(now.getFullYear());
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
}

/** Time spent somewhere, rounded for a summary line: "45 min", "9 h", "3 d 4 h". */
export function formatTimeSpent(seconds: number): string {
  if (!seconds || seconds < 0) return "—";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 48 * 3600) return `${Math.round(seconds / 3600)} h`;
  const d = Math.floor(seconds / 86_400);
  const h = Math.round((seconds % 86_400) / 3600);
  return h > 0 && h < 24 ? `${d} d ${h} h` : `${h === 24 ? d + 1 : d} d`;
}
