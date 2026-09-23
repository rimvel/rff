import { describe, expect, it } from 'vitest';
import { addDays, localToUtcMs, minutesBetween } from '../lib/time';

describe('localToUtcMs', () => {
    it('converts local time in a zone to UTC', () => {
        // Vilnius is UTC+3 in October (summer time)
        expect(localToUtcMs('2026-10-15T12:25:00', 'Europe/Vilnius')).toBe(Date.UTC(2026, 9, 15, 9, 25));
        // and UTC+2 in winter
        expect(localToUtcMs('2026-12-15T12:25:00', 'Europe/Vilnius')).toBe(Date.UTC(2026, 11, 15, 10, 25));
    });

    it('handles the day of a DST change', () => {
        // Clocks go forward 03:00 -> 04:00 in Vilnius on 29 March 2026
        expect(localToUtcMs('2026-03-29T01:00:00', 'Europe/Vilnius')).toBe(Date.UTC(2026, 2, 28, 23, 0));
        expect(localToUtcMs('2026-03-29T05:00:00', 'Europe/Vilnius')).toBe(Date.UTC(2026, 2, 29, 2, 0));
    });

    it('treats the time as UTC when no zone is known', () => {
        expect(localToUtcMs('2026-10-15T12:25:00')).toBe(Date.UTC(2026, 9, 15, 12, 25));
        expect(localToUtcMs('2026-10-15T12:25:00', 'Not/AZone')).toBe(Date.UTC(2026, 9, 15, 12, 25));
    });
});

describe('minutesBetween', () => {
    it('gives the real flight time across time zones', () => {
        // VNO 12:25 -> STN 13:15 local is 2h50m, not 50 minutes
        expect(minutesBetween('2026-10-15T12:25:00', 'Europe/Vilnius', '2026-10-15T13:15:00', 'Europe/London')).toBe(170);
    });
});

describe('addDays', () => {
    it('crosses month and year boundaries', () => {
        expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
        expect(addDays('2026-10-15', 0)).toBe('2026-10-15');
    });
});
