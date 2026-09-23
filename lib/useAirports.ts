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

export function useAirports() {
    const [airports, setAirports] = useState<Airport[]>(() => airportCache ?? []);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (airportCache) return;
        let cancelled = false;
        fetchAirports()
            .then(data => {
                if (!cancelled) setAirports(data);
            })
            .catch(err => {
                console.error('Failed to load airports', err);
                if (!cancelled) setError('Failed to load airports');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return { airports, isLoading: airports.length === 0 && !error, error };
}
