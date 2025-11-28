
import { NextResponse } from 'next/server';
import { getAirports } from '@/lib/ryanair';

export async function GET() {
    try {
        const airports = await getAirports();
        return NextResponse.json(airports);
    } catch (e) {
        return NextResponse.json({ error: 'Failed to fetch airports' }, { status: 500 });
    }
}
