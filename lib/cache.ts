// Small in-memory helpers for the server: a TTL cache that also de-duplicates
// in-flight requests, and a concurrency limiter for outgoing calls.

interface Entry<T> {
    value: Promise<T>;
    expires: number;
}

export class TtlCache<T> {
    private entries = new Map<string, Entry<T>>();

    constructor(private ttlMs: number, private maxEntries = 5000) {}

    /** Return the cached value for `key`, or load it. Concurrent callers share one load. */
    get(key: string, load: () => Promise<T>): Promise<T> {
        const now = Date.now();
        const hit = this.entries.get(key);
        if (hit && hit.expires > now) return hit.value;

        const value = load();
        this.entries.set(key, { value, expires: now + this.ttlMs });
        // Don't keep failures around
        value.catch(() => {
            if (this.entries.get(key)?.value === value) this.entries.delete(key);
        });

        if (this.entries.size > this.maxEntries) {
            for (const [k, e] of this.entries) {
                if (e.expires <= now || this.entries.size > this.maxEntries) this.entries.delete(k);
                if (this.entries.size <= this.maxEntries) break;
            }
        }
        return value;
    }

    clear() {
        this.entries.clear();
    }
}

/** Run at most `limit` tasks at the same time. */
export function createLimiter(limit: number) {
    let active = 0;
    const queue: (() => void)[] = [];

    const next = () => {
        active--;
        queue.shift()?.();
    };

    return async function run<T>(task: () => Promise<T>): Promise<T> {
        if (active >= limit) {
            await new Promise<void>(resolve => queue.push(resolve));
        }
        active++;
        try {
            return await task();
        } finally {
            next();
        }
    };
}
