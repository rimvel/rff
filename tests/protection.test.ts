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
});

describe('clientKey', () => {
    const key = (h: Record<string, string>) => clientKey(new Headers(h));
    it('reads the visitor IP the way Azure passes it on', () => {
        expect(key({ 'x-client-ip': '203.0.113.5' })).toBe('203.0.113.5');
        expect(key({ 'x-forwarded-for': '203.0.113.5:51234, 10.0.0.1' })).toBe('203.0.113.5');
        expect(key({ 'x-forwarded-for': '[2001:db8::1]:51234' })).toBe('2001:db8::1');
        expect(key({})).toBe('unknown');
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
