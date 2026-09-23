import { findCheapestRoutes, round2 } from './finder';
import { getTimeZones, isAirportCode } from './ryanair';
import { addDays, localToUtcMs } from './time';
import { DateDirection, RouteResult, SearchResult } from './types';

// Limits that keep one search from sending thousands of requests to Ryanair
export const MAX_DATE_RANGE_DAYS = 7;
export const MAX_AIRPORTS_PER_SIDE = 40;
export const MAX_SEARCH_COMBINATIONS = 300; // airport pairs x departure dates
export const MAX_RESULTS = 50;
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

export function expandDates(date: string, rangeDays: number, direction: DateDirection): string[] {
    const from = direction === 'after' ? 0 : -rangeDays;
    const to = direction === 'before' ? 0 : rangeDays;
    const dates: string[] = [];
    for (let i = from; i <= to; i++) dates.push(addDays(date, i));
    return dates;
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

export async function runSearch(p: SearchParams): Promise<SearchResult[]> {
    const timeZones = await getTimeZones();
    const outDates = expandDates(p.date, p.dateRangeDays, p.dateDirection);
    const returnDates = p.returnDate ? expandDates(p.returnDate, p.returnDateRange, p.returnDateDirection) : [];

    const pairs = p.origins.flatMap(origin => p.dests.filter(dest => dest !== origin).map(dest => ({ origin, dest })));

    // Outgoing requests are rate-limited and cached in ryanair.ts, so it's fine to start everything at once
    const perPair = await Promise.all(pairs.map(async ({ origin, dest }) => {
        const outboundPerDate = await Promise.all(outDates.map(async searchDate =>
            (await findCheapestRoutes(origin, dest, searchDate, timeZones)).map(r => ({ ...r, searchDate }))
        ));
        const outbound: SearchResult[] = outboundPerDate.flat();

        if (!p.returnDate || outbound.length === 0) return outbound;

        const returnsPerDate = await Promise.all(returnDates.map(async searchDate =>
            (await findCheapestRoutes(dest, origin, searchDate, timeZones)).map(r => ({ ...r, searchDate }))
        ));
        return combineRoundTrips(outbound, returnsPerDate.flat());
    }));

    return perPair.flat().sort((a, b) => a.totalPrice - b.totalPrice).slice(0, MAX_RESULTS);
}
