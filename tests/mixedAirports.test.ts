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
