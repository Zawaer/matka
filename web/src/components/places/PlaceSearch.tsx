"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { PlaceHit, SearchResult } from "@/lib/placeSearch";
import { KIND_META } from "@/lib/savedPlaces";
import { formatDate, formatLongDuration } from "@/lib/format";
import { placeCategoryLine, placeTitle } from "./category";
import { PlaceList, PlaceTile, rowClass, visitsLabel } from "./PlaceList";
import { Building2, ChevronRight, Earth, Search, SearchX, X } from "lucide-react";
import { Callout, cx, EmptyState, inputClass, placeIconFor, Skeleton } from "@/components/ui";

const DEBOUNCE_MS = 180;

type State =
  | { status: "idle" }
  | { status: "loading"; query: string; last: SearchResult | null }
  | { status: "done"; result: SearchResult }
  | { status: "error"; query: string };

/**
 * The Places page's search: instant results as you type, the normal list
 * (`children`) while the box is empty. "/" focuses it; ↓/↑ walk the results;
 * Enter opens the first; Esc clears. The query is kept in the URL (?q=).
 */
export function PlaceSearch({ initialQuery, children }: { initialQuery: string; children: ReactNode }) {
  const router = useRouter();
  // The URL's ?q= (kept by replaceState below) wins, so Back restores the search.
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? initialQuery);
  const [state, setState] = useState<State>({ status: "idle" });
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();

  // "/" focuses the search from anywhere on the page (not while typing elsewhere).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced fetch; a newer query aborts the older request.
  useEffect(() => {
    if (!trimmed) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setState((s) => ({
        status: "loading",
        query: trimmed,
        last: s.status === "done" ? s.result : s.status === "loading" ? s.last : null,
      }));
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: ctl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setState({ status: "done", result: (await res.json()) as SearchResult });
      } catch (err) {
        if ((err as Error).name !== "AbortError") setState({ status: "error", query: trimmed });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [trimmed]);

  // Keep ?q= in the URL so back/forward and reloads return to the search.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (trimmed) url.searchParams.set("q", trimmed);
    else url.searchParams.delete("q");
    // replaceState(null, …) is how Next's router picks the change up (docs: linking-and-navigating).
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [trimmed]);

  const focusables = () => [...(results.current?.querySelectorAll<HTMLElement>("[data-result]") ?? [])];

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (query) {
        e.preventDefault();
        setQuery("");
      } else input.current?.blur();
    } else if (e.key === "ArrowDown") {
      const first = focusables()[0];
      if (first) {
        e.preventDefault();
        first.focus();
      }
    } else if (e.key === "Enter") {
      const href = focusables()[0]?.getAttribute("href");
      if (href) router.push(href);
    }
  };

  // ↑/↓ between results (the place links and area links), ↑ from the first back to the box.
  const onResultsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Escape") return;
    e.preventDefault();
    if (e.key === "Escape") {
      input.current?.focus();
      return;
    }
    const items = focusables();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = at + (e.key === "ArrowDown" ? 1 : -1);
    if (next < 0) input.current?.focus();
    else items[Math.min(next, items.length - 1)]?.focus();
  };

  const shown =
    state.status === "done" ? state.result : state.status === "loading" ? state.last : null;
  const current = shown && shown.query.trim() === trimmed;
  const pending = !current && state.status !== "error";

  return (
    <>
      <div className="relative mb-6">
        <Search
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Search places, streets, cities…"
          aria-label="Search places"
          aria-controls="place-search-results"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={100}
          className={cx(inputClass, "h-10 pr-12 pl-9 text-base sm:text-sm [&::-webkit-search-cancel-button]:hidden")}
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
            className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text"
            aria-label="Clear search"
            title="Clear search"
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-border bg-surface-2 px-1.5 font-mono text-caption text-muted md:block">
            /
          </kbd>
        )}
      </div>

      {!trimmed ? (
        children
      ) : (
        <div
          id="place-search-results"
          ref={results}
          onKeyDown={onResultsKey}
          aria-live="polite"
          aria-busy={pending}
          className={pending && shown ? "opacity-60 transition-opacity" : undefined}
        >
          {state.status === "error" && !current ? (
            <Callout tone="danger" title="Search failed" role="alert">
              Something went wrong on the server. Change the search to try again.
            </Callout>
          ) : !shown ? (
            <SearchSkeleton />
          ) : shown.places.length === 0 && shown.areas.length === 0 ? (
            current ? (
              <EmptyState
                icon={SearchX}
                title={`Nothing matches “${trimmed}”`}
                description="Try part of a name, a street, a city, or a type like “cafe”."
              />
            ) : (
              <SearchSkeleton />
            )
          ) : (
            <SearchResults result={shown} />
          )}
        </div>
      )}
    </>
  );
}

