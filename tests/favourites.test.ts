import { describe, expect, it } from 'vitest';
import { routeKey, routeOf, searchFor } from '../lib/favourites';

describe('saved routes', () => {
    it('saves a round trip as a route with its length, without dates', () => {
        const route = routeOf({ origin: 'VNO', dest: 'STN,LTN,LGW', date: '2026-11-06', returnDate: '2026-11-09', departureDateRange: 2 }, 'Vilnius', 'London');
        expect(route).toEqual({ origin: 'VNO', dest: 'STN,LTN,LGW', tripDays: 3, fromLabel: 'Vilnius', toLabel: 'London' });
    });

    it('searches a saved route on the given date, keeping the trip length', () => {
        const route = routeOf({ origin: 'VNO', dest: 'BCN', date: '2026-11-06', returnDate: '2026-11-13' }, 'Vilnius', 'Barcelona');
        expect(searchFor(route, '2026-12-28')).toEqual({ origin: 'VNO', dest: 'BCN', date: '2026-12-28', returnDate: '2027-01-04' });
        const oneWay = routeOf({ origin: 'VNO', dest: 'ANYWHERE', date: '2026-11-06' }, 'Vilnius', 'Anywhere');
        expect(searchFor(oneWay, '2026-12-28')).toEqual({ origin: 'VNO', dest: 'ANYWHERE', date: '2026-12-28', returnDate: undefined });
    });

    it('treats one-way and round trip on the same route as different saved routes', () => {
        const oneWay = routeOf({ origin: 'VNO', dest: 'BCN', date: '2026-11-06' }, 'Vilnius', 'Barcelona');
        const roundTrip = routeOf({ origin: 'VNO', dest: 'BCN', date: '2026-11-06', returnDate: '2026-11-09' }, 'Vilnius', 'Barcelona');
        const longer = routeOf({ origin: 'VNO', dest: 'BCN', date: '2026-11-06', returnDate: '2026-11-16' }, 'Vilnius', 'Barcelona');
        expect(routeKey(oneWay)).not.toBe(routeKey(roundTrip));
        expect(routeKey(roundTrip)).toBe(routeKey(longer)); // same route: it shows as already saved
    });
});
