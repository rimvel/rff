import { describe, expect, it } from 'vitest';
import { buildAirportIndex } from '../lib/airportGroups';
import {
    buildQuickStarts, DEFAULT_ORIGIN, fitFlex, fitsLimits, formatDay, formatRange, MAX_AIRPORTS_PER_SIDE,
    MAX_DATE_RANGE_DAYS, MAX_SEARCH_COMBINATIONS, nextFriday, pickOrigin, saturdayFrom,
} from '../lib/quickStarts';
import * as server from '../lib/search';
import { readSearch, SearchRequest, toApiUrl, toPageParams } from '../lib/searchUrl';
import { addDays } from '../lib/time';
import { Airport } from '../lib/types';

const airport = (code: string, city = code): Airport => ({
    code, name: city, city: { name: city, code }, country: { name: 'Somewhere', code: 'xx' },
});

// The "South of Europe" group's airports, plus some origins
const SUN = ['ACE', 'FUE', 'LPA', 'TFS', 'AGP', 'LEI', 'RMU', 'ALC', 'FAO', 'FNC', 'CTA', 'PMO', 'TPS', 'MLA', 'HER', 'CHQ', 'RHO', 'KGS', 'JTR', 'LCA', 'PFO'];
const index = buildAirportIndex([airport('VNO', 'Vilnius'), airport('KUN', 'Kaunas'), ...SUN.map(code => airport(code))]);
const noAirportsYet = buildAirportIndex([]);

/** What the server says about a search: ok, or its error message */
function serverCheck(req: SearchRequest) {
    const result = server.parseSearchParams(new URLSearchParams(toApiUrl(req).split('?')[1]));
    return result.ok ? 'ok' : result.error;
}

const recent = (origin: string, fromLabel = 'Somewhere') => ({ request: { origin, dest: 'BCN', date: '2026-12-01' }, fromLabel, toLabel: 'Barcelona' });

describe('dates', () => {
    it('finds the next Friday (a week later on a Friday)', () => {
        // 2 Nov 2026 is a Monday
        expect(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map(nextFriday)).toEqual(Array(4).fill('2026-11-06'));
        expect(['2026-11-06', '2026-11-07', '2026-11-08'].map(nextFriday)).toEqual(Array(3).fill('2026-11-13'));
        expect(nextFriday('2026-12-28')).toBe('2027-01-01'); // across the year end
    });

    it('finds the first Saturday on or after a date', () => {
        expect(saturdayFrom('2026-11-20')).toBe('2026-11-21');
        expect(saturdayFrom('2026-11-21')).toBe('2026-11-21');
        expect(saturdayFrom('2026-11-22')).toBe('2026-11-28');
    });

    it('formats days and ranges', () => {
        expect(formatDay('2026-11-13')).toBe('Fri 13 Nov');
        expect(formatRange('2026-11-21', '2026-11-28')).toBe('21–28 Nov');
        expect(formatRange('2026-11-28', '2026-12-05')).toBe('28 Nov – 5 Dec');
    });
});

describe('origin', () => {
    it('uses the latest recent search, or Vilnius', () => {
        expect(pickOrigin([])).toEqual(DEFAULT_ORIGIN);
        expect(pickOrigin([recent('STN,LTN', 'London'), recent('KUN', 'Kaunas')])).toEqual({ codes: 'STN,LTN', label: 'London' });
    });

    it('falls back to Vilnius for an origin too big for "Anywhere", or one that is not airport codes', () => {
        expect(pickOrigin([recent('AAA,BBB,CCC,DDD,EEE,FFF')])).toEqual(DEFAULT_ORIGIN);
        expect(pickOrigin([recent('AAA,BBB,CCC,DDD,EEE')]).codes).toBe('AAA,BBB,CCC,DDD,EEE');
        expect(pickOrigin([recent('vno')])).toEqual(DEFAULT_ORIGIN);
        expect(pickOrigin([recent('')])).toEqual(DEFAULT_ORIGIN);
    });
});

