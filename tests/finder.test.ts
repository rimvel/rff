import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fake Ryanair API: routes per airport, and one fare per route/day
const ROUTES: Record<string, string[]> = {
    VNO: ['STN', 'BGY', 'BCN', 'AGP'],
    AGP: ['STN', 'BGY', 'BCN'],
};

const FARES: Record<string, [dep: string, arr: string, price: number]> = {
    'VNO-AGP': ['2026-10-15T15:00:00', '2026-10-15T19:30:00', 99], // direct, but pricier than via STN
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
    const month = url.match(/oneWayFares\/([A-Z]{3})\/([A-Z]{3})\/cheapestPerDay\?outboundMonthOfDate=(\d{4}-\d{2})/);
    if (month) {
        const fare = FARES[`${month[1]}-${month[2]}`];
        const days = Array.from({ length: 31 }, (_, i) => `${month[3]}-${String(i + 1).padStart(2, '0')}`);
        return json({
            outbound: {
                fares: days.map(day => fare && fare[0].startsWith(day)
                    ? { day, departureDate: fare[0], arrivalDate: fare[1], price: { value: fare[2], currencyCode: 'EUR' }, soldOut: false, unavailable: false }
                    : { day, departureDate: null, arrivalDate: null, price: null, soldOut: false, unavailable: true }),
            },
        });
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

    it('finds direct flights and layovers within the allowed connection window', async () => {
        const { findCheapestRoutes } = await import('../lib/finder');
        const results = await findCheapestRoutes('VNO', 'AGP', '2026-10-15');
        expect(results.map(r => r.via ?? 'direct')).toEqual(['STN', 'direct']);
        expect(results[0].totalPrice).toBe(45);
        expect(results[0].flights.map(f => `${f.origin}-${f.destination}`)).toEqual(['VNO-STN', 'STN-AGP']);
    });

    it('fetches a whole month of fares in one request per route', async () => {
        const { findDirect } = await import('../lib/finder');
        await findDirect('VNO', 'AGP', ['2026-10-14', '2026-10-15', '2026-10-16']);
        const urls = vi.mocked(fetch).mock.calls.map(c => String(c[0]));
        expect(urls.filter(u => u.includes('/VNO/AGP/cheapestPerDay'))).toHaveLength(1);
    });

    it('computes duration using airport time zones', async () => {
        const { findCheapestRoutes } = await import('../lib/finder');
        const zones = new Map([['VNO', 'Europe/Vilnius'], ['AGP', 'Europe/Madrid']]);
        const [result] = await findCheapestRoutes('VNO', 'AGP', '2026-10-15', zones); // via STN
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

    const params = {
        origins: ['VNO'], dests: ['AGP'], date: '2026-10-15',
        dateRangeDays: 0, dateDirection: 'both' as const, returnDateRange: 0, returnDateDirection: 'both' as const,
    };

    it('returns results sorted by price with time-zone aware durations and flight numbers', async () => {
        const { runSearch } = await import('../lib/search');
        const results = await runSearch(params);
        expect(results.map(r => r.totalPrice)).toEqual([45, 99]);
        expect(results[0].searchDate).toBe('2026-10-15');
        expect(results[0].duration).toBe(510);
        expect(results[0].flights.map(f => f.flightNumber)).toEqual(['FRVNO-STN', 'FRSTN-AGP']);
    });

    it('streams direct flights first, then everything, then flight numbers', async () => {
        const { streamSearch } = await import('../lib/search');
        const events = [];
        for await (const e of streamSearch(params)) events.push(e);

        expect(events.map(e => e.type === 'results' ? `results:${e.final ? 'final' : 'partial'}` : e.type))
            .toEqual(['results:partial', 'results:final', 'complete', 'flightNumbers']);
        const [partial, final] = events;
        expect(partial.type === 'results' && partial.results.map(r => r.type)).toEqual(['direct']);
        expect(final.type === 'results' && final.results.map(r => r.totalPrice)).toEqual([45, 99]);
    });
});

describe('priceCalendar', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal('fetch', vi.fn(fakeFetch));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('gives the cheapest price for each day of the month', async () => {
        const { priceCalendar } = await import('../lib/calendar');
        const cal = await priceCalendar({ origins: ['VNO'], dests: ['AGP'], month: '2026-10' });
        expect(cal.days).toHaveLength(31);
        expect(cal.includesConnections).toBe(true);
        expect(cal.days.find(d => d.date === '2026-10-15')).toEqual({ date: '2026-10-15', price: 45, direct: false });
        expect(cal.days.find(d => d.date === '2026-10-16')).toEqual({ date: '2026-10-16', price: null, direct: false });
    });
});
