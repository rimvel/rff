import { NextRequest, NextResponse } from 'next/server';
import { SearchEvent } from '@/lib/events';
import { clientKey, createRateLimit, tooManyRequests } from '@/lib/rateLimit';
import { parseSearchParams, streamSearch } from '@/lib/search';

// Per visitor: plenty for normal use, but stops one person (or bot) from getting the server blocked by Ryanair
const searchesPerVisitor = createRateLimit(30, 60_000);
const anywherePerVisitor = createRateLimit(5, 10 * 60_000); // "Anywhere" needs many more requests

// Streams results as newline-separated JSON messages (see lib/events.ts), so the page can show
// direct flights while connections are still being searched.
export async function GET(request: NextRequest) {
    const parsed = parseSearchParams(request.nextUrl.searchParams);
    if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const visitor = clientKey(request.headers);
    const allowed = searchesPerVisitor(visitor);
    if (!allowed.ok) {
        return tooManyRequests("You're searching very quickly. Please wait a minute and try again.", allowed.retryAfterSeconds);
    }
    if (parsed.params.anywhere) {
        const allowedAnywhere = anywherePerVisitor(visitor);
        if (!allowedAnywhere.ok) {
            const minutes = Math.ceil(allowedAnywhere.retryAfterSeconds / 60);
            return tooManyRequests(
                `You've done several "Anywhere" searches in a short time. Please try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
                allowedAnywhere.retryAfterSeconds,
            );
        }
    }

    // When the visitor leaves or starts another search, drop the Ryanair requests still queued for this one
    const abandoned = new AbortController();
    request.signal.addEventListener('abort', () => abandoned.abort(), { once: true });

    const encoder = new TextEncoder();
    const events = streamSearch(parsed.params, abandoned.signal);
    const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const { value, done } = await events.next();
                if (abandoned.signal.aborted) return; // nobody is reading any more
                if (done) controller.close();
                else controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
            } catch (e) {
                if (abandoned.signal.aborted) return;
                console.error('Search error:', e);
                const error: SearchEvent = { type: 'error', error: 'Something went wrong while searching. Please try again.' };
                controller.enqueue(encoder.encode(JSON.stringify(error) + '\n'));
                controller.close();
            }
        },
        async cancel() {
            abandoned.abort(); // visitor left or started another search
            await events.return(undefined);
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
