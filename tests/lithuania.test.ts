import { describe, expect, it } from 'vitest';
import { easterSunday, formatDayList, HOLIDAY_WINDOWS, holidayOn, publicHolidays, timeOff, upcomingWindows } from '../lib/lithuania';

describe('public holidays', () => {
    it('finds Easter', () => {
        expect(easterSunday(2026)).toBe('2026-04-05');
        expect(easterSunday(2027)).toBe('2027-03-28');
        expect(easterSunday(2028)).toBe('2028-04-16');
    });

    it('matches the list in the owner\'s spreadsheet (Nov 2026 – Aug 2027)', () => {
        const dates = [...publicHolidays(2026), ...publicHolidays(2027)].map(h => h.date)
            .filter(d => d >= '2026-11-01' && d <= '2027-08-31');
        expect(dates).toEqual([
            '2026-11-01', '2026-11-02', '2026-12-24', '2026-12-25', '2026-12-26', '2027-01-01', '2027-02-16', '2027-03-11',
            '2027-03-28', '2027-03-29', '2027-05-01', '2027-05-02', '2027-06-06', '2027-06-24', '2027-07-06', '2027-08-15',
        ]);
        expect(holidayOn('2027-06-24')).toBe('Midsummer („Joninės“)');
        expect(holidayOn('2027-06-25')).toBeUndefined();
    });
});

describe('time off for a trip', () => {
    // [start, end, days off, leave days, which days to take, missed school days] from the spreadsheet
    const SPREADSHEET: [string, string, number, number, string, string[]][] = [
        ['2026-10-31', '2026-11-02', 3, 0, '', []],
        ['2026-10-31', '2026-11-08', 9, 4, '3–6 Nov', []],
        ['2026-12-24', '2026-12-27', 4, 0, '', []],
        ['2026-12-24', '2027-01-03', 11, 4, '28–31 Dec', []],
        ['2026-12-22', '2027-01-03', 13, 6, '22, 23, 28–31 Dec', []],
        ['2026-12-19', '2027-01-03', 16, 7, '21–23, 28–31 Dec', ['2026-12-21']],
        ['2027-01-01', '2027-01-03', 3, 0, '', []],
        ['2027-02-13', '2027-02-16', 4, 1, '15 Feb', []],
        ['2027-02-13', '2027-02-21', 9, 4, '15, 17–19 Feb', []],
        ['2027-03-11', '2027-03-14', 4, 1, '12 Mar', ['2027-03-12']],
        ['2027-03-20', '2027-03-29', 10, 5, '22–26 Mar', []],
        ['2027-03-27', '2027-03-29', 3, 0, '', []],
        ['2027-03-27', '2027-04-04', 9, 4, '30 Mar – 2 Apr', []],
        ['2027-03-20', '2027-04-04', 16, 9, '22–26, 30 Mar – 2 Apr', []],
        ['2027-06-19', '2027-06-27', 9, 4, '21–23, 25 Jun', []],
        ['2027-06-24', '2027-06-27', 4, 1, '25 Jun', []],
        ['2027-06-24', '2027-07-06', 13, 7, '25, 28 Jun – 2 Jul, 5 Jul', []],
        ['2027-07-03', '2027-07-06', 4, 1, '5 Jul', []],
        ['2027-07-03', '2027-07-11', 9, 4, '5, 7–9 Jul', []],
    ];

    it('gives the same days off, leave days and missed school as the spreadsheet', () => {
        expect(HOLIDAY_WINDOWS.map(w => [w.start, w.end])).toEqual(SPREADSHEET.map(s => [s[0], s[1]]));
        for (const [start, end, days, leave, take, school] of SPREADSHEET) {
            const t = timeOff(start, end);
            expect([start, t.days, t.leaveDays.length, formatDayList(t.leaveDays), t.schoolDays]).toEqual([start, days, leave, take, school]);
        }
    });

    it('marks free windows and the best value ones, and hides those that are over', () => {
        const all = upcomingWindows('2026-10-13');
        expect(all).toHaveLength(19);
        expect(all.filter(w => w.free).map(w => w.start)).toEqual(['2026-10-31', '2026-12-24', '2027-01-01', '2027-03-27']);
        expect(all.find(w => w.start === '2026-12-24' && w.end === '2027-01-03')?.bestValue).toBe(true); // 11 for 4
        expect(all.find(w => w.start === '2026-10-31' && w.end === '2026-11-08')?.bestValue).toBe(false); // 9 for 4
        expect(upcomingWindows('2027-07-07').map(w => w.start)).toEqual(['2027-07-03']); // only Jul 3–11 left
    });
});
