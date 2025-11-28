
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
        const directFlight = await getOneWayFares(origin, dest, date);
        if (directFlight) {
            results.push({
                type: 'direct',
                origin,
                destination: dest,
                flights: [directFlight],
                totalPrice: directFlight.price.value,
                currency: directFlight.price.currencyCode,
                duration: getDurationInMinutes(directFlight.departureDate, directFlight.arrivalDate),
            });
        }
    } catch (e) {
        console.error('Error fetching direct flight', e);
    }

    // 2. Layover Flights
    try {
        const [routesFromOrigin, routesFromDest] = await Promise.all([
            getRoutes(origin),
            getRoutes(dest), // This gets destinations FROM dest. Assuming symmetry.
        ]);

        // Intersection: Hubs that are destinations from Origin AND destinations from Dest (meaning Dest is a destination from Hub if symmetric)
        // Wait, if A->C exists, and B->C exists (from getRoutes(B)), does that mean C->B exists?
        // Usually yes.
        const hubs = routesFromOrigin.filter(hub => routesFromDest.includes(hub));
        console.log(`Found ${hubs.length} potential hubs: ${hubs.join(', ')}`);

        // Limit concurrency
        const CONCURRENCY_LIMIT = 5;
        const chunks = [];
        for (let i = 0; i < hubs.length; i += CONCURRENCY_LIMIT) {
            chunks.push(hubs.slice(i, i + CONCURRENCY_LIMIT));
        }

        for (const chunk of chunks) {
            await Promise.all(chunk.map(async (hub) => {
                if (hub === origin || hub === dest) return;

                // Fetch A->Hub and Hub->B
                // We need Hub->B. We assumed symmetry.
                const [flightA, flightB] = await Promise.all([
                    getOneWayFares(origin, hub, date),
                    getOneWayFares(hub, dest, date), // This checks Hub->Dest
                ]);

                if (flightA && flightB) {
                    // Check connection time
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
