'use client';

import { useState } from 'react';
import SearchForm from '@/components/SearchForm';
import FlightResults from '@/components/FlightResults';

interface RouteResult {
  type: 'direct' | 'layover';
  origin: string;
  destination: string;
  via?: string;
  flights: any[];
  totalPrice: number;
  currency: string;
  duration: number;
}

export default function Home() {
  const [results, setResults] = useState<RouteResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (origin: string, dest: string, date: string, returnDate?: string, departureDateRange?: number, returnDateRange?: number, departureDateDirection?: string, returnDateDirection?: string) => {
    setIsLoading(true);
    setHasSearched(true);
    setResults([]);

    try {
      let url = `/api/search?origin=${origin}&dest=${dest}&date=${date}`;
      if (returnDate) {
        url += `&returnDate=${returnDate}`;
      }
      if (departureDateRange) {
        url += `&dateRangeDays=${departureDateRange}`;
      }
      if (returnDateRange) {
        url += `&returnDateRange=${returnDateRange}`;
      }
      if (departureDateDirection) {
        url += `&dateDirection=${departureDateDirection}`;
      }
      if (returnDateDirection) {
        url += `&returnDateDirection=${returnDateDirection}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      console.log('Search results received:', data);
      console.log('First result:', data[0]);
      console.log('First result isRoundTrip:', data[0]?.isRoundTrip);
      console.log('First result returnFlights:', data[0]?.returnFlights);
      setResults(data);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header-compact">
        <h1 className="app-title-compact">
          <span className="logo-compact">✈️</span>
          RFF.LT
        </h1>
      </header>

      <main className="app-main">
        <SearchForm onSearch={handleSearch} isLoading={isLoading} />

        {isLoading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Searching for the best flights...</p>
          </div>
        )}

        {!isLoading && hasSearched && <FlightResults results={results} />}
      </main>

      <footer className="app-footer">
        <p>Powered by Ryanair API • Built with Next.js</p>
      </footer>
    </div>
  );
}

