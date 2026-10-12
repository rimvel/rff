import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { combineWithOtherAirports } from '../lib/finder';
import { canComeBack, transferMinutes } from '../lib/mixedAirports';
import { applyView, usesOtherAirports } from '../lib/resultFilters';
import { DEFAULT_VIEW } from '../lib/searchUrl';
import { Flight, SearchResult } from '../lib/types';

const COORDS: Record<string, { latitude: number; longitude: number }> = {
    VNO: { latitude: 54.63, longitude: 25.28 },
    KUN: { latitude: 54.96, longitude: 24.08 }, // ~85 km from Vilnius
    PLQ: { latitude: 55.97, longitude: 21.09 }, // Palanga, ~300 km from Vilnius
};
const coords = (code: string) => COORDS[code];

function flight(origin: string, destination: string, dep: string, arr: string, price: number): Flight {
    return { origin, destination, departureDate: dep, arrivalDate: arr, price: { value: price, currencyCode: 'EUR' } };
}
function direct(f: Flight): SearchResult {
    return { type: 'direct', origin: f.origin, destination: f.destination, flights: [f], totalPrice: f.price.value, currency: 'EUR', duration: 170, searchDate: f.departureDate.slice(0, 10) };
}

describe('which airports can be mixed', () => {
    it('knows airports in the same city and how far apart they are', () => {
        expect(transferMinutes('STN', 'LTN')).toBe(105);
        expect(transferMinutes('LTN', 'STN')).toBe(105);
        expect(transferMinutes('STN', 'STN')).toBe(0);
        expect(transferMinutes('BVA', 'XCR')).toBeUndefined(); // Paris left out
        expect(transferMinutes('STN', 'BCN')).toBeUndefined();
    });

    it('comes back from the same city, to a home airport nearby', () => {
        expect(canComeBack('VNO', 'STN', 'LTN', 'VNO', coords)).toBe(true); // other London airport
        expect(canComeBack('VNO', 'STN', 'LTN', 'KUN', coords)).toBe(true); // and to Kaunas
        expect(canComeBack('VNO', 'STN', 'STN', 'KUN', coords)).toBe(true);
        expect(canComeBack('VNO', 'STN', 'STN', 'PLQ', coords)).toBe(false); // Palanga is too far from Vilnius
        expect(canComeBack('VNO', 'STN', 'BCN', 'VNO', coords)).toBe(false); // not the same city
    });
});

describe('combineWithOtherAirports', () => {
    const out = direct(flight('VNO', 'STN', '2026-11-06T06:15:00', '2026-11-06T07:05:00', 40));

    it('pairs returns from other airports and leaves time to get there', () => {
        const fromLuton = direct(flight('LTN', 'VNO', '2026-11-09T08:55:00', '2026-11-09T13:40:00', 75));
        const tooSoon = direct(flight('LTN', 'VNO', '2026-11-06T08:00:00', '2026-11-06T12:45:00', 10)); // 55 min after landing at Stansted
        const sameAirport = direct(flight('STN', 'VNO', '2026-11-09T10:00:00', '2026-11-09T14:45:00', 60));
        const combined = combineWithOtherAirports([out], [fromLuton, tooSoon, sameAirport]);
        expect(combined.map(c => `${c.returnFlights![0].origin}:${c.totalPrice}`)).toEqual(['LTN:115']);
    });

    it('is recognised by the "Same airport only" filter, and never booked as one trip', () => {
        const [mixed] = combineWithOtherAirports([out], [direct(flight('LTN', 'VNO', '2026-11-09T08:55:00', '2026-11-09T13:40:00', 75))]);
        expect(usesOtherAirports(mixed)).toBe(true);
        expect(applyView([mixed], { ...DEFAULT_VIEW, sameAirport: true })).toEqual([]);
        expect(applyView([mixed], DEFAULT_VIEW)).toEqual([mixed]);
    });
});

describe('round trip search with several airports', () => {
    // Out to Stansted only; back from Stansted (pricier) or Luton (cheaper)
    const FLIGHTS: Record<string, [string, string, number][]> = {
        'VNO-STN': [['2026-11-06T06:15:00', '2026-11-06T07:05:00', 40]],
        'STN-VNO': [['2026-11-09T10:00:00', '2026-11-09T14:45:00', 90]],
        'LTN-VNO': [['2026-11-09T08:55:00', '2026-11-09T13:40:00', 50]],
    };
    function fakeFetch(url: string) {
        const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
        if (url.includes('/airports/en/active')) return json([]);
        if (url.includes('/routes/')) return json([]);
        const m = url.match(/oneWayFares\/([A-Z]{3})\/([A-Z]{3})\/cheapestPerDay\?outboundMonthOfDate=(\d{4}-\d{2})/);
        if (m) {
            const list = (FLIGHTS[`${m[1]}-${m[2]}`] ?? []).filter(f => f[0].startsWith(m[3]));
            return json({ outbound: { fares: list.map(f => ({ day: f[0].slice(0, 10), departureDate: f[0], arrivalDate: f[1], price: { value: f[2], currencyCode: 'EUR' }, soldOut: false, unavailable: false })) } });
        }
        return json({ fares: [] });
    }
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal('fetch', vi.fn(fakeFetch));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('adds the cheaper return from the other London airport, keeping the same-airport one', async () => {
        const { runSearch } = await import('../lib/search');
        const results = await runSearch({
            origins: ['VNO'], dests: ['STN', 'LTN'], date: '2026-11-06', returnDate: '2026-11-09',
            dateRangeDays: 0, dateDirection: 'both', returnDateRange: 0, returnDateDirection: 'both',
        });
        expect(results.map(r => `${r.destination}->back from ${r.returnFlights![0].origin}: €${r.totalPrice}`))
            .toEqual(['STN->back from LTN: €90', 'STN->back from STN: €130']);
    });
});

