import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fake Ryanair API: routes per airport, and one fare per route/day
const ROUTES: Record<string, string[]> = {
    VNO: ['STN', 'BGY', 'BCN'],
    AGP: ['STN', 'BGY', 'BCN'],
};

const FARES: Record<string, [dep: string, arr: string, price: number]> = {
    'VNO-STN': ['2026-10-15T06:00:00', '2026-10-15T07:00:00', 20], // good connection to STN-AGP
    'STN-AGP': ['2026-10-15T10:00:00', '2026-10-15T13:30:00', 25],
    'VNO-BGY': ['2026-10-15T06:00:00', '2026-10-15T07:30:00', 10], // connection too short (1h)
    'BGY-AGP': ['2026-10-15T08:30:00', '2026-10-15T11:00:00', 10],
    'VNO-BCN': ['2026-10-15T06:00:00', '2026-10-15T09:00:00', 10], // connection too long (13h)
    'BCN-AGP': ['2026-10-15T22:00:00', '2026-10-15T23:30:00', 10],
};

function fakeFetch(url: string) {
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    const routes = url.match(/routes\/en\/airport\/([A-Z]{3})/);
    if (routes) return json((ROUTES[routes[1]] ?? []).map(code => ({ arrivalAirport: { code } })));
    if (url.includes('/airports/en/active')) {
        return json([
            { code: 'VNO', timeZone: 'Europe/Vilnius' },
            { code: 'AGP', timeZone: 'Europe/Madrid' },
        ]);
    }
    const u = new URL(url);
    const key = `${u.searchParams.get('departureAirportIataCode')}-${u.searchParams.get('arrivalAirportIataCode')}`;
    const fare = FARES[key];
    return json({
        fares: fare
            ? [{ outbound: { departureDate: fare[0], arrivalDate: fare[1], price: { value: fare[2], currencyCode: 'EUR' }, flightNumber: `FR${key}` } }]
            : [],
    });
}

describe('findCheapestRoutes', () => {
    beforeEach(() => {
        vi.resetModules(); // fresh caches for each test
        vi.stubGlobal('fetch', vi.fn(fakeFetch));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('finds layovers only within the allowed connection window', async () => {
        const { findCheapestRoutes } = await import('../lib/finder');
        const results = await findCheapestRoutes('VNO', 'AGP', '2026-10-15');
        expect(results).toHaveLength(1);
        expect(results[0].via).toBe('STN');
        expect(results[0].totalPrice).toBe(45);
        expect(results[0].flights.map(f => `${f.origin}-${f.destination}`)).toEqual(['VNO-STN', 'STN-AGP']);
    });

    it('computes duration using airport time zones', async () => {
        const { findCheapestRoutes } = await import('../lib/finder');
        const zones = new Map([['VNO', 'Europe/Vilnius'], ['AGP', 'Europe/Madrid']]);
        const [result] = await findCheapestRoutes('VNO', 'AGP', '2026-10-15', zones);
        // 06:00 Vilnius (03:00 UTC) -> 13:30 Madrid (11:30 UTC) = 8h30m
        expect(result.duration).toBe(510);
    });

    it('does not ask Ryanair twice for the same thing', async () => {
        const { findCheapestRoutes } = await import('../lib/finder');
        await findCheapestRoutes('VNO', 'AGP', '2026-10-15');
        const calls = vi.mocked(fetch).mock.calls.length;
        await findCheapestRoutes('VNO', 'AGP', '2026-10-15');
        expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
    });
});

describe('runSearch', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal('fetch', vi.fn(fakeFetch));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('returns results sorted by price with time-zone aware durations', async () => {
        const { runSearch } = await import('../lib/search');
        const results = await runSearch({
            origins: ['VNO'], dests: ['AGP'], date: '2026-10-15',
            dateRangeDays: 0, dateDirection: 'both', returnDateRange: 0, returnDateDirection: 'both',
        });
        expect(results).toHaveLength(1);
        expect(results[0].searchDate).toBe('2026-10-15');
        expect(results[0].duration).toBe(510);
    });
});
