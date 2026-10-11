import { NextRequest, NextResponse } from 'next/server';
import { parseCalendarParams, priceCalendar } from '@/lib/calendar';
import { clientKey, createRateLimit, tooManyRequests } from '@/lib/rateLimit';
import { isRyanairUnavailable } from '@/lib/ryanair';
import { RYANAIR_UNAVAILABLE } from '@/lib/search';

// Browsing months is quick, but each month can mean dozens of requests to Ryanair
const perVisitor = createRateLimit(40, 60_000);

export async function GET(request: NextRequest) {
    const parsed = parseCalendarParams(request.nextUrl.searchParams);
    if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const allowed = perVisitor(clientKey(request.headers));
    if (!allowed.ok) return tooManyRequests('Too many requests. Please wait a minute.', allowed.retryAfterSeconds);
    try {
        const calendar = await priceCalendar(parsed.params);
        if (calendar.days.every(d => d.price === null) && isRyanairUnavailable()) {
            return NextResponse.json({ error: RYANAIR_UNAVAILABLE }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
        }
        return NextResponse.json(calendar, {
            headers: { 'Cache-Control': 'public, max-age=300' },
        });
    } catch (e) {
        console.error('Calendar error:', e);
        return NextResponse.json({ error: 'Could not load prices.' }, { status: 500 });
    }
}
