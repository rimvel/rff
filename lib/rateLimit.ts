// Simple per-visitor request limits, kept in memory on the server.

import { NextResponse } from 'next/server';

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Allow at most `max` requests per key in any `windowMs` period. */
export function createRateLimit(max: number, windowMs: number) {
    const hits = new Map<string, number[]>();

    return function check(key: string): RateLimitResult {
        const now = Date.now();
        const recent = (hits.get(key) ?? []).filter(t => t > now - windowMs);
        if (recent.length >= max) {
            hits.set(key, recent);
            return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
        }
        recent.push(now);
        hits.set(key, recent);

        // Forget visitors who haven't been seen for a while
        if (hits.size > 5000) {
            for (const [k, times] of hits) {
                if (times[times.length - 1] <= now - windowMs) hits.delete(k);
            }
        }
        return { ok: true };
    };
}

/** The visitor's IP address, as passed on by Azure's front end. */
export function clientKey(headers: Headers): string {
    const raw = headers.get('x-client-ip') ?? headers.get('x-forwarded-for')?.split(',')[0] ?? headers.get('x-real-ip') ?? '';
    const ip = raw.trim();
    // Azure adds the port: "203.0.113.5:51234" or "[2001:db8::1]:51234"
    const v4 = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
    if (v4) return v4[1];
    const v6 = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
    if (v6) return v6[1];
    return ip || 'unknown';
}

export function tooManyRequests(error: string, retryAfterSeconds: number) {
    return NextResponse.json({ error }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } });
}
