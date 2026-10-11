import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSearchParams } from '../lib/search';

// Fake Ryanair data: [departure, arrival, price] per route
const FLIGHTS: Record<string, [string, string, number][]> = {
    'VNO-STN': [['2026-10-15T06:00:00', '2026-10-15T07:00:00', 20]],
    'VNO-BCN': [['2026-10-15T10:00:00', '2026-10-15T13:00:00', 50]],
    'STN-AGP': [['2026-10-15T10:00:00', '2026-10-15T13:30:00', 25]],
    'STN-BCN': [['2026-10-15T09:30:00', '2026-10-15T12:30:00', 15]],
    'STN-VNO': [['2026-10-15T08:00:00', '2026-10-15T11:00:00', 99], ['2026-10-18T13:00:00', '2026-10-18T16:00:00', 30]],
    'BCN-AGP': [['2026-10-15T18:00:00', '2026-10-15T19:30:00', 30]],
    'BCN-STN': [['2026-10-18T08:00:00', '2026-10-18T09:30:00', 20]],
};

function fare(route: string, [dep, arr, price]: [string, string, number]) {
    const [, to] = route.split('-');
    return { arrivalAirport: { iataCode: to }, departureDate: dep, arrivalDate: arr, price: { value: price, currencyCode: 'EUR' }, flightNumber: `FR-${route}` };
}

function fakeFetch(url: string) {
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    if (url.includes('/airports/en/active')) return json([]);
    const month = url.match(/oneWayFares\/([A-Z]{3})\/([A-Z]{3})\/cheapestPerDay\?outboundMonthOfDate=(\d{4}-\d{2})/);
    if (month) {
        const flights = FLIGHTS[`${month[1]}-${month[2]}`] ?? [];
        return json({
            outbound: {
                fares: flights.filter(f => f[0].startsWith(month[3])).map(f => ({
                    day: f[0].slice(0, 10), departureDate: f[0], arrivalDate: f[1],
                    price: { value: f[2], currencyCode: 'EUR' }, soldOut: false, unavailable: false,
                })),
            },
        });
    }
    const u = new URL(url);
    const from = u.searchParams.get('departureAirportIataCode');
    const to = u.searchParams.get('arrivalAirportIataCode');
    const day = u.searchParams.get('outboundDepartureDateFrom') ?? '';
    const fares = Object.entries(FLIGHTS)
        .filter(([route]) => route.startsWith(`${from}-`) && (!to || route === `${from}-${to}`))
        .flatMap(([route, list]) => list.filter(f => f[0].startsWith(day)).map(f => ({ outbound: fare(route, f) })));
    return json({ fares });
}

const base = {
    origins: ['VNO'], dests: ['ANYWHERE'], anywhere: true, date: '2026-10-15',
    dateRangeDays: 0, dateDirection: 'both' as const, returnDateRange: 0, returnDateDirection: 'both' as const,
};

describe('Anywhere search', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal('fetch', vi.fn(fakeFetch));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('finds destinations direct and with one stop, best per destination', async () => {
        const { streamSearch } = await import('../lib/search');
        const events = [];
        for await (const e of streamSearch(base)) events.push(e);

        const results = events.filter(e => e.type === 'results');
        // Direct flights first
        expect(results[0].type === 'results' && results[0].results.map(r => `${r.destination}:${r.totalPrice}`)).toEqual(['STN:20', 'BCN:50']);
        // Then everything: Barcelona is cheaper via Stansted, but the direct flight is kept as an option too
        const final = results[results.length - 1];
        expect(final.type === 'results' && final.final && final.results.map(r => `${r.destination}:${r.via ?? 'direct'}:${r.totalPrice}`))
            .toEqual(['STN:direct:20', 'BCN:STN:35', 'AGP:STN:45', 'BCN:direct:50']);
        expect(events.map(e => e.type)).toContain('complete');
    });

    it('pairs round trips with direct and one-stop returns to the same origin', async () => {
        const { runSearch } = await import('../lib/search');
        const results = await runSearch({ ...base, returnDate: '2026-10-18' });
        expect(results.map(r => `${r.destination}:${r.totalPrice}:back ${r.returnFlights?.[0].via ?? 'direct'}`))
            .toEqual(['STN:50:back direct', 'BCN:85:back STN']);
        // Málaga has no way back, so it's left out
    });
});

describe('Anywhere limits', () => {
    const parse = (q: string) => parseSearchParams(new URLSearchParams(q));

    it('accepts a weekend from one city', () => {
        const r = parse('origin=VNO,KUN&dest=anywhere&date=2026-10-15&dateRangeDays=2&dateDirection=after');
        expect(r.ok && r.params.anywhere).toBe(true);
    });

    it('rejects searches that would need too many requests', () => {
        expect(parse('origin=VNO,KUN,RIX&dest=ANYWHERE&date=2026-10-15&dateRangeDays=3').ok).toBe(false);
        expect(parse('origin=VNO,KUN,RIX,TLL,WAW,KRK&dest=ANYWHERE&date=2026-10-15').ok).toBe(false);
    });
});
