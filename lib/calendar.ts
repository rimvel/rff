import { findHubs, layoverResult } from './finder';
import { getMonthFares, isAirportCode } from './ryanair';
import { addDays } from './time';
import { MAX_AIRPORTS_PER_SIDE } from './search';

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

/** Cheapest one-way price for every day of a month, across all the airport pairs. */
export async function priceCalendar({ origins, dests, month }: CalendarParams): Promise<PriceCalendar> {
    const pairs = origins.flatMap(origin => dests.filter(d => d !== origin).map(dest => ({ origin, dest })));
    const includesConnections = pairs.length <= MAX_PAIRS_WITH_CONNECTIONS;
    const best = new Map<string, { price: number; direct: boolean }>();
    const offer = (date: string, price: number, direct: boolean) => {
        const current = best.get(date);
        if (!current || price < current.price) best.set(date, { price, direct });
    };

    await Promise.all(pairs.map(async ({ origin, dest }) => {
        const direct = getMonthFares(origin, dest, month);
        if (includesConnections) {
            const hubs = await findHubs(origin, dest);
            await Promise.all(hubs.map(async hub => {
                const [first, second] = await Promise.all([getMonthFares(origin, hub, month), getMonthFares(hub, dest, month)]);
                for (const [date, a] of first) {
                    const b = second.get(date);
                    const trip = b && layoverResult(a, b, date, new Map());
                    if (trip) offer(date, trip.totalPrice, false);
                }
            }));
        }
        for (const [date, f] of await direct) offer(date, f.price.value, true);
    }));

    return {
        month,
        includesConnections,
        days: daysOfMonth(month).map(date => ({ date, price: best.get(date)?.price ?? null, direct: best.get(date)?.direct ?? false })),
    };
}
