import { describe, expect, it } from 'vitest';
import { readSearch, readView, searchKey, toApiUrl, toPageParams, SearchRequest } from '../lib/searchUrl';

const roundTrip: SearchRequest = {
    origin: 'VNO', dest: 'BCN,GRO,REU', date: '2026-10-13', returnDate: '2026-10-20',
    departureDateRange: 2, departureDateDirection: 'after', returnDateRange: 3, returnDateDirection: 'both',
};

describe('page address', () => {
    it('round-trips a search through the address', () => {
        const params = toPageParams(roundTrip, { sort: 'fastest', directOnly: true, sameAirport: true, showMap: false, maxPrice: 150 });
        expect(params.toString()).toBe('from=VNO&to=BCN%2CGRO%2CREU&date=2026-10-13&return=2026-10-20&flex=2&flexDir=after&returnFlex=3&sort=fastest&direct=1&same=1&maxPrice=150');
        expect(readSearch(params)).toEqual(roundTrip);
        expect(readView(params)).toEqual({ sort: 'fastest', directOnly: true, sameAirport: true, showMap: false, maxLayoverHours: undefined, maxPrice: 150 });
    });

    it('keeps simple searches short', () => {
        expect(toPageParams({ origin: 'VNO', dest: 'STN', date: '2026-10-15' }).toString()).toBe('from=VNO&to=STN&date=2026-10-15');
    });

    it('ignores invalid or incomplete addresses', () => {
        expect(readSearch(new URLSearchParams(''))).toBeNull();
        expect(readSearch(new URLSearchParams('from=VNO&to=STN'))).toBeNull();
        expect(readSearch(new URLSearchParams('from=VNO;x&to=STN&date=2026-10-15'))).toBeNull();
        expect(readView(new URLSearchParams('sort=nonsense&maxPrice=-5'))).toEqual({ sort: 'cheapest', directOnly: false, sameAirport: false, showMap: false, maxLayoverHours: undefined, maxPrice: undefined });
        expect(readView(new URLSearchParams('show=map')).showMap).toBe(true);
    });

    it('accepts "Anywhere" as a destination only', () => {
        expect(readSearch(new URLSearchParams('from=VNO&to=anywhere&date=2026-10-15'))?.dest).toBe('ANYWHERE');
        expect(readSearch(new URLSearchParams('from=ANYWHERE&to=VNO&date=2026-10-15'))).toBeNull();
    });

    it('accepts lower-case codes from hand-typed links', () => {
        expect(readSearch(new URLSearchParams('from=vno&to=stn&date=2026-10-15'))?.origin).toBe('VNO');
    });

    it('identifies a search regardless of sorting and filters', () => {
        const a = toPageParams(roundTrip, { sort: 'earliest', directOnly: true, sameAirport: true, showMap: true });
        expect(searchKey(readSearch(a))).toBe(searchKey(roundTrip));
    });
});

describe('toApiUrl', () => {
    it('builds the search API address', () => {
        expect(toApiUrl(roundTrip)).toBe('/api/search?origin=VNO&dest=BCN%2CGRO%2CREU&date=2026-10-13&returnDate=2026-10-20&dateRangeDays=2&dateDirection=after&returnDateRange=3&returnDateDirection=both');
    });
});
