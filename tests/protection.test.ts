import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLimiter } from '../lib/cache';
import { clientKey, createRateLimit } from '../lib/rateLimit';

describe('createRateLimit', () => {
    it('allows up to the limit per visitor, then says how long to wait', () => {
        vi.useFakeTimers();
        const check = createRateLimit(2, 60_000);
        expect(check('a').ok).toBe(true);
        expect(check('a').ok).toBe(true);
        const third = check('a');
        expect(third.ok).toBe(false);
        expect(!third.ok && third.retryAfterSeconds).toBe(60);
        expect(check('b').ok).toBe(true); // other visitors aren't affected
        vi.advanceTimersByTime(60_001);
        expect(check('a').ok).toBe(true);
        vi.useRealTimers();
    });

    it('counts a costly request as several', () => {
        vi.useFakeTimers();
        const check = createRateLimit(10, 60_000);
        expect(check('a', 4).ok).toBe(true);
        vi.advanceTimersByTime(10_000);
        expect(check('a', 6).ok).toBe(true); // 10 used
        const next = check('a', 3);
        expect(next.ok).toBe(false);
        expect(!next.ok && next.retryAfterSeconds).toBe(50); // when the first 4 leave the window
        expect(check('b', 100).ok).toBe(true); // a cost above the limit counts as the whole limit
        expect(check('b').ok).toBe(false);
        vi.useRealTimers();
    });
});

describe('clientKey', () => {
    const key = (h: Record<string, string>) => clientKey(new Headers(h));
    it('reads the visitor IP the way Azure passes it on', () => {
        expect(key({ 'x-forwarded-for': '203.0.113.5:51234' })).toBe('203.0.113.5');
        expect(key({ 'x-forwarded-for': '203.0.113.5:51234, 10.0.0.1' })).toBe('203.0.113.5'); // internal hop
        expect(key({ 'x-forwarded-for': '[2001:db8::1]:51234' })).toBe('2001:db8::1');
        expect(key({ 'x-forwarded-for': '2001:DB8::1' })).toBe('2001:db8::1');
        expect(key({ 'x-client-ip': '203.0.113.5' })).toBe('203.0.113.5'); // only when there's no x-forwarded-for
        expect(key({})).toBe('unknown');
    });
    it("can't be fooled by addresses the visitor adds", () => {
        // Azure adds the real address at the end; the ones before it came from the visitor
        expect(key({ 'x-forwarded-for': '198.51.100.7, 203.0.113.5:51234' })).toBe('203.0.113.5');
        expect(key({ 'x-forwarded-for': 'made-up, 203.0.113.5:51234', 'x-client-ip': '198.51.100.7' })).toBe('203.0.113.5');
    });
});

describe('createLimiter spacing', () => {
    it('starts tasks at least the given interval apart', async () => {
        const run = createLimiter(10, 20);
        const starts: number[] = [];
        await Promise.all(Array.from({ length: 5 }, () => run(async () => { starts.push(Date.now()); })));
        const gaps = starts.slice(1).map((t, i) => t - starts[i]);
        expect(Math.min(...gaps)).toBeGreaterThanOrEqual(15); // timers can fire a few ms early
        expect(starts[4] - starts[0]).toBeGreaterThanOrEqual(75);
    });
});

