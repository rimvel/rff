import { describe, expect, it } from 'vitest';
import type { CalendarDay, DateGrid } from '../lib/calendar';
import { cheaperOneWay, cheaperRoundTrip } from '../lib/cheaperDates';
import { SearchRequest } from '../lib/searchUrl';
import { addDays, expandDates } from '../lib/time';

const TODAY = '2026-11-10';

/** A month of prices: `usual` every day, except the ones given */
function december(prices: Record<string, number | null>, usual = 100): CalendarDay[] {
    return expandDates('2026-12-16', 15, 'both').slice(0, 31).map(date => ({
        date,
        price: date in prices ? prices[date] : usual,
        direct: true,
    }));
}

const oneWay: SearchRequest = { origin: 'VNO', dest: 'STN', date: '2026-12-10' };

describe('cheaperOneWay', () => {
    it('finds the cheapest day within three days', () => {
        const days = december({ '2026-12-08': 60, '2026-12-12': 70 });
        expect(cheaperOneWay(days, oneWay, 100, TODAY)).toEqual({ date: '2026-12-08', price: 60, saving: 40 });
    });

    it('ignores days further away, and days the search already covered', () => {
        expect(cheaperOneWay(december({ '2026-12-14': 20 }), oneWay, 100, TODAY)).toBeNull();
        const flexible: SearchRequest = { ...oneWay, departureDateRange: 1, departureDateDirection: 'both' };
        const days = december({ '2026-12-11': 20, '2026-12-13': 80 });
        expect(cheaperOneWay(days, flexible, 100, TODAY)?.date).toBe('2026-12-13');
    });

    it('says nothing when the difference is small', () => {
        expect(cheaperOneWay(december({ '2026-12-09': 96 }), oneWay, 100, TODAY)).toBeNull(); // under 5 euros
        expect(cheaperOneWay(december({ '2026-12-09': 193 }, 200), oneWay, 200, TODAY)).toBeNull(); // under 10%
        expect(cheaperOneWay(december({ '2026-12-09': 15 }, 20), oneWay, 20, TODAY)?.saving).toBe(5);
    });

    it('skips days with no flights and days that have passed', () => {
        expect(cheaperOneWay(december({ '2026-12-09': null }), oneWay, 150, TODAY)?.price).toBe(100);
        const soon: SearchRequest = { ...oneWay, date: '2026-12-02' };
        const days = december({ '2026-12-01': 10, '2026-12-03': 50 });
        expect(cheaperOneWay(days, soon, 100, '2026-12-02')?.date).toBe('2026-12-03');
    });

    it('prefers the closest day when prices are equal', () => {
        const days = december({ '2026-12-07': 50, '2026-12-11': 50 });
        expect(cheaperOneWay(days, oneWay, 100, TODAY)?.date).toBe('2026-12-11');
    });
});

/** A grid around a 7-night trip, 200 everywhere except the cells given as "out|back" */
function grid(date: string, returnDate: string, prices: Record<string, number | null> = {}): DateGrid {
    const departures = expandDates(date, 3, 'both');
    const returns = expandDates(returnDate, 3, 'both');
    return {
        departures,
        returns,
        prices: departures.map(d => returns.map(r => (`${d}|${r}` in prices ? prices[`${d}|${r}`] : 200))),
        includesConnections: true,
    };
}

const roundTrip: SearchRequest = { origin: 'VNO', dest: 'BCN', date: '2026-12-05', returnDate: '2026-12-12' };

describe('cheaperRoundTrip', () => {
    it('finds cheaper dates for a trip of about the same length', () => {
        const g = grid('2026-12-05', '2026-12-12', { '2026-12-06|2026-12-12': 140, '2026-12-03|2026-12-10': 150 });
        expect(cheaperRoundTrip(g, roundTrip, 200, TODAY)).toEqual({ date: '2026-12-06', returnDate: '2026-12-12', price: 140, saving: 60 });
    });

    it('ignores trips that are much shorter or longer', () => {
        // 8 Dec to 9 Dec is one night, not a week
        const g = grid('2026-12-05', '2026-12-12', { '2026-12-08|2026-12-09': 30, '2026-12-02|2026-12-15': 30 });
        expect(cheaperRoundTrip(g, roundTrip, 200, TODAY)).toBeNull();
    });

    it('ignores the dates the search already covered, also with flexible days', () => {
        const g = grid('2026-12-05', '2026-12-12', { '2026-12-05|2026-12-12': 100, '2026-12-06|2026-12-12': 110, '2026-12-07|2026-12-14': 120 });
        expect(cheaperRoundTrip(g, roundTrip, 200, TODAY)?.date).toBe('2026-12-06');
        const flexible: SearchRequest = { ...roundTrip, departureDateRange: 1, departureDateDirection: 'both' };
        expect(cheaperRoundTrip(g, flexible, 200, TODAY)?.date).toBe('2026-12-07');
    });

    it('says nothing when the difference is small, or for a one-way search', () => {
        const g = grid('2026-12-05', '2026-12-12', { '2026-12-06|2026-12-12': 185 });
        expect(cheaperRoundTrip(g, roundTrip, 200, TODAY)).toBeNull();
        expect(cheaperRoundTrip(g, { ...roundTrip, returnDate: undefined }, 200, TODAY)).toBeNull();
    });

    it('works on a grid cut at the end of the month, and skips days that have passed', () => {
        const late: SearchRequest = { ...roundTrip, date: '2026-12-01', returnDate: '2026-12-08' };
        const cut: DateGrid = {
            departures: ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04'], // no November days
            returns: expandDates('2026-12-08', 3, 'both'),
            prices: [],
            includesConnections: true,
        };
        cut.prices = cut.departures.map(d => cut.returns.map(r => (d === '2026-12-02' && r === addDays(d, 7) ? 90 : 200)));
        expect(cheaperRoundTrip(cut, late, 200, TODAY)?.date).toBe('2026-12-02');
        expect(cheaperRoundTrip(cut, late, 200, '2026-12-03')).toBeNull(); // 2 Dec has passed
    });
});
