// Lithuanian public holidays, school breaks and "holiday windows" (time off around them), for planning trips.
// Kept free of server code so the page can use it.

import { addDays, expandDates } from './time';

export interface PublicHoliday {
    date: string; // "YYYY-MM-DD"
    name: string; // English, with the Lithuanian name in quotes where it helps
}

/** Easter Sunday (Gregorian calendar), "YYYY-MM-DD". */
export function easterSunday(year: number): string {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** First Sunday of a month ("YYYY-MM-DD"). */
function firstSunday(year: number, month: number): string {
    const first = new Date(Date.UTC(year, month - 1, 1));
    return addDays(first.toISOString().slice(0, 10), (7 - first.getUTCDay()) % 7);
}

/** Lithuania's non-working public holidays in a year (Labour Code, art. 123). */
export function publicHolidays(year: number): PublicHoliday[] {
    const easter = easterSunday(year);
    const list: PublicHoliday[] = [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: `${year}-02-16`, name: 'Restoration of the State Day („Vasario 16-oji“)' },
        { date: `${year}-03-11`, name: 'Restoration of Independence Day („Kovo 11-oji“)' },
        { date: easter, name: 'Easter Sunday („Velykos“)' },
        { date: addDays(easter, 1), name: 'Easter Monday' },
        { date: `${year}-05-01`, name: 'Labour Day' },
        { date: firstSunday(year, 5), name: "Mother's Day" },
        { date: firstSunday(year, 6), name: "Father's Day" },
        { date: `${year}-06-24`, name: 'Midsummer („Joninės“)' },
        { date: `${year}-07-06`, name: 'Statehood Day („Valstybės diena“)' },
        { date: `${year}-08-15`, name: 'Assumption Day („Žolinė“)' },
        { date: `${year}-11-01`, name: "All Saints' Day" },
        { date: `${year}-11-02`, name: 'All Souls\' Day („Vėlinės“)' },
        { date: `${year}-12-24`, name: 'Christmas Eve („Kūčios“)' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-26`, name: 'Second Day of Christmas' },
    ];
    return list.sort((x, y) => x.date.localeCompare(y.date));
}

const holidayCache = new Map<number, Map<string, string>>();

/** Name of the public holiday on a date, if it is one. */
export function holidayOn(date: string): string | undefined {
    const year = Number(date.slice(0, 4));
    if (!holidayCache.has(year)) holidayCache.set(year, new Map(publicHolidays(year).map(h => [h.date, h.name])));
    return holidayCache.get(year)!.get(date);
}

export interface SchoolBreak {
    name: string;
    start: string;
    end: string;
}

/**
 * School breaks for pupils. These are set each school year (not by a rule), so they need updating every
 * summer. 2026–2027 dates as provided by the site owner.
 */
export const SCHOOL_BREAKS: SchoolBreak[] = [
    { name: 'Autumn break („Rudens atostogos“)', start: '2026-11-02', end: '2026-11-08' },
    { name: 'Christmas break („Kalėdų atostogos“)', start: '2026-12-22', end: '2027-01-03' },
    { name: 'Winter break („Žiemos atostogos“)', start: '2027-02-15', end: '2027-02-21' },
    { name: 'Easter break („Velykų atostogos“)', start: '2027-03-22', end: '2027-04-04' },
    { name: 'Summer break („Vasaros atostogos“)', start: '2027-06-15', end: '2027-08-31' },
];

export function schoolBreakOn(date: string): SchoolBreak | undefined {
    return SCHOOL_BREAKS.find(b => date >= b.start && date <= b.end);
}

function weekday(date: string): number {
    return new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
}

const isWeekend = (date: string) => weekday(date) === 0 || weekday(date) === 6;

export interface TimeOff {
    days: number; // calendar days from start to end, both included
    leaveDays: string[]; // working days (Mon–Fri, not public holidays) you'd need to take off
    schoolDays: string[]; // days a pupil would miss school (working days outside school breaks)
}

/** What a trip from `start` to `end` (both included) costs in leave days and missed school. */
export function timeOff(start: string, end: string): TimeOff {
    const days = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1);
    const all = days > 0 ? expandDates(start, days - 1, 'after') : [];
    const leaveDays = all.filter(d => !isWeekend(d) && !holidayOn(d));
    return { days, leaveDays, schoolDays: leaveDays.filter(d => !schoolBreakOn(d)) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Compact list of dates, e.g. "3–6 Nov", "22, 23, 28–31 Dec", "30 Mar – 2 Apr". */
export function formatDayList(dates: string[]): string {
    const month = (d: string) => MONTHS[Number(d.slice(5, 7)) - 1];
    const day = (d: string) => String(Number(d.slice(8)));
    const runs: string[][] = [];
    for (const d of dates) {
        const run = runs[runs.length - 1];
        if (run && addDays(run[run.length - 1], 1) === d) run.push(d);
        else runs.push([d]);
    }
    return runs.map((run, i) => {
        const [a, b] = [run[0], run[run.length - 1]];
        if (month(a) !== month(b)) return `${day(a)} ${month(a)} – ${day(b)} ${month(b)}`;
        const text = run.length === 1 ? day(a) : run.length === 2 ? `${day(a)}, ${day(b)}` : `${day(a)}–${day(b)}`;
        // The month name follows the last dates of that month
        const next = runs[i + 1];
        return !next || month(next[0]) !== month(b) ? `${text} ${month(b)}` : text;
    }).join(', ');
}

export interface HolidayWindow {
    name: string;
    start: string;
    end: string;
}

/**
 * Good times to travel: long weekends and school breaks, with as few leave days as possible.
 * From the site owner's plan for 2026–2027; free days, leave days and missed school are calculated.
 */
export const HOLIDAY_WINDOWS: HolidayWindow[] = [
    { name: 'All Souls\' long weekend („Vėlinės“)', start: '2026-10-31', end: '2026-11-02' },
    { name: 'Whole autumn break', start: '2026-10-31', end: '2026-11-08' },
    { name: 'Christmas long weekend', start: '2026-12-24', end: '2026-12-27' },
    { name: 'Christmas to New Year', start: '2026-12-24', end: '2027-01-03' },
    { name: 'Whole Christmas break', start: '2026-12-22', end: '2027-01-03' },
    { name: 'Christmas break + weekend before', start: '2026-12-19', end: '2027-01-03' },
    { name: 'New Year long weekend', start: '2027-01-01', end: '2027-01-03' },
    { name: 'February 16 long weekend („Vasario 16-oji“)', start: '2027-02-13', end: '2027-02-16' },
    { name: 'Whole winter break', start: '2027-02-13', end: '2027-02-21' },
    { name: 'March 11 long weekend („Kovo 11-oji“)', start: '2027-03-11', end: '2027-03-14' },
    { name: 'First Easter break week', start: '2027-03-20', end: '2027-03-29' },
    { name: 'Easter long weekend („Velykos“)', start: '2027-03-27', end: '2027-03-29' },
    { name: 'Second Easter break week', start: '2027-03-27', end: '2027-04-04' },
    { name: 'Whole Easter break', start: '2027-03-20', end: '2027-04-04' },
    { name: 'Midsummer week („Joninės“)', start: '2027-06-19', end: '2027-06-27' },
    { name: 'Midsummer long weekend („Joninės“)', start: '2027-06-24', end: '2027-06-27' },
    { name: 'Midsummer + Statehood Day („Joninės“ + „Valstybės diena“)', start: '2027-06-24', end: '2027-07-06' },
    { name: 'Statehood Day long weekend („Valstybės diena“)', start: '2027-07-03', end: '2027-07-06' },
    { name: 'Statehood Day week („Valstybės diena“)', start: '2027-07-03', end: '2027-07-11' },
];

export interface WindowInfo extends HolidayWindow, TimeOff {
    free: boolean; // no leave days needed
    bestValue: boolean; // many days off per leave day
}

// "Best value": at least 2.75 days off per leave day (e.g. 11 days for 4, 4 days for 1)
const BEST_VALUE_RATIO = 2.75;

/** Holiday windows that haven't ended yet, with their cost in leave days, earliest first. */
export function upcomingWindows(today: string): WindowInfo[] {
    return HOLIDAY_WINDOWS
        .filter(w => w.end >= today)
        .map(w => {
            const t = timeOff(w.start, w.end);
            const free = t.leaveDays.length === 0;
            return { ...w, ...t, free, bestValue: !free && t.days / t.leaveDays.length >= BEST_VALUE_RATIO };
        })
        .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}
