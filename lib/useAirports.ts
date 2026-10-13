'use client';

import { useEffect, useState } from 'react';
import { Airport } from './types';

export type { Airport } from './types';

// Module-level cache shared by all components, so the list is fetched once per page load
let airportCache: Airport[] | null = null;
let fetchPromise: Promise<Airport[]> | null = null;

function fetchAirports(): Promise<Airport[]> {
    if (airportCache) return Promise.resolve(airportCache);

    // Reuse a fetch that's already in flight
    if (!fetchPromise) {
        fetchPromise = fetch('/api/airports')
            .then(res => {
                if (!res.ok) throw new Error(`Failed to fetch airports: ${res.status}`);
                return res.json() as Promise<Airport[]>;
            })
            .then(data => {
                airportCache = data;
                return data;
            })
            .finally(() => {
                fetchPromise = null;
            });
    }
    return fetchPromise;
}

// When the list can't be loaded (e.g. Ryanair isn't answering the server), try again after 5, 10, 20, 30, 30... s
const retryDelay = (attempt: number) => Math.min(30_000, 5_000 * 2 ** attempt);

export function useAirports() {
    const [airports, setAirports] = useState<Airport[]>(() => airportCache ?? []);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (airportCache) return;
        let cancelled = false;
        let retry: ReturnType<typeof setTimeout> | undefined;
        const load = (attempt: number) => {
            fetchAirports()
                .then(data => {
                    if (cancelled) return;
                    setAirports(data);
                    setError(null);
                })
                .catch(err => {
                    console.error('Failed to load airports', err);
                    if (cancelled) return;
                    setError('Failed to load airports');
                    retry = setTimeout(() => load(attempt + 1), retryDelay(attempt));
                });
        };
        load(0);
        return () => {
            cancelled = true;
            clearTimeout(retry);
        };
    }, []);

    return { airports, isLoading: airports.length === 0 && !error, error };
}
