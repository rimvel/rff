import { NextRequest, NextResponse } from 'next/server';
import { parseCalendarParams, priceCalendar } from '@/lib/calendar';

export async function GET(request: NextRequest) {
    const parsed = parseCalendarParams(request.nextUrl.searchParams);
    if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    try {
        return NextResponse.json(await priceCalendar(parsed.params), {
            headers: { 'Cache-Control': 'public, max-age=300' },
        });
    } catch (e) {
        console.error('Calendar error:', e);
        return NextResponse.json({ error: 'Could not load prices.' }, { status: 500 });
    }
}
