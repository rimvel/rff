'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SearchForm from '@/components/SearchForm';
import FlightResults from '@/components/FlightResults';
import RecentSearches from '@/components/RecentSearches';
import ThemeToggle from '@/components/ThemeToggle';
import { buildAirportIndex, shortLabelFor } from '@/lib/airportGroups';
import { saveRecentSearch } from '@/lib/recentSearches';
import { readSearch, readView, ResultView, SearchRequest, searchKey, toApiUrl, toPageParams } from '@/lib/searchUrl';
import { SearchResult } from '@/lib/types';
import { useAirports } from '@/lib/useAirports';
import { setQueryString, useFormVersion, useQueryString, useToday } from '@/lib/useUrl';

interface SearchOutcome {
  key: string;
  results: SearchResult[];
  error: string | null;
}

export default function Home() {
  // The search lives in the page address, so it can be shared and Back/Forward work
  const queryString = useQueryString();
  const params = useMemo(() => new URLSearchParams(queryString), [queryString]);
  const request = useMemo(() => readSearch(params), [params]);
  const view = useMemo(() => readView(params), [params]);
  const key = searchKey(request);
  const today = useToday();

  const { airports } = useAirports();
  const index = useMemo(() => buildAirportIndex(airports), [airports]);

  const formVersion = useFormVersion();

  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [searchCount, setSearchCount] = useState(0); // bumped to repeat the same search
  const runId = `${key}#${searchCount}`;
  const isLoading = !!request && outcome?.key !== runId;

  useEffect(() => {
    const req = readSearch(new URLSearchParams(key));
    if (!req) return;
    const controller = new AbortController();
    const finish = (results: SearchResult[], error: string | null) => setOutcome({ key: runId, results, error });

    fetch(toApiUrl(req), { signal: controller.signal })
      .then(async res => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(data)) finish([], data?.error ?? 'Search failed. Please try again.');
        else finish(data, null);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        console.error('Search failed:', err);
        finish([], 'Could not reach the server. Check your connection and try again.');
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
            <img src="/logo.svg" alt="Logo" className="logo-img-compact" />
            RYANAIR FLIGHT FINDER
          </Link>
        </h1>
        <p className="app-subtitle">beyond direct flights</p>
      </header>

      <main className="app-main">
        {/* Re-created from the address when it changes from outside the form, and once today's date is known */}
        <SearchForm key={`${formVersion}|${today}`} initial={request} today={today} onSearch={handleSearch} isLoading={isLoading} />

        <RecentSearches currentKey={key} onPick={req => setQueryString(toPageParams(req))} />

        {isLoading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Searching for the best flights...</p>
          </div>
        )}

        {!isLoading && outcome?.error && (
          <div className="no-results">
            <p>{outcome.error}</p>
          </div>
        )}

        {!isLoading && request && outcome && !outcome.error && (
          <FlightResults
            key={outcome.key}
            results={outcome.results}
            isRoundTrip={!!request.returnDate}
            view={view}
            onViewChange={handleViewChange}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>Powered by Ryanair API, Next.js, Azure • By RV</p>
        <ThemeToggle />
      </footer>
    </div>
  );
}
