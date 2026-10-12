import { AirportIndex, shortLabelFor } from './airportGroups';
import { ANYWHERE, SearchRequest } from './searchUrl';
import { localToUtcMs } from './time';

export const SITE_TITLE = 'RFF – cheap flights, beyond direct';

function formatDay(date: string): string {
    return new Date(localToUtcMs(date)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Title for a search, e.g. "Vilnius ⇄ Barcelona · 20 Nov – 27 Nov | RFF" (browser tab and link previews). */
export function searchTitle(req: SearchRequest, index: AirportIndex): string {
    const from = shortLabelFor(req.origin, index);
    const dates = req.returnDate ? `${formatDay(req.date)} – ${formatDay(req.returnDate)}` : formatDay(req.date);
    const title = req.dest === ANYWHERE
        ? `Cheapest destinations from ${from} · ${dates}`
        : `${from} ${req.returnDate ? '⇄' : '→'} ${shortLabelFor(req.dest, index)} · ${dates}`;
    return `${title} | RFF`;
}