describe('quick starts', () => {
    it('match the server limits', () => {
        expect(MAX_AIRPORTS_PER_SIDE).toBe(server.MAX_AIRPORTS_PER_SIDE);
        expect(MAX_SEARCH_COMBINATIONS).toBe(server.MAX_SEARCH_COMBINATIONS);
        expect(MAX_DATE_RANGE_DAYS).toBe(server.MAX_DATE_RANGE_DAYS);
    });

    it('builds three searches from Vilnius on a Friday', () => {
        const starts = buildQuickStarts('2026-11-06', DEFAULT_ORIGIN, index);
        expect(starts.map(s => [s.title, s.details.join(' · ')])).toEqual([
            ['Anywhere next weekend', 'From Vilnius · Fri 13 Nov'],
            ['A week in the sun', 'Vilnius ⇄ South of Europe · 21–28 Nov'],
            ['Christmas long weekend', 'Vilnius ⇄ South of Europe · 24–27 Dec · no leave days'],
        ]);
        const [anywhere, sun, longWeekend] = starts.map(s => s.request);
        expect(anywhere).toEqual({ origin: 'VNO', dest: 'ANYWHERE', date: '2026-11-13' });
        expect(sun).toEqual({
            origin: 'VNO', dest: SUN.join(','), date: '2026-11-21', returnDate: '2026-11-28',
            departureDateRange: 1, departureDateDirection: 'both', returnDateRange: 1, returnDateDirection: 'both',
        });
        expect(longWeekend).toEqual({ origin: 'VNO', dest: SUN.join(','), date: '2026-12-24', returnDate: '2026-12-27' });
    });

    it('says "this weekend" from Monday to Thursday', () => {
        expect(buildQuickStarts('2026-11-05', DEFAULT_ORIGIN, index)[0].title).toBe('Anywhere this weekend');
        expect(buildQuickStarts('2026-11-08', DEFAULT_ORIGIN, index)[0].title).toBe('Anywhere next weekend');
    });

    it('picks a long weekend or break that needs few leave days and has not started', () => {
        // On Christmas Eve both Christmas windows have started; New Year's is next and free
        const later = buildQuickStarts('2026-12-24', DEFAULT_ORIGIN, index).find(s => s.id === 'long-weekend');
        expect(later?.title).toBe('New Year long weekend');
        // 16 Feb needs one leave day for 4 days off (best value); the Lithuanian name is left out
        const feb = buildQuickStarts('2027-01-10', DEFAULT_ORIGIN, index).find(s => s.id === 'long-weekend');
        expect(feb?.title).toBe('February 16 long weekend');
        expect(feb?.details.slice(1)).toEqual(['13–16 Feb', '1 leave day']);
        // After the last window in the data there's none
        expect(buildQuickStarts('2027-08-01', DEFAULT_ORIGIN, index).map(s => s.id)).toEqual(['anywhere-weekend', 'sun-week']);
    });

    it('waits for today, and for the airport list before using the destination group', () => {
        expect(buildQuickStarts('', DEFAULT_ORIGIN, index)).toEqual([]);
        expect(buildQuickStarts('2026-11-06', DEFAULT_ORIGIN, noAirportsYet).map(s => s.id)).toEqual(['anywhere-weekend']);
    });

    it('leaves the origin out of the destinations', () => {
        const fromMalaga = buildQuickStarts('2026-11-06', { codes: 'AGP', label: 'Malaga' }, index);
        expect(fromMalaga[1].request.dest.split(',')).toHaveLength(SUN.length - 1);
        expect(fromMalaga[1].request.dest).not.toContain('AGP');
    });

    it('uses fewer flexible days when the origin has several airports', () => {
        expect(fitFlex(1, 21, 1)).toBe(1); // 63 combinations
        expect(fitFlex(5, 21, 1)).toBe(0); // 315 would be too many
        expect(fitFlex(1, 21, 7)).toBe(6);
        const fromFive = buildQuickStarts('2026-11-06', { codes: 'AAA,BBB,CCC,DDD,EEE', label: '5 airports' }, index);
        expect(fromFive[1].request.departureDateRange).toBeUndefined();
    });

    it('always land on a valid search the server accepts, all year round', () => {
        const origins = [DEFAULT_ORIGIN, { codes: 'VNO,KUN', label: 'Vilnius, Kaunas' }, { codes: 'AAA,BBB,CCC,DDD,EEE', label: '5 airports' }];
        let today = '2026-09-01';
        for (let i = 0; i < 400; i++, today = addDays(today, 1)) {
            for (const origin of origins) {
                for (const s of buildQuickStarts(today, origin, index)) {
                    expect(fitsLimits(s.request)).toBe(true);
                    expect(serverCheck(s.request), `${s.id} on ${today}`).toBe('ok');
                    expect(s.request.date > today).toBe(true);
                    // The page address gives back the same search
                    expect(readSearch(toPageParams(s.request))).toEqual(s.request);
                }
            }
        }
    });

    it('agrees with the server on what is too big', () => {
        const tooMany: SearchRequest[] = [
            { origin: 'AAA,BBB,CCC,DDD,EEE,FFF', dest: 'ANYWHERE', date: '2026-11-13' },
            { origin: 'AAA,BBB,CCC', dest: 'ANYWHERE', date: '2026-11-13', departureDateRange: 3, departureDateDirection: 'both' }, // 21 origin-days
            { origin: 'AAA,BBB,CCC,DDD,EEE', dest: SUN.join(','), date: '2026-11-21', departureDateRange: 1, departureDateDirection: 'both' },
        ];
        for (const req of tooMany) {
            expect(fitsLimits(req)).toBe(false);
            expect(serverCheck(req)).not.toBe('ok');
        }
    });
});
