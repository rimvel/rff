import { NextResponse } from 'next/server';
import { getAirports } from '@/lib/ryanair';

// getAirports() keeps a 24h in-memory cache and serves a stale copy if Ryanair is unreachable
export async function GET() {
    try {
        const airports = await getAirports();
        return NextResponse.json(airports, {
            headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
        });
    } catch (e) {
        console.error('Failed to fetch airports:', e);
        return NextResponse.json({ error: 'Failed to fetch airports' }, { status: 500 });
    }
}
