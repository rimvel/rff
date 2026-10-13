// Small in-memory helpers for the server: a TTL cache that also de-duplicates
// in-flight requests, a concurrency limiter for outgoing calls, and a stream merger.

interface Entry<T> {
    value: Promise<T>;
    expires: number;
}

export class TtlCache<T> {
    private entries = new Map<string, Entry<T>>();

    constructor(private ttlMs: number, private maxEntries = 5000) {}

    /**
     * Return the cached value for `key`, or load it. Concurrent callers share one load. If the shared load
     * was cancelled because the caller who started it gave up (`signal`), callers who still want it load again.
     */
    get(key: string, load: () => Promise<T>, signal?: AbortSignal): Promise<T> {
        return this.share(key, load).catch(e => {
            if (isAbortError(e) && !signal?.aborted) return this.get(key, load, signal);
            throw e;
        });
    }

    private share(key: string, load: () => Promise<T>): Promise<T> {
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

    /** Store a value that was obtained some other way. */
    set(key: string, value: T) {
        this.entries.set(key, { value: Promise.resolve(value), expires: Date.now() + this.ttlMs });
    }

    clear() {
        this.entries.clear();
    }
}

/** True for the error a cancelled task fails with (see `signal` below). */
export function isAbortError(e: unknown): boolean {
    return (e as { name?: string } | null)?.name === 'AbortError';
}

/**
 * Run at most `limit` tasks at the same time, and start them at least `minIntervalMs` apart
 * (so bursts are spread out). A task whose `signal` is aborted while it waits its turn is dropped
 * (it fails with an AbortError) instead of being run; a task that has started is left to finish.
 */
export function createLimiter(limit: number, minIntervalMs = 0) {
    let active = 0;
    const queue: (() => void)[] = [];
    let nextStart = 0;

    const next = () => {
        active--;
        queue.shift()?.();
    };

    return async function run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
        if (active >= limit) {
            await new Promise<void>(resolve => queue.push(resolve));
        }
        active++;
        try {
            signal?.throwIfAborted();
            if (minIntervalMs > 0) {
                const now = Date.now();
                const wait = nextStart - now;
                nextStart = Math.max(now, nextStart) + minIntervalMs;
                if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
            }
            signal?.throwIfAborted();
            return await task();
        } finally {
            next();
        }
    };
}

/** Turns tasks that each push messages into one stream of messages, in the order they happen. */
export async function* merge<T>(tasks: ((emit: (item: T) => void) => Promise<void>)[]): AsyncGenerator<T> {
    const queue: T[] = [];
    let wake: (() => void) | null = null;
    const emit = (item: T) => {
        queue.push(item);
        wake?.();
    };
    let running = tasks.length;
    for (const task of tasks) {
        task(emit)
            .catch(e => console.error('Search task failed:', e))
            .finally(() => {
                running--;
                wake?.();
            });
    }
    while (running > 0 || queue.length > 0) {
        if (queue.length === 0) await new Promise<void>(resolve => (wake = resolve));
        wake = null;
        yield* queue.splice(0);
    }
}
