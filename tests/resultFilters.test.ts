import { describe, expect, it } from 'vitest';
import { applyView, longestLayoverMinutes, travelMinutes } from '../lib/resultFilters';
import { DEFAULT_VIEW } from '../lib/searchUrl';
import { Flight, SearchResult } from '../lib/types';

function flight(origin: string, destination: string, dep: string, arr: string): Flight {
    return { origin, destination, departureDate: dep, arrivalDate: arr, price: { value: 10, currencyCode: 'EUR' }, flightNumber: 'FR1' };
}

const direct: SearchResult = {
    type: 'direct', origin: 'VNO', destination: 'BCN', searchDate: '2026-10-13', currency: 'EUR',
    flights: [flight('VNO', 'BCN', '2026-10-13T17:40:00', '2026-10-13T20:10:00')], totalPrice: 90, duration: 210,
};
const shortLayover: SearchResult = {
    type: 'layover', origin: 'VNO', destination: 'BCN', via: 'STN', searchDate: '2026-10-13', currency: 'EUR',
    flights: [flight('VNO', 'STN', '2026-10-13T06:45:00', '2026-10-13T07:35:00'), flight('STN', 'BCN', '2026-10-13T11:00:00', '2026-10-13T14:15:00')],
    totalPrice: 60, duration: 510,
};
const longLayover: SearchResult = {
    type: 'layover', origin: 'VNO', destination: 'BCN', via: 'BGY', searchDate: '2026-10-14', currency: 'EUR',
    flights: [flight('VNO', 'BGY', '2026-10-14T06:00:00', '2026-10-14T07:30:00'), flight('BGY', 'BCN', '2026-10-14T17:30:00', '2026-10-14T19:00:00')],
    totalPrice: 40, duration: 840,
};
const all = [direct, shortLayover, longLayover];

describe('applyView', () => {
    it('sorts by price by default', () => {
        expect(applyView(all, DEFAULT_VIEW).map(r => r.totalPrice)).toEqual([40, 60, 90]);
    });

    it('sorts by travel time and by departure', () => {
        expect(applyView(all, { ...DEFAULT_VIEW, sort: 'fastest' })).toEqual([direct, shortLayover, longLayover]);
        expect(applyView(all, { ...DEFAULT_VIEW, sort: 'earliest' })).toEqual([shortLayover, direct, longLayover]);
    });

    it('filters direct only, by layover length and by price', () => {
        expect(applyView(all, { ...DEFAULT_VIEW, directOnly: true })).toEqual([direct]);
        expect(applyView(all, { ...DEFAULT_VIEW, maxLayoverHours: 5 })).toEqual([shortLayover, direct]);
        expect(applyView(all, { ...DEFAULT_VIEW, maxPrice: 60 })).toEqual([longLayover, shortLayover]);
    });

    it('does not change the original list', () => {
        const copy = [...all];
        applyView(all, { ...DEFAULT_VIEW, sort: 'fastest' });
        expect(all).toEqual(copy);
    });

    it('looks at both legs of a round trip', () => {
        const trip: SearchResult = { ...direct, isRoundTrip: true, returnFlights: [longLayover], totalPrice: 130 };
        expect(travelMinutes(trip)).toBe(210 + 840);
        expect(longestLayoverMinutes(trip)).toBe(600);
        expect(applyView([trip], { ...DEFAULT_VIEW, directOnly: true })).toEqual([]);
    });
});
