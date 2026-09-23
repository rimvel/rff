import { describe, expect, it, vi } from 'vitest';
import { createLimiter, TtlCache } from '../lib/cache';

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