function SearchResults({ result }: { result: SearchResult }) {
  const places = result.places.length > 0 && (
    <section>
      <h2 className="mb-3 text-heading text-text">
        Places{" "}
        <span className="ml-1 font-normal tabular-nums text-muted">
          {result.places.length}
          {result.places.length >= 30 ? "+" : ""}
        </span>
      </h2>
      <PlaceList>
        {result.places.map((p) => (
          <PlaceResult key={p.id} place={p} />
        ))}
      </PlaceList>
    </section>
  );
  const areas = result.areas.length > 0 && (
    <section>
      <h2 className="mb-3 text-heading text-text">Cities and countries</h2>
      <PlaceList>
        {result.areas.map((a) => (
          <li key={`${a.type}/${a.name}/${a.country ?? ""}`}>
            <Link href={a.href} data-result className={rowClass}>
              <PlaceTile icon={a.type === "city" ? Building2 : Earth} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-label text-text">
                  {a.name}
                  {a.country && <span className="font-normal text-muted"> · {a.country}</span>}
                </span>
                <span className="mt-0.5 block truncate text-meta text-muted">
                  {a.places} {a.places === 1 ? "place" : "places"} · {visitsLabel(a.visits)}
                  {a.lastVisit ? ` · last ${formatDate(a.lastVisit.slice(0, 10))}` : ""}
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="-mr-1 hidden shrink-0 text-muted sm:block" />
            </Link>
          </li>
        ))}
      </PlaceList>
    </section>
  );
  // "tallinn": the city itself before the places that are only in it.
  const areasFirst = result.areas.length > 0 && result.places.every((p) => p.match === "area");
  return (
    <div className="flex flex-col gap-6">
      {areasFirst ? areas : places}
      {areasFirst ? places : areas}
    </div>
  );
}

/** A search hit: the place row, plus its latest days as links to the timeline (wider screens). */
function PlaceResult({ place: p }: { place: PlaceHit }) {
  const name = placeTitle(p.name, p.category);
  const what = p.kind ? KIND_META[p.kind].label : placeCategoryLine(p.name, p.category);
  const meta = [
    what,
    p.city,
    p.lastVisitDate ? `last ${formatDate(p.lastVisitDate)}` : "no visits yet",
    p.lastVisitDate ? visitsLabel(p.visitCount) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex items-center">
      <Link href={`/places/${p.id}`} data-result className={cx(rowClass, "min-w-0 flex-1")}>
        <PlaceTile icon={placeIconFor(p.kind, p.category)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-label text-text">{name}</span>
          <span className="mt-0.5 block truncate text-meta text-muted">{meta}</span>
        </span>
        <span className="shrink-0 text-right text-meta tabular-nums text-secondary">{formatLongDuration(p.totalTime)}</span>
      </Link>
      {p.recentDates.length > 0 && (
        <div className="hidden shrink-0 gap-1.5 pr-4 md:flex" aria-label="Recent visits">
          {p.recentDates.slice(0, 3).map((d) => (
            <Link
              key={d}
              href={`/timeline?date=${d}`}
              className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-caption tabular-nums text-secondary transition-colors hover:border-strong hover:bg-surface-2 hover:text-text"
              title={`Open ${formatDate(d)} on the timeline`}
            >
              {formatDate(d)}
            </Link>
          ))}
        </div>
      )}
    </li>
  );
}

function SearchSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface" aria-label="Searching">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex h-16 items-center gap-3 border-b border-border px-4 last:border-b-0 sm:px-5">
          <Skeleton className="h-8 w-8" />
          <div className="flex-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-1.5 h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
