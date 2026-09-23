// Shared types used by both the API routes and the UI.

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
    timeZone?: string; // IANA zone, e.g. "Europe/Vilnius"
}

export interface Price {
    value: number;
    currencyCode: string;
}

export interface Flight {
    origin: string;
    destination: string;
    departureDate: string; // local time at origin, no offset (e.g. "2026-10-15T12:25:00")
    arrivalDate: string; // local time at destination, no offset
    price: Price;
    flightNumber: string;
}

export interface RouteResult {
    type: 'direct' | 'layover';
    origin: string;
    destination: string;
    via?: string;
    flights: Flight[];
    totalPrice: number;
    currency: string;
    duration: number; // real elapsed minutes, time zones accounted for
    searchDate?: string;
}

export interface SearchResult extends RouteResult {
    searchDate: string;
    isRoundTrip?: boolean;
    returnFlights?: RouteResult[];
}

export type DateDirection = 'both' | 'after' | 'before';
