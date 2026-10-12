// Trips that use different airports: flying back from another airport in the same city, or returning to a
// different home airport you selected. Kept free of server code so the page can use it too.

/**
 * Airports in the same city (Ryanair's own city groups) and roughly how long it takes to get from one to the
 * other by coach or public transport, in minutes. Cautious estimates. Paris (Beauvais–Vatry, ~170 km apart,
 * about 3.5 hours) is left out on purpose.
 */
const TRANSFER_MINUTES: Record<string, number> = {
    // London
    'LTN-STN': 105,
    'LGW-STN': 180,
    'LGW-LTN': 150,
    // Milan
    'BGY-MXP': 105,
    // Rome
    'CIA-FCO': 75,
    // Barcelona
    'BCN-GRO': 90,
    'BCN-REU': 90,
    'GRO-REU': 180,
    // Brussels
    'BRU-CRL': 90,
    // Bucharest
    'BBU-OTP': 40,
    // Glasgow
    'GLA-PIK': 75,
    // Oslo
    'OSL-TRF': 120,
    // Stockholm
    'ARN-NYO': 120,
    'ARN-VST': 90,
    'NYO-VST': 150,
    // Valencia
    'CDT-VLC': 75,
    // Venice
    'TSF-VCE': 60,
    // Warsaw
    'WAW-WMI': 75,
};

/** Minutes to get between two airports in the same city; 0 for the same airport; undefined if not the same city. */
export function transferMinutes(a: string, b: string): number | undefined {
    if (a === b) return 0;
    return TRANSFER_MINUTES[[a, b].sort().join('-')];
}

/** Home airports this far apart can be mixed (out of one, back to the other) when you selected both. */
export const MAX_HOME_AIRPORT_KM = 200;

export interface Coordinates {
    latitude: number;
    longitude: number;
}

export function distanceKm(a: Coordinates, b: Coordinates): number {
    const rad = Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * rad;
    const dLon = (b.longitude - a.longitude) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Can a trip that went out from `outFrom` to `outTo` come back from `backFrom` to `backTo`?
 * The return must leave from the same city it arrived in, and land at a home airport you selected
 * (all origins of the search are selected) that's within MAX_HOME_AIRPORT_KM of where you left from.
 */
export function canComeBack(
    outFrom: string,
    outTo: string,
    backFrom: string,
    backTo: string,
    coordinates: (code: string) => Coordinates | undefined,
): boolean {
    if (transferMinutes(outTo, backFrom) === undefined) return false;
    if (backTo === outFrom || transferMinutes(outFrom, backTo) !== undefined) return true;
    const a = coordinates(outFrom);
    const b = coordinates(backTo);
    return !!a && !!b && distanceKm(a, b) <= MAX_HOME_AIRPORT_KM;
}
