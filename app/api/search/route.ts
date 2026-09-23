import { NextRequest, NextResponse } from 'next/server';
import { parseSearchParams, runSearch } from '@/lib/search';

export async function GET(request: NextRequest) {
    const parsed = parseSearchParams(request.nextUrl.searchParams);
    if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    try {
        return NextResponse.json(await runSearch(parsed.params));
    } catch (e) {
        console.error('Search error:', e);
        return NextResponse.json({ error: 'Something went wrong while searching. Please try again.' }, { status: 500 });
    }
}
