import { describe, expect, it } from 'vitest';
import { addDays, isPastEverywhere, localToUtcMs, minutesBetween, nextSameWeekday } from '../lib/time';

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

describe('nextSameWeekday', () => {
    // 2026-11-10 is a Tuesday
    it('moves a passed date to the same weekday after today', () => {
        expect(nextSameWeekday('2026-10-10', '2026-11-10')).toBe('2026-11-14'); // Saturday -> next Saturday
        expect(nextSameWeekday('2026-11-09', '2026-11-10')).toBe('2026-11-16'); // yesterday (Monday) -> next Monday
        expect(nextSameWeekday('2025-12-24', '2026-11-10')).toBe('2026-11-11'); // a Wednesday long ago -> tomorrow
    });

    it('never gives today itself, and leaves later dates alone', () => {
        expect(nextSameWeekday('2026-11-10', '2026-11-10')).toBe('2026-11-17');
        expect(nextSameWeekday('2026-11-03', '2026-11-10')).toBe('2026-11-17');
        expect(nextSameWeekday('2026-11-20', '2026-11-10')).toBe('2026-11-20');
    });

    it('keeps the weekday across a year end', () => {
        const moved = nextSameWeekday('2026-12-26', '2027-01-02'); // both Saturdays
        expect(moved).toBe('2027-01-09');
        expect(new Date(`${moved}T00:00:00Z`).getUTCDay()).toBe(6);
    });
});

describe('isPastEverywhere', () => {
    const at = (iso: string) => Date.parse(iso);

    it('is false while the day is still today somewhere (up to 12 hours behind UTC)', () => {
        expect(isPastEverywhere('2026-11-10', at('2026-11-10T23:59:00Z'))).toBe(false);
        expect(isPastEverywhere('2026-11-10', at('2026-11-11T11:59:00Z'))).toBe(false);
        expect(isPastEverywhere('2026-11-11', at('2026-11-10T08:00:00Z'))).toBe(false); // tomorrow
    });

    it('is true once the day has ended everywhere', () => {
        expect(isPastEverywhere('2026-11-10', at('2026-11-11T12:00:00Z'))).toBe(true);
        expect(isPastEverywhere('2026-10-10', at('2026-11-10T08:00:00Z'))).toBe(true);
    });
});
