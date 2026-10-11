'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SearchForm from '@/components/SearchForm';
import FlightResults from '@/components/FlightResults';
import PriceCalendar from '@/components/PriceCalendar';
import RecentSearches from '@/components/RecentSearches';
import ThemeToggle from '@/components/ThemeToggle';
import { buildAirportIndex, shortLabelFor } from '@/lib/airportGroups';
import { applyFlightNumbers, readEvents } from '@/lib/events';
import { saveRecentSearch } from '@/lib/recentSearches';
import { ANYWHERE, moveTrip, readSearch, readView, ResultView, SearchRequest, searchKey, toApiUrl, toPageParams } from '@/lib/searchUrl';
import { SearchResult } from '@/lib/types';
import { useAirports } from '@/lib/useAirports';
import { setQueryString, useFormVersion, useQueryString, useToday } from '@/lib/useUrl';

interface SearchOutcome {
  key: string;
  byPair: Record<string, SearchResult[]>; // results arrive per airport pair
  flightNumbers: Record<string, string>;
  complete: boolean;
  error: string | null;
}

export default function HomePage() {
  // The search lives in the page address, so it can be shared and Back/Forward work
  const queryString = useQueryString();
  const params = useMemo(() => new URLSearchParams(queryString), [queryString]);
  const request = useMemo(() => readSearch(params), [params]);
  const view = useMemo(() => readView(params), [params]);
  const key = searchKey(request);
  const anywhere = request?.dest === ANYWHERE;
  const today = useToday();

  const { airports } = useAirports();
  const index = useMemo(() => buildAirportIndex(airports), [airports]);

  const formVersion = useFormVersion();

  // What the form currently describes. When it differs from the search shown, the results are out of date.
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const isStale = !!request && draftKey !== null && draftKey !== key;

  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [searchCount, setSearchCount] = useState(0); // bumped to repeat the same search
  const runId = `${key}#${searchCount}`;
  const current = outcome?.key === runId ? outcome : null;
  const results = useMemo(
    () => (current ? applyFlightNumbers(Object.values(current.byPair).flat(), current.flightNumbers) : []),
    [current],
  );
  const isLoading = !!request && (!current || (!current.complete && !current.error && results.length === 0));
  const isSearchingMore = !!current && !current.complete && !current.error && results.length > 0;

  useEffect(() => {
    const req = readSearch(new URLSearchParams(key));
    if (!req) return;
    const controller = new AbortController();
    const update = (change: (o: SearchOutcome) => Partial<SearchOutcome>) =>
      setOutcome(o => {
        if (controller.signal.aborted) return o; // a newer search has started
        const base = o?.key === runId ? o : { key: runId, byPair: {}, flightNumbers: {}, complete: false, error: null };
        return { ...base, ...change(base) };
      });

    fetch(toApiUrl(req), { signal: controller.signal })
      .then(async res => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          update(() => ({ error: data?.error ?? 'Search failed. Please try again.' }));
          return;
        }
        await readEvents(res, event => {
          if (event.type === 'results') update(o => ({ byPair: { ...o.byPair, [event.pair]: event.results } }));
          else if (event.type === 'complete') update(() => ({ complete: true }));
          else if (event.type === 'flightNumbers') update(o => ({ flightNumbers: { ...o.flightNumbers, ...event.numbers } }));
          else if (event.type === 'error') update(() => ({ error: event.error }));
        });
        update(() => ({ complete: true })); // in case the stream ended early
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        console.error('Search failed:', err);
        update(o => (Object.keys(o.byPair).length > 0
          ? { complete: true } // keep what was found
          : { error: 'Could not reach the server. Check your connection and try again.' }));
      });

    return () => controller.abort();
  }, [key, runId]);

  // Remember searches once airport names are known, so the list can show them
  useEffect(() => {
    const req = readSearch(new URLSearchParams(key));
    if (req && index.airports.length > 0) {
      saveRecentSearch({ request: req, fromLabel: shortLabelFor(req.origin, index), toLabel: shortLabelFor(req.dest, index) });
    }
  }, [key, index]);

  const handleSearch = (req: SearchRequest) => {
    const newKey = searchKey(req);
    if (newKey === key) {
      setSearchCount(n => n + 1); // same search again
      return;
    }
    // A new search starts with default sorting and no filters
    setQueryString(toPageParams(req), { keepForm: true });
  };

  const handleViewChange = (next: ResultView) => {
    if (request) setQueryString(toPageParams(request, next), { replace: true, keepForm: true });
  };

  return (
    <div className="app-container">
      <header className="app-header-compact">
        <h1 className="app-title-compact">
          <Link
            href="/"
            className="no-underline text-current"
            onClick={e => {
              e.preventDefault();
              setQueryString(new URLSearchParams());
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG logo */}
            <img src="/logo.svg" alt="" className="logo-img-compact" />
            RFF
          </Link>
        </h1>
        <p className="app-subtitle">cheap flights, beyond direct</p>
      </header>

      <main className="app-main">
        {/* Re-created from the address when it changes from outside the form, and once today's date is known */}
        <SearchForm
          key={`${formVersion}|${today}`}
          initial={request}
          today={today}
          onSearch={handleSearch}
          onDraftChange={setDraftKey}
          isLoading={isLoading}
        />

        <RecentSearches currentKey={key} onPick={req => setQueryString(toPageParams(req))} />

        {isLoading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Searching for the best flights...</p>
          </div>
        )}

        {isStale && (
          <div className="stale-notice" role="status">
            You&apos;ve changed the search. Press <strong>Search</strong> to update the results.
          </div>
        )}

        {/* Old results are dimmed; old dead ends ("no flights", errors) are hidden */}
        <div className={isStale ? 'stale-results' : undefined}>
        {request && !anywhere && !current?.error && (
          <PriceCalendar
            key={`${request.origin}|${request.dest}|${request.date.slice(0, 7)}`}
            request={request}
            onPickDate={date => setQueryString(toPageParams(moveTrip(request, date)))} />
        )}

        {!isLoading && !isStale && current?.error && (
          <div className="no-results">
            <p>{current.error}</p>
          </div>
        )}

        {isSearchingMore && (
          <div className="searching-more">
            <span className="spinner-small" aria-hidden="true"></span>
            Showing direct flights · still looking for connections…
          </div>
        )}

        {!isLoading && request && current && !current.error && !(isStale && results.length === 0) && (
          <FlightResults
            key={current.key}
            results={results}
            isRoundTrip={!!request.returnDate}
            anywhere={anywhere}
            view={view}
            onViewChange={handleViewChange}
          />
        )}
        </div>
      </main>

      <footer className="app-footer">
        <p className="disclaimer">
          Unofficial site, not affiliated with or endorsed by Ryanair DAC. Fares come from Ryanair&apos;s public
          website and can change. Always check the price before booking.
        </p>
        <p>By RV</p>
        <ThemeToggle />
      </footer>
    </div>
  );
}
