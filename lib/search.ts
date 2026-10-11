import { applyFlightNumbers, flightKey, SearchEvent } from './events';
import { findDirect, findOneStop, round2 } from './finder';
import { getFlightNumber, getTimeZones, isAirportCode } from './ryanair';
import { addDays, expandDates, localToUtcMs } from './time';

export { expandDates };
import { DateDirection, Flight, RouteResult, SearchResult } from './types';

// Limits that keep one search from sending thousands of requests to Ryanair
export const MAX_DATE_RANGE_DAYS = 7;
export const MAX_AIRPORTS_PER_SIDE = 40;
export const MAX_SEARCH_COMBINATIONS = 300; // airport pairs x departure dates
export const MAX_RESULTS = 200; // the page sorts and filters these itself
export const RETURN_OPTIONS_PER_OUTBOUND = 5;

export interface SearchParams {
    origins: string[];
    dests: string[];
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
    if (![...origins, ...dests].every(isAirportCode)) {
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
        date,
        dateRangeDays,
        dateDirection: parseDirection(sp.get('dateDirection')),
        returnDate,
        returnDateRange,
        returnDateDirection: parseDirection(sp.get('returnDateDirection')),
    };

    const combinations = origins.length * dests.length * expandDates(date, dateRangeDays, params.dateDirection).length;
    if (combinations > MAX_SEARCH_COMBINATIONS) {
        return {
            ok: false,
            error: 'This search is too broad. Try fewer airports (e.g. a city or region instead of a whole country) or a smaller flexible date range.',
        };
    }

    return { ok: true, params };
}


/**
 * Pair each outbound option with the cheapest return options that depart after it lands.
 * Outbound options with no possible return are dropped.
 */
export function combineRoundTrips(outbound: SearchResult[], returns: RouteResult[]): SearchResult[] {
    const sortedReturns = [...returns].sort((a, b) => a.totalPrice - b.totalPrice);

    return outbound.flatMap(out => {
        // Arrival and return departure are both local to the destination airport, so they compare directly
        const landed = localToUtcMs(out.flights[out.flights.length - 1].arrivalDate);
        return sortedReturns
            .filter(ret => localToUtcMs(ret.flights[0].departureDate) > landed)
            .slice(0, RETURN_OPTIONS_PER_OUTBOUND)
            .map(ret => ({
                ...out,
                isRoundTrip: true,
                returnFlights: [ret],
                totalPrice: round2(out.totalPrice + ret.totalPrice),
            }));
    });
}

/** Turns tasks that each push messages into one stream of messages, in the order they happen. */
async function* merge<T>(tasks: ((emit: (item: T) => void) => Promise<void>)[]): AsyncGenerator<T> {
    const queue: T[] = [];
    let wake: (() => void) | null = null;
    const emit = (item: T) => {
        queue.push(item);
        wake?.();
    };
    let running = tasks.length;
    for (const task of tasks) {
        task(emit)
            .catch(e => console.error('Search task failed:', e))
            .finally(() => {
                running--;
                wake?.();
            });
    }
    while (running > 0 || queue.length > 0) {
        if (queue.length === 0) await new Promise<void>(resolve => (wake = resolve));
        wake = null;
        yield* queue.splice(0);
    }
}

const byPrice = (a: SearchResult, b: SearchResult) => a.totalPrice - b.totalPrice;

/** Most flight numbers to look up after a search (each is one request to Ryanair). */
const MAX_FLIGHT_NUMBER_LOOKUPS = 120;

/**
 * Search, sending results as they're found: direct flights first, then one-stop connections.
 * Afterwards, flight numbers are looked up for the cheapest results.
 */
export async function* streamSearch(p: SearchParams): AsyncGenerator<SearchEvent> {
    const timeZones = await getTimeZones();
    const outDates = expandDates(p.date, p.dateRangeDays, p.dateDirection);
    const returnDates = p.returnDate ? expandDates(p.returnDate, p.returnDateRange, p.returnDateDirection) : [];
    const pairs = p.origins.flatMap(origin => p.dests.filter(dest => dest !== origin).map(dest => ({ origin, dest })));
    // Keep the total sent to the page reasonable when many airports are searched
    const perPairLimit = Math.max(MAX_RESULTS / 10, Math.ceil((MAX_RESULTS * 3) / Math.max(pairs.length, 1)));
    const finalResults = new Map<string, SearchResult[]>();

    const tasks = pairs.map(({ origin, dest }) => async (emit: (e: SearchEvent) => void) => {
        const pair = `${origin}-${dest}`;
        const send = (results: SearchResult[], final: boolean) => {
            const sorted = [...results].sort(byPrice).slice(0, perPairLimit);
            if (final) finalResults.set(pair, sorted);
            if (final || sorted.length > 0) emit({ type: 'results', pair, results: sorted, final });
        };

        // Start everything; direct flights need far fewer requests, so they arrive first
        const outDirect = findDirect(origin, dest, outDates, timeZones);
        const outOneStop = findOneStop(origin, dest, outDates, timeZones);

        if (!p.returnDate) {
            send(await outDirect, false);
            send([...(await outDirect), ...(await outOneStop)], true);
            return;
        }

        const retDirect = findDirect(dest, origin, returnDates, timeZones);
        const retOneStop = findOneStop(dest, origin, returnDates, timeZones);
        send(combineRoundTrips(await outDirect, await retDirect), false);
        send(combineRoundTrips(
            [...(await outDirect), ...(await outOneStop)],
            [...(await retDirect), ...(await retOneStop)],
        ), true);
    });

    yield* merge(tasks);
    yield { type: 'complete' };

    // Flight numbers for the cheapest results (month fares don't include them)
    const cheapest = [...finalResults.values()].flat().sort(byPrice).slice(0, MAX_RESULTS / 2);
    const missing = new Map<string, Flight>();
    for (const r of cheapest) {
        for (const f of [...r.flights, ...(r.returnFlights?.[0]?.flights ?? [])]) {
            if (!f.flightNumber && missing.size < MAX_FLIGHT_NUMBER_LOOKUPS) missing.set(flightKey(f), f);
        }
    }
    if (missing.size > 0) {
        const numbers: Record<string, string> = {};
        await Promise.all([...missing].map(async ([key, f]) => {
            const n = await getFlightNumber(f);
            if (n) numbers[key] = n;
        }));
        yield { type: 'flightNumbers', numbers };
    }
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