describe('when Ryanair refuses requests', () => {
    beforeEach(() => {
        vi.resetModules(); // fresh request state for each test
    });
    afterEach(() => vi.unstubAllGlobals());

    const params = {
        origins: ['VNO'], dests: ['STN'], date: '2026-10-15',
        dateRangeDays: 0, dateDirection: 'both' as const, returnDateRange: 0, returnDateDirection: 'both' as const,
    };

    it('says so instead of "no flights", and stops asking for a while', async () => {
        const fetchMock = vi.fn(async () => new Response('Forbidden', { status: 403 }));
        vi.stubGlobal('fetch', fetchMock);
        const { streamSearch, RYANAIR_UNAVAILABLE } = await import('../lib/search');

        const events = [];
        for await (const e of streamSearch(params)) events.push(e);
        expect(events[events.length - 1]).toEqual({ type: 'error', error: RYANAIR_UNAVAILABLE });

        // Paused: the next search answers straight away without calling Ryanair
        const callsSoFar = fetchMock.mock.calls.length;
        const again = [];
        for await (const e of streamSearch(params)) again.push(e);
        expect(again).toEqual([{ type: 'error', error: RYANAIR_UNAVAILABLE }]);
        expect(fetchMock.mock.calls.length).toBe(callsSoFar);
    });

    it('still reports "no flights" when Ryanair answers normally with nothing', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            const body = url.includes('cheapestPerDay') ? { outbound: { fares: [] } } : url.includes('/routes/') ? [] : url.includes('/airports/') ? [] : { fares: [] };
            return new Response(JSON.stringify(body), { status: 200 });
        }));
        const { streamSearch } = await import('../lib/search');
        const events = [];
        for await (const e of streamSearch(params)) events.push(e);
        expect(events.map(e => e.type)).toEqual(['results', 'complete']);
    });
});

describe('health check', () => {
    beforeEach(() => vi.resetModules());
    afterEach(() => vi.unstubAllGlobals());

    it('reports ok with no problems', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ outbound: { fares: [] } }), { status: 200 })));
        const { getMonthFares } = await import('../lib/ryanair');
        await getMonthFares('VNO', 'STN', '2026-11');
        const { GET } = await import('../app/api/health/route');
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.ryanair.sinceStart).toEqual({ requests: 1, failures: 0 });
        expect(body.ryanair.lastSuccessAt).not.toBeNull();
    });

    it('reports when Ryanair refuses requests, with the status code, and answers 503', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })));
        const { getMonthFares } = await import('../lib/ryanair');
        await getMonthFares('VNO', 'STN', '2026-11');
        const { GET } = await import('../app/api/health/route');
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(503);
        expect(body.status).toBe('paused');
        expect(body.ryanair.paused).toBe(true);
        expect(body.ryanair.lastFailure).toMatchObject({ status: 403, reason: 'refused' });
    });
});

describe('abandoned searches', () => {
    beforeEach(() => vi.resetModules());
    afterEach(() => vi.unstubAllGlobals());

    it("don't ask Ryanair for fares nobody is waiting for", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            const body = url.includes('/routes/') ? [{ arrivalAirport: { code: 'BGY' } }] : url.includes('/airports/') ? [] : { outbound: { fares: [] } };
            return new Response(JSON.stringify(body), { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { streamSearch } = await import('../lib/search');

        const left = new AbortController();
        left.abort();
        const params = {
            origins: ['VNO'], dests: ['STN', 'LTN', 'BCN', 'AGP'], date: '2026-10-15',
            dateRangeDays: 3, dateDirection: 'both' as const, returnDateRange: 0, returnDateDirection: 'both' as const,
        };
        for await (const e of streamSearch(params, left.signal)) void e;

        const fareRequests = fetchMock.mock.calls.filter(([url]) => String(url).includes('oneWayFares'));
        expect(fareRequests).toHaveLength(0);
        expect(errors).not.toHaveBeenCalled(); // dropped requests aren't failures
        errors.mockRestore();
    });
});

describe('price calendar size', () => {
    const codes = (n: number, first: string) => Array.from({ length: n }, (_, i) => first + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26))).join(',');

    it('refuses more than 100 airport pairs, and counts big views as several', async () => {
        const { calendarCost, parseCalendarParams } = await import('../lib/calendar');
        const params = (origins: number, dests: number) =>
            parseCalendarParams(new URLSearchParams({ origin: codes(origins, 'O'), dest: codes(dests, 'D'), month: '2026-11' }));
        expect(params(10, 10).ok).toBe(true);
        expect(params(11, 10)).toEqual({ ok: false, error: expect.stringContaining('fewer') });
        expect(params(40, 40).ok).toBe(false);

        expect(calendarCost(['VNO'], ['STN'])).toBe(1);
        expect(calendarCost(['VNO', 'KUN', 'PLQ'], codes(21, 'D').split(','))).toBe(7); // 63 pairs
        expect(calendarCost(codes(10, 'O').split(','), codes(10, 'D').split(','))).toBe(11);
    });
});
