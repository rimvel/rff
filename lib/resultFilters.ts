import { ResultView } from './searchUrl';
import { minutesAtSamePlace } from './time';
import { RouteResult, SearchResult } from './types';

function legs(result: SearchResult): RouteResult[] {
    const ret = result.returnFlights?.[0];
    return ret ? [result, ret] : [result];
}

/** Total time in the air plus layovers, outbound and return. */
export function travelMinutes(result: SearchResult): number {
    return legs(result).reduce((sum, leg) => sum + leg.duration, 0);
}

/** Longest wait at a connecting airport, in minutes (0 for direct flights). */
export function longestLayoverMinutes(result: SearchResult): number {
    let longest = 0;
    for (const leg of legs(result)) {
        for (let i = 0; i < leg.flights.length - 1; i++) {
            longest = Math.max(longest, minutesAtSamePlace(leg.flights[i].arrivalDate, leg.flights[i + 1].departureDate));
        }
    }
    return longest;
}

/** Whether the return leaves from another airport than the outbound landed at, and/or lands at another home airport. */
export function otherAirportsBack(result: SearchResult): { from: boolean; to: boolean } {
    const ret = result.returnFlights?.[0];
    if (!ret) return { from: false, to: false };
    return { from: ret.origin !== result.destination, to: ret.destination !== result.origin };
}

/** Whether a connection lands at one airport and leaves from another. */
export function changesAirportsMidway(leg: RouteResult): boolean {
    return leg.flights.some((f, i) => i > 0 && leg.flights[i - 1].destination !== f.origin);
}

/** Whether the trip involves getting from one airport to another (as opposed to always the same airport). */
export function usesOtherAirports(result: SearchResult): boolean {
    const back = otherAirportsBack(result);
    return back.from || back.to || legs(result).some(changesAirportsMidway);
}

export function isAllDirect(result: SearchResult): boolean {
    return legs(result).every(leg => leg.type === 'direct');
}

const byPrice = (a: SearchResult, b: SearchResult) => a.totalPrice - b.totalPrice;

const COMPARATORS: Record<ResultView['sort'], (a: SearchResult, b: SearchResult) => number> = {
    cheapest: byPrice,
    fastest: (a, b) => travelMinutes(a) - travelMinutes(b) || byPrice(a, b),
    // Local departure times compare directly as "YYYY-MM-DDTHH:mm:ss" strings
    earliest: (a, b) => a.flights[0].departureDate.localeCompare(b.flights[0].departureDate) || byPrice(a, b),
};

/** Keep only the first (best, in the current order) result for each destination. */
export function onePerDestination(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(r => !seen.has(r.destination) && !!seen.add(r.destination));
}

export function applyView(results: SearchResult[], view: ResultView): SearchResult[] {
    return results
        .filter(r =>
            (!view.directOnly || isAllDirect(r)) &&
            (!view.sameAirport || !usesOtherAirports(r)) &&
            (!view.maxPrice || r.totalPrice <= view.maxPrice) &&
            (!view.maxLayoverHours || longestLayoverMinutes(r) <= view.maxLayoverHours * 60)
        )
        .sort(COMPARATORS[view.sort]);
}

export interface ResultSummary {
    cheapest: number;
    fastestMinutes: number;
    cheapestDirect?: number; // only when the cheapest overall isn't direct
}

/** Headline numbers for a list of results: cheapest price, shortest travel time, cheapest direct. */
export function summarize(results: SearchResult[]): ResultSummary | null {
    if (results.length === 0) return null;
    const cheapest = Math.min(...results.map(r => r.totalPrice));
    const fastestMinutes = Math.min(...results.map(travelMinutes));
    const direct = results.filter(isAllDirect).map(r => r.totalPrice);
    const cheapestDirect = direct.length > 0 ? Math.min(...direct) : undefined;
    return { cheapest, fastestMinutes, cheapestDirect: cheapestDirect !== cheapest ? cheapestDirect : undefined };
}
