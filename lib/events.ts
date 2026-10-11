// Messages the search API streams to the page, one JSON object per line.
// Kept free of server code so the page can import it.

import { Flight, RouteResult, SearchResult } from './types';

export type SearchEvent =
    /** All results so far for one airport pair; replaces earlier results for that pair */
    | { type: 'results'; pair: string; results: SearchResult[]; final: boolean }
    /** Every pair has been searched */
    | { type: 'complete' }
    /** Flight numbers looked up after the search, keyed by flightKey() */
    | { type: 'flightNumbers'; numbers: Record<string, string> }
    | { type: 'error'; error: string };

export function flightKey(f: Flight): string {
    return `${f.origin}-${f.destination}-${f.departureDate}`;
}

function withNumbers<T extends RouteResult>(leg: T, numbers: Record<string, string>): T {
    if (leg.flights.every(f => f.flightNumber || !numbers[flightKey(f)])) return leg;
    return { ...leg, flights: leg.flights.map(f => (f.flightNumber ? f : { ...f, flightNumber: numbers[flightKey(f)] })) };
}

/** Fill in flight numbers that arrived after the results. */
export function applyFlightNumbers(results: SearchResult[], numbers: Record<string, string>): SearchResult[] {
    return results.map(r => {
        const out = withNumbers(r, numbers);
        const ret = r.returnFlights?.[0];
        return ret ? { ...out, returnFlights: [withNumbers(ret, numbers)] } : out;
    });
}

/** Read a streamed search response, calling `onEvent` for each message as it arrives. */
export async function readEvents(res: Response, onEvent: (event: SearchEvent) => void): Promise<void> {
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (line.trim()) onEvent(JSON.parse(line) as SearchEvent);
        }
        if (done) return;
    }
}
