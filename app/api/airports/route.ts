
import { NextResponse } from 'next/server';
import { getAirports, Airport } from '@/lib/ryanair';

// Server-side in-memory cache: airports change very rarely
let cachedAirports: Airport[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function GET() {
    try {
        const now = Date.now();
        if (cachedAirports && now - cacheTimestamp < CACHE_TTL) {
            return NextResponse.json(cachedAirports, {
                headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
            });
        }

        const airports = await getAirports();
        cachedAirports = airports;
        cacheTimestamp = now;

        return NextResponse.json(airports, {
            headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
        });
    } catch (e) {
        // If cache exists but is stale, serve stale data rather than error
        if (cachedAirports) {
            console.warn('Failed to refresh airports, serving stale cache:', e);
            return NextResponse.json(cachedAirports, {
                headers: { 'Cache-Control': 'public, max-age=600' },
            });
        }
        return NextResponse.json({ error: 'Failed to fetch airports' }, { status: 500 });
    }
}
