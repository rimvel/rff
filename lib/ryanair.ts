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

const FARE_TTL = 15 * 60 * 1000;

interface MonthResponse {
    outbound?: {
        fares?: {
            day: string;
            departureDate: string | null;
            arrivalDate: string | null;
            price: { value: number; currencyCode: string } | null;
            unavailable: boolean;
            soldOut: boolean;
        }[];
    };
}

const monthCache = new TtlCache<Map<string, Flight>>(FARE_TTL);

/**
 * Cheapest flight on each day of a month (`month` is "YYYY-MM"), in one request.
 * These fares have no flight number; see getFlightNumber().
 */
export function getMonthFares(origin: string, dest: string, month: string): Promise<Map<string, Flight>> {
    if (!isAirportCode(origin) || !isAirportCode(dest) || !/^\d{4}-\d{2}$/.test(month)) return Promise.resolve(new Map());
    return monthCache.get(`${origin}-${dest}-${month}`, async () => {
        const url = `${BASE_URL}/oneWayFares/${origin}/${dest}/cheapestPerDay?outboundMonthOfDate=${month}-01&currency=EUR`;
        const data = (await fetchJson(url)) as MonthResponse;
        const days = new Map<string, Flight>();
        for (const f of data.outbound?.fares ?? []) {
            if (f.unavailable || f.soldOut || !f.price || !f.departureDate || !f.arrivalDate) continue;
            days.set(f.day, {
                origin,
                destination: dest,
                departureDate: f.departureDate,
                arrivalDate: f.arrivalDate,
                price: { value: f.price.value, currencyCode: f.price.currencyCode },
            });
        }
        return days;
    }).catch(e => {
        console.error(`Error fetching month fares ${origin}->${dest} ${month}`, e);
        return new Map();
    });
}

/** Cheapest flight on a day ("YYYY-MM-DD"), from the cached month. */
export async function getDayFare(origin: string, dest: string, date: string): Promise<Flight | null> {
    return (await getMonthFares(origin, dest, date.slice(0, 7))).get(date) ?? null;
}

/** Flight number of a flight found via getMonthFares (looked up from that day's fare). */
export async function getFlightNumber(flight: Flight): Promise<string | undefined> {
    const day = await getOneWayFares(flight.origin, flight.destination, flight.departureDate.slice(0, 10));
    return day && day.departureDate === flight.departureDate ? day.flightNumber : undefined;
}

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

const fareCache = new TtlCache<Flight | null>(FARE_TTL);

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
