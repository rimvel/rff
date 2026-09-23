import { Airport, Flight } from './types';
import { TtlCache, createLimiter } from './cache';

export type { Airport, Flight } from './types';

const BASE_URL = 'https://services-api.ryanair.com/farfnd/v4';
const LOCATE_URL = 'https://www.ryanair.com/api/views/locate';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const HOUR = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

// Max simultaneous requests to Ryanair from this server, across all searches
const limit = createLimiter(8);

const AIRPORT_CODE = /^[A-Z]{3}$/;

export function isAirportCode(code: string): boolean {
    return AIRPORT_CODE.test(code);
}

async function fetchJson(url: string): Promise<unknown> {
    return limit(async () => {
        const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`Ryanair API ${res.status} for ${url}`);
        return res.json();
    });
}

// --- Airports (cached 24h, stale copy served if a refresh fails) ---

let airportCache: { data: Airport[]; fetchedAt: number } | null = null;
let airportFetch: Promise<Airport[]> | null = null;

export async function getAirports(): Promise<Airport[]> {
    if (airportCache && Date.now() - airportCache.fetchedAt < 24 * HOUR) return airportCache.data;
    if (!airportFetch) {
        airportFetch = (async () => {
            try {
                const data = (await fetchJson(`${LOCATE_URL}/5/airports/en/active`)) as Airport[];
                airportCache = { data, fetchedAt: Date.now() };
                return data;
            } catch (e) {
                if (airportCache) {
                    console.warn('Failed to refresh airports, serving stale cache:', e);
                    return airportCache.data;
                }
                throw e;
            } finally {
                airportFetch = null;
            }
        })();
    }
    return airportFetch;
}

/** Map of airport code -> IANA time zone. Empty if airports can't be loaded. */
export async function getTimeZones(): Promise<Map<string, string>> {
    try {
        const airports = await getAirports();
        return new Map(airports.filter(a => a.timeZone).map(a => [a.code, a.timeZone!]));
    } catch {
        return new Map();
    }
}

// --- Routes (cached 12h) ---

const routeCache = new TtlCache<string[]>(12 * HOUR);

export function getRoutes(airportCode: string): Promise<string[]> {
    if (!isAirportCode(airportCode)) return Promise.resolve([]);
    return routeCache.get(airportCode, async () => {
        const data = (await fetchJson(`${LOCATE_URL}/searchWidget/routes/en/airport/${airportCode}`)) as { arrivalAirport: { code: string } }[];
        return data.map(r => r.arrivalAirport.code);
    }).catch(e => {
        console.error(`Error fetching routes for ${airportCode}`, e);
        return [];
    });
}

// --- Fares (cached 15 min; prices change, but not by the second) ---

interface FareResponse {
    fares?: {
        outbound: {
            departureDate: string;
            arrivalDate: string;
            price: { value: number; currencyCode: string };
            flightNumber: string;
        };
    }[];
}

const fareCache = new TtlCache<Flight | null>(15 * 60 * 1000);

/**
 * Cheapest one-way fare for a route on a given day.
 * Note: this Ryanair endpoint only returns the single cheapest flight per day.
 */
export function getOneWayFares(origin: string, dest: string, date: string): Promise<Flight | null> {
    if (!isAirportCode(origin) || !isAirportCode(dest)) return Promise.resolve(null);
    const params = new URLSearchParams({
        departureAirportIataCode: origin,
        arrivalAirportIataCode: dest,
        outboundDepartureDateFrom: date,
        outboundDepartureDateTo: date,
        currency: 'EUR',
    });
    return fareCache.get(`${origin}-${dest}-${date}`, async () => {
        const data = (await fetchJson(`${BASE_URL}/oneWayFares?${params}`)) as FareResponse;
        const fare = data.fares?.[0]?.outbound;
        if (!fare) return null;
        return {
            origin,
            destination: dest,
            departureDate: fare.departureDate,
            arrivalDate: fare.arrivalDate,
            price: { value: fare.price.value, currencyCode: fare.price.currencyCode },
            flightNumber: fare.flightNumber,
        };
    }).catch(e => {
        console.error(`Error fetching fares ${origin}->${dest}`, e);
        return null;
    });
}
