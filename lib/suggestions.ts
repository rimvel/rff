// Ideas to offer when a search finds nothing.

import { AirportIndex, nearbyAirports, shortLabelFor } from './airportGroups';
import { ANYWHERE, MAX_ANYWHERE_ORIGIN_DAYS, MAX_ANYWHERE_ORIGINS, SearchRequest } from './searchUrl';
import { expandDates } from './time';

export interface Suggestion {
    label: string;
    request: SearchRequest;
}

const FLEX_DAYS = 3;
const MAX_NEARBY = 2;

function fitsAnywhereLimits(req: SearchRequest): boolean {
    const origins = req.origin.split(',').length;
    const days = expandDates(req.date, req.departureDateRange ?? 0, req.departureDateDirection ?? 'both').length;
    return origins <= MAX_ANYWHERE_ORIGINS && origins * days <= MAX_ANYWHERE_ORIGIN_DAYS;
}

export function suggestAlternatives(req: SearchRequest, index: AirportIndex): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const anywhere = req.dest === ANYWHERE;

    if ((req.departureDateRange ?? 0) < FLEX_DAYS) {
        const flexible: SearchRequest = { ...req, departureDateRange: FLEX_DAYS, departureDateDirection: 'both' };
        if (req.returnDate) {
            flexible.returnDateRange = Math.max(FLEX_DAYS, req.returnDateRange ?? 0);
            flexible.returnDateDirection = req.returnDateDirection ?? 'both';
        }
        if (!anywhere || fitsAnywhereLimits(flexible)) suggestions.push({ label: `Try ±${FLEX_DAYS} days`, request: flexible });
    }

    const origins = req.origin.split(',');
    const nearOrigin = nearbyAirports(origins, index).slice(0, MAX_NEARBY);
    if (nearOrigin.length > 0) {
        const wider = { ...req, origin: [...origins, ...nearOrigin.map(a => a.code)].join(',') };
        if (!anywhere || fitsAnywhereLimits(wider)) {
            suggestions.push({ label: `Also from ${nearOrigin.map(a => `${a.name} (${a.code})`).join(', ')}`, request: wider });
        }
    }

    if (!anywhere) {
        const dests = req.dest.split(',');
        const nearDest = nearbyAirports(dests, index).slice(0, MAX_NEARBY);
        if (nearDest.length > 0) {
            suggestions.push({
                label: `Also to ${nearDest.map(a => `${a.name} (${a.code})`).join(', ')}`,
                request: { ...req, dest: [...dests, ...nearDest.map(a => a.code)].join(',') },
            });
        }
    }

    if (req.returnDate) {
        suggestions.push({
            label: 'Search one way',
            request: { ...req, returnDate: undefined, returnDateRange: undefined, returnDateDirection: undefined },
        });
    }

    if (!anywhere) {
        const everywhere = { ...req, dest: ANYWHERE };
        if (fitsAnywhereLimits(everywhere)) {
            suggestions.push({ label: `Cheapest destinations from ${shortLabelFor(req.origin, index)}`, request: everywhere });
        }
    }

    return suggestions;
}
