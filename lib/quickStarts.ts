// One-tap searches for the home page, shown before the visitor has searched.
// Kept free of server code so the page can use it.

import { AirportIndex } from './airportGroups';
import { upcomingWindows } from './lithuania';
import { ANYWHERE, MAX_ANYWHERE_ORIGIN_DAYS, MAX_ANYWHERE_ORIGINS, SearchRequest } from './searchUrl';
import { addDays, expandDates } from './time';

// The server's limits (lib/search.ts, which can't be imported here because it uses server code).
// tests/quickStarts.test.ts checks that they still match.
export const MAX_AIRPORTS_PER_SIDE = 40;
export const MAX_SEARCH_COMBINATIONS = 300; // airport pairs x departure dates
export const MAX_DATE_RANGE_DAYS = 7;

export interface QuickStartOrigin {
    codes: string; // comma-separated airport codes
    label: string; // e.g. "Vilnius"
}

export interface QuickStart {
    id: string;
    icon: 'globe' | 'sun' | 'calendar'; // a line icon (components/Icon.tsx)
    title: string;
    details: string[]; // shown as "Vilnius ⇄ South of Europe · 21–28 Nov"
    request: SearchRequest;
}

export const DEFAULT_ORIGIN: QuickStartOrigin = { codes: 'VNO', label: 'Vilnius' };

/** The destination group the sunny quick starts fly to. */
export const SUN_GROUP = 'South of Europe';

const CODES = /^[A-Z]{3}(,[A-Z]{3})*$/;

/**
 * Where quick starts fly from: the origin of the latest recent search, or Vilnius. An origin with more
 * airports than an "Anywhere" search allows (e.g. a whole country) isn't used.
 */
export function pickOrigin(recent: { request: SearchRequest; fromLabel: string }[]): QuickStartOrigin {
    const latest = recent[0];
    const codes = latest?.request.origin ?? '';
    if (!CODES.test(codes) || codes.split(',').length > MAX_ANYWHERE_ORIGINS) return DEFAULT_ORIGIN;
    return { codes, label: latest.fromLabel || codes };
}

function weekday(date: string): number {
    return new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
}

/** The first Friday after today (a week later when today is a Friday). */
export function nextFriday(today: string): string {
    return addDays(today, ((11 - weekday(today)) % 7) + 1);
}

/** The first Saturday on or after a date. */
export function saturdayFrom(date: string): string {
    return addDays(date, (6 - weekday(date) + 7) % 7);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const day = (d: string) => Number(d.slice(8));
const month = (d: string) => MONTHS[Number(d.slice(5, 7)) - 1];

/** "Fri 13 Nov" */
export function formatDay(date: string): string {
    return `${DAYS[weekday(date)]} ${day(date)} ${month(date)}`;
}

/** "21–28 Nov", "28 Nov – 5 Dec" */
export function formatRange(start: string, end: string): string {
    return month(start) === month(end) ? `${day(start)}–${day(end)} ${month(end)}` : `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`;
}

/** Number of departure days a search covers. */
function departureDays(req: SearchRequest): number {
    return req.departureDateRange ? expandDates(req.date, req.departureDateRange, req.departureDateDirection ?? 'both').length : 1;
}

/** Whether the server accepts a search of this size (same rules as parseSearchParams in lib/search.ts). */
export function fitsLimits(req: SearchRequest): boolean {
    const origins = req.origin.split(',');
    const days = departureDays(req);
    if ((req.departureDateRange ?? 0) > MAX_DATE_RANGE_DAYS || (req.returnDateRange ?? 0) > MAX_DATE_RANGE_DAYS) return false;
    if (origins.length > MAX_AIRPORTS_PER_SIDE) return false;
    if (req.dest === ANYWHERE) return origins.length <= MAX_ANYWHERE_ORIGINS && origins.length * days <= MAX_ANYWHERE_ORIGIN_DAYS;
    const dests = req.dest.split(',');
    return dests.length <= MAX_AIRPORTS_PER_SIDE && origins.length * dests.length * days <= MAX_SEARCH_COMBINATIONS;
}

/** The most flexible days (± around the date, at most `wanted`) that keep a search within the limits. */
export function fitFlex(origins: number, dests: number, wanted: number): number {
    for (let flex = wanted; flex > 0; flex--) {
        if (origins * dests * (2 * flex + 1) <= MAX_SEARCH_COMBINATIONS) return flex;
    }
    return 0;
}

/** "Christmas long weekend („Kalėdos“)" -> "Christmas long weekend" */
const withoutLocalName = (name: string) => name.replace(/\s*\(.*\)\s*$/, '');

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Up to three ready-made searches from `origin`: anywhere next weekend, a week in the sun in about two weeks,
 * and the next Lithuanian long weekend that needs few leave days. The sunny ones need the airport index
 * (for the destination group) and are left out until it has loaded.
 */
export function buildQuickStarts(today: string, origin: QuickStartOrigin, index: AirportIndex): QuickStart[] {
    if (!today) return [];
    const origins = origin.codes.split(',');
    const starts: QuickStart[] = [];

    // 1. The cheapest places to fly to on Friday, one way
    const friday = nextFriday(today);
    starts.push({
        id: 'anywhere-weekend',
        icon: 'globe',
        // Monday to Thursday it's this week's Friday; from Friday on, next week's
        title: addDays(today, 4) >= friday ? 'Anywhere this weekend' : 'Anywhere next weekend',
        details: [`From ${origin.label}`, formatDay(friday)],
        request: { origin: origin.codes, dest: ANYWHERE, date: friday },
    });

    // The sunny group, without the origin's own airports
    const sun = index.regions.find(r => r.name === SUN_GROUP);
    const sunCodes = (sun?.airportCodes ?? []).filter(code => !origins.includes(code)).slice(0, MAX_AIRPORTS_PER_SIDE);
    if (sunCodes.length > 0) {
        const dest = sunCodes.join(',');

        // 2. A week in the sun, leaving on a Saturday about two weeks from now (± a day either way)
        const date = saturdayFrom(addDays(today, 14));
        const returnDate = addDays(date, 7);
        const flex = fitFlex(origins.length, sunCodes.length, 1);
        starts.push({
            id: 'sun-week',
            icon: 'sun',
            title: 'A week in the sun',
            details: [`${origin.label} ⇄ ${SUN_GROUP}`, formatRange(date, returnDate)],
            request: {
                origin: origin.codes,
                dest,
                date,
                returnDate,
                ...(flex > 0 && { departureDateRange: flex, departureDateDirection: 'both', returnDateRange: flex, returnDateDirection: 'both' }),
            },
        });

        // 3. The next long weekend or break that needs no (or few) leave days, on its exact dates
        const window = upcomingWindows(today).find(w => w.start > today && (w.free || w.bestValue));
        if (window) {
            starts.push({
                id: 'long-weekend',
                icon: 'calendar',
                title: withoutLocalName(window.name),
                details: [
                    `${origin.label} ⇄ ${SUN_GROUP}`,
                    formatRange(window.start, window.end),
                    window.free ? 'no leave days' : plural(window.leaveDays.length, 'leave day'),
                ],
                request: { origin: origin.codes, dest, date: window.start, returnDate: window.end },
            });
        }
    }

    return starts.filter(s => fitsLimits(s.request));
}
