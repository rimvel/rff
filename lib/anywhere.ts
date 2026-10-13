// "Anywhere" search: the cheapest destinations from the chosen airport(s), direct or with one stop.

import { SearchEvent } from './events';
import { combineRoundTrips, directResult, findDirect, layoverResult } from './finder';
import { isAllDirect } from './resultFilters';
import { getAnywhere, getDayFare } from './ryanair';
import type { SearchParams } from './search';
import { expandDates } from './time';
import { Flight, SearchResult } from './types';

export { ANYWHERE, MAX_ANYWHERE_ORIGIN_DAYS, MAX_ANYWHERE_ORIGINS } from './searchUrl';
// Return flights are looked up for this many of the cheapest destinations
export const MAX_ROUND_TRIP_DESTINATIONS = 40;

const byPrice = (a: SearchResult, b: SearchResult) => a.totalPrice - b.totalPrice;

/** For each destination: the cheapest option, plus the cheapest all-direct one if that's a different trip. */
export function bestPerDestination(results: SearchResult[]): SearchResult[] {
    const byDest = new Map<string, SearchResult[]>();
    for (const r of results) {
        const list = byDest.get(r.destination) ?? [];
        list.push(r);
        byDest.set(r.destination, list);
    }
    const best: SearchResult[] = [];
    for (const list of byDest.values()) {
        list.sort(byPrice);
        best.push(list[0]);
        const direct = list.find(isAllDirect);
        if (direct && direct !== list[0]) best.push(direct);
    }
    return best.sort(byPrice);
}

export async function* searchAnywhere(p: SearchParams, timeZones: Map<string, string>, signal?: AbortSignal): AsyncGenerator<SearchEvent> {
    const outDates = expandDates(p.date, p.dateRangeDays, p.dateDirection);
    const origins = new Set(p.origins);
    const pair = 'anywhere';

    // 1. Every destination from each origin on each day (one request each); these are also the first legs
    const firstLegs: { date: string; flights: Flight[] }[] = await Promise.all(
        p.origins.flatMap(origin => outDates.map(async date => ({ date, flights: await getAnywhere(origin, date, signal) }))),
    );
    const outDirect = firstLegs.flatMap(({ date, flights }) =>
        flights.filter(f => !origins.has(f.destination)).map(f => directResult(f, date, timeZones)));

    if (!p.returnDate) yield { type: 'results', pair, results: bestPerDestination(outDirect), final: false };

    // 2. Every destination from each of those airports, on the same days, as second legs
    const hubDays = new Map<string, { hub: string; date: string }>();
    for (const { date, flights } of firstLegs) {
        for (const f of flights) hubDays.set(`${f.destination}|${date}`, { hub: f.destination, date });
    }
    const secondLegs = new Map<string, Flight[]>(); // by "hub|date"
    await Promise.all([...hubDays].map(async ([key, { hub, date }]) => secondLegs.set(key, await getAnywhere(hub, date, signal))));

    const outOneStop: SearchResult[] = [];
    const hubsTo = new Map<string, Set<string>>(); // destination -> airports that fly there
    for (const { date, flights } of firstLegs) {
        for (const first of flights) {
            for (const second of secondLegs.get(`${first.destination}|${date}`) ?? []) {
                const dest = second.destination;
                if (origins.has(dest) || dest === first.origin) continue;
                if (!hubsTo.has(dest)) hubsTo.set(dest, new Set());
                hubsTo.get(dest)!.add(first.destination);
                const trip = layoverResult(first, second, date, timeZones);
                if (trip) outOneStop.push(trip);
            }
        }
    }
    const outbound = [...outDirect, ...outOneStop];

    if (!p.returnDate) {
        yield { type: 'results', pair, results: bestPerDestination(outbound), final: true };
        return;
    }

    // 3. Round trips: return flights for the cheapest destinations, back to the same origin
    const returnDates = expandDates(p.returnDate, p.returnDateRange, p.returnDateDirection);
    const destinations = [...new Set(bestPerDestination(outbound).map(r => r.destination))].slice(0, MAX_ROUND_TRIP_DESTINATIONS);
    const routes = destinations.flatMap(dest => [...origins].map(origin => ({ origin, dest })))
        .filter(({ origin, dest }) => outbound.some(r => r.origin === origin && r.destination === dest));
    const outboundFor = (origin: string, dest: string) => outbound.filter(r => r.origin === origin && r.destination === dest);
    const directHubs = new Map([...origins].map(o => [o, new Set(firstLegs.flatMap(l => l.flights).filter(f => f.origin === o).map(f => f.destination))]));

    const directReturns = await Promise.all(routes.map(({ origin, dest }) => findDirect(dest, origin, returnDates, timeZones, signal)));
    yield {
        type: 'results',
        pair,
        results: bestPerDestination(routes.flatMap(({ origin, dest }, i) => combineRoundTrips(outboundFor(origin, dest), directReturns[i]))),
        final: false,
    };

    // One-stop returns via airports that connect the destination and the origin
    const allReturns = await Promise.all(routes.map(async ({ origin, dest }, i) => {
        const hubs = [...(hubsTo.get(dest) ?? [])].filter(h => directHubs.get(origin)?.has(h));
        const oneStop = await Promise.all(hubs.flatMap(hub => returnDates.map(async date => {
            const [first, second] = await Promise.all([getDayFare(dest, hub, date, signal), getDayFare(hub, origin, date, signal)]);
            return first && second ? layoverResult(first, second, date, timeZones) : null;
        })));
        return [...directReturns[i], ...oneStop.filter((r): r is SearchResult => r !== null)];
    }));
    yield {
        type: 'results',
        pair,
        results: bestPerDestination(routes.flatMap(({ origin, dest }, i) => combineRoundTrips(outboundFor(origin, dest), allReturns[i]))),
        final: true,
    };
}
