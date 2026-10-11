import { NextRequest, NextResponse } from 'next/server';
import { SearchEvent } from '@/lib/events';
import { parseSearchParams, streamSearch } from '@/lib/search';

// Streams results as newline-separated JSON messages (see lib/events.ts), so the page can show
// direct flights while connections are still being searched.
export async function GET(request: NextRequest) {
    const parsed = parseSearchParams(request.nextUrl.searchParams);
    if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const events = streamSearch(parsed.params);
    const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const { value, done } = await events.next();
                if (done) controller.close();
                else controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
            } catch (e) {
                console.error('Search error:', e);
                const error: SearchEvent = { type: 'error', error: 'Something went wrong while searching. Please try again.' };
                controller.enqueue(encoder.encode(JSON.stringify(error) + '\n'));
                controller.close();
            }
        },
        async cancel() {
            await events.return(undefined); // visitor left or started another search
        },
    });

    return new Response(body, {
        headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            // Stop proxies and compression from holding back the stream
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
        },
    });
}
