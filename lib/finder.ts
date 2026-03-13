import { getOneWayFares, getRoutes, Flight } from './ryanair';

export interface RouteResult {
    type: 'direct' | 'layover';
    origin: string;
    destination: string;
    via?: string;
    flights: Flight[];
    totalPrice: number;
    currency: string;
    duration: number; // in minutes
    carrier?: string; // flight carrier
}

const MIN_CONNECTION_MINUTES = 120; // 2 hours
const MAX_CONNECTION_MINUTES = 720; // 12 hours

function getDurationInMinutes(start: string, end: string): number {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    return (e - s) / 60000;
}

export async function findCheapestRoutes(origin: string, dest: string, date: string): Promise<RouteResult[]> {
    const results: RouteResult[] = [];

    // 1. Direct Flight
    try {
        const ryanairFlight = await getOneWayFares(origin, dest, date).catch(e => {
            console.error('Ryanair direct search failed', e);
            return null;
        });

        if (ryanairFlight) {
            results.push({
                type: 'direct',
                origin,
                destination: dest,
                flights: [ryanairFlight],
                totalPrice: ryanairFlight.price.value,
                currency: ryanairFlight.price.currencyCode,
                duration: getDurationInMinutes(ryanairFlight.departureDate, ryanairFlight.arrivalDate),
                carrier: 'Ryanair'
            });
        }
    } catch (e) {
        console.error('Error fetching direct flights', e);
    }

    // 2. Layover Flights via Ryanair Hubs
    try {
        const [routesFromOrigin, routesFromDest] = await Promise.all([
            getRoutes(origin),
            getRoutes(dest),
        ]);

        const hubs = routesFromOrigin.filter(hub => routesFromDest.includes(hub));

        // Limit concurrency
        const CONCURRENCY_LIMIT = 5;
        const chunks = [];
        for (let i = 0; i < hubs.length; i += CONCURRENCY_LIMIT) {
            chunks.push(hubs.slice(i, i + CONCURRENCY_LIMIT));
        }

        for (const chunk of chunks) {
            await Promise.all(chunk.map(async (hub) => {
                if (hub === origin || hub === dest) return;

                const [flightA, flightB] = await Promise.all([
                    getOneWayFares(origin, hub, date),
                    getOneWayFares(hub, dest, date),
                ]);

                if (flightA && flightB) {
                    const arrivalA = new Date(flightA.arrivalDate).getTime();
                    const departureB = new Date(flightB.departureDate).getTime();
                    const diffMinutes = (departureB - arrivalA) / 60000;

                    if (diffMinutes >= MIN_CONNECTION_MINUTES && diffMinutes <= MAX_CONNECTION_MINUTES) {
                        results.push({
                            type: 'layover',
                            origin,
                            destination: dest,
                            via: hub,
                            flights: [flightA, flightB],
                            totalPrice: flightA.price.value + flightB.price.value,
                            currency: flightA.price.currencyCode,
                            duration: getDurationInMinutes(flightA.departureDate, flightB.arrivalDate),
                            carrier: 'Ryanair (Layover)'
                        });
                    }
                }
            }));
        }

    } catch (e) {
        console.error('Error finding layovers', e);
    }

    return results.sort((a, b) => a.totalPrice - b.totalPrice);
}
