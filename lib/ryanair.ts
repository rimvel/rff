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

// Requests that come too fast get this server blocked by Ryanair for a while, so for all searches
// together: at most 6 at once, started at least 50 ms apart (about 20 per second)
const limit = createLimiter(6, 50);

// --- Backing off when Ryanair refuses requests ---

const PAUSE_MS = 60_000; // after being refused, stop asking for a minute
const WINDOW_MS = 30_000;
let pausedUntil = 0;
const recent: { at: number; ok: boolean }[] = [];

/** Thrown instead of calling Ryanair while requests are paused. */
export class RyanairUnavailableError extends Error {}

// For /api/health: what happened recently, without calling Ryanair
let lastSuccessAt = 0;
let lastFailure: { at: number; status?: number; reason: string } | null = null;
const totals = { requests: 0, failures: 0 };

function recordOutcome(ok: boolean, failure?: { status?: number; reason: string }) {
    const now = Date.now();
    totals.requests++;
    if (ok) {
        lastSuccessAt = now;
    } else {
        totals.failures++;
        lastFailure = { at: now, status: failure?.status, reason: failure?.reason ?? 'failed' };
    }
    recent.push({ at: now, ok });
    while (recent.length > 0 && recent[0].at < now - WINDOW_MS) recent.shift();
    const failures = recent.filter(r => !r.ok).length;
    // Many failures in a row look like a block: pause rather than keep hammering
    if (!ok && failures >= 8 && failures >= recent.length / 2) pause('many failed requests');
}

function pause(reason: string) {
    if (Date.now() >= pausedUntil) console.warn(`Pausing requests to Ryanair for ${PAUSE_MS / 1000}s: ${reason}`);
    pausedUntil = Date.now() + PAUSE_MS;
}

export interface RyanairStatus {
    paused: boolean;
    pausedUntil: string | null;
    unavailable: boolean; // refusing or failing most recent requests
    last30s: { requests: number; failures: number };
    sinceStart: { requests: number; failures: number };
    lastSuccessAt: string | null;
    lastFailure: { at: string; status: number | null; reason: string } | null;
}

/** Recent state of requests to Ryanair (no request is made). */
export function ryanairStatus(): RyanairStatus {
    const now = Date.now();
    const window = recent.filter(r => r.at >= now - WINDOW_MS);
    const iso = (t: number) => (t > 0 ? new Date(t).toISOString() : null);
    return {
        paused: now < pausedUntil,
        pausedUntil: now < pausedUntil ? iso(pausedUntil) : null,
        unavailable: isRyanairUnavailable(),
        last30s: { requests: window.length, failures: window.filter(r => !r.ok).length },
        sinceStart: { ...totals },
        lastSuccessAt: iso(lastSuccessAt),
        lastFailure: lastFailure && { at: iso(lastFailure.at)!, status: lastFailure.status ?? null, reason: lastFailure.reason },
    };
}

/** True when Ryanair is refusing or failing most requests, so empty results probably mean "couldn't ask". */
export function isRyanairUnavailable(): boolean {
    const now = Date.now();
    if (now < pausedUntil) return true;
    const window = recent.filter(r => r.at >= now - WINDOW_MS);
    const failures = window.filter(r => !r.ok).length;
    return failures >= 3 && failures >= window.length / 2;
}

/** Log a failed lookup, except the expected ones while paused. */
function logFailure(message: string, e: unknown) {
    if (!(e instanceof RyanairUnavailableError)) console.error(message, e);
}

const AIRPORT_CODE = /^[A-Z]{3}$/;

export function isAirportCode(code: string): boolean {
    return AIRPORT_CODE.test(code);
}

async function fetchJson(url: string): Promise<unknown> {
    const checkPaused = () => {
        if (Date.now() < pausedUntil) throw new RyanairUnavailableError('Requests to Ryanair are paused');
    };
    checkPaused();
    return limit(async () => {
        checkPaused(); // it may have been paused while this request was waiting its turn
        let res: Response;
        try {
            res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        } catch (e) {
            recordOutcome(false, { reason: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 120) : 'network error' });
            throw e;
        }
        if (res.status === 403 || res.status === 429) {
            recordOutcome(false, { status: res.status, reason: 'refused' });
            pause(`Ryanair answered ${res.status}`);
            throw new Error(`Ryanair API ${res.status} for ${url}`);
        }
        if (!res.ok) {
            // e.g. 404 for an unknown route is a normal answer
            recordOutcome(res.status < 500, { status: res.status, reason: 'error response' });
            throw new Error(`Ryanair API ${res.status} for ${url}`);
        }
        try {
            const data = await res.json();
            recordOutcome(true);
            return data;
        } catch (e) {
            recordOutcome(false, { status: res.status, reason: 'not JSON (maybe a bot check page)' }); // e.g. an HTML "are you a robot?" page
            throw e;
        }
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

/** Map of airport code -> position. Empty if airports can't be loaded. */
export async function getCoordinates(): Promise<Map<string, { latitude: number; longitude: number }>> {
    try {
        const airports = await getAirports();
        return new Map(airports.filter(a => a.coordinates).map(a => [a.code, a.coordinates!]));
    } catch {
        return new Map();
    }
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
        logFailure(`Error fetching routes for ${airportCode}`, e);
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
        logFailure(`Error fetching month fares ${origin}->${dest} ${month}`, e);
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
        logFailure(`Error fetching fares ${origin}->${dest}`, e);
        return null;
    });
}

// --- "Anywhere": every destination from an airport on one day ---

interface AnywhereResponse {
    fares?: {
        outbound: {
            arrivalAirport: { iataCode: string };
            departureDate: string;
            arrivalDate: string;
            price: { value: number; currencyCode: string };
            flightNumber: string;
        };
    }[];
}

const anywhereCache = new TtlCache<Flight[]>(FARE_TTL);

/** Cheapest flight to every destination from `origin` on `date`, in one request. */
export function getAnywhere(origin: string, date: string): Promise<Flight[]> {
    if (!isAirportCode(origin)) return Promise.resolve([]);
    const params = new URLSearchParams({
        departureAirportIataCode: origin,
        outboundDepartureDateFrom: date,
        outboundDepartureDateTo: date,
        currency: 'EUR',
    });
    return anywhereCache.get(`${origin}-${date}`, async () => {
        const data = (await fetchJson(`${BASE_URL}/oneWayFares?${params}`)) as AnywhereResponse;
        return (data.fares ?? []).map(({ outbound: o }) => {
            const flight: Flight = {
                origin,
                destination: o.arrivalAirport.iataCode,
                departureDate: o.departureDate,
                arrivalDate: o.arrivalDate,
                price: { value: o.price.value, currencyCode: o.price.currencyCode },
                flightNumber: o.flightNumber,
            };
            // The same fare a single-route lookup for that day would return
            fareCache.set(`${origin}-${flight.destination}-${date}`, flight);
            return flight;
        });
    }).catch(e => {
        logFailure(`Error fetching destinations from ${origin} on ${date}`, e);
        return [];
    });
}
