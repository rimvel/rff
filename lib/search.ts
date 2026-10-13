import { ANYWHERE, MAX_ANYWHERE_ORIGIN_DAYS, MAX_ANYWHERE_ORIGINS, searchAnywhere } from './anywhere';
import { merge } from './cache';
import { applyFlightNumbers, flightKey, SearchEvent } from './events';
import { combineRoundTrips, combineWithOtherAirports, findDirect, findOneStop } from './finder';
import { canComeBack } from './mixedAirports';
import { getCoordinates, getFlightNumber, getTimeZones, isAirportCode, isRyanairUnavailable } from './ryanair';
import { addDays, expandDates } from './time';
import { DateDirection, Flight, SearchResult } from './types';

export { combineRoundTrips, RETURN_OPTIONS_PER_OUTBOUND } from './finder';
export { expandDates };

// Limits that keep one search from sending thousands of requests to Ryanair
export const MAX_DATE_RANGE_DAYS = 7;
export const MAX_AIRPORTS_PER_SIDE = 40;
export const MAX_SEARCH_COMBINATIONS = 300; // airport pairs x departure dates
export const MAX_RESULTS = 200; // the page sorts and filters these itself

export const RYANAIR_UNAVAILABLE =
    "Ryanair isn't answering right now, so prices can't be loaded. Please try again in a few minutes.";

export interface SearchParams {
    origins: string[];
    dests: string[]; // [ANYWHERE] to find the cheapest destinations
    anywhere?: boolean;
    date: string;
    dateRangeDays: number;
    dateDirection: DateDirection;
    returnDate?: string;
    returnDateRange: number;
    returnDateDirection: DateDirection;
}

export type ParseResult = { ok: true; params: SearchParams } | { ok: false; error: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseCodes(value: string | null): string[] {
    if (!value) return [];
    return [...new Set(value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))];
}

function parseDirection(value: string | null): DateDirection {
    return value === 'after' || value === 'before' ? value : 'both';
}

