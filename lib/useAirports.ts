'use client';

import { useState, useEffect } from 'react';

export interface Airport {
    code: string;
    name: string;
    country: {
        name: string;
        code: string;
    };
    city: {
        name: string;
        code: string;
    };
    macCity?: {
        name: string;
        code: string;
    };
    region?: {
        name: string;
        code: string;
    };
}

// Module-level singleton cache shared across all component instances
let airportCache: Airport[] | null = null;
let fetchPromise: Promise<Airport[]> | null = null;

async function fetchAirports(): Promise<Airport[]> {
    if (airportCache) return airportCache;

    // Deduplicate: if a fetch is already in-flight, reuse it
    if (!fetchPromise) {
        fetchPromise = fetch('/api/airports')
            .then(res => {
                if (!res.ok) throw new Error(`Failed to fetch airports: ${res.status}`);
                return res.json();
            })
            .then((data: Airport[]) => {
                airportCache = data;
                fetchPromise = null;
                return data;
            })
            .catch(err => {
                fetchPromise = null;
                throw err;
            });
    }

    return fetchPromise;
}

export function useAirports() {
    const [airports, setAirports] = useState<Airport[]>(airportCache || []);
    const [isLoading, setIsLoading] = useState(!airportCache);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // If already cached, skip the fetch
        if (airportCache) {
            setAirports(airportCache);
            setIsLoading(false);
            return;
        }

        fetchAirports()
            .then(data => {
                setAirports(data);
                setIsLoading(false);
            })
            .catch(err => {
                console.error('Failed to load airports', err);
                setError('Failed to load airports');
                setIsLoading(false);
            });
    }, []);

    return { airports, isLoading, error };
}

/**
 * Get the display name for an airport code.
 * Uses the cached airport data if available.
 */
export function getAirportName(code: string, airports: Airport[]): string {
    const airport = airports.find(a => a.code === code);
    return airport?.name || code;
}
