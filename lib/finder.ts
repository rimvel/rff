import { getOneWayFares, getRoutes } from './ryanair';
import { minutesBetween } from './time';
import { Flight, RouteResult } from './types';

export type { RouteResult } from './types';

export const MIN_CONNECTION_MINUTES = 120; // 2 hours
export const MAX_CONNECTION_MINUTES = 720; // 12 hours

/** Real elapsed minutes from the first departure to the last arrival. */
export function tripDuration(flights: Flight[], timeZones: Map<string, string>): number {
    const first = flights[0];
    const last = flights[flights.length - 1];
    return minutesBetween(first.departureDate, timeZones.get(first.origin), last.arrivalDate, timeZones.get(last.destination));
}

/** Minutes waiting at the hub. Both times are local to the same airport, so no time zone is needed. */
export function connectionMinutes(first: Flight, second: Flight): number {
    return minutesBetween(first.arrivalDate, undefined, second.departureDate, undefined);
}

export async function findCheapestRoutes(
    origin: string,
    dest: string,
    date: string,
    timeZones: Map<string, string> = new Map(),
): Promise<RouteResult[]> {
    const results: RouteResult[] = [];

    const [direct, routesFromOrigin, routesFromDest] = await Promise.all([
        getOneWayFares(origin, dest, date),
        getRoutes(origin),
        getRoutes(dest),
    ]);

    // 1. Direct flight
    if (direct) {
        results.push({
            type: 'direct',
            origin,
            destination: dest,
            flights: [direct],
            totalPrice: direct.price.value,
            currency: direct.price.currencyCode,
            duration: tripDuration([direct], timeZones),
        });
    }

    // 2. One stop via any airport both ends fly to
    const fromDest = new Set(routesFromDest);
    const hubs = routesFromOrigin.filter(hub => fromDest.has(hub) && hub !== origin && hub !== dest);

    // Outgoing requests are rate-limited globally in ryanair.ts, so run all hubs at once
    await Promise.all(hubs.map(async hub => {
        const [flightA, flightB] = await Promise.all([
            getOneWayFares(origin, hub, date),
            getOneWayFares(hub, dest, date),
        ]);
        if (!flightA || !flightB) return;

        const wait = connectionMinutes(flightA, flightB);
        if (wait < MIN_CONNECTION_MINUTES || wait > MAX_CONNECTION_MINUTES) return;

        results.push({
            type: 'layover',
            origin,
            destination: dest,
            via: hub,
            flights: [flightA, flightB],
            totalPrice: round2(flightA.price.value + flightB.price.value),
            currency: flightA.price.currencyCode,
            duration: tripDuration([flightA, flightB], timeZones),
        });
    }));

    return results.sort((a, b) => a.totalPrice - b.totalPrice);
}

export function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