function parseRange(value: string | null): number {
    const n = parseInt(value ?? '', 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

function isValidDate(value: string): boolean {
    return DATE.test(value) && !Number.isNaN(Date.parse(value)) && addDays(value, 0) === value;
}

export function parseSearchParams(sp: URLSearchParams): ParseResult {
    const origins = parseCodes(sp.get('origin'));
    const dests = parseCodes(sp.get('dest'));
    const date = sp.get('date') ?? '';
    const returnDate = sp.get('returnDate') || undefined;

    if (origins.length === 0 || dests.length === 0 || !date) {
        return { ok: false, error: 'Please choose where you are flying from, where to, and a date.' };
    }
    const anywhere = dests.length === 1 && dests[0] === ANYWHERE;
    if (![...origins, ...(anywhere ? [] : dests)].every(isAirportCode)) {
        return { ok: false, error: 'Invalid airport code.' };
    }
    if (!isValidDate(date) || (returnDate && !isValidDate(returnDate))) {
        return { ok: false, error: 'Invalid date.' };
    }
    if (returnDate && returnDate < date) {
        return { ok: false, error: 'The return date must be on or after the departure date.' };
    }
    if (origins.length > MAX_AIRPORTS_PER_SIDE || dests.length > MAX_AIRPORTS_PER_SIDE) {
        return { ok: false, error: `Too many airports selected (max ${MAX_AIRPORTS_PER_SIDE} on each side).` };
    }

    const dateRangeDays = parseRange(sp.get('dateRangeDays'));
    const returnDateRange = parseRange(sp.get('returnDateRange'));
    if (dateRangeDays > MAX_DATE_RANGE_DAYS || returnDateRange > MAX_DATE_RANGE_DAYS) {
        return { ok: false, error: `Flexible dates can be at most ${MAX_DATE_RANGE_DAYS} days.` };
    }

    const params: SearchParams = {
        origins,
        dests,
        anywhere,
        date,
        dateRangeDays,
        dateDirection: parseDirection(sp.get('dateDirection')),
        returnDate,
        returnDateRange,
        returnDateDirection: parseDirection(sp.get('returnDateDirection')),
    };

    const days = expandDates(date, dateRangeDays, params.dateDirection).length;
    if (anywhere) {
        if (origins.length > MAX_ANYWHERE_ORIGINS || origins.length * days > MAX_ANYWHERE_ORIGIN_DAYS) {
            return {
                ok: false,
                error: 'This "Anywhere" search is too broad. Try one city as the origin or fewer flexible days.',
            };
        }
        return { ok: true, params };
    }

    const combinations = origins.length * dests.length * days;
    if (combinations > MAX_SEARCH_COMBINATIONS) {
        return {
            ok: false,
            error: 'This search is too broad. Try fewer airports (e.g. a city or region instead of a whole country) or a smaller flexible date range.',
        };
    }

    return { ok: true, params };
}



const byPrice = (a: SearchResult, b: SearchResult) => a.totalPrice - b.totalPrice;

// Flight numbers are looked up after a search for the cheapest results only: each is one request to Ryanair,
// and other searches wait behind them. Results without one still link to the booking page.
const FLIGHT_NUMBER_RESULTS = 20;
const MAX_FLIGHT_NUMBER_LOOKUPS = 40;

/** Direct and one-stop trips for every origin/destination airport pair. */
async function* searchPairs(p: SearchParams, timeZones: Map<string, string>, signal?: AbortSignal): AsyncGenerator<SearchEvent> {
    const outDates = expandDates(p.date, p.dateRangeDays, p.dateDirection);
    const returnDates = p.returnDate ? expandDates(p.returnDate, p.returnDateRange, p.returnDateDirection) : [];
    const pairs = p.origins.flatMap(origin => p.dests.filter(dest => dest !== origin).map(dest => ({ origin, dest })));
    // Keep the total sent to the page reasonable when many airports are searched
    const perPairLimit = Math.max(MAX_RESULTS / 10, Math.ceil((MAX_RESULTS * 3) / Math.max(pairs.length, 1)));

    // Round trips: every pair's flights, so returns can also come from another selected airport (see below)
    const outboundByPair = new Map<string, SearchResult[]>();
    const returnsByPair = new Map<string, SearchResult[]>(); // flights back for the pair, dest -> origin

    const tasks = pairs.map(({ origin, dest }) => async (emit: (e: SearchEvent) => void) => {
        const pair = `${origin}-${dest}`;
        const send = (results: SearchResult[], final: boolean) => {
            const sorted = [...results].sort(byPrice).slice(0, perPairLimit);
            if (final || sorted.length > 0) emit({ type: 'results', pair, results: sorted, final });
        };

        // Start everything; direct flights need far fewer requests, so they arrive first
        const outDirect = findDirect(origin, dest, outDates, timeZones, signal);
        const outOneStop = findOneStop(origin, dest, outDates, timeZones, true, signal);

        if (!p.returnDate) {
            send(await outDirect, false);
            send([...(await outDirect), ...(await outOneStop)], true);
            return;
        }

        const retDirect = findDirect(dest, origin, returnDates, timeZones, signal);
        const retOneStop = findOneStop(dest, origin, returnDates, timeZones, true, signal);
        send(combineRoundTrips(await outDirect, await retDirect), false);
        const outbound = [...(await outDirect), ...(await outOneStop)];
        const returns = [...(await retDirect), ...(await retOneStop)];
        outboundByPair.set(pair, outbound);
        returnsByPair.set(pair, returns);
        // Final results come once every pair is done, so they can include other airports' returns
        send(combineRoundTrips(outbound, returns), pairs.length === 1);
    });

    yield* merge(tasks);
    if (!p.returnDate || pairs.length === 1) return;

    // Round trips that come back from another airport in the same city, or to another selected home
    // airport nearby. These need no extra requests: every selected airport's returns are already here.
    const coordinates = await getCoordinates();
    for (const { origin, dest } of pairs) {
        const pair = `${origin}-${dest}`;
        const outbound = outboundByPair.get(pair);
        if (!outbound) continue; // this pair's search failed; keep what was already sent
        const otherReturns = pairs
            .filter(other => other.dest !== dest || other.origin !== origin)
            .filter(other => canComeBack(origin, dest, other.dest, other.origin, code => coordinates.get(code)))
            .flatMap(other => returnsByPair.get(`${other.origin}-${other.dest}`) ?? []);
        const results = [
            ...combineRoundTrips(outbound, returnsByPair.get(pair) ?? []),
            ...combineWithOtherAirports(outbound, otherReturns),
        ].sort(byPrice).slice(0, perPairLimit);
        yield { type: 'results', pair, results, final: true };
    }
}

/** Flight numbers for the cheapest results (month fares don't include them). */
async function lookUpFlightNumbers(results: SearchResult[], signal?: AbortSignal): Promise<Record<string, string>> {
    const missing = new Map<string, Flight>();
    for (const r of [...results].sort(byPrice).slice(0, FLIGHT_NUMBER_RESULTS)) {
        for (const f of [...r.flights, ...(r.returnFlights?.[0]?.flights ?? [])]) {
            if (!f.flightNumber && missing.size < MAX_FLIGHT_NUMBER_LOOKUPS) missing.set(flightKey(f), f);
        }
    }
    const numbers: Record<string, string> = {};
    await Promise.all([...missing].map(async ([key, f]) => {
        const n = await getFlightNumber(f, signal);
        if (n) numbers[key] = n;
    }));
    return numbers;
}

/**
 * Search, sending results as they're found: direct flights first, then one-stop connections.
 * Afterwards, flight numbers are looked up for the cheapest results. Abort `signal` when nobody is waiting for
 * the results any more, so the Ryanair requests still queued for them are dropped.
 */
export async function* streamSearch(p: SearchParams, signal?: AbortSignal): AsyncGenerator<SearchEvent> {
    if (isRyanairUnavailable()) {
        yield { type: 'error', error: RYANAIR_UNAVAILABLE };
        return;
    }
    const timeZones = await getTimeZones();
    const finalResults = new Map<string, SearchResult[]>();

    for await (const event of p.anywhere ? searchAnywhere(p, timeZones, signal) : searchPairs(p, timeZones, signal)) {
        if (event.type === 'results' && event.final) finalResults.set(event.pair, event.results);
        yield event;
    }
    // Nothing found because Ryanair didn't answer is not the same as "no flights"
    if ([...finalResults.values()].every(r => r.length === 0) && isRyanairUnavailable()) {
        yield { type: 'error', error: RYANAIR_UNAVAILABLE };
        return;
    }
    yield { type: 'complete' };

    const numbers = await lookUpFlightNumbers([...finalResults.values()].flat(), signal);
    if (Object.keys(numbers).length > 0) yield { type: 'flightNumbers', numbers };
}

/** Whole search at once (used by tests): every result, cheapest first. */
export async function runSearch(p: SearchParams): Promise<SearchResult[]> {
    const byPair = new Map<string, SearchResult[]>();
    let numbers: Record<string, string> = {};
    for await (const event of streamSearch(p)) {
        if (event.type === 'results') byPair.set(event.pair, event.results);
        if (event.type === 'flightNumbers') numbers = event.numbers;
    }
    return applyFlightNumbers([...byPair.values()].flat(), numbers).sort(byPrice).slice(0, MAX_RESULTS);
}
