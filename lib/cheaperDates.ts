// "Cheaper nearby": whether moving a search by a few days would be noticeably cheaper.
// Works on the price calendar's answers; kept free of server code so the page can use it.

import type { CalendarDay, DateGrid } from './calendar';
import { SearchRequest } from './searchUrl';
import { expandDates } from './time';

export interface CheaperDates {
    date: string;
    returnDate?: string;
    price: number;
    /** How much less than the cheapest option of the search shown */
    saving: number;
}

/** How far the dates may move */
export const NEARBY_DAYS = 3;
/** A round trip may become this many days longer or shorter, no more: it should stay the same kind of trip */
const MAX_LENGTH_CHANGE = 1;
// Small differences aren't worth a hint: at least this many euros and this share of the price
const MIN_SAVING = 5;
const MIN_SAVING_SHARE = 0.1;

const DAY_MS = 86_400_000;
const daysApart = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
const round2 = (n: number) => Math.round(n * 100) / 100;

function worthIt(price: number, cheapestNow: number): boolean {
    const saving = cheapestNow - price;
    return saving >= MIN_SAVING && saving >= cheapestNow * MIN_SAVING_SHARE;
}

function searchedDates(date: string, range?: number, direction?: 'both' | 'after' | 'before'): Set<string> {
    return new Set(expandDates(date, range ?? 0, direction ?? 'both'));
}

/**
 * The cheapest day within a few days of a one-way search that it didn't already cover, if it is
 * noticeably cheaper than `cheapestNow` (the cheapest option found). `days` is a month of the price calendar.
 */
export function cheaperOneWay(days: CalendarDay[], request: SearchRequest, cheapestNow: number, today: string): CheaperDates | null {
    const searched = searchedDates(request.date, request.departureDateRange, request.departureDateDirection);
    let best: CheaperDates | null = null;
    let bestDistance = 0;
    for (const day of days) {
        const distance = Math.abs(daysApart(request.date, day.date));
        if (day.price === null || distance > NEARBY_DAYS || searched.has(day.date) || day.date < today) continue;
        // Equal prices: the day closest to the one asked for
        if (!best || day.price < best.price || (day.price === best.price && distance < bestDistance)) {
            best = { date: day.date, price: day.price, saving: round2(cheapestNow - day.price) };
            bestDistance = distance;
        }
    }
    return best && worthIt(best.price, cheapestNow) ? best : null;
}

/**
 * The same for a round trip, from the date grid: the cheapest nearby pair of dates the search didn't cover,
 * for a trip of about the same length.
 */
export function cheaperRoundTrip(grid: DateGrid, request: SearchRequest, cheapestNow: number, today: string): CheaperDates | null {
    if (!request.returnDate) return null;
    const searchedOut = searchedDates(request.date, request.departureDateRange, request.departureDateDirection);
    const searchedBack = searchedDates(request.returnDate, request.returnDateRange, request.returnDateDirection);
    const length = daysApart(request.date, request.returnDate);
    let best: CheaperDates | null = null;
    let bestDistance = 0;
    grid.departures.forEach((date, i) => grid.returns.forEach((returnDate, j) => {
        const price = grid.prices[i]?.[j] ?? null;
        if (price === null || date < today || (searchedOut.has(date) && searchedBack.has(returnDate))) return;
        if (Math.abs(daysApart(date, returnDate) - length) > MAX_LENGTH_CHANGE) return;
        const distance = Math.abs(daysApart(request.date, date)) + Math.abs(daysApart(request.returnDate!, returnDate));
        if (!best || price < best.price || (price === best.price && distance < bestDistance)) {
            best = { date, returnDate, price, saving: round2(cheapestNow - price) };
            bestDistance = distance;
        }
    }));
    return best && worthIt((best as CheaperDates).price, cheapestNow) ? best : null;
}
