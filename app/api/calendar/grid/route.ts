import { NextRequest, NextResponse } from 'next/server';
import { calendarCost, calendarRequestsPerVisitor, parseGridParams, roundTripGrid } from '@/lib/calendar';
import { clientKey, tooManyRequests } from '@/lib/rateLimit';
import { isRyanairUnavailable } from '@/lib/ryanair';
import { RYANAIR_UNAVAILABLE } from '@/lib/search';

// Round-trip prices for departure days x return days around the chosen dates
export async function GET(request: NextRequest) {
    const parsed = parseGridParams(request.nextUrl.searchParams);
    if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const allowed = calendarRequestsPerVisitor(clientKey(request.headers), calendarCost(parsed.params.origins, parsed.params.dests));
    if (!allowed.ok) return tooManyRequests('Too many requests. Please wait a minute.', allowed.retryAfterSeconds);
    try {
        const grid = await roundTripGrid(parsed.params, request.signal); // dropped if the visitor leaves
        if (grid.prices.every(row => row.every(p => p === null)) && isRyanairUnavailable()) {
            return NextResponse.json({ error: RYANAIR_UNAVAILABLE }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
        }
        return NextResponse.json(grid, { headers: { 'Cache-Control': 'public, max-age=300' } });
    } catch (e) {
        console.error('Date grid error:', e);
        return NextResponse.json({ error: 'Could not load prices.' }, { status: 500 });
    }
}