describe('changing airports during a connection', () => {
    const arriveStansted = flight('VNO', 'STN', '2026-11-09T06:15:00', '2026-11-09T07:05:00', 20);
    const fromLuton = (dep: string) => flight('LTN', 'LIS', dep, '2026-11-09T22:00:00', 40);

    it('needs 2 h plus the transfer time between the airports', async () => {
        const { layoverResult } = await import('../lib/finder');
        // Stansted -> Luton takes ~1 h 45 min, so at least 3 h 45 min between flights
        expect(layoverResult(arriveStansted, fromLuton('2026-11-09T10:30:00'), '2026-11-09', new Map())).toBeNull();
        const ok = layoverResult(arriveStansted, fromLuton('2026-11-09T11:00:00'), '2026-11-09', new Map());
        expect(ok?.via).toBe('STN');
        expect(ok?.flights.map(f => `${f.origin}-${f.destination}`)).toEqual(['VNO-STN', 'LTN-LIS']);
        expect(ok?.totalPrice).toBe(60);
    });

    it('never connects airports in different cities', async () => {
        const { layoverResult } = await import('../lib/finder');
        const fromBarcelona = flight('BCN', 'LIS', '2026-11-09T12:00:00', '2026-11-09T14:00:00', 10);
        expect(layoverResult(arriveStansted, fromBarcelona, '2026-11-09', new Map())).toBeNull();
    });

    it('counts the transfer when deciding if a connection is tight', async () => {
        const { layoverBadges } = await import('../lib/layoverRisk');
        // 4 h between flights, but 1 h 45 min of it is getting to Luton
        expect(layoverBadges(arriveStansted, fromLuton('2026-11-09T11:05:00')).map(b => b.kind)).toEqual(['tight']);
        expect(layoverBadges(arriveStansted, fromLuton('2026-11-09T12:30:00')).map(b => b.kind)).toEqual([]);
    });

    it('is hidden by the "Same airport only" filter', async () => {
        const { layoverResult } = await import('../lib/finder');
        const trip = layoverResult(arriveStansted, fromLuton('2026-11-09T12:00:00'), '2026-11-09', new Map())!;
        expect(usesOtherAirports(trip)).toBe(true);
        expect(applyView([trip], { ...DEFAULT_VIEW, sameAirport: true })).toEqual([]);
    });
});

describe('one-stop search with airport changes', () => {
    const ROUTES: Record<string, string[]> = { VNO: ['STN'], LIS: ['LTN'] };
    const FLIGHTS: Record<string, [string, string, number]> = {
        'VNO-STN': ['2026-11-09T06:15:00', '2026-11-09T07:05:00', 20],
        'LTN-LIS': ['2026-11-09T12:00:00', '2026-11-09T14:45:00', 40],
    };
    function fakeFetch(url: string) {
        const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
        const routes = url.match(/routes\/en\/airport\/([A-Z]{3})/);
        if (routes) return json((ROUTES[routes[1]] ?? []).map(code => ({ arrivalAirport: { code } })));
        const m = url.match(/oneWayFares\/([A-Z]{3})\/([A-Z]{3})\/cheapestPerDay/);
        if (m) {
            const f = FLIGHTS[`${m[1]}-${m[2]}`];
            return json({ outbound: { fares: f ? [{ day: f[0].slice(0, 10), departureDate: f[0], arrivalDate: f[1], price: { value: f[2], currencyCode: 'EUR' }, soldOut: false, unavailable: false }] : [] } });
        }
        return json([]);
    }
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal('fetch', vi.fn(fakeFetch));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('finds Vilnius -> Stansted, Luton -> Lisbon when no airport is shared', async () => {
        const { findOneStop } = await import('../lib/finder');
        const results = await findOneStop('VNO', 'LIS', ['2026-11-09']);
        expect(results.map(r => r.flights.map(f => `${f.origin}-${f.destination}`).join(' + '))).toEqual(['VNO-STN + LTN-LIS']);
        expect(await findOneStop('VNO', 'LIS', ['2026-11-09'], new Map(), false)).toEqual([]);
    });
});
