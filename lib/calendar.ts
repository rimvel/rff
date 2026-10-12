import { findAirportChanges, findHubs, layoverResult } from './finder';
import { canComeBack } from './mixedAirports';
import { createRateLimit } from './rateLimit';
import { getCoordinates, getMonthFares, isAirportCode } from './ryanair';
import { addDays, expandDates } from './time';
import { MAX_AIRPORTS_PER_SIDE } from './search';

// Shared by the calendar endpoints: browsing is quick, but each view can mean dozens of requests to Ryanair
export const calendarRequestsPerVisitor = createRateLimit(40, 60_000);

export interface CalendarDay {
    date: string;
    price: number | null; // cheapest one-way price that day, null if no flights
    direct: boolean; // whether the cheapest option is a direct flight
}

export interface PriceCalendar {
    month: string; // "YYYY-MM"
    days: CalendarDay[];
    includesConnections: boolean;
}

// Beyond this many airport pairs, the calendar shows direct flights only (connections need many more requests)
export const MAX_PAIRS_WITH_CONNECTIONS = 12;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export type CalendarParams = { origins: string[]; dests: string[]; month: string };

export function parseCalendarParams(sp: URLSearchParams): { ok: true; params: CalendarParams } | { ok: false; error: string } {
    const codes = (v: string | null) => [...new Set((v ?? '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean))];
    const origins = codes(sp.get('origin'));
    const dests = codes(sp.get('dest'));
    const month = sp.get('month') ?? '';
    if (origins.length === 0 || dests.length === 0 || ![...origins, ...dests].every(isAirportCode)) {
        return { ok: false, error: 'Invalid airport code.' };
    }
    if (origins.length > MAX_AIRPORTS_PER_SIDE || dests.length > MAX_AIRPORTS_PER_SIDE) {
        return { ok: false, error: 'Too many airports selected.' };
    }
    if (!MONTH.test(month)) return { ok: false, error: 'Invalid month.' };
    return { ok: true, params: { origins, dests, month } };
}

function daysOfMonth(month: string): string[] {
    const days: string[] = [];
    for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) days.push(d);
    return days;
}

type DayPrices = Map<string, { price: number; direct: boolean }>;

function offerTo(best: DayPrices) {
    return (date: string, price: number, direct: boolean) => {
        const current = best.get(date);
        if (!current || price < current.price) best.set(date, { price, direct });
    };
}

/**
 * Cheapest one-way price on each of the days for one airport pair: direct, and (if `connections`) with one
 * stop, including changing airports in the same city. Fares come a month at a time.
 */
async function cheapestByDay(origin: string, dest: string, days: string[], connections: boolean): Promise<DayPrices> {
    const wanted = new Set(days);
    const months = [...new Set(days.map(d => d.slice(0, 7)))];
    const best: DayPrices = new Map();
    const offer = offerTo(best);

    const direct = Promise.all(months.map(m => getMonthFares(origin, dest, m)));
    if (connections) {
        const [hubs, changes] = await Promise.all([findHubs(origin, dest), findAirportChanges(origin, dest)]);
        const links = [...hubs.map(hub => ({ arrive: hub, depart: hub })), ...changes];
        await Promise.all(links.flatMap(({ arrive, depart }) => months.map(async month => {
            const [first, second] = await Promise.all([getMonthFares(origin, arrive, month), getMonthFares(depart, dest, month)]);
            for (const [date, a] of first) {
                const b = wanted.has(date) ? second.get(date) : undefined;
                const trip = b && layoverResult(a, b, date, new Map());
                if (trip) offer(date, trip.totalPrice, false);
            }
        })));
    }
    for (const month of await direct) {
        for (const [date, f] of month) if (wanted.has(date)) offer(date, f.price.value, true);
    }
    return best;
}

function airportPairs(origins: string[], dests: string[]) {
    return origins.flatMap(origin => dests.filter(d => d !== origin).map(dest => ({ origin, dest })));
}

/** Cheapest one-way price for every day of a month, across all the airport pairs. */
export async function priceCalendar({ origins, dests, month }: CalendarParams): Promise<PriceCalendar> {
    const pairs = airportPairs(origins, dests);
    const includesConnections = pairs.length <= MAX_PAIRS_WITH_CONNECTIONS;
    const days = daysOfMonth(month);
    const best: DayPrices = new Map();
    const offer = offerTo(best);

    const perPair = await Promise.all(pairs.map(({ origin, dest }) => cheapestByDay(origin, dest, days, includesConnections)));
    for (const prices of perPair) for (const [date, p] of prices) offer(date, p.price, p.direct);

    return {
        month,
        includesConnections,
        days: days.map(date => ({ date, price: best.get(date)?.price ?? null, direct: best.get(date)?.direct ?? false })),
    };
}

// --- Round-trip date grid ---

export const GRID_DAYS = 3; // departure and return dates, each +-3 days
export const MAX_GRID_PAIRS = 12;
const MAX_GRID_PAIRS_WITH_CONNECTIONS = 4; // both directions are needed, so connections are costlier here

export interface DateGrid {
    departures: string[];
    returns: string[];
    /** prices[i][j]: cheapest round trip leaving departures[i], coming back returns[j]; null if none */
    prices: (number | null)[][];
    includesConnections: boolean;
}

export type GridParams = { origins: string[]; dests: string[]; date: string; returnDate: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseGridParams(sp: URLSearchParams): { ok: true; params: GridParams } | { ok: false; error: string } {
    const codes = (v: string | null) => [...new Set((v ?? '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean))];
    const origins = codes(sp.get('origin'));
    const dests = codes(sp.get('dest'));
    const date = sp.get('date') ?? '';
    const returnDate = sp.get('returnDate') ?? '';
    if (origins.length === 0 || dests.length === 0 || ![...origins, ...dests].every(isAirportCode)) {
        return { ok: false, error: 'Invalid airport code.' };
    }
    if (!DATE.test(date) || !DATE.test(returnDate) || addDays(date, 0) !== date || addDays(returnDate, 0) !== returnDate || returnDate < date) {
        return { ok: false, error: 'Invalid dates.' };
    }
    if (airportPairs(origins, dests).length > MAX_GRID_PAIRS) {
        return { ok: false, error: 'Too many airports for the date grid.' };
    }
    return { ok: true, params: { origins, dests, date, returnDate } };
}

/**
 * Cheapest round trip for each departure day x return day around the chosen dates. Outbound and return are
 * separate one-way fares (that's how they're booked anyway), paired by the same rules as the search,
 * including coming back from another airport in the same city or to another selected home airport nearby.
 */
export async function roundTripGrid({ origins, dests, date, returnDate }: GridParams): Promise<DateGrid> {
    const departures = expandDates(date, GRID_DAYS, 'both');
    const returns = expandDates(returnDate, GRID_DAYS, 'both');
    const pairs = airportPairs(origins, dests);
    const includesConnections = pairs.length <= MAX_GRID_PAIRS_WITH_CONNECTIONS;

    const [coordinates, outbound, back] = await Promise.all([
        getCoordinates(),
        Promise.all(pairs.map(({ origin, dest }) => cheapestByDay(origin, dest, departures, includesConnections))),
        Promise.all(pairs.map(({ origin, dest }) => cheapestByDay(dest, origin, returns, includesConnections))),
    ]);

    const prices = departures.map(dep => returns.map(ret => {
        if (ret <= dep) return null;
        let cheapest: number | null = null;
        pairs.forEach((out, i) => {
            const outPrice = outbound[i].get(dep)?.price;
            if (outPrice === undefined) return;
            pairs.forEach((home, j) => {
                if (!canComeBack(out.origin, out.dest, home.dest, home.origin, code => coordinates.get(code))) return;
                const backPrice = back[j].get(ret)?.price;
                if (backPrice !== undefined && (cheapest === null || outPrice + backPrice < cheapest)) {
                    cheapest = Math.round((outPrice + backPrice) * 100) / 100;
                }
            });
        });
        return cheapest;
    }));

    return { departures, returns, prices, includesConnections };
}
