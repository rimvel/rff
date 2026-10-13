// Simple per-visitor request limits, kept in memory on the server.

import { NextResponse } from 'next/server';

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Allow at most `max` requests per key in any `windowMs` period. A request can count as more than one
 * (`cost`, at most `max`), e.g. when it covers many airports.
 */
export function createRateLimit(max: number, windowMs: number) {
    const hits = new Map<string, number[]>();

    return function check(key: string, cost = 1): RateLimitResult {
        const now = Date.now();
        const n = Math.min(Math.max(1, Math.round(cost)), max);
        const recent = (hits.get(key) ?? []).filter(t => t > now - windowMs);
        if (recent.length + n > max) {
            hits.set(key, recent);
            // Wait until enough earlier requests have left the window
            const freedBy = recent[recent.length + n - max - 1];
            return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((freedBy + windowMs - now) / 1000)) };
        }
        for (let i = 0; i < n; i++) recent.push(now);
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

/** "203.0.113.5:51234" -> "203.0.113.5", "[2001:db8::1]:51234" -> "2001:db8::1"; undefined if it isn't an IP. */
function parseAddress(value: string): string | undefined {
    const ip = value.trim();
    const v4 = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
    if (v4) return v4[1];
    const v6 = ip.match(/^\[([0-9a-f:.]+)\](?::\d+)?$/i) ?? ip.match(/^([0-9a-f]*:[0-9a-f:.]+)$/i);
    return v6?.[1].toLowerCase();
}

/** Addresses of private networks and the server itself, which are never the visitor. */
function isInternal(ip: string): boolean {
    return /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip === '::1' || /^(fc|fd|fe80:)/.test(ip);
}

let loggedHeaderShape = false;

/**
 * The visitor's IP address. Azure's front end adds the address it was connected from at the end of
 * X-Forwarded-For; anything before that came from the visitor and could be made up, so the last public
 * address is used.
 */
export function clientKey(headers: Headers): string {
    const forwarded = (headers.get('x-forwarded-for') ?? '').split(',').map(parseAddress).filter((ip): ip is string => !!ip);
    const fromProxy = forwarded.reverse().find(ip => !isInternal(ip));
    const key = fromProxy ?? parseAddress(headers.get('x-client-ip') ?? '') ?? parseAddress(headers.get('x-real-ip') ?? '') ?? 'unknown';
    if (!loggedHeaderShape) {
        // Once per start, so the logs show which headers Azure sends (no addresses are logged)
        loggedHeaderShape = true;
        console.log(`Visitor IP headers: x-forwarded-for has ${forwarded.length} address(es), x-client-ip ${headers.has('x-client-ip') ? 'present' : 'absent'}; visitors are told apart by ${fromProxy ? 'x-forwarded-for' : key === 'unknown' ? 'nothing (all share one limit)' : 'another header'}`);
    }
    return key;
}

export function tooManyRequests(error: string, retryAfterSeconds: number) {
    return NextResponse.json({ error }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } });
}
