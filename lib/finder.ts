import { getDayFare, getRoutes } from './ryanair';
import { transferMinutes } from './mixedAirports';
import { localToUtcMs, minutesAtSamePlace, minutesBetween } from './time';
import { Flight, RouteResult, SearchResult } from './types';

export type { RouteResult } from './types';

export const MIN_CONNECTION_MINUTES = 120; // 2 hours
export const MAX_CONNECTION_MINUTES = 720; // 12 hours
export const RETURN_OPTIONS_PER_OUTBOUND = 5;

/** Real elapsed minutes from the first departure to the last arrival. */
export function tripDuration(flights: Flight[], timeZones: Map<string, string>): number {
    const first = flights[0];
    const last = flights[flights.length - 1];
    return minutesBetween(first.departureDate, timeZones.get(first.origin), last.arrivalDate, timeZones.get(last.destination));
}

/** Minutes waiting at the hub. Both times are local to the same airport, so no time zone is needed. */
export function connectionMinutes(first: Flight, second: Flight): number {
    return minutesAtSamePlace(first.arrivalDate, second.departureDate);
}

export function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Copy of the flight with its flight time filled in. */
function timed(flight: Flight, timeZones: Map<string, string>): Flight {
    return { ...flight, minutes: tripDuration([flight], timeZones) };
}

export function directResult(flight: Flight, searchDate: string, timeZones: Map<string, string>): SearchResult {
    return {
        type: 'direct',
        origin: flight.origin,
        destination: flight.destination,
        flights: [timed(flight, timeZones)],
        totalPrice: flight.price.value,
        currency: flight.price.currencyCode,
        duration: tripDuration([flight], timeZones),
        searchDate,
    };
}

/**
 * One-stop trip if the connection time works, otherwise null. The second flight may leave from another
 * airport in the same city (e.g. land at Stansted, fly on from Luton); then the time to get there is added
 * to the minimum connection time.
 */
export function layoverResult(first: Flight, second: Flight, searchDate: string, timeZones: Map<string, string>): SearchResult | null {
    const transfer = transferMinutes(first.destination, second.origin);
    if (transfer === undefined) return null; // not the same airport or city
    const wait = connectionMinutes(first, second);
    if (wait < MIN_CONNECTION_MINUTES + transfer || wait > MAX_CONNECTION_MINUTES) return null;
    return {
        type: 'layover',
        origin: first.origin,
        destination: second.destination,
        via: first.destination,
        flights: [timed(first, timeZones), timed(second, timeZones)],
        totalPrice: round2(first.price.value + second.price.value),
        currency: first.price.currencyCode,
        duration: tripDuration([first, second], timeZones),
        searchDate,
    };
}

/** Cheapest direct flight on each of the dates. Fares for a whole month come in one request. */
export async function findDirect(origin: string, dest: string, dates: string[], timeZones: Map<string, string> = new Map()): Promise<SearchResult[]> {
    const flights = await Promise.all(dates.map(date => getDayFare(origin, dest, date)));
    return flights.flatMap((f, i) => (f ? [directResult(f, dates[i], timeZones)] : []));
}

/** Airports both ends fly to, which could work as a one-stop connection. */
export async function findHubs(origin: string, dest: string): Promise<string[]> {
    const [fromOrigin, fromDest] = await Promise.all([getRoutes(origin), getRoutes(dest)]);
    const toDest = new Set(fromDest);
    return fromOrigin.filter(hub => toDest.has(hub) && hub !== origin && hub !== dest);
}

/**
 * Pairs of airports in the same city where the trip could land at one and leave from the other,
 * e.g. VNO -> STN, then LTN -> LIS.
 */
export async function findAirportChanges(origin: string, dest: string): Promise<{ arrive: string; depart: string }[]> {
    const [fromOrigin, fromDest] = await Promise.all([getRoutes(origin), getRoutes(dest)]);
    const ends = new Set([origin, dest]);
    return fromOrigin.flatMap(arrive => fromDest
        .filter(depart => depart !== arrive && !ends.has(arrive) && !ends.has(depart) && transferMinutes(arrive, depart) !== undefined)
        .map(depart => ({ arrive, depart })));
}

/**
 * One-stop trips on each of the dates: via every airport both ends fly to, and, when `changeAirports`
 * is on, also landing at one airport and flying on from another in the same city.
 */
export async function findOneStop(
    origin: string,
    dest: string,
    dates: string[],
    timeZones: Map<string, string> = new Map(),
    changeAirports = true,
): Promise<SearchResult[]> {
    const [hubs, changes] = await Promise.all([findHubs(origin, dest), changeAirports ? findAirportChanges(origin, dest) : []]);
    const connections = [...hubs.map(hub => ({ arrive: hub, depart: hub })), ...changes];
    // Outgoing requests are rate-limited globally in ryanair.ts, so run everything at once
    const perConnection = await Promise.all(connections.map(({ arrive, depart }) => Promise.all(dates.map(async date => {
        const [first, second] = await Promise.all([getDayFare(origin, arrive, date), getDayFare(depart, dest, date)]);
        return first && second ? layoverResult(first, second, date, timeZones) : null;
    }))));
    return perConnection.flat().filter((r): r is SearchResult => r !== null);
}

/** Direct and one-stop trips for one date, cheapest first. */
export async function findCheapestRoutes(
    origin: string,
    dest: string,
    date: string,
    timeZones: Map<string, string> = new Map(),
): Promise<SearchResult[]> {
    const [direct, oneStop] = await Promise.all([
        findDirect(origin, dest, [date], timeZones),
        findOneStop(origin, dest, [date], timeZones),
    ]);
    return [...direct, ...oneStop].sort((a, b) => a.totalPrice - b.totalPrice);
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

/**
 * Like combineRoundTrips, for returns that use a different airport: back from another airport in the same
 * city, and/or to another home airport. Each outbound option gets its own cheapest few of these, so they
 * never push out the same-airport options. Callers pass only returns that are allowed (see canComeBack).
 */
export function combineWithOtherAirports(outbound: SearchResult[], returns: RouteResult[]): SearchResult[] {
    const sortedReturns = [...returns].sort((a, b) => a.totalPrice - b.totalPrice);

    return outbound.flatMap(out => {
        const arrival = out.flights[out.flights.length - 1];
        const landed = localToUtcMs(arrival.arrivalDate);
        // Allow time to get to the other airport (same city, so local times compare directly)
        const readyFor = (ret: RouteResult) => landed + (transferMinutes(arrival.destination, ret.origin) ?? 0) * 60_000;
        return sortedReturns
            .filter(ret => ret.origin !== out.destination || ret.destination !== out.origin)
            .filter(ret => localToUtcMs(ret.flights[0].departureDate) > readyFor(ret))
            .slice(0, RETURN_OPTIONS_PER_OUTBOUND)
            .map(ret => ({
                ...out,
                isRoundTrip: true,
                returnFlights: [ret],
                totalPrice: round2(out.totalPrice + ret.totalPrice),
            }));
    });
}
