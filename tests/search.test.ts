import { describe, expect, it } from 'vitest';
import { combineRoundTrips, expandDates, parseSearchParams, RETURN_OPTIONS_PER_OUTBOUND } from '../lib/search';
import { Flight, RouteResult, SearchResult } from '../lib/types';

function flight(origin: string, destination: string, dep: string, arr: string, price: number): Flight {
    return { origin, destination, departureDate: dep, arrivalDate: arr, price: { value: price, currencyCode: 'EUR' }, flightNumber: 'FR1' };
}

function direct(f: Flight, searchDate = f.departureDate.slice(0, 10)): SearchResult {
    return {
        type: 'direct', origin: f.origin, destination: f.destination, flights: [f],
        totalPrice: f.price.value, currency: 'EUR', duration: 120, searchDate,
    };
}

describe('expandDates', () => {
    it('expands in both directions', () => {
        expect(expandDates('2026-10-15', 2, 'both')).toEqual(['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']);
    });
    it('expands only after or only before', () => {
        expect(expandDates('2026-10-15', 1, 'after')).toEqual(['2026-10-15', '2026-10-16']);
        expect(expandDates('2026-10-15', 1, 'before')).toEqual(['2026-10-14', '2026-10-15']);
    });
    it('returns just the date with no range', () => {
        expect(expandDates('2026-10-15', 0, 'both')).toEqual(['2026-10-15']);
    });
});

describe('parseSearchParams', () => {
    const parse = (q: string) => parseSearchParams(new URLSearchParams(q));

    it('accepts a normal search and normalises codes', () => {
        const r = parse('origin=vno&dest=STN,LTN&date=2026-10-15&dateRangeDays=3&dateDirection=after');
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.params.origins).toEqual(['VNO']);
            expect(r.params.dests).toEqual(['STN', 'LTN']);
            expect(r.params.dateRangeDays).toBe(3);
            expect(r.params.dateDirection).toBe('after');
        }
    });

    it('rejects missing or malformed input', () => {
        expect(parse('origin=VNO&date=2026-10-15').ok).toBe(false);
        expect(parse('origin=VNO&dest=STN&date=15-10-2026').ok).toBe(false);
        expect(parse('origin=VNO&dest=STN&date=2026-02-30').ok).toBe(false);
        expect(parse('origin=VNO%26x%3D1&dest=STN&date=2026-10-15').ok).toBe(false);
        expect(parse('origin=VNO&dest=STN&date=2026-10-15&returnDate=2026-10-10').ok).toBe(false);
    });

    it('enforces the limits', () => {
        expect(parse('origin=VNO&dest=STN&date=2026-10-15&dateRangeDays=30').ok).toBe(false);
        expect(parse('origin=VNO&dest=STN&date=2026-10-15&returnDate=2026-10-20&returnDateRange=8').ok).toBe(false);

        const many = Array.from({ length: 30 }, (_, i) => `A${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`).join(',');
        // 30 x 30 airport pairs is far too broad
        expect(parse(`origin=${many}&dest=${many}&date=2026-10-15`).ok).toBe(false);
    });
});

describe('combineRoundTrips', () => {
    const out = direct(flight('VNO', 'STN', '2026-10-15T12:25:00', '2026-10-15T13:15:00', 30));

    it('pairs outbound with the cheapest returns across all return dates', () => {
        // Returns from different days, deliberately not in price order
        const returns: RouteResult[] = [
            direct(flight('STN', 'VNO', '2026-10-20T08:00:00', '2026-10-20T13:00:00', 90)),
            direct(flight('STN', 'VNO', '2026-10-21T08:00:00', '2026-10-21T13:00:00', 15)),
            direct(flight('STN', 'VNO', '2026-10-22T08:00:00', '2026-10-22T13:00:00', 40)),
        ];
        const combined = combineRoundTrips([out], returns);
        expect(combined.map(c => c.totalPrice)).toEqual([45, 70, 120]);
        expect(combined.every(c => c.isRoundTrip)).toBe(true);
    });

    it('keeps at most the configured number of return options', () => {
        const returns = Array.from({ length: 10 }, (_, i) =>
            direct(flight('STN', 'VNO', `2026-10-${20 + i}T08:00:00`, `2026-10-${20 + i}T13:00:00`, 10 + i)));
        expect(combineRoundTrips([out], returns)).toHaveLength(RETURN_OPTIONS_PER_OUTBOUND);
    });

    it('ignores returns that leave before the outbound lands and drops outbound with no return', () => {
        const tooEarly = direct(flight('STN', 'VNO', '2026-10-15T13:00:00', '2026-10-15T18:00:00', 5));
        expect(combineRoundTrips([out], [tooEarly])).toEqual([]);
    });

    it('rounds prices to cents', () => {
        const a = direct(flight('VNO', 'STN', '2026-10-15T12:25:00', '2026-10-15T13:15:00', 0.1));
        const b = direct(flight('STN', 'VNO', '2026-10-20T08:00:00', '2026-10-20T13:00:00', 0.2));
        expect(combineRoundTrips([a], [b])[0].totalPrice).toBe(0.3);
    });
});
