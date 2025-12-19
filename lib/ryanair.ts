
const BASE_URL = 'https://services-api.ryanair.com/farfnd/v4';
const LOCATE_URL = 'https://www.ryanair.com/api/views/locate';

export interface Airport {
    code: string;
    name: string;
    country: {
        code: string;
        name: string;
    };
    city: {
        name: string;
        code: string;
    };
    macCity?: {
        name: string;
        code: string;
    };
    region?: {
        name: string;
        code: string;
    };
}

export interface Route {
    arrivalAirport: Airport;
    operator: string;
}

export interface Price {
    value: number;
    currencyCode: string;
}

export interface Flight {
    departureDate: string;
    arrivalDate: string;
    price: Price;
    flightNumber: string;
    duration: string; // inferred
}

export interface Trip {
    origin: string;
    destination: string;
    flights: Flight[];
    totalPrice: number;
    currency: string;
}

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

export async function getAirports(): Promise<Airport[]> {
    const res = await fetch(`${LOCATE_URL}/5/airports/en/active`, { headers: HEADERS });
    if (!res.ok) throw new Error(`Failed to fetch airports: ${res.status}`);
    return res.json();
}

export async function getRoutes(airportCode: string): Promise<string[]> {
    try {
        const res = await fetch(`${LOCATE_URL}/searchWidget/routes/en/airport/${airportCode}`, { headers: HEADERS });
        if (!res.ok) return []; // Some airports might not have routes or error out
        const data = await res.json();
        return data.map((r: any) => r.arrivalAirport.code);
    } catch (e) {
        console.error(`Error fetching routes for ${airportCode}`, e);
        return [];
    }
}

export async function getOneWayFares(origin: string, dest: string, date: string): Promise<Flight | null> {
    const url = `${BASE_URL}/oneWayFares?departureAirportIataCode=${origin}&arrivalAirportIataCode=${dest}&outboundDepartureDateFrom=${date}&outboundDepartureDateTo=${date}&currency=EUR`;
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.fares && data.fares.length > 0) {
            const fare = data.fares[0].outbound;
            return {
                departureDate: fare.departureDate,
                arrivalDate: fare.arrivalDate,
                price: fare.price,
                flightNumber: fare.flightNumber,
                duration: '', // Calculate if needed
            };
        }
        return null;
    } catch (e) {
        console.error(`Error fetching fares ${origin}->${dest}`, e);
        return null;
    }
}
