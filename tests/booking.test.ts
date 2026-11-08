import { describe, expect, it } from 'vitest';
import { ryanairBookingUrl } from '../lib/booking';

describe('ryanairBookingUrl', () => {
    it('opens the one-way flight selection on ryanair.com (a real market in the path)', () => {
        const url = new URL(ryanairBookingUrl('VNO', 'STN', '2026-11-27'));
        expect(url.origin + url.pathname).toBe('https://www.ryanair.com/gb/en/trip/flights/select');
        expect(url.searchParams.get('originIata')).toBe('VNO');
        expect(url.searchParams.get('destinationIata')).toBe('STN');
        expect(url.searchParams.get('dateOut')).toBe('2026-11-27');
        expect(url.searchParams.get('dateIn')).toBe('');
        expect(url.searchParams.get('isReturn')).toBe('false');
        expect(url.searchParams.get('adt')).toBe('1');
        expect(url.searchParams.get('tpStartDate')).toBe('2026-11-27');
    });

    it('opens both directions for a return trip', () => {
        const url = new URL(ryanairBookingUrl('VNO', 'BCN', '2026-12-24', '2027-01-03'));
        expect(url.searchParams.get('isReturn')).toBe('true');
        expect(url.searchParams.get('dateIn')).toBe('2027-01-03');
        expect(url.searchParams.get('tpEndDate')).toBe('2027-01-03');
        expect(url.searchParams.get('tpDestinationIata')).toBe('BCN');
    });
});
