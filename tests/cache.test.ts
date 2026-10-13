import { describe, expect, it, vi } from 'vitest';
import { createLimiter, isAbortError, TtlCache } from '../lib/cache';

describe('TtlCache', () => {
    it('shares one load between concurrent callers', async () => {
        const cache = new TtlCache<number>(1000);
        const load = vi.fn(async () => 42);
        const [a, b] = await Promise.all([cache.get('k', load), cache.get('k', load)]);
        expect(a).toBe(42);
        expect(b).toBe(42);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('does not cache failures', async () => {
        const cache = new TtlCache<number>(1000);
        await expect(cache.get('k', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        await expect(cache.get('k', async () => 1)).resolves.toBe(1);
    });

    it('loads again for a caller who still wants it when the shared load was cancelled for someone else', async () => {
        const cache = new TtlCache<number>(1000);
        const gaveUp = new AbortController();
        let release!: () => void;
        const first = cache.get('k', () => new Promise<number>((resolve, reject) => {
            release = () => reject(new DOMException('Cancelled', 'AbortError'));
        }), gaveUp.signal);
        const second = cache.get('k', async () => 7); // shares the first load while it's pending
        gaveUp.abort();
        release();
        await expect(first).rejects.toSatisfy(isAbortError);
        await expect(second).resolves.toBe(7);
    });

    it('reloads after the TTL', async () => {
        vi.useFakeTimers();
        const cache = new TtlCache<number>(1000);
        const load = vi.fn(async () => 1);
        await cache.get('k', load);
        vi.advanceTimersByTime(1500);
        await cache.get('k', load);
        expect(load).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });
});

describe('createLimiter', () => {
    it('never runs more than the limit at once', async () => {
        const limit = createLimiter(3);
        let active = 0;
        let peak = 0;
        const task = () => limit(async () => {
            active++;
            peak = Math.max(peak, active);
            await new Promise(r => setTimeout(r, 5));
            active--;
        });
        await Promise.all(Array.from({ length: 20 }, task));
        expect(peak).toBe(3);
    });
});

describe('createLimiter with cancelled tasks', () => {
    it('drops tasks whose search was abandoned while they waited, and runs the rest', async () => {
        const limit = createLimiter(1);
        const ran: string[] = [];
        const abandoned = new AbortController();
        const task = (name: string, signal?: AbortSignal) => limit(async () => {
            ran.push(name);
            await new Promise(r => setTimeout(r, 5));
        }, signal);

        const results = Promise.allSettled([
            task('a'),
            task('b', abandoned.signal),
            task('c', abandoned.signal),
            task('d'),
        ]);
        abandoned.abort(); // 'a' is running; 'b' and 'c' are still waiting
        const settled = await results;
        expect(ran).toEqual(['a', 'd']);
        expect(settled.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'rejected', 'fulfilled']);
        expect(settled[1].status === 'rejected' && isAbortError(settled[1].reason)).toBe(true);
    });
});
