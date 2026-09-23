'use client';

import { useState } from 'react';
import Link from 'next/link';
import SearchForm, { SearchRequest } from '@/components/SearchForm';
import FlightResults from '@/components/FlightResults';
import ThemeToggle from '@/components/ThemeToggle';
import { SearchResult } from '@/lib/types';

function buildSearchUrl(req: SearchRequest): string {
  const params = new URLSearchParams({ origin: req.origin, dest: req.dest, date: req.date });
  if (req.returnDate) params.set('returnDate', req.returnDate);
  if (req.departureDateRange) params.set('dateRangeDays', String(req.departureDateRange));
  if (req.departureDateDirection) params.set('dateDirection', req.departureDateDirection);
  if (req.returnDateRange) params.set('returnDateRange', String(req.returnDateRange));
  if (req.returnDateDirection) params.set('returnDateDirection', req.returnDateDirection);
  return `/api/search?${params}`;
}

export default function Home() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (req: SearchRequest) => {
    setIsLoading(true);
    setHasSearched(true);
    setIsRoundTrip(!!req.returnDate);
    setResults([]);
    setError(null);

    try {
      const res = await fetch(buildSearchUrl(req));
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) {
        setError(data?.error ?? 'Search failed. Please try again.');
        return;
      }
      setResults(data);
    } catch (err) {
      console.error('Search failed:', err);
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header-compact">
        <h1 className="app-title-compact">
          <Link href="/" className="no-underline text-current">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG logo */}
            <img src="/logo.svg" alt="Logo" className="logo-img-compact" />
            RYANAIR FLIGHT FINDER
          </Link>
        </h1>
        <p className="app-subtitle">beyond direct flights</p>
      </header>

      <main className="app-main">
        <SearchForm onSearch={handleSearch} isLoading={isLoading} />

        {isLoading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Searching for the best flights...</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="no-results">
            <p>{error}</p>
          </div>
        )}

        {!isLoading && !error && hasSearched && <FlightResults results={results} isRoundTrip={isRoundTrip} />}
      </main>

      <footer className="app-footer">
        <p>Powered by Ryanair API, Next.js, Azure • By RV</p>
        <ThemeToggle />
      </footer>
    </div>
  );
}
