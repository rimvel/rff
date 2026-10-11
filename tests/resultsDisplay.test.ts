import { describe, expect, it } from 'vitest';
import { buildAirportIndex } from '../lib/airportGroups';
import { formatDay, formatDuration, formatStay } from '../lib/format';
import { layoverBadges } from '../lib/layoverRisk';
import { summarize } from '../lib/resultFilters';
import { suggestAlternatives } from '../lib/suggestions';
import { Airport, Flight, SearchResult } from '../lib/types';

function flight(origin: string, destination: string, dep: string, arr: string, price = 10): Flight {
    return { origin, destination, departureDate: dep, arrivalDate: arr, price: { value: price, currencyCode: 'EUR' } };
}

describe('formatting', () => {
    it('formats durations like "8 h 10 min"', () => {
        expect(formatDuration(50)).toBe('50 min');
        expect(formatDuration(180)).toBe('3 h');
        expect(formatDuration(490)).toBe('8 h 10 min');
        expect(formatStay(13 * 60 + 20)).toBe('13 h');
        expect(formatStay(7 * 24 * 60 + 13 * 60)).toBe('7 d 13 h');
    });

    it('formats days with the weekday', () => {
        expect(formatDay('2026-11-13T06:45:00')).toBe('Fri 13 Nov');
    });
});

describe('layoverBadges', () => {
    const arriving = flight('VNO', 'STN', '2026-11-13T06:00:00', '2026-11-13T07:00:00');
    const leaving = (dep: string) => flight('STN', 'BCN', dep, '2026-11-14T12:00:00');
    const kinds = (dep: string) => layoverBadges(arriving, leaving(dep)).map(b => b.label);

    it('flags tight, long and overnight connections', () => {
        expect(kinds('2026-11-13T09:10:00')).toEqual(['Tight: 2 h 10 min']);
        expect(kinds('2026-11-13T12:00:00')).toEqual([]);
        expect(kinds('2026-11-13T16:30:00')).toEqual(['Long: 9 h 30 min']);
        expect(kinds('2026-11-14T06:00:00')).toEqual(['Long: 23 h', 'Overnight']);
    });
});

describe('summarize', () => {
    const result = (type: 'direct' | 'layover', price: number, duration: number): SearchResult => ({
        type, origin: 'VNO', destination: 'BCN', flights: [], totalPrice: price, currency: 'EUR', duration, searchDate: '2026-11-13',
    });

    it('gives the cheapest price, the fastest trip and the cheapest direct flight', () => {
        expect(summarize([result('layover', 80, 500), result('direct', 120, 210), result('direct', 150, 200)]))
            .toEqual({ cheapest: 80, fastestMinutes: 200, cheapestDirect: 120 });
    });

    it('leaves out "direct from" when the cheapest is already direct', () => {
        expect(summarize([result('direct', 60, 210), result('layover', 80, 500)])?.cheapestDirect).toBeUndefined();
        expect(summarize([])).toBeNull();
    });
});

describe('suggestAlternatives', () => {
    const airport = (code: string, name: string, city: string, latitude: number, longitude: number, country = 'Lithuania', cc = 'lt'): Airport => ({
        code, name, city: { name: city, code: city.toUpperCase() }, country: { name: country, code: cc }, coordinates: { latitude, longitude },
    });
    const index = buildAirportIndex([
        airport('VNO', 'Vilnius', 'Vilnius', 54.63, 25.28),
        airport('KUN', 'Kaunas', 'Kaunas', 54.96, 24.08),
        airport('BCN', 'Barcelona', 'Barcelona', 41.3, 2.08, 'Spain', 'es'),
        airport('GRO', 'Girona', 'Girona', 41.9, 2.76, 'Spain', 'es'),
        airport('AGP', 'Malaga', 'Malaga', 36.67, -4.49, 'Spain', 'es'),
    ]);

    it('offers flexible dates, nearby airports, one way and Anywhere', () => {
        const s = suggestAlternatives({ origin: 'VNO', dest: 'BCN', date: '2026-11-28', returnDate: '2026-12-05' }, index);
        expect(s.map(x => x.label)).toEqual([
            'Try ±3 days',
            'Also from Kaunas (KUN)',
            'Also to Girona (GRO)',
            'Search one way',
            'Cheapest destinations from Vilnius',
        ]);
        expect(s[0].request).toMatchObject({ departureDateRange: 3, returnDateRange: 3 });
        expect(s[1].request.origin).toBe('VNO,KUN');
        expect(s[3].request.returnDate).toBeUndefined();
        expect(s[4].request.dest).toBe('ANYWHERE');
    });

    it('does not offer what is already there', () => {
        const s = suggestAlternatives({ origin: 'VNO,KUN', dest: 'ANYWHERE', date: '2026-11-28', departureDateRange: 3 }, index);
        expect(s.map(x => x.label)).toEqual([]);
    });
});
