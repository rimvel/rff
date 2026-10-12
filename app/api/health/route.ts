import { NextResponse } from 'next/server';
import { ryanairStatus } from '@/lib/ryanair';

export const dynamic = 'force-dynamic';

const startedAt = new Date().toISOString();

/**
 * Health check: which version is running and how requests to Ryanair are going. It never calls Ryanair.
 * Answers 503 while requests to Ryanair are paused, so an uptime monitor can raise an alert.
 */
export async function GET() {
    const ryanair = ryanairStatus();
    const status = ryanair.paused ? 'paused' : ryanair.unavailable ? 'degraded' : 'ok';
    return NextResponse.json(
        {
            status,
            version: process.env.BUILD_SHA ?? 'unknown',
            builtAt: process.env.BUILD_TIME ?? null,
            startedAt,
            uptimeSeconds: Math.round(process.uptime()),
            ryanair,
        },
        { status: status === 'paused' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
    );
}
